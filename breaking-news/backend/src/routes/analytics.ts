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

  // ─── GET /api/v1/analytics/engagement — Cross-platform engagement dashboard ──
  app.get('/analytics/engagement', async (_request, reply) => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Total engagement last 24h and 7d
    const [engagement24h, engagement7d] = await Promise.all([
      prisma.sourcePost.aggregate({
        where: { publishedAt: { gte: oneDayAgo } },
        _sum: {
          engagementLikes: true,
          engagementShares: true,
          engagementComments: true,
        },
      }),
      prisma.sourcePost.aggregate({
        where: { publishedAt: { gte: sevenDaysAgo } },
        _sum: {
          engagementLikes: true,
          engagementShares: true,
          engagementComments: true,
        },
      }),
    ]);

    const sumEngagement = (agg: any) =>
      (agg._sum?.engagementLikes || 0) +
      (agg._sum?.engagementShares || 0) +
      (agg._sum?.engagementComments || 0);

    // By platform
    const platformGroups = await prisma.sourcePost.groupBy({
      by: ['sourceId'],
      where: { publishedAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
      _sum: {
        engagementLikes: true,
        engagementShares: true,
        engagementComments: true,
      },
    });

    // Get source platforms for grouping
    const sourceIds = platformGroups.map((g) => g.sourceId);
    const sources = await prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, platform: true },
    });
    const sourcePlatformMap: Record<string, string> = {};
    for (const s of sources) sourcePlatformMap[s.id] = s.platform;

    const byPlatformMap: Record<string, { posts: number; engagement: number }> = {};
    for (const g of platformGroups) {
      const platform = sourcePlatformMap[g.sourceId] || 'UNKNOWN';
      if (!byPlatformMap[platform]) byPlatformMap[platform] = { posts: 0, engagement: 0 };
      byPlatformMap[platform].posts += g._count._all;
      byPlatformMap[platform].engagement +=
        (g._sum?.engagementLikes || 0) +
        (g._sum?.engagementShares || 0) +
        (g._sum?.engagementComments || 0);
    }
    const byPlatform = Object.entries(byPlatformMap).map(([platform, data]) => ({
      platform,
      ...data,
    }));

    // Top 10 stories by total engagement
    const storiesWithEngagement = await prisma.story.findMany({
      where: { mergedIntoId: null, firstSeenAt: { gte: sevenDaysAgo } },
      select: {
        id: true,
        title: true,
        status: true,
        storySources: {
          select: {
            sourcePost: {
              select: {
                engagementLikes: true,
                engagementShares: true,
                engagementComments: true,
              },
            },
          },
        },
      },
    });

    const storyEngagement = storiesWithEngagement.map((story) => {
      const total = story.storySources.reduce((sum, ss) => {
        return (
          sum +
          (ss.sourcePost.engagementLikes || 0) +
          (ss.sourcePost.engagementShares || 0) +
          (ss.sourcePost.engagementComments || 0)
        );
      }, 0);
      return { id: story.id, title: story.title, status: story.status, totalEngagement: total };
    });
    storyEngagement.sort((a, b) => b.totalEngagement - a.totalEngagement);
    const topEngaged = storyEngagement.slice(0, 10);

    // Hourly engagement trend for last 48h
    const recentPosts = await prisma.sourcePost.findMany({
      where: { publishedAt: { gte: twoDaysAgo } },
      select: {
        publishedAt: true,
        engagementLikes: true,
        engagementShares: true,
        engagementComments: true,
      },
      orderBy: { publishedAt: 'asc' },
    });

    const hourlyEngagement: Record<string, number> = {};
    for (const post of recentPosts) {
      const hour = new Date(post.publishedAt).toISOString().slice(0, 13) + ':00:00Z';
      if (!hourlyEngagement[hour]) hourlyEngagement[hour] = 0;
      hourlyEngagement[hour] +=
        (post.engagementLikes || 0) +
        (post.engagementShares || 0) +
        (post.engagementComments || 0);
    }
    const engagementTrend = Object.entries(hourlyEngagement).map(([hour, total]) => ({
      hour,
      total,
    }));

    return reply.send({
      totalEngagement: {
        last24h: sumEngagement(engagement24h),
        last7d: sumEngagement(engagement7d),
      },
      byPlatform,
      topEngaged,
      engagementTrend,
    });
  });

  // ─── GET /api/v1/analytics/velocity — Story velocity metrics ──────────────
  app.get('/analytics/velocity', async (_request, reply) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // All transitions to BREAKING in the last 7 days
    const breakingTransitions = await prisma.storyStateTransition.findMany({
      where: {
        toState: 'BREAKING',
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        storyId: true,
        createdAt: true,
        story: {
          select: {
            id: true,
            title: true,
            firstSeenAt: true,
            sourceCount: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Deduplicate: keep only the first BREAKING transition per story
    const seenStories = new Set<string>();
    const uniqueTransitions = breakingTransitions.filter((t) => {
      if (seenStories.has(t.storyId)) return false;
      seenStories.add(t.storyId);
      return true;
    });

    // Calculate time-to-breaking for each story
    const timesToBreaking = uniqueTransitions.map((t) => {
      const minutes =
        (new Date(t.createdAt).getTime() - new Date(t.story.firstSeenAt).getTime()) / 60000;
      return {
        storyId: t.story.id,
        title: t.story.title,
        category: t.story.category,
        minutes: Math.max(0, minutes),
        sourceCount: t.story.sourceCount,
      };
    });

    // Average time to breaking
    const avgTimeToBreaking =
      timesToBreaking.length > 0
        ? timesToBreaking.reduce((sum, t) => sum + t.minutes, 0) / timesToBreaking.length
        : 0;

    // Average sources at breaking
    const avgSourcesAtBreaking =
      timesToBreaking.length > 0
        ? timesToBreaking.reduce((sum, t) => sum + t.sourceCount, 0) / timesToBreaking.length
        : 0;

    // Fastest 5 stories to reach BREAKING
    const sorted = [...timesToBreaking].sort((a, b) => a.minutes - b.minutes);
    const fastestBreaking = sorted.slice(0, 5).map((t) => ({
      title: t.title,
      timeMinutes: Math.round(t.minutes * 10) / 10,
      sources: t.sourceCount,
    }));

    // Velocity by category
    const categoryMap: Record<string, { total: number; count: number }> = {};
    for (const t of timesToBreaking) {
      const cat = t.category || 'Unknown';
      if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
      categoryMap[cat].total += t.minutes;
      categoryMap[cat].count++;
    }
    const velocityByCategory = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      avgMinutes: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
    }));

    // Velocity by hour of day
    const hourMap: Record<number, number> = {};
    for (const t of uniqueTransitions) {
      const hour = new Date(t.createdAt).getUTCHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
    const velocityByHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap[h] || 0,
    }));

    return reply.send({
      avgTimeToBreaking: Math.round(avgTimeToBreaking * 10) / 10,
      avgSourcesAtBreaking: Math.round(avgSourcesAtBreaking * 10) / 10,
      fastestBreaking,
      velocityByCategory,
      velocityByHour,
    });
  });

  // ─── GET /api/v1/analytics/coverage — Coverage performance ────────────────
  app.get('/analytics/coverage', async (_request, reply) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalMatches, gaps, coveredMatches] = await Promise.all([
      prisma.coverageMatch.count({ where: { matchedAt: { gte: sevenDaysAgo } } }),
      prisma.coverageMatch.count({
        where: { isCovered: false, matchedAt: { gte: sevenDaysAgo } },
      }),
      prisma.coverageMatch.count({
        where: { isCovered: true, matchedAt: { gte: sevenDaysAgo } },
      }),
    ]);

    const totalGaps = gaps;
    const gapRate = totalMatches > 0 ? Math.round((gaps / totalMatches) * 1000) / 10 : 0;
    const coveredRate = totalMatches > 0 ? Math.round((coveredMatches / totalMatches) * 1000) / 10 : 0;

    // Gaps by category
    const gapStories = await prisma.coverageMatch.findMany({
      where: { isCovered: false, matchedAt: { gte: sevenDaysAgo } },
      select: {
        story: { select: { category: true, firstSeenAt: true } },
        matchedAt: true,
      },
    });

    const gapCategoryMap: Record<string, number> = {};
    let totalGapDuration = 0;
    let gapDurationCount = 0;
    for (const g of gapStories) {
      const cat = g.story?.category || 'Unknown';
      gapCategoryMap[cat] = (gapCategoryMap[cat] || 0) + 1;
      if (g.story?.firstSeenAt && g.matchedAt) {
        const dur =
          (new Date(g.matchedAt).getTime() - new Date(g.story.firstSeenAt).getTime()) / 60000;
        if (dur > 0) {
          totalGapDuration += dur;
          gapDurationCount++;
        }
      }
    }
    const gapsByCategory = Object.entries(gapCategoryMap).map(([category, count]) => ({
      category,
      count,
    }));
    const avgGapDuration =
      gapDurationCount > 0 ? Math.round((totalGapDuration / gapDurationCount) * 10) / 10 : 0;

    // Feed performance
    const feeds = await prisma.coverageFeed.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        matches: {
          where: { matchedAt: { gte: sevenDaysAgo } },
          select: { isCovered: true },
        },
      },
    });
    const feedPerformance = feeds.map((f) => {
      const covered = f.matches.filter((m) => m.isCovered).length;
      const gapCount = f.matches.filter((m) => !m.isCovered).length;
      return {
        id: f.id,
        name: f.name,
        covered,
        gaps: gapCount,
        total: f.matches.length,
      };
    });

    return reply.send({
      totalGaps,
      gapRate,
      gapsByCategory,
      avgGapDuration,
      coveredRate,
      feedPerformance,
    });
  });

  // ─── GET /api/v1/analytics/pipeline — Pipeline health ─────────────────────
  app.get('/analytics/pipeline', async (_request, reply) => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Ingestion rate: stories ingested per hour (last 24h)
    const [postsLast24h, storiesLast24h] = await Promise.all([
      prisma.sourcePost.count({ where: { collectedAt: { gte: oneDayAgo } } }),
      prisma.story.count({ where: { mergedIntoId: null, firstSeenAt: { gte: oneDayAgo } } }),
    ]);
    const ingestionRate = Math.round((postsLast24h / 24) * 10) / 10;

    // Enrichment rate: posts with category set in last 24h
    const enrichedLast24h = await prisma.sourcePost.count({
      where: { collectedAt: { gte: oneDayAgo }, category: { not: null } },
    });
    const enrichmentRate = Math.round((enrichedLast24h / 24) * 10) / 10;

    // Average processing time: estimate from firstSeenAt to lastUpdatedAt for scored stories
    const recentStories = await prisma.story.findMany({
      where: { mergedIntoId: null, firstSeenAt: { gte: oneDayAgo }, compositeScore: { gt: 0 } },
      select: { firstSeenAt: true, lastUpdatedAt: true },
      take: 100,
      orderBy: { firstSeenAt: 'desc' },
    });

    let avgProcessingTime = 0;
    if (recentStories.length > 0) {
      const totalMs = recentStories.reduce((sum, s) => {
        return sum + (new Date(s.lastUpdatedAt).getTime() - new Date(s.firstSeenAt).getTime());
      }, 0);
      avgProcessingTime = Math.round(totalMs / recentStories.length / 60000 * 10) / 10;
    }

    // Queue depths from Redis via BullMQ - approximate from DB counts
    // Since we don't have direct BullMQ access here, estimate from recent data
    const queueNames = ['ingestion', 'enrichment', 'clustering', 'scoring'];

    // Failure rate: use state transitions as a proxy for completed work
    const totalTransitions = await prisma.storyStateTransition.count({
      where: { createdAt: { gte: oneDayAgo } },
    });

    // Approximate queue depths from unprocessed items
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

    const queueDepths = [
      { queue: 'ingestion', waiting: 0, active: 0 },
      { queue: 'enrichment', waiting: unprocessedPosts, active: 0 },
      { queue: 'clustering', waiting: unenrichedPosts, active: 0 },
      { queue: 'scoring', waiting: unscoredStories, active: 0 },
    ];

    // Failure rate estimate
    const failureRate = totalTransitions > 0
      ? Math.round((unscoredStories / (totalTransitions + unscoredStories)) * 1000) / 10
      : 0;

    return reply.send({
      ingestionRate,
      enrichmentRate,
      avgProcessingTime,
      failureRate,
      queueDepths,
      storiesProcessed24h: storiesLast24h,
      postsIngested24h: postsLast24h,
    });
  });

  // ─── GET /api/v1/analytics/content — Content performance ──────────────────
  app.get('/analytics/content', async (_request, reply) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // AI summary rate
    const [totalStories7d, storiesWithAiSummary] = await Promise.all([
      prisma.story.count({
        where: { mergedIntoId: null, firstSeenAt: { gte: sevenDaysAgo } },
      }),
      prisma.story.count({
        where: {
          mergedIntoId: null,
          firstSeenAt: { gte: sevenDaysAgo },
          aiSummary: { not: null },
        },
      }),
    ]);
    const aiSummaryRate =
      totalStories7d > 0 ? Math.round((storiesWithAiSummary / totalStories7d) * 1000) / 10 : 0;

    // Breaking package rate
    const breakingAlertStories = await prisma.story.count({
      where: {
        mergedIntoId: null,
        firstSeenAt: { gte: sevenDaysAgo },
        status: { in: ['BREAKING', 'ALERT'] },
      },
    });
    const breakingWithPackage = await prisma.breakingPackage.groupBy({
      by: ['storyId'],
      where: {
        createdAt: { gte: sevenDaysAgo },
        story: { status: { in: ['BREAKING', 'ALERT'] } },
      },
    });
    const breakingPackageRate =
      breakingAlertStories > 0
        ? Math.round((breakingWithPackage.length / breakingAlertStories) * 1000) / 10
        : 0;

    // Average drafts per story
    const [totalDrafts7d, storiesWithDrafts] = await Promise.all([
      prisma.firstDraft.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.firstDraft.groupBy({
        by: ['storyId'],
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ]);
    const avgDraftsPerStory =
      storiesWithDrafts.length > 0
        ? Math.round((totalDrafts7d / storiesWithDrafts.length) * 10) / 10
        : 0;

    // Top categories 7d with trend vs previous 7d
    const [categoriesThisWeek, categoriesLastWeek] = await Promise.all([
      prisma.story.groupBy({
        by: ['category'],
        where: { mergedIntoId: null, category: { not: null }, firstSeenAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10,
      }),
      prisma.story.groupBy({
        by: ['category'],
        where: {
          mergedIntoId: null,
          category: { not: null },
          firstSeenAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
        _count: { _all: true },
      }),
    ]);

    const lastWeekMap: Record<string, number> = {};
    for (const c of categoriesLastWeek) {
      if (c.category) lastWeekMap[c.category] = c._count._all;
    }

    const topCategories7d = categoriesThisWeek.map((c) => {
      const thisWeekCount = c._count._all;
      const lastWeekCount = lastWeekMap[c.category!] || 0;
      const trend = thisWeekCount > lastWeekCount ? 'up' : thisWeekCount < lastWeekCount ? 'down' : 'flat';
      return {
        category: c.category,
        count: thisWeekCount,
        previousCount: lastWeekCount,
        trend,
      };
    });

    // Sentiment distribution from source posts
    const sentimentCounts = await prisma.sourcePost.groupBy({
      by: ['sentimentLabel'],
      where: {
        publishedAt: { gte: sevenDaysAgo },
        sentimentLabel: { not: null },
      },
      _count: { _all: true },
    });

    const sentimentDistribution: Record<string, number> = {
      POSITIVE: 0,
      NEGATIVE: 0,
      NEUTRAL: 0,
      MIXED: 0,
    };
    for (const s of sentimentCounts) {
      if (s.sentimentLabel && sentimentDistribution.hasOwnProperty(s.sentimentLabel)) {
        sentimentDistribution[s.sentimentLabel] = s._count._all;
      }
    }

    return reply.send({
      aiSummaryRate,
      breakingPackageRate,
      avgDraftsPerStory,
      topCategories7d,
      sentimentDistribution,
    });
  });
}
