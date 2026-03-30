// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function analyticsRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/analytics/overview - dashboard summary
  app.get('/analytics/overview', async (_request, reply) => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalStories,
      last24hStories,
      lastWeekStories,
      breakingCount,
      topStoryCount,
      sourceCount,
      statusCounts,
      categoryCounts,
      topSources,
    ] = await Promise.all([
      prisma.story.count({ where: { mergedIntoId: null } }),
      prisma.story.count({ where: { mergedIntoId: null, firstSeenAt: { gte: oneDayAgo } } }),
      prisma.story.count({ where: { mergedIntoId: null, firstSeenAt: { gte: oneWeekAgo } } }),
      prisma.story.count({ where: { status: 'BREAKING', mergedIntoId: null } }),
      prisma.story.count({ where: { status: 'TOP_STORY', mergedIntoId: null } }),
      prisma.source.count({ where: { isActive: true } }),
      prisma.story.groupBy({
        by: ['status'],
        where: { mergedIntoId: null },
        _count: { _all: true },
      }),
      prisma.story.groupBy({
        by: ['category'],
        where: { mergedIntoId: null, category: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10,
      }),
      prisma.source.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          platform: true,
          _count: { select: { posts: true } },
        },
        orderBy: { posts: { _count: 'desc' } },
        take: 10,
      }),
    ]);

    return reply.send({
      overview: {
        totalStories,
        last24hStories,
        lastWeekStories,
        breakingNow: breakingCount,
        topStoriesNow: topStoryCount,
        activeSources: sourceCount,
      },
      statuses: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
      categories: categoryCounts.map((c) => ({ category: c.category, count: c._count._all })),
      topSources: topSources.map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
        postCount: s._count.posts,
      })),
    });
  });

  // GET /api/v1/analytics/domain-scores - source reliability rankings
  app.get('/analytics/domain-scores', async (_request, reply) => {
    const scores = await prisma.domainScore.findMany({
      orderBy: { score: 'desc' },
      take: 50,
    });
    return reply.send({ data: scores });
  });

  // GET /api/v1/analytics/timeline - story creation timeline
  app.get('/analytics/timeline', async (_request, reply) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stories = await prisma.story.findMany({
      where: { mergedIntoId: null, firstSeenAt: { gte: sevenDaysAgo } },
      select: { firstSeenAt: true, status: true, category: true },
      orderBy: { firstSeenAt: 'asc' },
    });

    // Group by hour
    const hourBuckets: Record<string, { total: number; breaking: number; topStory: number }> = {};
    for (const story of stories) {
      const hour = new Date(story.firstSeenAt).toISOString().slice(0, 13) + ':00:00Z';
      if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, breaking: 0, topStory: 0 };
      hourBuckets[hour].total++;
      if (story.status === 'BREAKING' || story.status === 'ALERT') hourBuckets[hour].breaking++;
      if (story.status === 'TOP_STORY') hourBuckets[hour].topStory++;
    }

    const timeline = Object.entries(hourBuckets).map(([hour, counts]) => ({
      hour,
      ...counts,
    }));

    return reply.send({ data: timeline });
  });
}
