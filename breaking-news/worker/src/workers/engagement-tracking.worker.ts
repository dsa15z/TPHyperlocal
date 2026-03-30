// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('engagement-tracking');

interface EngagementTrackingJob {
  storyId: string;
}

/**
 * Calculate engagement velocity: total engagement per hour since story first appeared.
 */
function calculateVelocity(totalEngagement: number, firstSeenAt: Date): number {
  const hoursAlive = Math.max(
    (Date.now() - new Date(firstSeenAt).getTime()) / (60 * 60 * 1000),
    0.1 // avoid division by zero for very new stories
  );
  return Math.round((totalEngagement / hoursAlive) * 100) / 100;
}

/**
 * Calculate engagement within a time window.
 */
function engagementInWindow(
  posts: Array<{ engagementLikes: number; engagementShares: number; engagementComments: number; postedAt: Date }>,
  windowStart: Date,
  windowEnd: Date,
): number {
  return posts
    .filter((p) => {
      const t = new Date(p.postedAt).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    })
    .reduce((sum, p) => sum + p.engagementLikes + p.engagementShares + p.engagementComments, 0);
}

async function processEngagementTracking(job: Job<EngagementTrackingJob>): Promise<void> {
  const { storyId } = job.data;

  // 1. Fetch story with all source posts and their engagement metrics
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: {
          sourcePost: {
            include: {
              source: { select: { platform: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found for engagement tracking');
    return;
  }

  if (story.mergedIntoId) {
    logger.info({ storyId, mergedIntoId: story.mergedIntoId }, 'Story merged, skipping engagement tracking');
    return;
  }

  const sourcePosts = story.storySources.map((ss) => ss.sourcePost);

  // 2. Calculate aggregated engagement across all sources

  // Total likes, shares, comments
  let totalLikes = 0;
  let totalShares = 0;
  let totalComments = 0;

  // Platform breakdown
  const platformBreakdown: Record<string, { likes: number; shares: number; comments: number; total: number }> = {};

  for (const post of sourcePosts) {
    totalLikes += post.engagementLikes;
    totalShares += post.engagementShares;
    totalComments += post.engagementComments;

    const platform = post.source.platform;
    if (!platformBreakdown[platform]) {
      platformBreakdown[platform] = { likes: 0, shares: 0, comments: 0, total: 0 };
    }
    platformBreakdown[platform].likes += post.engagementLikes;
    platformBreakdown[platform].shares += post.engagementShares;
    platformBreakdown[platform].comments += post.engagementComments;
    platformBreakdown[platform].total +=
      post.engagementLikes + post.engagementShares + post.engagementComments;
  }

  const totalEngagement = totalLikes + totalShares + totalComments;

  // Engagement velocity (engagement per hour since firstSeenAt)
  const velocity = calculateVelocity(totalEngagement, story.firstSeenAt);

  // Engagement trend: compare last hour vs previous hour
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const lastHourEngagement = engagementInWindow(sourcePosts, oneHourAgo, now);
  const previousHourEngagement = engagementInWindow(sourcePosts, twoHoursAgo, oneHourAgo);

  let trend: string;
  if (previousHourEngagement === 0 && lastHourEngagement === 0) {
    trend = 'flat';
  } else if (previousHourEngagement === 0) {
    trend = 'surging';
  } else {
    const ratio = lastHourEngagement / previousHourEngagement;
    if (ratio > 2.0) trend = 'surging';
    else if (ratio > 1.2) trend = 'rising';
    else if (ratio > 0.8) trend = 'flat';
    else trend = 'declining';
  }

  logger.info(
    {
      storyId,
      totalEngagement,
      totalLikes,
      totalShares,
      totalComments,
      velocity,
      trend,
      lastHourEngagement,
      previousHourEngagement,
      sourceCount: sourcePosts.length,
    },
    'Engagement aggregation complete',
  );

  // 3. Update StoryAnalytics record for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.storyAnalytics.upsert({
    where: {
      storyId_date: { storyId, date: today },
    },
    create: {
      storyId,
      date: today,
      views: 0,
      shares: totalShares,
      apiHits: 0,
      widgetViews: 0,
    },
    update: {
      shares: totalShares,
    },
  });

  // 4. Check if engagement velocity is unusually high (potential viral story)
  // Compare against average velocity for this category
  if (story.category) {
    const recentStories = await prisma.story.findMany({
      where: {
        category: story.category,
        mergedIntoId: null,
        firstSeenAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        id: { not: storyId },
      },
      include: {
        storySources: {
          include: {
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
      take: 50,
    });

    if (recentStories.length > 0) {
      const velocities = recentStories.map((s) => {
        const eng = s.storySources.reduce(
          (sum, ss) =>
            sum +
            ss.sourcePost.engagementLikes +
            ss.sourcePost.engagementShares +
            ss.sourcePost.engagementComments,
          0,
        );
        return calculateVelocity(eng, s.firstSeenAt);
      });

      const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;

      if (avgVelocity > 0 && velocity > avgVelocity * 2) {
        logger.warn(
          {
            storyId,
            storyTitle: story.title,
            category: story.category,
            velocity,
            avgVelocity: Math.round(avgVelocity * 100) / 100,
            multiplier: Math.round((velocity / avgVelocity) * 10) / 10,
            totalEngagement,
            trend,
            platformBreakdown,
          },
          'POTENTIAL VIRAL STORY: engagement velocity >2x category average',
        );
      }
    }
  }
}

export function createEngagementTrackingWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<EngagementTrackingJob>(
    'engagement-tracking',
    async (job: Job<EngagementTrackingJob>) => {
      logger.info({ jobId: job.id, storyId: job.data.storyId }, 'Processing engagement tracking job');
      await processEngagementTracking(job);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, storyId: job.data.storyId }, 'Engagement tracking job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Engagement tracking job failed');
  });

  return worker;
}
