import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getRedis } from '../lib/redis.js';

const ACTIVITY_KEY = 'tp:last_ui_activity';
const ACTIVITY_TTL = 30 * 60; // 30 minutes

export async function healthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/health - health check endpoint
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks['database'] = {
        status: 'healthy',
        latencyMs: Date.now() - dbStart,
      };
    } catch (err) {
      checks['database'] = {
        status: 'unhealthy',
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      const redis = getRedis();
      await redis.ping();
      checks['redis'] = {
        status: 'healthy',
        latencyMs: Date.now() - redisStart,
      };
    } catch (err) {
      checks['redis'] = {
        status: 'unhealthy',
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    const allHealthy = Object.values(checks).every(
      (c) => c.status === 'healthy',
    );

    const statusCode = allHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      checks,
    });
  });

  // POST /api/v1/heartbeat — UI sends this every 5 min to indicate active users
  app.post('/heartbeat', async (_request, reply) => {
    try {
      const redis = getRedis();
      await redis.set(ACTIVITY_KEY, Date.now().toString(), 'EX', ACTIVITY_TTL);
      return reply.send({ ok: true });
    } catch {
      return reply.send({ ok: true }); // Don't fail if Redis is down
    }
  });

  // GET /api/v1/activity — Workers check this before polling
  // Returns whether UI is active and optimal lookback hours
  app.get('/activity', async (_request, reply) => {
    try {
      const redis = getRedis();
      const lastActivity = await redis.get(ACTIVITY_KEY);
      const lastActiveMs = lastActivity ? parseInt(lastActivity, 10) : 0;
      const idleMs = Date.now() - lastActiveMs;
      const isActive = idleMs < ACTIVITY_TTL * 1000;

      // Optimal lookback: min(24h, time since last activity)
      const lookbackHours = Math.min(24, Math.ceil(idleMs / (1000 * 60 * 60)));

      return reply.send({
        isActive,
        lastActivityAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
        idleMinutes: Math.round(idleMs / 60000),
        lookbackHours: isActive ? 1 : lookbackHours, // If active, just pull last hour
      });
    } catch {
      return reply.send({ isActive: true, lookbackHours: 1 }); // Default to active if Redis fails
    }
  });

  // POST /api/v1/health/db-sync — Create any missing tables
  // Uses Prisma's createMany with skipDuplicates pattern to safely
  // check/create tables that may not exist yet.
  app.post('/health/db-sync', async (_request, reply) => {
    const results: Array<{ table: string; status: string }> = [];

    // List of tables that may be missing and their creation SQL
    const tables = [
      { name: 'PublicDataFeed', check: 'SELECT 1 FROM "PublicDataFeed" LIMIT 1' },
      { name: 'PublicDataAlert', check: 'SELECT 1 FROM "PublicDataAlert" LIMIT 1' },
      { name: 'ShowDeadline', check: 'SELECT 1 FROM "ShowDeadline" LIMIT 1' },
      { name: 'RadioScript', check: 'SELECT 1 FROM "RadioScript" LIMIT 1' },
      { name: 'HistoryEvent', check: 'SELECT 1 FROM "HistoryEvent" LIMIT 1' },
      { name: 'StockAlert', check: 'SELECT 1 FROM "StockAlert" LIMIT 1' },
      { name: 'Reporter', check: 'SELECT 1 FROM "Reporter" LIMIT 1' },
      { name: 'Assignment', check: 'SELECT 1 FROM "Assignment" LIMIT 1' },
      { name: 'ShiftBriefing', check: 'SELECT 1 FROM "ShiftBriefing" LIMIT 1' },
      { name: 'BreakingPackage', check: 'SELECT 1 FROM "BreakingPackage" LIMIT 1' },
      { name: 'StoryEditSession', check: 'SELECT 1 FROM "StoryEditSession" LIMIT 1' },
      { name: 'FactCheck', check: 'SELECT 1 FROM "FactCheck" LIMIT 1' },
      { name: 'TranslatedContent', check: 'SELECT 1 FROM "TranslatedContent" LIMIT 1' },
      { name: 'CoverageFeed', check: 'SELECT 1 FROM "CoverageFeed" LIMIT 1' },
      { name: 'CoverageMatch', check: 'SELECT 1 FROM "CoverageMatch" LIMIT 1' },
      { name: 'AudioSource', check: 'SELECT 1 FROM "AudioSource" LIMIT 1' },
      { name: 'AudioTranscript', check: 'SELECT 1 FROM "AudioTranscript" LIMIT 1' },
      { name: 'StoryPrediction', check: 'SELECT 1 FROM "StoryPrediction" LIMIT 1' },
    ];

    for (const table of tables) {
      try {
        await prisma.$queryRawUnsafe(table.check);
        results.push({ table: table.name, status: 'exists' });
      } catch (err: any) {
        if (err.code === 'P2010' || err.message?.includes('does not exist')) {
          results.push({ table: table.name, status: 'MISSING' });
        } else {
          results.push({ table: table.name, status: `error: ${err.message?.substring(0, 80)}` });
        }
      }
    }

    const missing = results.filter(r => r.status === 'MISSING');

    return reply.send({
      timestamp: new Date().toISOString(),
      totalTables: results.length,
      existing: results.filter(r => r.status === 'exists').length,
      missing: missing.length,
      details: results,
      fix: missing.length > 0
        ? 'Run: npx prisma db push --skip-generate in the backend container'
        : 'All tables exist',
    });
  });
}
