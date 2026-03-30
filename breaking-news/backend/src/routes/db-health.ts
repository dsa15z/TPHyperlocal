// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { checkReplicaLag, prismaRead } from '../lib/prisma-replica.js';
import { getRedis } from '../lib/redis.js';

// ─── Database health routes ─────────────────────────────────────────────────

export async function dbHealthRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/health/database — Database health including replica status
  app.get('/health/database', async (_request: FastifyRequest, reply: FastifyReply) => {
    const result: {
      primary: { status: string; latencyMs: number; error?: string };
      replica: { status: string; latencyMs: number; lagMs: number; isHealthy: boolean; hasReplica: boolean; error?: string };
      timestamp: string;
    } = {
      primary: { status: 'unknown', latencyMs: 0 },
      replica: { status: 'unknown', latencyMs: 0, lagMs: 0, isHealthy: false, hasReplica: false },
      timestamp: new Date().toISOString(),
    };

    // Check primary database
    const primaryStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      result.primary = {
        status: 'healthy',
        latencyMs: Date.now() - primaryStart,
      };
    } catch (err) {
      result.primary = {
        status: 'unhealthy',
        latencyMs: Date.now() - primaryStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Check replica
    const replicaStart = Date.now();
    try {
      const replicaLag = await checkReplicaLag();
      if (!replicaLag.hasReplica) {
        result.replica = {
          status: 'not_configured',
          latencyMs: 0,
          lagMs: 0,
          isHealthy: true,
          hasReplica: false,
        };
      } else {
        // Also measure replica latency directly
        await prismaRead.$queryRaw`SELECT 1`;
        result.replica = {
          status: replicaLag.isHealthy ? 'healthy' : 'lagging',
          latencyMs: Date.now() - replicaStart,
          lagMs: replicaLag.lagMs,
          isHealthy: replicaLag.isHealthy,
          hasReplica: true,
        };
      }
    } catch (err) {
      result.replica = {
        status: 'unhealthy',
        latencyMs: Date.now() - replicaStart,
        lagMs: -1,
        isHealthy: false,
        hasReplica: !!process.env.DATABASE_REPLICA_URL,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    const allHealthy = result.primary.status === 'healthy'
      && (result.replica.status === 'healthy' || result.replica.status === 'not_configured');

    return reply.status(allHealthy ? 200 : 503).send(result);
  });

  // GET /api/v1/health/detailed — Full system health
  app.get('/health/detailed', async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, { status: string; latencyMs?: number; details?: any; error?: string }> = {};

    // 1. Primary database
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks['database.primary'] = {
        status: 'healthy',
        latencyMs: Date.now() - dbStart,
      };
    } catch (err) {
      checks['database.primary'] = {
        status: 'unhealthy',
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // 2. Read replica
    const replicaStart = Date.now();
    try {
      const lag = await checkReplicaLag();
      checks['database.replica'] = {
        status: lag.hasReplica ? (lag.isHealthy ? 'healthy' : 'lagging') : 'not_configured',
        latencyMs: Date.now() - replicaStart,
        details: {
          hasReplica: lag.hasReplica,
          lagMs: lag.lagMs,
        },
      };
    } catch (err) {
      checks['database.replica'] = {
        status: 'unhealthy',
        latencyMs: Date.now() - replicaStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // 3. Redis
    const redisStart = Date.now();
    try {
      const redis = getRedis();
      const pong = await redis.ping();
      const info = await redis.info('memory');
      const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
      const usedMemory = usedMemoryMatch ? usedMemoryMatch[1].trim() : 'unknown';

      const connectedClientsInfo = await redis.info('clients');
      const clientsMatch = connectedClientsInfo.match(/connected_clients:(\d+)/);
      const connectedClients = clientsMatch ? parseInt(clientsMatch[1], 10) : 0;

      checks['redis'] = {
        status: pong === 'PONG' ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - redisStart,
        details: {
          usedMemory,
          connectedClients,
        },
      };
    } catch (err) {
      checks['redis'] = {
        status: 'unhealthy',
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // 4. Queue depths (estimated from DB)
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [unprocessedPosts, unenrichedPosts, unscoredStories] = await Promise.all([
        prisma.sourcePost.count({
          where: { collectedAt: { gte: oneDayAgo }, category: null },
        }),
        prisma.sourcePost.count({
          where: {
            collectedAt: { gte: oneDayAgo },
            category: { not: null },
            sentimentLabel: null,
          },
        }),
        prisma.story.count({
          where: {
            mergedIntoId: null,
            firstSeenAt: { gte: oneDayAgo },
            compositeScore: 0,
          },
        }),
      ]);

      checks['queues'] = {
        status: 'healthy',
        details: {
          ingestion: { estimatedPending: 0 },
          enrichment: { estimatedPending: unprocessedPosts },
          clustering: { estimatedPending: unenrichedPosts },
          scoring: { estimatedPending: unscoredStories },
        },
      };
    } catch (err) {
      checks['queues'] = {
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // 5. Cache stats from Redis
    try {
      const redis = getRedis();
      const infoStats = await redis.info('stats');
      const hitsMatch = infoStats.match(/keyspace_hits:(\d+)/);
      const missesMatch = infoStats.match(/keyspace_misses:(\d+)/);
      const hits = hitsMatch ? parseInt(hitsMatch[1], 10) : 0;
      const misses = missesMatch ? parseInt(missesMatch[1], 10) : 0;
      const hitRate = hits + misses > 0
        ? Math.round((hits / (hits + misses)) * 1000) / 10
        : 0;

      checks['cache'] = {
        status: 'healthy',
        details: {
          hits,
          misses,
          hitRatePercent: hitRate,
        },
      };
    } catch (err) {
      checks['cache'] = {
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // 6. SSE client count (approximate — count from global if available)
    checks['sse'] = {
      status: 'healthy',
      details: {
        note: 'SSE client count available via /api/v1/stream endpoint',
      },
    };

    // Overall status
    const allHealthy = Object.values(checks).every(
      (c) => c.status === 'healthy' || c.status === 'not_configured',
    );
    const hasCriticalFailure = checks['database.primary']?.status === 'unhealthy'
      || checks['redis']?.status === 'unhealthy';

    const overallStatus = hasCriticalFailure ? 'unhealthy' : (allHealthy ? 'healthy' : 'degraded');

    return reply.status(overallStatus === 'unhealthy' ? 503 : 200).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      nodeVersion: process.version,
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      },
      checks,
    });
  });
}
