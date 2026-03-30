// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('prediction');

interface PredictionJob {
  storyId: string;
}

/**
 * Heuristic viral prediction scoring.
 * Factors: velocity trend, source diversity, engagement momentum,
 * category virality history, time-of-day, and score trajectory.
 *
 * Returns 0-1 probability of going viral (reaching TOP_STORY or BREAKING).
 */
async function calculateViralProbability(storyId: string): Promise<{
  probability: number;
  peakPrediction: number;
  predictedStatus: string;
  factors: Record<string, number>;
}> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: { sourcePost: { include: { source: true } } },
        orderBy: { addedAt: 'desc' },
      },
      scoreSnapshots: {
        orderBy: { snapshotAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!story) return { probability: 0, peakPrediction: 0, predictedStatus: 'STALE', factors: {} };

  const ageMinutes = (Date.now() - story.firstSeenAt.getTime()) / (1000 * 60);
  const sources = story.storySources;
  const snapshots = story.scoreSnapshots;

  // Factor 1: Velocity trend (are scores increasing?)
  let velocityTrend = 0;
  if (snapshots.length >= 3) {
    const recent = snapshots.slice(0, 3).map((s) => s.compositeScore);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const oldest = snapshots[snapshots.length - 1]?.compositeScore || 0;
    velocityTrend = oldest > 0 ? Math.min(1, (avgRecent / oldest - 1) * 2) : avgRecent > 0.3 ? 0.5 : 0;
  }

  // Factor 2: Source diversity (unique sources in first hour)
  const uniqueSources = new Set(sources.map((s) => s.sourcePost.sourceId));
  const diversityScore = Math.min(1, uniqueSources.size / 5);

  // Factor 3: Engagement momentum
  const totalEngagement = sources.reduce((sum, s) => {
    return sum + s.sourcePost.engagementLikes + s.sourcePost.engagementShares * 2 + s.sourcePost.engagementComments;
  }, 0);
  const engagementPerMinute = ageMinutes > 0 ? totalEngagement / ageMinutes : 0;
  const engagementMomentum = Math.min(1, engagementPerMinute / 10);

  // Factor 4: Category virality (some categories go viral more often)
  const categoryViralityMap: Record<string, number> = {
    CRIME: 0.7, WEATHER: 0.8, TRAFFIC: 0.5, POLITICS: 0.6,
    SPORTS: 0.5, COMMUNITY: 0.4, HEALTH: 0.5, BUSINESS: 0.3,
    TECHNOLOGY: 0.4, ENTERTAINMENT: 0.6, ENVIRONMENT: 0.4, EDUCATION: 0.3,
  };
  const categoryFactor = categoryViralityMap[story.category || ''] || 0.3;

  // Factor 5: Early velocity (posts per minute in first 30 min)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const earlyPosts = sources.filter((s) => s.addedAt >= thirtyMinAgo).length;
  const earlyVelocity = Math.min(1, earlyPosts / 5);

  // Factor 6: Trust-weighted source quality
  const avgTrust = sources.length > 0
    ? sources.reduce((sum, s) => sum + s.sourcePost.source.trustScore, 0) / sources.length
    : 0;

  // Weighted combination
  const factors = {
    velocityTrend,
    diversityScore,
    engagementMomentum,
    categoryFactor,
    earlyVelocity,
    avgTrust,
  };

  const probability = Math.min(1, Math.max(0,
    0.25 * velocityTrend +
    0.20 * diversityScore +
    0.15 * engagementMomentum +
    0.10 * categoryFactor +
    0.20 * earlyVelocity +
    0.10 * avgTrust
  ));

  // Predict peak score based on current trajectory
  const currentScore = story.compositeScore;
  const peakPrediction = Math.min(1, currentScore * (1 + probability));

  // Predict final status
  let predictedStatus = 'ONGOING';
  if (probability > 0.7) predictedStatus = 'BREAKING';
  else if (probability > 0.5) predictedStatus = 'TOP_STORY';
  else if (probability > 0.3) predictedStatus = 'DEVELOPING';
  else if (probability < 0.1) predictedStatus = 'STALE';

  return { probability, peakPrediction, predictedStatus, factors };
}

async function processPrediction(job: Job<PredictionJob>): Promise<void> {
  const { storyId } = job.data;

  const result = await calculateViralProbability(storyId);

  await prisma.storyPrediction.create({
    data: {
      storyId,
      viralProbability: result.probability,
      peakScorePrediction: result.peakPrediction,
      predictedStatus: result.predictedStatus,
      factors: result.factors,
    },
  });

  logger.info({
    storyId,
    probability: (result.probability * 100).toFixed(1) + '%',
    predicted: result.predictedStatus,
  }, 'Prediction complete');
}

export function createPredictionWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<PredictionJob>(
    'prediction',
    async (job) => { await processPrediction(job); },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Prediction job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Prediction job failed'));
  return worker;
}
