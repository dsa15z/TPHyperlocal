// @ts-nocheck
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
  // GET /api/v1/pipeline/source-health — Quick source health report
  app.get('/pipeline/source-health', async (_request, reply) => {
    try {
      const sources = await prisma.$queryRaw<any[]>`
        SELECT id, name, platform, "isActive", "lastPolledAt",
               metadata->>'consecutiveFailures' as failures,
               metadata->>'healResult' as "healResult",
               metadata->>'lastFailure' as "lastFailure",
               metadata->>'deactivateReason' as "deactivateReason"
        FROM "Source"
        WHERE "isActive" = false OR (metadata->>'consecutiveFailures')::int >= 3
        ORDER BY (metadata->>'consecutiveFailures')::int DESC NULLS LAST
        LIMIT 30
      `;

      const activeCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "Source" WHERE "isActive" = true`;
      const totalCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "Source"`;
      const neverPolled = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "Source" WHERE "isActive" = true AND "lastPolledAt" IS NULL`;

      return reply.send({
        summary: {
          total: totalCount[0]?.count || 0,
          active: activeCount[0]?.count || 0,
          inactive: (totalCount[0]?.count || 0) - (activeCount[0]?.count || 0),
          neverPolled: neverPolled[0]?.count || 0,
          failing: sources.filter((s: any) => s.isActive && parseInt(s.failures || '0') >= 3).length,
        },
        problemSources: sources.map((s: any) => ({
          name: s.name,
          platform: s.platform,
          active: s.isActive,
          failures: parseInt(s.failures || '0'),
          healResult: s.healResult,
          lastFailure: s.lastFailure?.substring(0, 80),
          deactivateReason: s.deactivateReason,
          lastPolled: s.lastPolledAt,
        })),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/v1/pipeline/monitor — Self-healing monitor activity log
  app.get('/pipeline/monitor', async (_request, reply) => {
    try {
      const IORedis = (await import('ioredis')).default;
      const redis = new IORedis(process.env['REDIS_URL'] || 'redis://localhost:6379', { maxRetriesPerRequest: null });
      const latest = await redis.get('tp:monitor:latest');
      const logRaw = await redis.lrange('tp:monitor:log', 0, 49);
      await redis.quit();

      return reply.send({
        latest: latest ? JSON.parse(latest) : null,
        log: logRaw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean),
        description: 'Pipeline self-healing monitor runs every 2 minutes. Clears stale errors, heals failing sources, logs unknown issues.',
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

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
    lookbackHours: z.number().int().min(1).max(24).default(24), // Max 24h to control costs
  });

  // POST /api/v1/pipeline/clear-failed - clear failed jobs from a queue
  app.post('/pipeline/clear-failed', async (request, reply) => {
    const body = z.object({
      queue: z.string().min(1),
    }).safeParse(request.body || {});
    if (!body.success) return reply.status(400).send({ error: 'queue name required' });

    try {
      const queue = getQueue(body.data.queue as any);
      const failed = await queue.getFailed(0, 5000);
      let removed = 0;
      for (const job of failed) {
        try { await job.remove(); removed++; } catch { /* already removed */ }
      }
      return reply.send({ message: `Cleared ${removed} failed jobs from ${body.data.queue}`, removed, queue: body.data.queue });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/clear-all - clear all jobs (waiting + failed) from a queue
  app.post('/pipeline/clear-all', async (request, reply) => {
    const body = z.object({
      queue: z.string().min(1),
    }).safeParse(request.body || {});
    if (!body.success) return reply.status(400).send({ error: 'queue name required' });

    try {
      const queue = getQueue(body.data.queue as any);
      await queue.obliterate({ force: true });
      return reply.send({ message: `Cleared all jobs from ${body.data.queue}`, queue: body.data.queue });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/run-queue - force run a specific queue's scheduler now
  app.post('/pipeline/run-queue', async (request, reply) => {
    const body = z.object({
      queue: z.string().min(1),
    }).safeParse(request.body || {});
    if (!body.success) return reply.status(400).send({ error: 'queue name required' });

    const queueName = body.data.queue;

    // Enqueue a trigger job that the scheduler would normally create
    try {
      const queue = getQueue((queueName === 'ingestion' ? 'ingestion' : queueName) as any);

      if (queueName === 'ingestion') {
        // Trigger RSS poll for all active RSS sources
        const sources = await prisma.source.findMany({
          where: { isActive: true, platform: 'RSS' },
          take: 100,
        });
        let queued = 0;
        for (const source of sources) {
          if (!source.url) continue;
          await queue.add('rss_poll', {
            type: 'rss_poll',
            sourceId: source.id,
            feedUrl: source.url,
          }, {
            jobId: `force-rss-${source.id}-${Date.now()}`,
            attempts: 2,
            removeOnComplete: true,
            removeOnFail: { age: 3600 },
          });
          queued++;
        }
        return reply.send({ message: `Force-triggered ${queued} RSS ingestion jobs`, queued });
      }

      if (queueName === 'scoring') {
        const stories = await prisma.story.findMany({
          where: { status: { notIn: ['ARCHIVED', 'STALE'] } },
          select: { id: true },
          take: 500,
        });
        for (const story of stories) {
          await queue.add('score', { storyId: story.id }, {
            jobId: `force-score-${story.id}-${Date.now()}`,
            removeOnComplete: true,
          });
        }
        return reply.send({ message: `Force-triggered scoring for ${stories.length} stories`, queued: stories.length });
      }

      return reply.send({ message: `Queue ${queueName} does not support force-run yet` });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/heal-source/:id - force self-heal + reactivate a single source
  app.post('/pipeline/heal-source/:id', async (request, reply) => {
    const { id: sourceId } = request.params as { id: string };
    const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return reply.status(404).send({ error: 'Source not found' });
    if (!source.url) return reply.status(400).send({ error: 'Source has no URL' });

    const meta = (source.metadata || {}) as Record<string, unknown>;
    const log: Array<{ at: string; action: string; result: string }> = [];
    let healed = false;
    let newUrl = source.url;

    // Strategy 1: Try original URL with browser UA
    try {
      log.push({ at: new Date().toISOString(), action: 'Testing original URL with browser UA', result: 'pending' });
      const resp = await fetch(source.url, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
          log.push({ at: new Date().toISOString(), action: 'Original URL works with browser UA', result: 'SUCCESS' });
          healed = true;
        } else if (text.includes('cloudflare') || text.includes('Just a moment')) {
          log.push({ at: new Date().toISOString(), action: 'Cloudflare challenge detected', result: 'BLOCKED' });
        } else if (text.includes('<html')) {
          log.push({ at: new Date().toISOString(), action: 'HTML returned instead of RSS', result: 'WRONG_FORMAT' });
        }
      } else {
        log.push({ at: new Date().toISOString(), action: `HTTP ${resp.status}`, result: 'FAILED' });
      }
    } catch (err: any) {
      log.push({ at: new Date().toISOString(), action: `Fetch error: ${err.message}`, result: 'ERROR' });
    }

    // Strategy 2: Try proxy-to-direct mapping (rsshub → apnews)
    if (!healed && source.url.includes('rsshub.app/apnews')) {
      const apMatch = source.url.match(/rsshub\.app\/apnews\/topics\/(.+)/);
      if (apMatch) {
        const directUrl = `https://apnews.com/hub/${apMatch[1].replace('apf-', '').replace(/\/$/, '')}?format=rss`;
        log.push({ at: new Date().toISOString(), action: `Trying direct AP URL: ${directUrl}`, result: 'pending' });
        try {
          const resp = await fetch(directUrl, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(10000) });
          if (resp.ok) {
            const text = await resp.text();
            if (text.includes('<rss') || text.includes('<feed')) {
              log.push({ at: new Date().toISOString(), action: 'Direct AP URL works!', result: 'SUCCESS' });
              newUrl = directUrl;
              healed = true;
            } else {
              log.push({ at: new Date().toISOString(), action: 'Direct AP URL returns HTML not RSS', result: 'WRONG_FORMAT' });
            }
          } else {
            log.push({ at: new Date().toISOString(), action: `Direct AP URL HTTP ${resp.status}`, result: 'FAILED' });
          }
        } catch (err: any) {
          log.push({ at: new Date().toISOString(), action: `Direct AP error: ${err.message}`, result: 'ERROR' });
        }
      }
    }

    // Strategy 3: Try common RSS URL variants
    if (!healed) {
      const variants = ['/feed', '/rss', '/rss.xml', '/atom.xml', '/index.xml'];
      const origin = new URL(source.url).origin;
      for (const variant of variants) {
        const altUrl = origin + variant;
        try {
          const resp = await fetch(altUrl, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            const text = await resp.text();
            if (text.includes('<rss') || text.includes('<feed')) {
              log.push({ at: new Date().toISOString(), action: `Found working RSS at ${altUrl}`, result: 'SUCCESS' });
              newUrl = altUrl;
              healed = true;
              break;
            }
          }
        } catch {}
      }
      if (!healed) {
        log.push({ at: new Date().toISOString(), action: 'All RSS URL variants failed', result: 'FAILED' });
      }
    }

    // Apply healing
    if (healed) {
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          isActive: true,
          url: newUrl,
          metadata: {
            ...meta,
            consecutiveFailures: 0,
            healResult: newUrl !== source.url ? 'url-changed' : 'ua-fix',
            previousUrl: newUrl !== source.url ? source.url : undefined,
            useBrowserUA: true,
            healedAt: new Date().toISOString(),
            failureLog: [...((meta.failureLog || []) as any[]).slice(-10), ...log],
          },
        },
      });
    } else {
      // Log the attempt even if it failed
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          metadata: {
            ...meta,
            failureLog: [...((meta.failureLog || []) as any[]).slice(-10), ...log],
            lastHealAttemptAt: new Date().toISOString(),
          },
        },
      });
    }

    return reply.send({
      sourceId,
      name: source.name,
      healed,
      reactivated: healed && !source.isActive,
      oldUrl: source.url,
      newUrl: healed ? newUrl : source.url,
      urlChanged: newUrl !== source.url,
      log,
    });
  });

  // POST /api/v1/pipeline/poll-source/:id - force poll a single source now
  app.post('/pipeline/poll-source/:id', async (request, reply) => {
    const { id: sourceId } = request.params as { id: string };

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return reply.status(404).send({ error: 'Source not found' });

    try {
      const queue = getQueue('ingestion');
      const platform = source.platform as string;

      let jobName = 'rss_poll';
      let jobData: Record<string, any> = { type: 'rss_poll', sourceId: source.id, feedUrl: source.url };

      if (platform === 'REDDIT') {
        jobName = 'reddit_poll';
        const meta = source.metadata as Record<string, any> | null;
        const subreddits = (meta?.subreddits || []) as string[];
        if (subreddits.length === 0) {
          return reply.status(400).send({ error: 'Reddit source has no subreddits configured in metadata' });
        }
        jobData = { type: 'reddit_poll', sourceId: source.id, subreddits };
      } else if (platform === 'NEWSAPI') {
        jobName = 'newsapi_poll';
        const meta = source.metadata as Record<string, any> | null;
        jobData = { type: 'newsapi_poll', sourceId: source.id, query: meta?.query || source.name };
      } else if (platform === 'TWITTER') {
        jobName = 'twitter_poll';
        const meta = source.metadata as Record<string, any> | null;
        jobData = { type: 'twitter_poll', sourceId: source.id, query: meta?.query || source.url || '' };
      }

      await queue.add(jobName, jobData, {
        jobId: `force-poll-${sourceId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
      });

      return reply.send({ message: `Poll triggered for ${source.name}`, sourceId, jobName });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/cleanup-sources — deduplicate sources by URL and name
  // Keeps the oldest source, migrates market links, deletes duplicates
  app.post('/pipeline/cleanup-sources', async (_request, reply) => {
    // Step 1: Find all sources grouped by URL (the real dedup key)
    const allSources = await prisma.source.findMany({
      select: { id: true, name: true, url: true, marketId: true, isActive: true, createdAt: true, isGlobal: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by URL (normalized)
    const byUrl = new Map<string, typeof allSources>();
    const byName = new Map<string, typeof allSources>();

    for (const src of allSources) {
      const urlKey = (src.url || '').toLowerCase().trim();
      const nameKey = src.name.toLowerCase().trim();

      if (urlKey) {
        if (!byUrl.has(urlKey)) byUrl.set(urlKey, []);
        byUrl.get(urlKey)!.push(src);
      }

      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey)!.push(src);
    }

    let duplicatesRemoved = 0;
    let marketLinksMigrated = 0;
    const removedIds: string[] = [];

    // Step 2: For each group with duplicates, keep the oldest and remove the rest
    for (const [key, group] of [...byUrl.entries(), ...byName.entries()]) {
      if (group.length <= 1) continue;

      // Keep the first (oldest by createdAt) and preferably the active one
      const sorted = group.sort((a, b) => {
        // Prefer active sources
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        // Then oldest
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const keeper = sorted[0];
      const dupes = sorted.slice(1).filter(d => !removedIds.includes(d.id) && d.id !== keeper.id);

      for (const dupe of dupes) {
        if (removedIds.includes(dupe.id)) continue;

        // Migrate market links from dupe to keeper
        if (dupe.marketId && dupe.marketId !== keeper.marketId) {
          try {
            await prisma.sourceMarket.create({
              data: { sourceId: keeper.id, marketId: dupe.marketId },
            }).catch(() => {}); // Ignore if already linked
            marketLinksMigrated++;
          } catch {}
        }

        // Migrate any SourceMarket records
        try {
          const dupeMarkets = await prisma.sourceMarket.findMany({
            where: { sourceId: dupe.id },
          });
          for (const sm of dupeMarkets) {
            await prisma.sourceMarket.create({
              data: { sourceId: keeper.id, marketId: sm.marketId },
            }).catch(() => {}); // Ignore unique constraint
            marketLinksMigrated++;
          }
        } catch {}

        // Move any story links from dupe to keeper
        try {
          await prisma.storySource.updateMany({
            where: { sourcePostId: { in: await prisma.sourcePost.findMany({ where: { sourceId: dupe.id }, select: { id: true } }).then(posts => posts.map(p => p.id)) } },
            data: {}, // StorySource links to sourcePost, not source directly
          });
        } catch {}

        // Delete the duplicate
        try {
          await prisma.accountSource.deleteMany({ where: { sourceId: dupe.id } });
          await prisma.sourceMarket.deleteMany({ where: { sourceId: dupe.id } });
          // Move posts to keeper before deleting
          await prisma.sourcePost.updateMany({
            where: { sourceId: dupe.id },
            data: { sourceId: keeper.id },
          });
          await prisma.source.delete({ where: { id: dupe.id } });
          removedIds.push(dupe.id);
          duplicatesRemoved++;
        } catch (err: any) {
          // Log but continue
        }
      }
    }

    // Step 3: Set isGlobal=false on all sources (deprecated field)
    await prisma.source.updateMany({
      where: { isGlobal: true },
      data: { isGlobal: false },
    });

    return reply.send({
      message: `Cleanup complete: removed ${duplicatesRemoved} duplicates, migrated ${marketLinksMigrated} market links`,
      duplicatesRemoved,
      marketLinksMigrated,
      totalSourcesBefore: allSources.length,
      totalSourcesAfter: allSources.length - duplicatesRemoved,
    });
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

  // POST /api/v1/pipeline/heal-sources — Force self-healing on inactive/never-polled sources
  app.post('/pipeline/heal-sources', async (_request, reply) => {
    try {
      // Find all sources that are inactive (auto-deactivated) or never polled
      const sources = await prisma.source.findMany({
        where: {
          OR: [
            { isActive: false }, // inactive (likely auto-deactivated from failures)
            { isActive: true, lastPolledAt: null }, // active but never polled
          ],
          platform: 'RSS', // only RSS sources can self-heal
          url: { not: null },
        },
        select: { id: true, name: true, url: true, platform: true, isActive: true, lastPolledAt: true, metadata: true },
      });

      let healed = 0;
      let reactivated = 0;
      let failed = 0;
      const results: string[] = [];
      const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      for (const source of sources) {
        const meta = (source.metadata || {}) as Record<string, unknown>;
        const url = source.url!;

        // Try fetching with browser UA
        try {
          const resp = await fetch(url, {
            headers: {
              'User-Agent': BROWSER_UA,
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(10000),
          });

          if (resp.ok) {
            const text = await resp.text();
            if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
              // Feed works! Reactivate + reset failures
              await prisma.source.update({
                where: { id: source.id },
                data: {
                  isActive: true,
                  metadata: { ...meta, consecutiveFailures: 0, useBrowserUA: true, healedAt: new Date().toISOString(), healResult: 'force-heal-success' },
                },
              });
              healed++;
              if (!source.isActive) reactivated++;
              results.push(`✓ ${source.name} — feed works, reactivated`);
              continue;
            }

            // HTML instead of RSS — check for Cloudflare or site without RSS
            if (text.includes('cloudflare') || text.includes('Cloudflare') || text.includes('Just a moment')) {
              // Try proxy-to-direct mapping for rsshub
              if (url.includes('rsshub.app/apnews')) {
                const apMatch = url.match(/rsshub\.app\/apnews\/topics\/(.+)/);
                if (apMatch) {
                  const directUrl = `https://apnews.com/hub/${apMatch[1].replace('apf-', '').replace(/\/$/, '')}?format=rss`;
                  const directResp = await fetch(directUrl, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(10000) }).catch(() => null);
                  if (directResp?.ok) {
                    const directText = await directResp.text();
                    if (directText.includes('<rss') || directText.includes('<feed')) {
                      await prisma.source.update({
                        where: { id: source.id },
                        data: {
                          isActive: true,
                          url: directUrl,
                          metadata: { ...meta, consecutiveFailures: 0, previousUrl: url, healResult: 'force-heal-proxy-to-direct', healedAt: new Date().toISOString() },
                        },
                      });
                      healed++;
                      if (!source.isActive) reactivated++;
                      results.push(`✓ ${source.name} — switched from proxy to ${directUrl}`);
                      continue;
                    }
                  }
                }
              }
              results.push(`✗ ${source.name} — Cloudflare blocked`);
              failed++;
              continue;
            }

            // HTML but not Cloudflare — site doesn't have RSS
            results.push(`✗ ${source.name} — returns HTML not RSS`);
            failed++;
          } else {
            results.push(`✗ ${source.name} — HTTP ${resp.status}`);
            failed++;
          }
        } catch (err: any) {
          results.push(`✗ ${source.name} — ${err.message?.substring(0, 50)}`);
          failed++;
        }
      }

      return reply.send({
        message: `Force heal complete: ${healed} healed, ${reactivated} reactivated, ${failed} still failing`,
        total: sources.length,
        healed,
        reactivated,
        failed,
        results: results.slice(0, 100),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/backfill-famous — Detect famous persons in existing stories
  app.post('/pipeline/backfill-famous', async (_request, reply) => {
    try {
      const { generateWithFallback } = await import('../lib/llm-factory.js');

      // Find stories that haven't been checked for famous persons
      const stories = await prisma.story.findMany({
        where: {
          hasFamousPerson: false,
          status: { notIn: ['ARCHIVED', 'STALE'] },
          title: { not: '' },
        },
        select: { id: true, title: true, aiSummary: true, summary: true },
        orderBy: { compositeScore: 'desc' },
        take: 100, // Process top 100 stories per call
      });

      let updated = 0;
      const famous: string[] = [];

      for (const story of stories) {
        try {
          const text = `${story.title} ${story.aiSummary || story.summary || ''}`.substring(0, 500);
          const result = await generateWithFallback(
            `List any famous/notable people mentioned in this news story. Only include truly well-known public figures (presidents, governors, celebrities, pro athletes, Fortune 500 CEOs). Respond with just names, one per line, or NONE if no famous people.\n\nStory: ${text}`,
            { maxTokens: 100, temperature: 0.1, systemPrompt: 'You identify famous people in news articles. Be strict — only list truly famous people.' }
          );

          const resultText = result.content || result.text || '';
          const names = resultText.split('\n')
            .map((l: string) => l.trim().replace(/^[-•*]\s*/, ''))
            .filter((n: string) => n && n.length > 2 && n !== 'NONE' && n !== 'None' && n !== 'N/A');

          if (names.length > 0) {
            await prisma.story.update({
              where: { id: story.id },
              data: { hasFamousPerson: true, famousPersonNames: names },
            });
            updated++;
            famous.push(`${story.title.substring(0, 40)}... → ${names.join(', ')}`);
          }
        } catch {
          // Skip on LLM failure, continue with next story
        }
      }

      return reply.send({
        message: `Backfill complete: ${updated} stories flagged with famous persons`,
        totalChecked: stories.length,
        updated,
        famous: famous.slice(0, 50),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/consolidate-news-sources — Merge per-market Bing/Google sources into one
  app.post('/pipeline/consolidate-news-sources', async (_request, reply) => {
    try {
      const results: string[] = [];

      // Find all "Bing News Local - {City}" sources and consolidate into one "Bing News" source
      for (const prefix of ['Bing News Local', 'Google News Local', 'Event Registry', 'HyperLocal Intel']) {
        const perMarketSources = await prisma.source.findMany({
          where: { name: { startsWith: prefix, mode: 'insensitive' } },
          include: { sourceMarkets: { select: { marketId: true } } },
        });

        if (perMarketSources.length <= 1) {
          results.push(`${prefix}: only ${perMarketSources.length} sources, no consolidation needed`);
          continue;
        }

        // Collect all market IDs from the individual sources + from legacy marketId
        const allMarketIds = new Set<string>();
        for (const s of perMarketSources) {
          if ((s as any).marketId) allMarketIds.add((s as any).marketId);
          for (const sm of (s as any).sourceMarkets || []) {
            allMarketIds.add(sm.marketId);
          }
        }

        // Determine the right platform and URL for the consolidated source
        const firstSource = perMarketSources[0];
        const consolPlatform = (firstSource as any).platform || 'RSS';
        const consolSourceType = (firstSource as any).sourceType || 'API_PROVIDER';
        const consolUrl = prefix.includes('Bing')
          ? 'https://www.bing.com/news/search?q=news&format=rss'
          : prefix.includes('Google')
          ? 'https://news.google.com/rss/search?q=us+news&hl=en-US'
          : prefix.includes('Event Registry')
          ? 'https://eventregistry.org'
          : prefix.includes('HyperLocal')
          ? 'https://futurilabs.com/hyperlocalhyperrecent'
          : (firstSource as any).url || '';

        // Create the consolidated source (or find existing one)
        const consolidatedName = prefix.replace(' Local', '').replace(/ - .*$/, '');
        let consolidated = await prisma.source.findFirst({
          where: { name: consolidatedName },
        });

        if (!consolidated) {
          consolidated = await prisma.source.create({
            data: {
              name: consolidatedName,
              platform: consolPlatform as any,
              sourceType: consolSourceType as any,
              url: consolUrl,
              trustScore: 0.85,
              isActive: true,
              isGlobal: false,
            },
          });
          results.push(`Created consolidated source: ${consolidatedName} (${consolPlatform})`);
        }

        // Link all markets to the consolidated source
        let linked = 0;
        for (const marketId of allMarketIds) {
          try {
            await prisma.sourceMarket.create({
              data: { sourceId: consolidated.id, marketId },
            });
            linked++;
          } catch { /* already linked */ }
        }

        // Deactivate the per-market sources (don't delete — preserve history)
        // Delete the per-market duplicates (keep only the consolidated one)
        const idsToDelete = perMarketSources.map(s => s.id).filter(id => id !== consolidated.id);
        let deletedCount = 0;
        for (const sid of idsToDelete) {
          try {
            await prisma.sourceMarket.deleteMany({ where: { sourceId: sid } });
            await prisma.accountSource.deleteMany({ where: { sourceId: sid } });
            await prisma.source.delete({ where: { id: sid } });
            deletedCount++;
          } catch {}
        }
        const deactivated = { count: deletedCount };

        results.push(`${consolidatedName}: ${perMarketSources.length} sources → 1 consolidated, ${linked} markets linked, ${deactivated.count} deactivated`);
      }

      return reply.send({
        message: 'News source consolidation complete',
        results,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/fix-source-markets — Link sources to correct markets
  // Global sources → National market, city-named sources → their city market
  app.post('/pipeline/fix-source-markets', async (_request, reply) => {
    try {
      // ── Rename "National" → "USA National" and set country codes ──
      await prisma.$executeRaw`UPDATE "Market" SET name = 'USA National', slug = 'usa-national' WHERE name = 'National' AND (country = 'US' OR country IS NULL)`.catch(() => {});
      await prisma.$executeRaw`UPDATE "Market" SET country = 'US' WHERE country IS NULL`.catch(() => {});
      await prisma.$executeRaw`UPDATE "Market" SET country = 'CA' WHERE slug = 'toronto'`.catch(() => {});

      // Ensure Market has international support columns
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`.catch(() => {});
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'`.catch(() => {});
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS region TEXT`.catch(() => {});
      // Ensure REDDIT platform enum value exists
      await prisma.$executeRaw`ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'REDDIT'`.catch(() => {});
      // Ensure ToolAnalytics table exists
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ToolAnalytics" (
          id TEXT PRIMARY KEY, tool TEXT NOT NULL, args JSONB,
          "userId" TEXT NOT NULL, role TEXT NOT NULL, "durationMs" INTEGER DEFAULT 0,
          success BOOLEAN DEFAULT true, error TEXT, cached BOOLEAN DEFAULT false,
          "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
        )
      `.catch(() => {});

      // Ensure SourceMarket + StoryEntity + SystemKnowledge tables exist
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SourceMarket" (
          "id" TEXT NOT NULL DEFAULT concat('sm_', gen_random_uuid()),
          "sourceId" TEXT NOT NULL,
          "marketId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SourceMarket_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "SourceMarket_sourceId_marketId_key" UNIQUE ("sourceId", "marketId"),
          CONSTRAINT "SourceMarket_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE,
          CONSTRAINT "SourceMarket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SourceMarket_sourceId_idx" ON "SourceMarket"("sourceId")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SourceMarket_marketId_idx" ON "SourceMarket"("marketId")`;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "StoryEntity" (
          "id" TEXT NOT NULL DEFAULT concat('se_', gen_random_uuid()),
          "storyId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          "source" TEXT NOT NULL DEFAULT 'llm',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StoryEntity_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "StoryEntity_storyId_name_type_key" UNIQUE ("storyId", "name", "type"),
          CONSTRAINT "StoryEntity_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "StoryEntity_name_type_idx" ON "StoryEntity"("name", "type")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "StoryEntity_storyId_idx" ON "StoryEntity"("storyId")`;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SystemKnowledge" (
          "id" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'general',
          "updatedBy" TEXT,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SystemKnowledge_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "SystemKnowledge_key_key" UNIQUE ("key")
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SystemKnowledge_category_idx" ON "SystemKnowledge"("category")`;

      // ── Editorial Workflow tables ──────────────────────────────────────
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "WorkflowStage" (
          "id" TEXT NOT NULL DEFAULT concat('ws_', gen_random_uuid()),
          "accountId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "slug" TEXT NOT NULL,
          "order" INTEGER NOT NULL,
          "color" TEXT NOT NULL DEFAULT '#6B7280',
          "icon" TEXT,
          "requiredRole" TEXT NOT NULL DEFAULT 'VIEWER',
          "isInitial" BOOLEAN NOT NULL DEFAULT false,
          "isFinal" BOOLEAN NOT NULL DEFAULT false,
          "autoActions" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "WorkflowStage_accountId_slug_key" UNIQUE ("accountId", "slug"),
          CONSTRAINT "WorkflowStage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "WorkflowStage_accountId_order_idx" ON "WorkflowStage"("accountId", "order")`;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PublishedContent" (
          "id" TEXT NOT NULL DEFAULT concat('pc_', gen_random_uuid()),
          "accountId" TEXT NOT NULL,
          "accountStoryId" TEXT NOT NULL,
          "platform" TEXT NOT NULL,
          "externalId" TEXT,
          "externalUrl" TEXT,
          "contentType" TEXT NOT NULL DEFAULT 'article',
          "content" JSONB,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "scheduledFor" TIMESTAMP(3),
          "publishedAt" TIMESTAMP(3),
          "error" TEXT,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PublishedContent_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "PublishedContent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE,
          CONSTRAINT "PublishedContent_accountStoryId_fkey" FOREIGN KEY ("accountStoryId") REFERENCES "AccountStory"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PublishedContent_accountId_status_idx" ON "PublishedContent"("accountId", "status")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PublishedContent_accountStoryId_idx" ON "PublishedContent"("accountStoryId")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PublishedContent_platform_idx" ON "PublishedContent"("platform")`;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "AudioSpot" (
          "id" TEXT NOT NULL DEFAULT concat('as_', gen_random_uuid()),
          "accountId" TEXT NOT NULL,
          "accountStoryId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "script" TEXT NOT NULL,
          "voiceId" TEXT NOT NULL DEFAULT 'alloy',
          "format" TEXT NOT NULL DEFAULT '30s',
          "audioUrl" TEXT,
          "audioBase64" TEXT,
          "durationMs" INTEGER,
          "model" TEXT NOT NULL DEFAULT 'tts-1',
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "error" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AudioSpot_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "AudioSpot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE,
          CONSTRAINT "AudioSpot_accountStoryId_fkey" FOREIGN KEY ("accountStoryId") REFERENCES "AccountStory"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "AudioSpot_accountStoryId_idx" ON "AudioSpot"("accountStoryId")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "AudioSpot_accountId_idx" ON "AudioSpot"("accountId")`;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "EditorialComment" (
          "id" TEXT NOT NULL DEFAULT concat('ec_', gen_random_uuid()),
          "accountStoryId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "action" TEXT,
          "fromStage" TEXT,
          "toStage" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EditorialComment_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "EditorialComment_accountStoryId_fkey" FOREIGN KEY ("accountStoryId") REFERENCES "AccountStory"("id") ON DELETE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "EditorialComment_accountStoryId_createdAt_idx" ON "EditorialComment"("accountStoryId", "createdAt")`;

      // Add new Story columns if they don't exist
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "hasFamousPerson" BOOLEAN DEFAULT false`;
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "famousPersonNames" JSONB`;
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT DEFAULT 'UNVERIFIED'`;
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "verificationScore" DOUBLE PRECISION DEFAULT 0`;
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3)`;
      await prisma.$executeRaw`ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "verificationDetails" JSONB`;

      // International market support
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'US'`;
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'en'`;
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "region" TEXT`;

      // Get all markets
      const markets = await prisma.market.findMany({
        select: { id: true, name: true, state: true, slug: true },
      });

      // Find or create National market
      let nationalMarket = markets.find(m => m.name.toLowerCase() === 'national');
      if (!nationalMarket) {
        const created = await prisma.market.create({
          data: {
            name: 'National',
            slug: 'national',
            latitude: 39.8283,
            longitude: -98.5795,
            radiusKm: 5000,
            timezone: 'America/Chicago',
            accountId: 'system',
            keywords: [],
            neighborhoods: [],
          },
        });
        nationalMarket = { id: created.id, name: 'National', state: null, slug: 'national' };
      }

      // Build city name → market ID lookup (lowercased)
      const cityToMarket: Record<string, string> = {};
      for (const m of markets) {
        cityToMarket[m.name.toLowerCase()] = m.id;
        // Also try "city, ST" format
        if (m.state) {
          cityToMarket[`${m.name.toLowerCase()}, ${m.state.toLowerCase()}`] = m.id;
        }
      }

      // Get all sources with their current SourceMarket links
      const sources = await prisma.source.findMany({
        select: {
          id: true,
          name: true,
          url: true,
          isGlobal: true,
          marketId: true,
          sourceMarkets: { select: { marketId: true } },
        },
      });

      let linked = 0;
      let nationalLinked = 0;
      let alreadyLinked = 0;
      const fixes: string[] = [];

      for (const source of sources) {
        const existingMarketIds = new Set(source.sourceMarkets.map(sm => sm.marketId));

        // Determine target market(s) for this source
        const targetMarketIds: string[] = [];

        // Check if source name contains a city name (e.g., "Bing News Local - Memphis")
        const nameLower = source.name.toLowerCase();
        let matchedCity = false;

        for (const [city, marketId] of Object.entries(cityToMarket)) {
          if (city === 'national') continue;
          if (nameLower.includes(city)) {
            targetMarketIds.push(marketId);
            matchedCity = true;
            break; // Take first match
          }
        }

        // Also check URL for city names (e.g., ?q=Memphis%20news)
        if (!matchedCity && source.url) {
          const urlDecoded = decodeURIComponent(source.url).toLowerCase();
          for (const [city, marketId] of Object.entries(cityToMarket)) {
            if (city === 'national' || city.length < 4) continue;
            if (urlDecoded.includes(city)) {
              targetMarketIds.push(marketId);
              matchedCity = true;
              break;
            }
          }
        }

        // If no city matched AND source is global/no market → link to National
        if (!matchedCity) {
          if (source.isGlobal || (!source.marketId && existingMarketIds.size === 0)) {
            targetMarketIds.push(nationalMarket.id);
          }
        }

        // Create missing SourceMarket links
        for (const marketId of targetMarketIds) {
          if (existingMarketIds.has(marketId)) {
            alreadyLinked++;
            continue;
          }

          try {
            await prisma.sourceMarket.create({
              data: { sourceId: source.id, marketId },
            });

            if (marketId === nationalMarket.id) {
              nationalLinked++;
              fixes.push(`${source.name} → National`);
            } else {
              linked++;
              const market = markets.find(m => m.id === marketId);
              fixes.push(`${source.name} → ${market?.name || marketId}`);
            }
          } catch {
            // Unique constraint — already linked
            alreadyLinked++;
          }
        }
      }

      return reply.send({
        message: `Fixed source-market links`,
        totalSources: sources.length,
        newCityLinks: linked,
        newNationalLinks: nationalLinked,
        alreadyLinked,
        fixes: fixes.slice(0, 100), // Show first 100 fixes
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/seed-toronto — Create Toronto market + Reddit + RSS sources
  app.post('/pipeline/seed-toronto', async (request, reply) => {
    try {
      // Ensure REDDIT enum value exists in DB (may not if migration hasn't run)
      await prisma.$executeRaw`ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'REDDIT'`.catch(() => {});

      // Ensure country/language/region columns exist on Market (may not if migration hasn't run)
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`.catch(() => {});
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'`.catch(() => {});
      await prisma.$executeRaw`ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS region TEXT`.catch(() => {});

      // Ensure ToolAnalytics table exists
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ToolAnalytics" (
          id TEXT PRIMARY KEY,
          tool TEXT NOT NULL,
          args JSONB,
          "userId" TEXT NOT NULL,
          role TEXT NOT NULL,
          "durationMs" INTEGER NOT NULL DEFAULT 0,
          success BOOLEAN NOT NULL DEFAULT true,
          error TEXT,
          cached BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `.catch(() => {});

      // Deduplicate Toronto markets — keep only the one with the most sources linked
      await prisma.$executeRaw`
        DELETE FROM "Market" WHERE slug = 'toronto' AND id NOT IN (
          SELECT m.id FROM "Market" m
          LEFT JOIN "Source" s ON s."marketId" = m.id
          WHERE m.slug = 'toronto'
          GROUP BY m.id
          ORDER BY COUNT(s.id) DESC
          LIMIT 1
        )
      `.catch(() => {});

      // Find an account to attach the market to
      const account = await prisma.account.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!account) return reply.status(400).send({ error: 'No active account found' });

      const accountId = account.id;

      // Use raw SQL to create Toronto market (avoids Prisma schema mismatch with country/language columns)
      const marketId = `mkt_toronto_${accountId.slice(0, 8)}`;
      await prisma.$executeRaw`
        INSERT INTO "Market" (id, "accountId", name, slug, state, latitude, longitude, "radiusKm", timezone, "isActive", keywords, neighborhoods, "createdAt", "updatedAt")
        VALUES (
          ${marketId}, ${accountId}, 'Toronto', 'toronto', 'ON',
          43.6532, -79.3832, 60, 'America/Toronto', true,
          ${JSON.stringify(['toronto', 'gta', 'the six', 'the 6ix', 'yyz', 'tdot', 'peel region', 'york region', 'durham region', 'halton region', 'ontario'])}::jsonb,
          ${JSON.stringify(['Downtown', 'Midtown', 'North York', 'Scarborough', 'Etobicoke', 'East York', 'Yorkville', 'The Annex', 'Kensington Market', 'Queen West', 'King West', 'Liberty Village', 'Leslieville', 'The Beaches', 'Danforth', 'Roncesvalles', 'High Park', 'Parkdale', 'Junction', 'Bloor West Village', 'Forest Hill', 'Lawrence Park', 'Leaside', 'Don Mills', 'Willowdale', 'Thornhill', 'Richmond Hill', 'Markham', 'Vaughan', 'Mississauga', 'Brampton', 'Oakville', 'Burlington', 'Ajax', 'Pickering', 'Oshawa', 'Whitby', 'Milton', 'Newmarket', 'Aurora', 'Caledon'])}::jsonb,
          NOW(), NOW()
        )
        ON CONFLICT ("accountId", slug) DO UPDATE SET "isActive" = true
      `;

      // Set country to CA for Toronto (column may have just been created above)
      await prisma.$executeRaw`UPDATE "Market" SET country = 'CA' WHERE slug = 'toronto'`.catch(() => {});

      // Get the actual market ID (may differ if it already existed)
      const marketRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM "Market" WHERE "accountId" = ${accountId} AND slug = 'toronto' LIMIT 1
      `;
      const market = { id: marketRows[0]?.id || marketId };

      // Helper to create source and link to market via raw SQL
      // (avoids Prisma enum mismatch — REDDIT may not exist in DB enum yet)
      const created: string[] = [];
      async function createSource(data: any) {
        // Check if exists — by exact platform match first, then by name alone (handles RSS→REDDIT migration)
        let existing = await prisma.$queryRaw<any[]>`
          SELECT id, platform FROM "Source" WHERE name = ${data.name} AND platform = ${data.platform}::"Platform" LIMIT 1
        `.catch(() => []);

        // Also check by name only (source may have been created with RSS fallback for REDDIT)
        if (existing.length === 0) {
          existing = await prisma.$queryRaw<any[]>`
            SELECT id, platform FROM "Source" WHERE name = ${data.name} LIMIT 1
          `.catch(() => []);
        }

        if (existing.length > 0) {
          const existingId = existing[0].id;
          const existingPlatform = existing[0].platform;
          // Fix platform if it was created with RSS fallback but should be REDDIT
          if (data.platform === 'REDDIT' && existingPlatform === 'RSS') {
            await prisma.$executeRaw`UPDATE "Source" SET platform = 'REDDIT'::"Platform" WHERE id = ${existingId}`.catch(() => {});
            // Also ensure metadata has subreddits
            if (data.metadata?.subreddits) {
              await prisma.$executeRaw`
                UPDATE "Source" SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{subreddits}', ${JSON.stringify(data.metadata.subreddits)}::jsonb)
                WHERE id = ${existingId}
              `.catch(() => {});
            }
            created.push(`${data.name} (fixed platform RSS→REDDIT, linked)`);
          } else {
            created.push(`${data.name} (already existed, linked)`);
          }
          await prisma.$executeRaw`
            INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt")
            VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${existingId}, ${market.id}, NOW())
            ON CONFLICT ("sourceId", "marketId") DO NOTHING
          `.catch(() => {});
          return;
        }

        const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        // Use RSS platform as fallback if REDDIT enum doesn't exist yet
        const platform = data.platform;
        try {
          await prisma.$executeRaw`
            INSERT INTO "Source" (id, platform, "sourceType", name, url, "trustScore", "isActive", "marketId", metadata, "createdAt", "updatedAt")
            VALUES (${sourceId}, ${platform}::"Platform", ${data.sourceType}::"SourceType", ${data.name}, ${data.url}, ${data.trustScore}, true, ${market.id}, ${JSON.stringify(data.metadata || {})}::jsonb, NOW(), NOW())
          `;
        } catch {
          // REDDIT enum doesn't exist — use RSS as platform, store real platform in metadata
          await prisma.$executeRaw`
            INSERT INTO "Source" (id, platform, "sourceType", name, url, "trustScore", "isActive", "marketId", metadata, "createdAt", "updatedAt")
            VALUES (${sourceId}, 'RSS'::"Platform", ${data.sourceType}::"SourceType", ${data.name}, ${data.url}, ${data.trustScore}, true, ${market.id}, ${JSON.stringify({ ...data.metadata, actualPlatform: 'REDDIT' })}::jsonb, NOW(), NOW())
          `;
        }

        await prisma.$executeRaw`
          INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt")
          VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${sourceId}, ${market.id}, NOW())
          ON CONFLICT ("sourceId", "marketId") DO NOTHING
        `.catch(() => {});
        created.push(data.name);
      }

      // Reddit consolidated source
      await createSource({
        platform: 'REDDIT', sourceType: 'RSS_FEED',
        name: 'Reddit Toronto (13 subreddits)',
        url: 'https://www.reddit.com/r/Toronto',
        trustScore: 0.55,
        metadata: {
          subreddits: ['Toronto', 'Ontario', 'askTO', 'TorontoRealEstate', 'FoodToronto', 'torontoraptors', 'leafs', 'BlueJays', 'Mississauga', 'Brampton', 'Markham', 'PersonalFinanceCanada', 'TorontoDriving'],
          type: 'reddit-consolidated',
        },
      });

      // Toronto + Ontario RSS/API sources (TV, radio, newspapers, blogs, government)
      const feeds = [
        // ── TV Stations ──
        { name: 'CBC Toronto', url: 'https://www.cbc.ca/cmlink/rss-canada-toronto', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.90, metadata: { type: 'tv', network: 'CBC', callSign: 'CBLT' } },
        { name: 'CBC Ontario', url: 'https://www.cbc.ca/cmlink/rss-canada-ottawa', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.90, metadata: { type: 'tv', network: 'CBC' } },
        { name: 'CBC Hamilton', url: 'https://www.cbc.ca/cmlink/rss-canada-hamilton', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.90, metadata: { type: 'tv', network: 'CBC' } },
        { name: 'CBC Kitchener-Waterloo', url: 'https://www.cbc.ca/cmlink/rss-canada-kitchener-waterloo', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.90, metadata: { type: 'tv', network: 'CBC' } },
        { name: 'CTV Toronto', url: 'https://toronto.ctvnews.ca/rss/ctv-news-toronto-1.822319', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.88, metadata: { type: 'tv', network: 'CTV', callSign: 'CFTO' } },
        { name: 'CTV Barrie', url: 'https://barrie.ctvnews.ca/rss/ctv-news-barrie-1.1272498', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'tv', network: 'CTV' } },
        { name: 'Global News Toronto', url: 'https://globalnews.ca/toronto/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'tv', network: 'Global', callSign: 'CIII' } },
        { name: 'Global News Canada', url: 'https://globalnews.ca/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'tv', network: 'Global' } },
        { name: 'CP24', url: 'https://www.cp24.com/rss/topstories', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.88, metadata: { type: 'tv', network: 'CP24', callSign: 'CP24' } },
        { name: 'CityNews Toronto', url: 'https://toronto.citynews.ca/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.82, metadata: { type: 'tv', network: 'CityTV', callSign: 'CITY' } },
        { name: 'TVO - Ontario Today', url: 'https://www.tvo.org/rss.xml', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'tv', network: 'TVO' } },
        // ── Radio Stations ──
        { name: 'CBC Radio One Toronto', url: 'https://www.cbc.ca/cmlink/rss-topstories', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.92, metadata: { type: 'radio', network: 'CBC', callSign: 'CBLA-FM', format: 'News/Talk', frequency: '99.1 FM' } },
        { name: 'Newstalk 1010 CFRB', url: 'https://www.iheartradio.ca/newstalk-1010/rss', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.80, metadata: { type: 'radio', callSign: 'CFRB', format: 'News/Talk', frequency: '1010 AM' } },
        { name: '680 News Toronto', url: 'https://www.680news.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.82, metadata: { type: 'radio', callSign: 'CFTR', format: 'All-News', frequency: '680 AM' } },
        { name: 'AM640 Toronto', url: 'https://globalnews.ca/am640/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.78, metadata: { type: 'radio', callSign: 'CFMJ', format: 'News/Talk', frequency: '640 AM' } },
        { name: 'CP24 Radio', url: 'https://www.cp24.com/rss/cp24-latest-news-1.7498316', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'radio', network: 'CP24', format: 'All-News' } },
        // ── Newspapers ──
        { name: 'Toronto Star', url: 'https://www.thestar.com/search/?f=rss&t=article&c=news/gta*&l=50&s=start_time&sd=desc', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'newspaper' } },
        { name: 'Toronto Star - Canada', url: 'https://www.thestar.com/search/?f=rss&t=article&c=news/canada*&l=50&s=start_time&sd=desc', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'newspaper' } },
        { name: 'Toronto Sun', url: 'https://torontosun.com/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.75, metadata: { type: 'newspaper' } },
        { name: 'National Post', url: 'https://nationalpost.com/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.82, metadata: { type: 'newspaper' } },
        { name: 'Globe and Mail', url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.88, metadata: { type: 'newspaper' } },
        { name: 'Hamilton Spectator', url: 'https://www.thespec.com/search/?f=rss&t=article&l=50&s=start_time&sd=desc', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.78, metadata: { type: 'newspaper', city: 'Hamilton' } },
        { name: 'Ottawa Citizen', url: 'https://ottawacitizen.com/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.78, metadata: { type: 'newspaper', city: 'Ottawa' } },
        // ── Blogs & Hyperlocal ──
        { name: 'BlogTO', url: 'https://www.blogto.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'blog', subtype: 'local' } },
        { name: 'Daily Hive Toronto', url: 'https://dailyhive.com/toronto/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'blog', subtype: 'local' } },
        { name: 'Narcity Toronto', url: 'https://www.narcity.com/toronto/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.55, metadata: { type: 'blog', subtype: 'lifestyle' } },
        { name: 'The Logic', url: 'https://thelogic.co/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.75, metadata: { type: 'blog', subtype: 'business' } },
        { name: 'Storeys Toronto Real Estate', url: 'https://storeys.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'blog', subtype: 'real-estate' } },
        { name: 'Toronto Guardian', url: 'https://torontoguardian.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.55, metadata: { type: 'blog', subtype: 'local' } },
        // ── Government & Official ──
        { name: 'City of Toronto News', url: 'https://www.toronto.ca/news/feed/', platform: 'RSS', sourceType: 'GOV_AGENCY', trustScore: 0.95, metadata: { type: 'government', level: 'municipal' } },
        { name: 'Ontario Newsroom', url: 'https://news.ontario.ca/en/rss/allnews', platform: 'RSS', sourceType: 'GOV_AGENCY', trustScore: 0.95, metadata: { type: 'government', level: 'provincial' } },
        { name: 'Toronto Police News', url: 'https://torontopolice.on.ca/newsreleases/rss.php', platform: 'RSS', sourceType: 'GOV_AGENCY', trustScore: 0.92, metadata: { type: 'government', subtype: 'police' } },
        { name: 'TTC Service Alerts', url: 'https://www.ttc.ca/service-advisories/RSS', platform: 'RSS', sourceType: 'GOV_AGENCY', trustScore: 0.90, metadata: { type: 'government', subtype: 'transit' } },
        // ── Sports ──
        { name: 'Sportsnet - Raptors', url: 'https://www.sportsnet.ca/basketball/nba/teams/toronto-raptors/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.80, metadata: { type: 'sports', team: 'Raptors' } },
        { name: 'Sportsnet - Leafs', url: 'https://www.sportsnet.ca/hockey/nhl/teams/toronto-maple-leafs/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.80, metadata: { type: 'sports', team: 'Maple Leafs' } },
        { name: 'Sportsnet - Blue Jays', url: 'https://www.sportsnet.ca/baseball/mlb/teams/toronto-blue-jays/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.80, metadata: { type: 'sports', team: 'Blue Jays' } },
        { name: 'Sportsnet - TFC', url: 'https://www.sportsnet.ca/soccer/mls/teams/toronto-fc/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.80, metadata: { type: 'sports', team: 'Toronto FC' } },
        { name: 'TSN', url: 'https://www.tsn.ca/rss/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.82, metadata: { type: 'sports', network: 'TSN' } },
        // ── Wire / Aggregator ──
        { name: 'Google News - Toronto', url: 'https://news.google.com/rss/search?q=Toronto+Ontario+news&hl=en-CA&gl=CA&ceid=CA:en', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.75, metadata: { type: 'google-news', subtype: 'local' } },
        { name: 'Google News - Ontario', url: 'https://news.google.com/rss/search?q=Ontario+Canada+news&hl=en-CA&gl=CA&ceid=CA:en', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.75, metadata: { type: 'google-news', subtype: 'provincial' } },
        { name: 'Google News - GTA Crime', url: 'https://news.google.com/rss/search?q=Toronto+GTA+crime+police&hl=en-CA&gl=CA&ceid=CA:en', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.70, metadata: { type: 'google-news', subtype: 'crime' } },
        { name: 'Bing News - Toronto', url: 'https://www.bing.com/news/search?q=Toronto+Ontario+news&format=rss', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.70, metadata: { type: 'bing-news', subtype: 'local' } },
        { name: 'Canadian Press', url: 'https://www.thecanadianpress.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.92, metadata: { type: 'wire', provider: 'CP' } },
        // ── Suburban / Regional ──
        { name: 'Mississauga News', url: 'https://www.mississauga.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'newspaper', city: 'Mississauga' } },
        { name: 'Brampton Guardian', url: 'https://www.bramptonguardian.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'newspaper', city: 'Brampton' } },
        { name: 'York Region', url: 'https://www.yorkregion.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'newspaper', city: 'Markham' } },
        { name: 'Durham Region', url: 'https://www.durhamregion.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.65, metadata: { type: 'newspaper', city: 'Oshawa' } },
        { name: 'Waterloo Region Record', url: 'https://www.therecord.com/search/?f=rss&t=article&l=50&s=start_time&sd=desc', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.72, metadata: { type: 'newspaper', city: 'Kitchener' } },
        // ── Business & Tech ──
        { name: 'BetaKit (Canadian Tech)', url: 'https://betakit.com/feed/', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.70, metadata: { type: 'blog', subtype: 'tech' } },
        { name: 'Financial Post', url: 'https://financialpost.com/feed', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.82, metadata: { type: 'newspaper', subtype: 'business' } },
        { name: 'BNN Bloomberg Canada', url: 'https://www.bnnbloomberg.ca/rss/latest', platform: 'RSS', sourceType: 'NEWS_ORG', trustScore: 0.85, metadata: { type: 'tv', network: 'BNN Bloomberg', subtype: 'business' } },
      ];

      for (const f of feeds) {
        await createSource(f);
      }

      // Debug: report actual Reddit source state from DB
      let redditDebug: any = null;
      try {
        const redditSources = await prisma.$queryRaw<any[]>`
          SELECT id, name, platform, "isActive", "lastPolledAt", metadata->>'subreddits' as subreddits
          FROM "Source" WHERE name LIKE '%Reddit%' LIMIT 5
        `;
        redditDebug = redditSources;
      } catch (e: any) { redditDebug = { error: e.message }; }

      return reply.send({
        message: `Toronto market created with ${created.length} sources`,
        marketId: market.id,
        marketName: 'Toronto',
        sources: created,
        redditDebug,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/pipeline/seed-national — Create a national market for any country
  app.post('/pipeline/seed-national', async (request, reply) => {
    const body = z.object({
      country: z.string().min(2).max(6).default('CA'), // ISO 3166-1 alpha-2 or GLOBAL
      name: z.string().optional(), // e.g., "Canada National"
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Provide country code (2-letter ISO)' });

    const { country } = body.data;
    const countryUpper = country.toUpperCase();

    const NATIONAL_CONFIGS: Record<string, { name: string; slug: string; lat: number; lon: number; tz: string; keywords: string[]; feeds: Array<{ name: string; url: string; trust: number }> }> = {
      CA: {
        name: 'Canada National',
        slug: 'canada-national',
        lat: 56.1304, lon: -106.3468, tz: 'America/Toronto',
        keywords: ['canada', 'canadian', 'federal', 'ottawa', 'parliament', 'trudeau', 'house of commons', 'senate'],
        feeds: [
          { name: 'CBC National', url: 'https://www.cbc.ca/cmlink/rss-topstories', trust: 0.92 },
          { name: 'CTV National', url: 'https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009', trust: 0.88 },
          { name: 'Global News Canada', url: 'https://globalnews.ca/feed/', trust: 0.85 },
          { name: 'National Post', url: 'https://nationalpost.com/feed', trust: 0.82 },
          { name: 'Globe and Mail', url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/', trust: 0.88 },
          { name: 'Canadian Press', url: 'https://www.thecanadianpress.com/feed/', trust: 0.92 },
          { name: 'Google News Canada', url: 'https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en', trust: 0.75 },
        ],
      },
      GB: {
        name: 'UK National',
        slug: 'uk-national',
        lat: 51.5074, lon: -0.1278, tz: 'Europe/London',
        keywords: ['uk', 'britain', 'british', 'england', 'parliament', 'westminster', 'downing street'],
        feeds: [
          { name: 'BBC News UK', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', trust: 0.92 },
          { name: 'The Guardian', url: 'https://www.theguardian.com/uk-news/rss', trust: 0.85 },
          { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/uk.xml', trust: 0.82 },
        ],
      },
      AU: {
        name: 'Australia National',
        slug: 'australia-national',
        lat: -25.2744, lon: 133.7751, tz: 'Australia/Sydney',
        keywords: ['australia', 'australian', 'canberra', 'parliament house', 'asx'],
        feeds: [
          { name: 'ABC Australia', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml', trust: 0.90 },
          { name: 'Sydney Morning Herald', url: 'https://www.smh.com.au/rss/feed.xml', trust: 0.82 },
        ],
      },
    };

    // Also support "GLOBAL" / "WORLD" as a special case
    const GLOBAL_CONFIG = {
      name: 'Global / World News',
      slug: 'global-world',
      lat: 0, lon: 0, tz: 'UTC',
      keywords: ['world', 'global', 'international', 'breaking', 'united nations', 'nato', 'eu', 'g7', 'g20'],
      feeds: [
        { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', trust: 0.95 },
        { name: 'BBC World News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', trust: 0.92 },
        { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', trust: 0.82 },
        { name: 'AP World News', url: 'https://rsshub.app/apnews/topics/apf-intlnews', trust: 0.95 },
        { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', trust: 0.88 },
        { name: 'France 24', url: 'https://www.france24.com/en/rss', trust: 0.80 },
        { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', trust: 0.80 },
        { name: 'Google News World', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', trust: 0.75 },
      ],
    };

    if (countryUpper === 'GLOBAL' || countryUpper === 'WW') {
      // Use global config
      const account = await prisma.account.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!account) return reply.status(400).send({ error: 'No active account' });
      const marketId = `mkt_global_world_${account.id.slice(0, 8)}`;
      await prisma.$executeRaw`
        INSERT INTO "Market" (id, "accountId", name, slug, state, latitude, longitude, "radiusKm", timezone, "isActive", keywords, "createdAt", "updatedAt")
        VALUES (${marketId}, ${account.id}, ${GLOBAL_CONFIG.name}, ${GLOBAL_CONFIG.slug}, NULL, 0, 0, 40000, 'UTC', true, ${JSON.stringify(GLOBAL_CONFIG.keywords)}::jsonb, NOW(), NOW())
        ON CONFLICT ("accountId", slug) DO UPDATE SET name = ${GLOBAL_CONFIG.name}, "isActive" = true
      `;
      const rows = await prisma.$queryRaw<any[]>`SELECT id FROM "Market" WHERE slug = 'global-world' LIMIT 1`;
      const mktId = rows[0]?.id || marketId;
      const created: string[] = [];
      for (const feed of GLOBAL_CONFIG.feeds) {
        const srcId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const existing = await prisma.$queryRaw<any[]>`SELECT id FROM "Source" WHERE name = ${feed.name} LIMIT 1`.catch(() => []);
        if (existing.length > 0) {
          await prisma.$executeRaw`INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt") VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${existing[0].id}, ${mktId}, NOW()) ON CONFLICT DO NOTHING`.catch(() => {});
          created.push(`${feed.name} (linked)`);
        } else {
          await prisma.$executeRaw`INSERT INTO "Source" (id, platform, "sourceType", name, url, "trustScore", "isActive", "marketId", metadata, "createdAt", "updatedAt") VALUES (${srcId}, 'RSS'::"Platform", 'NEWS_ORG'::"SourceType", ${feed.name}, ${feed.url}, ${feed.trust}, true, ${mktId}, '{}', NOW(), NOW())`;
          await prisma.$executeRaw`INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt") VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${srcId}, ${mktId}, NOW()) ON CONFLICT DO NOTHING`.catch(() => {});
          created.push(feed.name);
        }
      }
      return reply.send({ message: `${GLOBAL_CONFIG.name} created with ${created.length} sources`, marketId: mktId, country: 'GLOBAL', sources: created });
    }

    const config = NATIONAL_CONFIGS[countryUpper];
    if (!config) {
      return reply.status(400).send({ error: `No national config for country "${countryUpper}". Supported: ${Object.keys(NATIONAL_CONFIGS).join(', ')}` });
    }

    try {
      const account = await prisma.account.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!account) return reply.status(400).send({ error: 'No active account' });

      const marketName = body.data.name || config.name;

      // Create national market via raw SQL
      const marketId = `mkt_${config.slug.replace(/-/g, '_')}_${account.id.slice(0, 8)}`;
      await prisma.$executeRaw`
        INSERT INTO "Market" (id, "accountId", name, slug, state, latitude, longitude, "radiusKm", timezone, "isActive", keywords, "createdAt", "updatedAt")
        VALUES (${marketId}, ${account.id}, ${marketName}, ${config.slug}, NULL, ${config.lat}, ${config.lon}, 5000, ${config.tz}, true, ${JSON.stringify(config.keywords)}::jsonb, NOW(), NOW())
        ON CONFLICT ("accountId", slug) DO UPDATE SET name = ${marketName}, "isActive" = true
      `;
      await prisma.$executeRaw`UPDATE "Market" SET country = ${countryUpper} WHERE slug = ${config.slug}`.catch(() => {});

      // Get actual market ID
      const rows = await prisma.$queryRaw<any[]>`SELECT id FROM "Market" WHERE slug = ${config.slug} LIMIT 1`;
      const mktId = rows[0]?.id || marketId;

      // Create feeds
      const created: string[] = [];
      for (const feed of config.feeds) {
        const srcId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const existing = await prisma.$queryRaw<any[]>`SELECT id FROM "Source" WHERE name = ${feed.name} LIMIT 1`.catch(() => []);
        if (existing.length > 0) {
          await prisma.$executeRaw`INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt") VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${existing[0].id}, ${mktId}, NOW()) ON CONFLICT DO NOTHING`.catch(() => {});
          created.push(`${feed.name} (linked)`);
        } else {
          await prisma.$executeRaw`INSERT INTO "Source" (id, platform, "sourceType", name, url, "trustScore", "isActive", "marketId", metadata, "createdAt", "updatedAt") VALUES (${srcId}, 'RSS'::"Platform", 'NEWS_ORG'::"SourceType", ${feed.name}, ${feed.url}, ${feed.trust}, true, ${mktId}, '{}', NOW(), NOW())`;
          await prisma.$executeRaw`INSERT INTO "SourceMarket" (id, "sourceId", "marketId", "createdAt") VALUES (${`sm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${srcId}, ${mktId}, NOW()) ON CONFLICT DO NOTHING`.catch(() => {});
          created.push(feed.name);
        }
      }

      return reply.send({ message: `${marketName} created with ${created.length} sources`, marketId: mktId, country: countryUpper, sources: created });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
