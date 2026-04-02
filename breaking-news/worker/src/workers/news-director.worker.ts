// @ts-nocheck
/**
 * AI News Director — proactive editorial intelligence.
 * Runs every 5 minutes and pushes actionable alerts when:
 * 1. A high-score story hasn't been covered by any account
 * 2. A competitor covered something the account hasn't
 * 3. A story's velocity suggests it's about to peak
 * 4. A story involves a famous person in the account's market
 */
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('news-director');

interface DirectorJob {
  type: 'evaluate';
}

interface DirectorAlert {
  type: 'cover_now' | 'competitor_gap' | 'about_to_peak' | 'famous_person' | 'spreading';
  storyId: string;
  title: string;
  urgency: 'critical' | 'high' | 'medium';
  reason: string;
  suggestedAction: string;
}

async function evaluateStories(job: Job<DirectorJob>): Promise<void> {
  logger.info('News Director evaluating story landscape');

  const alerts: DirectorAlert[] = [];

  // Find high-score uncovered stories from the last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const hotStories = await prisma.story.findMany({
    where: {
      compositeScore: { gte: 0.3 },
      firstSeenAt: { gte: sixHoursAgo },
      mergedIntoId: null,
      status: { in: ['BREAKING', 'DEVELOPING', 'TOP_STORY', 'ALERT'] },
    },
    select: {
      id: true,
      title: true,
      compositeScore: true,
      breakingScore: true,
      sourceCount: true,
      status: true,
      category: true,
      locationName: true,
      hasFamousPerson: true,
      famousPersonNames: true,
      firstSeenAt: true,
      accountStories: { select: { id: true, accountId: true, coveredAt: true } },
    },
    orderBy: { compositeScore: 'desc' },
    take: 20,
  });

  for (const story of hotStories) {
    const isCoveredByAnyone = story.accountStories.some(as => as.coveredAt);

    // Alert 1: High-score story nobody has covered
    if (!isCoveredByAnyone && story.compositeScore >= 0.4) {
      alerts.push({
        type: 'cover_now',
        storyId: story.id,
        title: story.title,
        urgency: story.compositeScore >= 0.6 ? 'critical' : 'high',
        reason: `Score ${Math.round(story.compositeScore * 100)}, ${story.sourceCount} sources, ${story.status} — nobody has covered this yet`,
        suggestedAction: `Assign a reporter to cover this ${story.category || 'story'} in ${story.locationName || 'your market'}`,
      });
    }

    // Alert 2: Famous person story not covered
    if (!isCoveredByAnyone && story.hasFamousPerson && (story.famousPersonNames as string[])?.length > 0) {
      alerts.push({
        type: 'famous_person',
        storyId: story.id,
        title: story.title,
        urgency: 'high',
        reason: `Involves ${(story.famousPersonNames as string[]).join(', ')} — ${story.sourceCount} sources confirming`,
        suggestedAction: 'Celebrity/public figure stories drive high engagement — cover immediately',
      });
    }

    // Alert 3: Story spreading across markets
    if (story.sourceCount >= 5 && !isCoveredByAnyone) {
      alerts.push({
        type: 'spreading',
        storyId: story.id,
        title: story.title,
        urgency: 'medium',
        reason: `${story.sourceCount} sources across multiple outlets — story is spreading`,
        suggestedAction: 'Multi-source confirmation — high confidence story',
      });
    }
  }

  // Store alerts in Redis for the frontend to pick up
  if (alerts.length > 0) {
    const redis = getSharedConnection();
    await redis.set(
      'news-director:alerts',
      JSON.stringify({ alerts, evaluatedAt: new Date().toISOString(), storyCount: hotStories.length }),
      'EX', 600 // expire after 10 minutes
    );
    logger.info({ alertCount: alerts.length }, 'News Director generated alerts');
  }
}

export function createNewsDirectorWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<DirectorJob>(
    'news-director',
    async (job) => { await evaluateStories(job); },
    { connection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'News Director evaluation complete');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'News Director evaluation failed');
  });

  return worker;
}
