// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


export async function broadcastMonitorRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // POST /broadcast-monitor/competitors — add competitor feed
  app.post('/broadcast-monitor/competitors', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      name: z.string().min(1),
      stationCall: z.string().min(1),
      feedUrl: z.string().url(),
      market: z.string().optional(),
    }).parse(request.body);

    const feed = await prisma.coverageFeed.create({
      data: {
        accountId: payload.accountId,
        name: `${body.stationCall} - ${body.name}`,
        type: 'COMPETITOR',
        url: body.feedUrl,
        isActive: true,
        pollIntervalMin: 10, // Check competitors every 10 min
      },
    });

    return reply.status(201).send({ data: feed });
  });

  // GET /broadcast-monitor/competitors — list configured competitors
  app.get('/broadcast-monitor/competitors', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const feeds = await prisma.coverageFeed.findMany({
      where: { accountId: payload.accountId, type: 'COMPETITOR' },
      include: {
        _count: { select: { matches: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: feeds });
  });

  // DELETE /broadcast-monitor/competitors/:id
  app.delete('/broadcast-monitor/competitors/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.coverageFeed.deleteMany({ where: { id, accountId: payload.accountId, type: 'COMPETITOR' } });
    return reply.status(204).send();
  });

  // GET /broadcast-monitor/dashboard — competitive intelligence dashboard
  app.get('/broadcast-monitor/dashboard', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get competitor feeds
    const competitorFeeds = await prisma.coverageFeed.findMany({
      where: { accountId: payload.accountId, type: 'COMPETITOR', isActive: true },
    });

    const competitorFeedIds = competitorFeeds.map((f) => f.id);

    if (competitorFeedIds.length === 0) {
      return reply.send({
        data: {
          competitorExclusives: [],
          ourExclusives: [],
          sharedCoverage: [],
          competitorActivity: [],
          beatScore: 0,
        },
      });
    }

    // Get all coverage matches for competitor feeds in last 24h
    const matches = await prisma.coverageMatch.findMany({
      where: {
        coverageFeedId: { in: competitorFeedIds },
        matchedAt: { gte: oneDayAgo },
      },
      include: {
        story: {
          select: {
            id: true, title: true, status: true, category: true,
            compositeScore: true, firstSeenAt: true, sourceCount: true,
          },
        },
        coverageFeed: { select: { id: true, name: true } },
      },
      orderBy: { matchedAt: 'desc' },
    });

    // Competitor exclusives: stories they covered (isCovered=true) that we haven't
    // Get our own coverage feeds (non-COMPETITOR type)
    const ourFeeds = await prisma.coverageFeed.findMany({
      where: { accountId: payload.accountId, type: { not: 'COMPETITOR' }, isActive: true },
    });
    const ourFeedIds = ourFeeds.map((f) => f.id);

    const ourMatches = ourFeedIds.length > 0
      ? await prisma.coverageMatch.findMany({
          where: {
            coverageFeedId: { in: ourFeedIds },
            isCovered: true,
            matchedAt: { gte: oneDayAgo },
          },
          select: { storyId: true },
        })
      : [];

    const ourCoveredStoryIds = new Set(ourMatches.map((m) => m.storyId));

    // Stories competitors covered
    const competitorCoveredMap = new Map<string, { story: any; feeds: string[]; matchedTitle: string | null }>();
    for (const m of matches) {
      if (m.isCovered && m.story) {
        const existing = competitorCoveredMap.get(m.storyId);
        if (existing) {
          existing.feeds.push(m.coverageFeed.name);
        } else {
          competitorCoveredMap.set(m.storyId, {
            story: m.story,
            feeds: [m.coverageFeed.name],
            matchedTitle: m.matchedTitle,
          });
        }
      }
    }

    // Competitor exclusives = they covered it, we didn't
    const competitorExclusives = [];
    const sharedCoverage = [];
    for (const [storyId, data] of competitorCoveredMap) {
      if (ourCoveredStoryIds.has(storyId)) {
        sharedCoverage.push({ ...data.story, competitorFeeds: data.feeds });
      } else {
        competitorExclusives.push({
          ...data.story,
          competitorFeeds: data.feeds,
          competitorTitle: data.matchedTitle,
        });
      }
    }

    // Our exclusives = stories we have that no competitor covered
    const recentStories = await prisma.story.findMany({
      where: {
        accountId: payload.accountId,
        mergedIntoId: null,
        firstSeenAt: { gte: oneDayAgo },
        status: { notIn: ['STALE', 'ARCHIVED'] },
      },
      select: { id: true, title: true, status: true, category: true, compositeScore: true },
      orderBy: { compositeScore: 'desc' },
      take: 50,
    });

    const ourExclusives = recentStories.filter(
      (s) => !competitorCoveredMap.has(s.id) && s.compositeScore > 0.3
    );

    // Per-competitor activity stats
    const competitorActivity = competitorFeeds.map((feed) => {
      const feedMatches = matches.filter((m) => m.coverageFeedId === feed.id);
      const covered = feedMatches.filter((m) => m.isCovered);
      return {
        name: feed.name,
        storiesDetected: feedMatches.length,
        storiesCovered: covered.length,
        overlapWithUs: covered.filter((m) => ourCoveredStoryIds.has(m.storyId)).length,
      };
    });

    // Beat score: for shared coverage stories, what % did we detect first?
    let beatCount = 0;
    for (const shared of sharedCoverage) {
      const ourStory = recentStories.find((s) => s.id === shared.id);
      if (ourStory) beatCount++; // We had it (simplified — ideally compare timestamps)
    }
    const beatScore = sharedCoverage.length > 0
      ? Math.round((beatCount / sharedCoverage.length) * 100)
      : 100;

    return reply.send({
      data: {
        competitorExclusives: competitorExclusives.slice(0, 20),
        ourExclusives: ourExclusives.slice(0, 20),
        sharedCoverage: sharedCoverage.slice(0, 20),
        competitorActivity,
        beatScore,
        summary: {
          totalCompetitorStories: competitorCoveredMap.size,
          competitorExclusiveCount: competitorExclusives.length,
          ourExclusiveCount: ourExclusives.length,
          sharedCount: sharedCoverage.length,
        },
      },
    });
  });

  // GET /broadcast-monitor/timeline — competitive coverage timeline
  app.get('/broadcast-monitor/timeline', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const matches = await prisma.coverageMatch.findMany({
      where: {
        accountId: payload.accountId,
        matchedAt: { gte: oneDayAgo },
      },
      select: { matchedAt: true, isCovered: true, coverageFeed: { select: { type: true } } },
      orderBy: { matchedAt: 'asc' },
    });

    // Group by hour
    const hourBuckets: Record<string, { competitor: number; ours: number }> = {};
    for (const m of matches) {
      const hour = new Date(m.matchedAt).toISOString().slice(0, 13) + ':00:00Z';
      if (!hourBuckets[hour]) hourBuckets[hour] = { competitor: 0, ours: 0 };
      if (m.coverageFeed.type === 'COMPETITOR') {
        hourBuckets[hour].competitor++;
      } else {
        hourBuckets[hour].ours++;
      }
    }

    return reply.send({
      data: Object.entries(hourBuckets).map(([hour, counts]) => ({ hour, ...counts })),
    });
  });
}
