// @ts-nocheck
/**
 * HyperLocal Intel integration routes.
 * Connects to the futurilabs.com/hyperlocalhyperrecent API for
 * 12-source geo-scored news aggregation.
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

function getPayload(req: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

export async function hyperLocalIntelRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /hyperlocal-intel/lookup — Trigger a single-market lookup
  app.post('/hyperlocal-intel/lookup', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      marketId: z.string().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }).parse(request.body);

    let lat = body.lat;
    let lng = body.lng;
    let marketName = 'Custom Location';

    // If marketId provided, look up coordinates
    if (body.marketId) {
      const market = await prisma.market.findFirst({
        where: { id: body.marketId, accountId: payload.accountId },
      });
      if (!market) return reply.status(404).send({ error: 'Market not found' });
      lat = market.latitude;
      lng = market.longitude;
      marketName = market.name;
    }

    if (lat === undefined || lng === undefined) {
      return reply.status(400).send({ error: 'lat/lng required (or provide marketId)' });
    }

    // Find or create HyperLocal Intel source
    let source = await prisma.source.findFirst({
      where: {
        name: { contains: 'HyperLocal Intel' },
        isActive: true,
      },
    });

    if (!source) {
      source = await prisma.source.create({
        data: {
          name: `HyperLocal Intel - ${marketName}`,
          platform: 'NEWSAPI' as any,
          sourceType: 'API_PROVIDER' as any,
          url: 'https://futurilabs.com/hyperlocalhyperrecent/api/lookup',
          trustScore: 0.80,
          isActive: true,
          metadata: { type: 'hyperlocal-intel' },
        },
      });
    }

    // Queue the lookup job
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue('hyperlocal-intel', { connection });

    const job = await queue.add('lookup', {
      type: 'single_lookup',
      sourceId: source.id,
      lat,
      lng,
      marketName,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    });

    await queue.close();
    await connection.quit();

    return reply.send({
      message: 'HyperLocal Intel lookup queued',
      jobId: job.id,
      lat,
      lng,
      market: marketName,
    });
  });

  // POST /hyperlocal-intel/batch — Run batch lookup for all account markets
  app.post('/hyperlocal-intel/batch', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const markets = await prisma.market.findMany({
      where: { accountId: payload.accountId, isActive: true },
      select: { id: true, name: true },
    });

    if (markets.length === 0) {
      return reply.status(400).send({ error: 'No active markets configured' });
    }

    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue('hyperlocal-intel', { connection });

    const job = await queue.add('batch', {
      type: 'batch_markets',
      accountId: payload.accountId,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    });

    await queue.close();
    await connection.quit();

    return reply.send({
      message: 'Batch HyperLocal Intel lookup queued',
      jobId: job.id,
      marketCount: markets.length,
      markets: markets.map((m) => m.name),
    });
  });

  // POST /hyperlocal-intel/webhook — Receive batch completion webhook
  app.post('/hyperlocal-intel/webhook', async (request, reply) => {
    const batchId = request.headers['x-hyperlocal-batch-id'];
    const event = request.headers['x-hyperlocal-event'];

    if (event !== 'batch.completed') {
      return reply.status(200).send({ received: true, ignored: true });
    }

    const body = request.body as any;

    // Queue processing of the results
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue('hyperlocal-intel', { connection });

    await queue.add('webhook-results', {
      type: 'batch_markets',
      batchId: body.batch_id,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });

    await queue.close();
    await connection.quit();

    return reply.send({ received: true, batch_id: batchId });
  });

  // GET /hyperlocal-intel/status — Check integration status
  app.get('/hyperlocal-intel/status', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const sources = await prisma.source.findMany({
      where: {
        name: { contains: 'HyperLocal Intel' },
      },
      select: { id: true, name: true, lastPolledAt: true, isActive: true, marketId: true },
    });

    const markets = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    return reply.send({
      configured: sources.length > 0,
      sources,
      markets: markets.map((m) => ({
        id: m.id,
        name: m.name,
        lat: m.latitude,
        lng: m.longitude,
      })),
      apiUrl: process.env.HYPERLOCAL_INTEL_URL || 'https://futurilabs.com/hyperlocalhyperrecent',
    });
  });
}
