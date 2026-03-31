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

const JobsQuerySchema = z.object({
  state: z.enum(['active', 'waiting', 'completed', 'failed', 'delayed']).default('failed'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

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

  // GET /api/v1/pipeline/jobs/:queue - get job details for a specific queue
  app.get('/pipeline/jobs/:queue', async (request, reply) => {
    const { queue: queueName } = request.params as { queue: string };
    const queueNames = Object.values(QUEUE_NAMES);
    if (!queueNames.includes(queueName as any)) {
      return reply.status(400).send({ error: `Invalid queue: ${queueName}` });
    }

    const parseResult = JobsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parseResult.error.flatten() });
    }

    const { state, limit, offset } = parseResult.data;
    const queue = getQueue(queueName as any);

    try {
      const jobs = await queue.getJobs([state], offset, offset + limit - 1);

      const result = jobs.map((job) => ({
        id: job.id,
        name: job.name,
        state,
        data: {
          type: job.data?.type,
          sourceId: job.data?.sourceId,
          feedUrl: job.data?.feedUrl,
          query: job.data?.query,
        },
        failedReason: job.failedReason || null,
        stacktrace: job.stacktrace?.[0]?.substring(0, 300) || null,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn || null,
        finishedOn: job.finishedOn || null,
      }));

      return reply.send({
        queue: queueName,
        state,
        jobs: result,
        total: result.length,
      });
    } catch {
      return reply.send({ queue: queueName, state, jobs: [], total: 0 });
    }
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

  // POST /api/v1/pipeline/add-sources - add additional sources (even if some exist)
  app.post('/pipeline/add-sources', async (_request, reply) => {
    const allSources = [
      // === HOUSTON LOCAL NEWS (TV/Radio) ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Chronicle', url: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'KHOU 11 News', url: 'https://www.khou.com/feeds/syndication/rss/news', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://www.khou.com/feeds/syndication/rss/news' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'KPRC / Click2Houston', url: 'https://www.click2houston.com/arcio/rss/category/news/', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://www.click2houston.com/arcio/rss/category/news/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'ABC13 Houston (KTRK)', url: 'https://abc13.com/feed/', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://abc13.com/feed/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'FOX 26 Houston (KRIV)', url: 'https://www.fox26houston.com/rss', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://www.fox26houston.com/rss' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Public Media (KUHF)', url: 'https://www.houstonpublicmedia.org/feed/', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://www.houstonpublicmedia.org/feed/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Landing', url: 'https://houstonlanding.org/feed/', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://houstonlanding.org/feed/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Press', url: 'https://www.houstonpress.com/houston/Rss.xml', trustScore: 0.70, isGlobal: true, metadata: { feedUrl: 'https://www.houstonpress.com/houston/Rss.xml' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Community Impact - Houston', url: 'https://communityimpact.com/feed/?market=houston', trustScore: 0.75, isGlobal: true, metadata: { feedUrl: 'https://communityimpact.com/feed/?market=houston' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Business Journal', url: 'https://www.bizjournals.com/houston/news/rss', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://www.bizjournals.com/houston/news/rss' } },

      // === TEXAS STATE NEWS ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Texas Tribune', url: 'https://www.texastribune.org/feeds/latest/', trustScore: 0.90, isGlobal: true, metadata: { feedUrl: 'https://www.texastribune.org/feeds/latest/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Dallas Morning News', url: 'https://www.dallasnews.com/arc/outboundfeeds/rss/?outputType=xml', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://www.dallasnews.com/arc/outboundfeeds/rss/?outputType=xml' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'San Antonio Express-News', url: 'https://www.expressnews.com/rss/feed/San-Antonio-breaking-news-702.php', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://www.expressnews.com/rss/feed/San-Antonio-breaking-news-702.php' } },

      // === NATIONAL NEWS AGGREGATORS (matching TopicPulse) ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Google News - Houston', url: 'https://news.google.com/rss/search?q=Houston+Texas&hl=en-US&gl=US&ceid=US:en', trustScore: 0.75, isGlobal: true, metadata: { feedUrl: 'https://news.google.com/rss/search?q=Houston+Texas&hl=en-US&gl=US&ceid=US:en' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Google News - Breaking', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', trustScore: 0.70, isGlobal: true, metadata: { feedUrl: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Bing News - Houston', url: 'https://www.bing.com/news/search?q=Houston+Texas&format=rss&mkt=en-US', trustScore: 0.70, isGlobal: true, metadata: { feedUrl: 'https://www.bing.com/news/search?q=Houston+Texas&format=rss&mkt=en-US' } },

      // === NATIONAL WIRE SERVICES ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'AP News - Top Headlines', url: 'https://rsshub.app/apnews/topics/apf-topnews', trustScore: 0.95, isGlobal: true, metadata: { feedUrl: 'https://rsshub.app/apnews/topics/apf-topnews' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Reuters - Top News', url: 'https://www.reutersagency.com/feed/', trustScore: 0.95, isGlobal: true, metadata: { feedUrl: 'https://www.reutersagency.com/feed/' } },

      // === GOVERNMENT SOURCES ===
      { platform: 'RSS' as const, sourceType: 'GOV_AGENCY' as const, name: 'Harris County', url: 'https://www.harriscountytx.gov/rss', trustScore: 0.90, isGlobal: true, metadata: { feedUrl: 'https://www.harriscountytx.gov/rss' } },
      { platform: 'RSS' as const, sourceType: 'GOV_AGENCY' as const, name: 'City of Houston', url: 'https://www.houstontx.gov/rss.html', trustScore: 0.90, isGlobal: true, metadata: { feedUrl: 'https://www.houstontx.gov/rss.html' } },
      { platform: 'RSS' as const, sourceType: 'GOV_AGENCY' as const, name: 'NWS Houston', url: 'https://alerts.weather.gov/cap/tx.php?x=0', trustScore: 0.95, isGlobal: true, metadata: { feedUrl: 'https://alerts.weather.gov/cap/tx.php?x=0' } },
      { platform: 'RSS' as const, sourceType: 'GOV_AGENCY' as const, name: 'TxDOT Houston', url: 'https://www.txdot.gov/inside-txdot/media-center/feeds.xml', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://www.txdot.gov/inside-txdot/media-center/feeds.xml' } },

      // === SPECIALTY BEATS ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Space City Weather', url: 'https://spacecityweather.com/feed/', trustScore: 0.85, isGlobal: true, metadata: { feedUrl: 'https://spacecityweather.com/feed/' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Sports - ESPN', url: 'https://www.espn.com/espn/rss/news', trustScore: 0.75, isGlobal: true, metadata: { feedUrl: 'https://www.espn.com/espn/rss/news' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Chron - Sports', url: 'https://www.houstonchronicle.com/rss/feed/Houston-Texans-702.php', trustScore: 0.80, isGlobal: true, metadata: { feedUrl: 'https://www.houstonchronicle.com/rss/feed/Houston-Texans-702.php' } },
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'Houston Real Estate', url: 'https://www.har.com/blog/feed/', trustScore: 0.70, isGlobal: true, metadata: { feedUrl: 'https://www.har.com/blog/feed/' } },

      // === API SOURCES ===
      { platform: 'NEWSAPI' as const, sourceType: 'API_PROVIDER' as const, name: 'NewsAPI - Houston', url: 'https://newsapi.org/v2/everything?q=Houston+Texas&sortBy=publishedAt', trustScore: 0.80, isGlobal: true, metadata: { query: 'Houston Texas', sortBy: 'publishedAt' } },
      { platform: 'NEWSAPI' as const, sourceType: 'API_PROVIDER' as const, name: 'NewsAPI - Harris County', url: 'https://newsapi.org/v2/everything?q=Harris+County+Texas&sortBy=publishedAt', trustScore: 0.75, isGlobal: true, metadata: { query: 'Harris County Texas', sortBy: 'publishedAt' } },
      { platform: 'GDELT' as const, sourceType: 'API_PROVIDER' as const, name: 'GDELT - Houston', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=Houston+Texas&mode=artlist&format=json&maxrecords=50', trustScore: 0.70, isGlobal: true, metadata: { query: 'Houston Texas', mode: 'artlist' } },

      // === SPANISH LANGUAGE ===
      { platform: 'RSS' as const, sourceType: 'NEWS_ORG' as const, name: 'La Voz de Houston', url: 'https://lavoztx.com/feed/', trustScore: 0.70, isGlobal: true, metadata: { feedUrl: 'https://lavoztx.com/feed/', language: 'es' } },

      // === LLM SOURCES (AI-powered news scanning) ===
      { platform: 'LLM_OPENAI' as const, sourceType: 'LLM_PROVIDER' as const, name: 'OpenAI - Houston Breaking News', url: 'https://api.openai.com', trustScore: 0.65, isGlobal: true, metadata: { marketName: 'Houston, Texas', marketKeywords: ['Houston', 'Harris County', 'breaking news', 'crime', 'weather', 'traffic', 'politics', 'business'], model: 'gpt-4o-mini' } },
      { platform: 'LLM_GROK' as const, sourceType: 'LLM_PROVIDER' as const, name: 'Grok - Houston Real-Time', url: 'https://api.x.ai', trustScore: 0.70, isGlobal: true, metadata: { marketName: 'Houston, Texas', marketKeywords: ['Houston', 'Harris County', 'breaking', 'shooting', 'fire', 'flood', 'accident', 'storm'], model: 'grok-3-mini' } },
      { platform: 'LLM_CLAUDE' as const, sourceType: 'LLM_PROVIDER' as const, name: 'Claude - Houston News Analysis', url: 'https://api.anthropic.com', trustScore: 0.65, isGlobal: true, metadata: { marketName: 'Houston, Texas', marketKeywords: ['Houston', 'Harris County', 'Texas', 'breaking news', 'developing story', 'investigation'], model: 'claude-sonnet-4-6-20250514' } },
      { platform: 'LLM_GEMINI' as const, sourceType: 'LLM_PROVIDER' as const, name: 'Gemini - Houston News', url: 'https://generativelanguage.googleapis.com', trustScore: 0.60, isGlobal: true, metadata: { marketName: 'Houston, Texas', marketKeywords: ['Houston', 'Harris County', 'breaking news', 'trending', 'community'], model: 'gemini-2.0-flash' } },
    ];

    let added = 0;
    let skipped = 0;
    for (const src of allSources) {
      // Check if source with this URL already exists
      const existing = await prisma.source.findFirst({ where: { url: src.url } });
      if (existing) { skipped++; continue; }
      await prisma.source.create({ data: { ...src, isActive: true } });
      added++;
    }

    return reply.send({
      message: `Added ${added} new sources (${skipped} already existed)`,
      added,
      skipped,
      total: allSources.length,
    });
  });

  // POST /api/v1/pipeline/trigger - trigger ingestion for all active sources
  app.post('/pipeline/trigger', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  // POST /api/v1/pipeline/drain-old — Remove all waiting jobs older than N minutes
  app.post('/pipeline/drain-old', async (request, reply) => {
    const body = (request.body || {}) as { maxAgeMinutes?: number; queue?: string };
    const maxAgeMs = ((body.maxAgeMinutes || 60) * 60 * 1000);
    const queueName = body.queue || 'ingestion';
    const cutoff = Date.now() - maxAgeMs;

    const queue = getQueue(queueName as any);
    const waiting = await queue.getWaiting(0, 5000);

    let removed = 0;
    for (const job of waiting) {
      if (job.timestamp && job.timestamp < cutoff) {
        try {
          await job.remove();
          removed++;
        } catch {}
      }
    }

    // Also clean completed/failed older than 1 hour
    const cleanedCompleted = await queue.clean(3600 * 1000, 5000, 'completed');
    const cleanedFailed = await queue.clean(3600 * 1000, 5000, 'failed');

    return reply.send({
      removed,
      cleanedCompleted: cleanedCompleted.length,
      cleanedFailed: cleanedFailed.length,
      remainingWaiting: waiting.length - removed,
    });
  });

  // POST /api/v1/pipeline/cleanup-failed — Deactivate sources that keep failing and purge their jobs
  app.post('/pipeline/cleanup-failed', async (_request, reply) => {
    const queue = getQueue(QUEUE_NAMES.INGESTION);

    // Get all failed jobs to find which sources are failing
    const failed = await queue.getFailed(0, 200);
    const failCounts: Record<string, { count: number; sourceId: string; url: string; reason: string }> = {};

    for (const job of failed) {
      const sourceId = job.data?.sourceId || '';
      const url = job.data?.feedUrl || job.data?.query || '';
      const reason = job.failedReason || '';
      const key = sourceId || url;
      if (!failCounts[key]) failCounts[key] = { count: 0, sourceId, url, reason };
      failCounts[key].count++;
    }

    // Deactivate sources with 3+ failures
    const deactivated = [];
    for (const [_, info] of Object.entries(failCounts)) {
      if (info.count >= 3 && info.sourceId) {
        try {
          await prisma.source.update({
            where: { id: info.sourceId },
            data: {
              isActive: false,
              metadata: {
                deactivatedAt: new Date().toISOString(),
                deactivateReason: info.reason?.substring(0, 200),
                consecutiveFailures: info.count,
              },
            },
          });
          deactivated.push({ sourceId: info.sourceId, url: info.url, failures: info.count });
        } catch {
          // Source might not exist or already deactivated
        }
      }
    }

    // Purge waiting jobs for deactivated sources
    const deactivatedIds = new Set(deactivated.map(d => d.sourceId));
    let purged = 0;

    if (deactivatedIds.size > 0) {
      const waiting = await queue.getWaiting(0, 1000);
      for (const job of waiting) {
        if (deactivatedIds.has(job.data?.sourceId)) {
          try {
            await job.remove();
            purged++;
          } catch {}
        }
      }
    }

    // Also clean all failed jobs
    const cleaned = await queue.clean(0, 1000, 'failed');

    return reply.send({
      deactivated: deactivated.length,
      sources: deactivated,
      purgedWaitingJobs: purged,
      cleanedFailedJobs: cleaned.length,
    });
  });
}
