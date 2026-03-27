import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('credibility');

interface CredibilityJob {
  sourceId: string;
}

/**
 * Auto-scores source credibility based on corroboration history.
 * Runs periodically to update Source.trustScore based on how often
 * that source's stories get confirmed by other independent sources.
 */
async function processCredibility(job: Job<CredibilityJob>): Promise<void> {
  const { sourceId } = job.data;

  logger.info({ sourceId }, 'Calculating source credibility');

  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return;

  // Get all story-source links for this source in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const storyLinks = await prisma.storySource.findMany({
    where: {
      sourcePost: { sourceId },
      addedAt: { gte: thirtyDaysAgo },
    },
    include: {
      story: {
        include: {
          _count: { select: { storySources: true } },
        },
      },
    },
  });

  if (storyLinks.length === 0) {
    logger.info({ sourceId }, 'No recent stories, keeping current trust score');
    return;
  }

  // Calculate corroboration rate: how often are this source's stories
  // confirmed by at least 2 other independent sources?
  let corroboratedCount = 0;
  let totalStories = 0;
  let totalTimeToCorroboration = 0;
  let corroboratedWithTime = 0;

  for (const link of storyLinks) {
    totalStories++;
    const otherSourceCount = link.story._count.storySources - 1; // exclude self

    if (otherSourceCount >= 2) {
      corroboratedCount++;
    }

    // Log for history
    await prisma.sourceCredibilityLog.create({
      data: {
        sourceId,
        storyId: link.storyId,
        wasCorroborated: otherSourceCount >= 1,
        corroboratedBy: otherSourceCount,
      },
    }).catch(() => {}); // ignore duplicate errors
  }

  const corroborationRate = corroboratedCount / totalStories;

  // Calculate new trust score:
  // Base: 0.3 (minimum for any active source)
  // + corroboration rate * 0.5 (max 0.5 from corroboration)
  // + volume bonus: min(0.2, totalStories / 100) (more stories = slight bonus)
  const baseTrust = 0.3;
  const corroborationBonus = corroborationRate * 0.5;
  const volumeBonus = Math.min(0.2, totalStories / 100);
  const calculatedTrust = Math.min(1.0, baseTrust + corroborationBonus + volumeBonus);

  // Blend with existing trust score (80% new, 20% old) to smooth changes
  const newTrustScore = 0.8 * calculatedTrust + 0.2 * source.trustScore;
  const clampedScore = Math.max(0.1, Math.min(1.0, newTrustScore));

  await prisma.source.update({
    where: { id: sourceId },
    data: { trustScore: parseFloat(clampedScore.toFixed(3)) },
  });

  logger.info({
    sourceId,
    oldTrust: source.trustScore,
    newTrust: clampedScore,
    corroborationRate,
    totalStories,
    corroboratedCount,
  }, 'Credibility score updated');
}

export function createCredibilityWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<CredibilityJob>(
    'credibility',
    async (job) => { await processCredibility(job); },
    { connection, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Credibility job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Credibility job failed');
  });

  return worker;
}
