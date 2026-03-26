import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getRedis } from '../lib/redis.js';

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
}
