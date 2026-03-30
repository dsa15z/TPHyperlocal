// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function storyAnalyticsRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/stories/:id/analytics — Story performance dashboard
  app.get('/stories/:id/analytics', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify story exists
    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true, title: true, category: true, firstSeenAt: true },
    });

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Fetch all data in parallel
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      analyticsRecords,
      storySources,
      stateTransitions,
      scoreSnapshots,
      coverageMatches,
    ] = await Promise.all([
      // Daily analytics for the last 30 days
      prisma.storyAnalytics.findMany({
        where: { storyId: id, date: { gte: thirtyDaysAgo } },
        orderBy: { date: 'asc' },
      }),

      // Source posts with engagement breakdown
      prisma.storySource.findMany({
        where: { storyId: id },
        include: {
          sourcePost: {
            include: {
              source: { select: { platform: true, name: true } },
            },
          },
        },
      }),

      // State transition history
      prisma.storyStateTransition.findMany({
        where: { storyId: id },
        orderBy: { createdAt: 'asc' },
      }),

      // Last 50 score snapshots
      prisma.scoreSnapshot.findMany({
        where: { storyId: id },
        orderBy: { snapshotAt: 'desc' },
        take: 50,
      }),

      // Coverage matches
      prisma.coverageMatch.findMany({
        where: { storyId: id },
        include: {
          coverageFeed: { select: { name: true, url: true, type: true } },
        },
      }),
    ]);

    // Aggregate totals from analytics records
    let totalViews = 0;
    let totalShares = 0;
    let totalApiRequests = 0;
    let totalWidgetImpressions = 0;

    for (const record of analyticsRecords) {
      totalViews += record.views;
      totalShares += record.shares;
      totalApiRequests += record.apiHits;
      totalWidgetImpressions += record.widgetViews;
    }

    // Engagement by source post
    const engagementBySource = storySources.map((ss) => {
      const post = ss.sourcePost;
      return {
        sourcePostId: post.id,
        platform: post.source.platform,
        sourceName: post.source.name,
        likes: post.engagementLikes,
        shares: post.engagementShares,
        comments: post.engagementComments,
        total: post.engagementLikes + post.engagementShares + post.engagementComments,
        isPrimary: ss.isPrimary,
      };
    });

    // Total engagement across all source posts
    const totalEngagement = engagementBySource.reduce((sum, e) => sum + e.total, 0);

    // Timeline: daily views/shares
    const timeline = analyticsRecords.map((r) => ({
      date: r.date,
      views: r.views,
      shares: r.shares,
      apiHits: r.apiHits,
      widgetViews: r.widgetViews,
    }));

    // State history with duration in each state
    const stateHistory = stateTransitions.map((t, i) => {
      const nextTransition = stateTransitions[i + 1];
      const enteredAt = t.createdAt;
      const exitedAt = nextTransition ? nextTransition.createdAt : null;
      const durationMs = exitedAt
        ? new Date(exitedAt).getTime() - new Date(enteredAt).getTime()
        : Date.now() - new Date(enteredAt).getTime();

      return {
        id: t.id,
        fromState: t.fromState,
        toState: t.toState,
        trigger: t.trigger,
        triggeredBy: t.triggeredBy,
        reason: t.reason,
        enteredAt,
        exitedAt,
        durationMs,
        durationMinutes: Math.round(durationMs / 60000),
      };
    });

    // Score trend: composite score over time (chronological)
    const scoreTrend = scoreSnapshots
      .reverse()
      .map((s) => ({
        snapshotAt: s.snapshotAt,
        compositeScore: s.compositeScore,
        breakingScore: s.breakingScore,
        trendingScore: s.trendingScore,
        confidenceScore: s.confidenceScore,
        localityScore: s.localityScore,
      }));

    // Competitor coverage
    const competitorCoverage = coverageMatches.map((cm) => ({
      feedName: cm.coverageFeed.name,
      feedUrl: cm.coverageFeed.url,
      feedType: cm.coverageFeed.type,
      isCovered: cm.isCovered,
      matchedTitle: cm.matchedTitle,
      matchedUrl: cm.matchedUrl,
      similarityScore: cm.similarityScore,
      matchedAt: cm.matchedAt,
    }));

    const coveredCount = competitorCoverage.filter((c) => c.isCovered).length;
    const gapCount = competitorCoverage.filter((c) => !c.isCovered).length;

    return reply.send({
      storyId: id,
      storyTitle: story.title,
      category: story.category,
      firstSeenAt: story.firstSeenAt,
      totals: {
        totalViews,
        totalShares,
        totalApiRequests,
        totalWidgetImpressions,
        totalEngagement,
      },
      engagementBySource,
      timeline,
      stateHistory,
      scoreTrend,
      competitorCoverage: {
        feeds: competitorCoverage,
        coveredCount,
        gapCount,
        totalFeeds: competitorCoverage.length,
      },
    });
  });

  // POST /api/v1/stories/:id/analytics/track — Track a view/share event
  app.post('/stories/:id/analytics/track', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { event } = request.body as { event: string };

    const validEvents = ['view', 'share', 'api_request', 'widget_impression'];
    if (!event || !validEvents.includes(event)) {
      return reply.status(400).send({
        error: `Invalid event. Must be one of: ${validEvents.join(', ')}`,
      });
    }

    // Verify story exists
    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Today's date at midnight (for the @@unique([storyId, date]) constraint)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Map event type to the correct column increment
    const incrementField: Record<string, string> = {
      view: 'views',
      share: 'shares',
      api_request: 'apiHits',
      widget_impression: 'widgetViews',
    };

    const field = incrementField[event];

    // Upsert today's analytics record, incrementing the appropriate counter
    const record = await prisma.storyAnalytics.upsert({
      where: {
        storyId_date: { storyId: id, date: today },
      },
      create: {
        storyId: id,
        date: today,
        [field]: 1,
      },
      update: {
        [field]: { increment: 1 },
      },
    });

    return reply.send({
      success: true,
      event,
      storyId: id,
      date: today,
      current: {
        views: record.views,
        shares: record.shares,
        apiHits: record.apiHits,
        widgetViews: record.widgetViews,
      },
    });
  });

  // GET /api/v1/analytics/stories/top — Top performing stories
  app.get('/analytics/stories/top', async (request, reply) => {
    const query = request.query as {
      period?: string;
      metric?: string;
    };

    const period = query.period || '24h';
    const metric = query.metric || 'views';

    // Calculate date cutoff
    const periodMs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const cutoffMs = periodMs[period];
    if (!cutoffMs) {
      return reply.status(400).send({
        error: 'Invalid period. Must be one of: 24h, 7d, 30d',
      });
    }

    const validMetrics = ['views', 'shares', 'engagement'];
    if (!validMetrics.includes(metric)) {
      return reply.status(400).send({
        error: `Invalid metric. Must be one of: ${validMetrics.join(', ')}`,
      });
    }

    const since = new Date(Date.now() - cutoffMs);

    if (metric === 'engagement') {
      // Engagement = sum of source post engagement across all linked sources
      // We need to find stories with highest total engagement from their source posts
      const stories = await prisma.story.findMany({
        where: {
          mergedIntoId: null,
          firstSeenAt: { gte: since },
        },
        include: {
          storySources: {
            include: {
              sourcePost: {
                select: {
                  engagementLikes: true,
                  engagementShares: true,
                  engagementComments: true,
                  source: { select: { platform: true } },
                },
              },
            },
          },
        },
        orderBy: { compositeScore: 'desc' },
        take: 100, // fetch more, then sort by engagement
      });

      // Calculate engagement for each story and sort
      const ranked = stories
        .map((story) => {
          const totalEngagement = story.storySources.reduce((sum, ss) => {
            const post = ss.sourcePost;
            return sum + post.engagementLikes + post.engagementShares + post.engagementComments;
          }, 0);

          return {
            id: story.id,
            title: story.title,
            category: story.category,
            status: story.status,
            compositeScore: story.compositeScore,
            firstSeenAt: story.firstSeenAt,
            sourceCount: story.sourceCount,
            totalEngagement,
            platformBreakdown: story.storySources.reduce((acc, ss) => {
              const platform = ss.sourcePost.source.platform;
              if (!acc[platform]) acc[platform] = 0;
              acc[platform] +=
                ss.sourcePost.engagementLikes +
                ss.sourcePost.engagementShares +
                ss.sourcePost.engagementComments;
              return acc;
            }, {} as Record<string, number>),
          };
        })
        .sort((a, b) => b.totalEngagement - a.totalEngagement)
        .slice(0, 20);

      return reply.send({ period, metric, data: ranked });
    }

    // For views and shares, aggregate from StoryAnalytics
    const analyticsColumn = metric === 'views' ? 'views' : 'shares';

    // Get analytics records in the period, grouped by storyId
    const analyticsRecords = await prisma.storyAnalytics.findMany({
      where: { date: { gte: since } },
    });

    // Aggregate by storyId
    const storyTotals = new Map<string, { views: number; shares: number; apiHits: number; widgetViews: number }>();

    for (const record of analyticsRecords) {
      const existing = storyTotals.get(record.storyId) || { views: 0, shares: 0, apiHits: 0, widgetViews: 0 };
      existing.views += record.views;
      existing.shares += record.shares;
      existing.apiHits += record.apiHits;
      existing.widgetViews += record.widgetViews;
      storyTotals.set(record.storyId, existing);
    }

    // Sort by the requested metric and take top 20
    const sorted = [...storyTotals.entries()]
      .sort((a, b) => b[1][analyticsColumn] - a[1][analyticsColumn])
      .slice(0, 20);

    if (sorted.length === 0) {
      return reply.send({ period, metric, data: [] });
    }

    const storyIds = sorted.map(([storyId]) => storyId);

    // Fetch story details
    const stories = await prisma.story.findMany({
      where: { id: { in: storyIds } },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        compositeScore: true,
        firstSeenAt: true,
        sourceCount: true,
      },
    });

    const storyMap = new Map(stories.map((s) => [s.id, s]));

    const data = sorted.map(([storyId, totals]) => {
      const story = storyMap.get(storyId);
      return {
        id: storyId,
        title: story?.title || 'Unknown',
        category: story?.category,
        status: story?.status,
        compositeScore: story?.compositeScore,
        firstSeenAt: story?.firstSeenAt,
        sourceCount: story?.sourceCount,
        views: totals.views,
        shares: totals.shares,
        apiHits: totals.apiHits,
        widgetViews: totals.widgetViews,
      };
    });

    return reply.send({ period, metric, data });
  });
}
