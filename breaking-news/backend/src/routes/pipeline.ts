import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { getQueue, QUEUE_NAMES } from '../lib/queue.js';
import { prisma } from '../lib/prisma.js';

interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function pipelineRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/pipeline/status - pipeline queue status
  app.get('/pipeline/status', async (_request, reply) => {
    const queueNames = Object.values(QUEUE_NAMES);
    const statuses: QueueStatus[] = [];

    for (const name of queueNames) {
      try {
        const queue = getQueue(name as any);
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        statuses.push({
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      } catch {
        statuses.push({
          name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        });
      }
    }

    const totalActive = statuses.reduce((s, q) => s + q.active, 0);
    const totalWaiting = statuses.reduce((s, q) => s + q.waiting, 0);
    const totalCompleted = statuses.reduce((s, q) => s + q.completed, 0);
    const totalFailed = statuses.reduce((s, q) => s + q.failed, 0);

    return reply.send({
      timestamp: new Date().toISOString(),
      summary: {
        active: totalActive,
        waiting: totalWaiting,
        completed: totalCompleted,
        failed: totalFailed,
        is_processing: totalActive > 0 || totalWaiting > 0,
      },
      queues: statuses,
    });
  });

  // POST /api/v1/pipeline/trigger - trigger ingestion for all active sources
  const TriggerSchema = z.object({
    lookbackHours: z.number().int().min(1).max(168).default(24),
  });

  // POST /api/v1/pipeline/seed-sources - seed default sources if none exist
  app.post('/pipeline/seed-sources', async (_request, reply) => {
    const count = await prisma.source.count();
    if (count > 0) {
      return reply.send({ message: `${count} sources already exist, skipping seed.`, seeded: 0 });
    }

    const sources = [
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Chronicle', url: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php', trustScore: 0.8, isGlobal: true, metadata: { feedUrl: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'KHOU 11', url: 'https://www.khou.com/feeds/syndication/rss/news', trustScore: 0.8, isGlobal: true, metadata: { feedUrl: 'https://www.khou.com/feeds/syndication/rss/news' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'KPRC / Click2Houston', url: 'https://www.click2houston.com/arcio/rss/category/news/', trustScore: 0.8, isGlobal: true, metadata: { feedUrl: 'https://www.click2houston.com/arcio/rss/category/news/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'ABC13 Houston', url: 'https://abc13.com/feed/', trustScore: 0.8, isGlobal: true, metadata: { feedUrl: 'https://abc13.com/feed/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Public Media', url: 'https://www.houstonpublicmedia.org/feed/', trustScore: 0.8, isGlobal: true, metadata: { feedUrl: 'https://www.houstonpublicmedia.org/feed/' } },
      { platform: 'RSS' as const, sourceType: 'GOV_AGENCY' as const, name: 'Harris County', url: 'https://www.harriscountytx.gov/rss', trustScore: 0.9, isGlobal: true, metadata: { feedUrl: 'https://www.harriscountytx.gov/rss' } },
      { platform: 'NEWSAPI' as const, sourceType: 'API_PROVIDER' as const, name: 'NewsAPI - Houston', url: 'https://newsapi.org/v2/everything?q=Houston+Texas&sortBy=publishedAt', trustScore: 0.8, isGlobal: true, metadata: { query: 'Houston Texas', sortBy: 'publishedAt' } },
      { platform: 'NEWSAPI' as const, sourceType: 'API_PROVIDER' as const, name: 'GDELT - Houston', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=Houston+Texas&mode=artlist&format=json', trustScore: 0.7, isGlobal: true, metadata: { query: 'Houston Texas', mode: 'artlist', format: 'json' } },
    ];

    let seeded = 0;
    for (const src of sources) {
      await prisma.source.create({ data: { ...src, isActive: true } });
      seeded++;
    }

    // Also create a dev API key
    await prisma.aPIKey.upsert({
      where: { key: 'dev-key-do-not-use-in-production' },
      update: {},
      create: {
        key: 'dev-key-do-not-use-in-production',
        name: 'Development Key',
        ownerId: 'system',
        isActive: true,
        rateLimit: 1000,
      },
    });

    return reply.send({ message: `Seeded ${seeded} sources`, seeded });
  });

  // POST /api/v1/pipeline/trigger - trigger ingestion for all active sources
  app.post('/pipeline/trigger', async (request, reply) => {
    const parseResult = TriggerSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { lookbackHours } = parseResult.data;

    // Get all active sources
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      select: {
        id: true,
        platform: true,
        name: true,
        url: true,
        metadata: true,
      },
    });

    if (sources.length === 0) {
      return reply.status(404).send({
        error: 'No active sources found',
        message: 'Add sources via the Data Feeds page first.',
      });
    }

    const ingestionQueue = getQueue(QUEUE_NAMES.INGESTION);
    let queued = 0;

    for (const source of sources) {
      const meta = (source.metadata as Record<string, unknown>) || {};

      if (source.platform === 'RSS') {
        const feedUrl = (meta.feedUrl as string) || source.url;
        if (feedUrl) {
          await ingestionQueue.add(
            `backfill-rss-${source.id}`,
            {
              type: 'rss_poll',
              sourceId: source.id,
              feedUrl,
              lookbackHours,
            },
            { removeOnComplete: 100, removeOnFail: 50 },
          );
          queued++;
        }
      } else if (source.platform === 'NEWSAPI') {
        const query = (meta.query as string) || 'Houston Texas';
        await ingestionQueue.add(
          `backfill-newsapi-${source.id}`,
          {
            type: 'newsapi_poll',
            sourceId: source.id,
            query,
            lookbackHours,
          },
          { removeOnComplete: 100, removeOnFail: 50 },
        );
        queued++;
      } else if (source.platform === 'FACEBOOK') {
        const pageId = (meta.pageId as string) || source.url;
        if (pageId) {
          await ingestionQueue.add(
            `backfill-fb-${source.id}`,
            {
              type: 'facebook_page_poll',
              sourceId: source.id,
              pageId,
              lookbackHours,
            },
            { removeOnComplete: 100, removeOnFail: 50 },
          );
          queued++;
        }
      } else if (source.platform.startsWith('LLM_')) {
        await ingestionQueue.add(
          `backfill-llm-${source.id}`,
          {
            type: 'llm_poll',
            sourceId: source.id,
            platform: source.platform,
            lookbackHours,
          },
          { removeOnComplete: 100, removeOnFail: 50 },
        );
        queued++;
      }
    }

    await ingestionQueue.close();

    return reply.send({
      message: `Triggered ingestion for ${queued} sources (${lookbackHours}h lookback)`,
      queued,
      totalSources: sources.length,
      lookbackHours,
    });
  });
}
