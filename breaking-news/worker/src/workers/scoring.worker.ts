import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { detectNeighborhoods } from '../utils/text.js';

const logger = createChildLogger('scoring');

interface ScoringJob {
  storyId: string;
}

/**
 * Calculate breaking score based on velocity, source diversity, and recency
 */
async function calculateBreakingScore(storyId: string): Promise<number> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Get posts in the last 2 hours for velocity
  const recentSources = await prisma.storySource.findMany({
    where: {
      storyId,
      addedAt: { gte: twoHoursAgo },
    },
    include: {
      sourcePost: {
        include: { source: true },
      },
    },
  });

  // Velocity: posts per hour in last 2 hours
  const postsPerHour = recentSources.length / 2;
  const velocityScore = Math.min(1.0, postsPerHour / 10); // Cap at 10 posts/hour

  // Source diversity: unique sources in recent window
  const uniqueSources = new Set(recentSources.map((ss) => ss.sourcePost.sourceId));
  const diversityScore = Math.min(1.0, uniqueSources.size / 5); // Cap at 5 unique sources

  // Recency: exponential decay based on most recent post (half-life 2 hours)
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) return 0;

  const ageMs = Date.now() - story.lastUpdatedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const halfLifeHours = 2;
  const recencyScore = Math.exp((-Math.LN2 * ageHours) / halfLifeHours);

  // Weighted combination
  const breakingScore = 0.4 * velocityScore + 0.3 * diversityScore + 0.3 * recencyScore;

  return Math.min(1.0, Math.max(0, breakingScore));
}

/**
 * Calculate trending score based on sustained growth and total engagement
 */
async function calculateTrendingScore(storyId: string): Promise<number> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get all sources in last 24 hours
  const allSources = await prisma.storySource.findMany({
    where: {
      storyId,
      addedAt: { gte: twentyFourHoursAgo },
    },
    include: {
      sourcePost: true,
    },
  });

  // Sources in last 6 hours vs 6-24 hours ago for growth rate
  const recentSources = allSources.filter((s) => s.addedAt >= sixHoursAgo);
  const olderSources = allSources.filter((s) => s.addedAt < sixHoursAgo);

  // Growth rate
  let growthScore = 0;
  if (olderSources.length > 0) {
    const growthRate = recentSources.length / olderSources.length;
    growthScore = Math.min(1.0, growthRate / 3); // Cap at 3x growth
  } else if (recentSources.length > 0) {
    growthScore = 0.5; // New story, moderate growth
  }

  // Total engagement
  const totalEngagement = allSources.reduce((sum, s) => {
    return sum +
      s.sourcePost.engagementLikes +
      s.sourcePost.engagementShares * 2 + // Shares weighted more
      s.sourcePost.engagementComments;
  }, 0);
  const engagementScore = Math.min(1.0, totalEngagement / 1000); // Cap at 1000

  // Source count factor
  const sourceCountScore = Math.min(1.0, allSources.length / 10);

  // Weighted combination
  const trendingScore = 0.4 * growthScore + 0.3 * engagementScore + 0.3 * sourceCountScore;

  return Math.min(1.0, Math.max(0, trendingScore));
}

/**
 * Calculate confidence score based on source count and trust scores
 */
async function calculateConfidenceScore(storyId: string): Promise<number> {
  const storySources = await prisma.storySource.findMany({
    where: { storyId },
    include: {
      sourcePost: {
        include: { source: true },
      },
    },
  });

  if (storySources.length === 0) return 0;

  const sourceCount = storySources.length;
  const sourceCountFactor = Math.min(1.0, sourceCount / 5);

  // Average trust score of sources
  const avgTrustScore = storySources.reduce(
    (sum, ss) => sum + ss.sourcePost.source.trustScore,
    0
  ) / storySources.length;

  return sourceCountFactor * avgTrustScore;
}

/**
 * Calculate locality score based on Houston-specific mentions
 */
async function calculateLocalityScore(storyId: string): Promise<number> {
  const storySources = await prisma.storySource.findMany({
    where: { storyId },
    include: { sourcePost: true },
  });

  if (storySources.length === 0) return 0;

  let totalLocalityScore = 0;

  for (const ss of storySources) {
    const text = `${ss.sourcePost.title || ''} ${ss.sourcePost.content}`;
    const neighborhoods = detectNeighborhoods(text);

    // Base score for any Houston mention
    const lowerText = text.toLowerCase();
    let postScore = 0;

    if (lowerText.includes('houston') || neighborhoods.length > 0) {
      postScore = 0.3; // Base Houston mention
    }

    // Bonus for specific neighborhood mentions
    if (neighborhoods.length > 0) {
      postScore += Math.min(0.4, neighborhoods.length * 0.15);
    }

    // Bonus for specific Houston landmarks/institutions
    const landmarks = [
      'nrg', 'minute maid', 'toyota center', 'george r. brown',
      'hermann park', 'discovery green', 'buffalo bayou', 'nasa',
      'johnson space center', 'port of houston', 'ship channel',
      'texas medical center', 'rice university', 'university of houston',
    ];

    for (const landmark of landmarks) {
      if (lowerText.includes(landmark)) {
        postScore += 0.1;
      }
    }

    totalLocalityScore += Math.min(1.0, postScore);
  }

  return Math.min(1.0, totalLocalityScore / storySources.length);
}

/**
 * Determine story status based on scores and age
 */
function determineStatus(
  currentStatus: string,
  breakingScore: number,
  trendingScore: number,
  ageHours: number,
): string {
  // Breaking threshold
  if (breakingScore > 0.7) {
    return 'BREAKING';
  }

  // Transition from BREAKING to TRENDING
  if (currentStatus === 'BREAKING' && breakingScore <= 0.7 && trendingScore > 0.5) {
    return 'TRENDING';
  }

  // TRENDING based on sustained interest
  if (trendingScore > 0.5) {
    return 'TRENDING';
  }

  // Age-based transitions
  if (ageHours > 48) {
    return 'STALE';
  }

  if (ageHours > 12) {
    return 'ACTIVE';
  }

  if (currentStatus === 'BREAKING' && breakingScore <= 0.7) {
    return 'TRENDING';
  }

  // Default for new or unscored stories
  if (currentStatus === 'EMERGING' || currentStatus === 'ACTIVE') {
    return ageHours > 6 ? 'ACTIVE' : 'EMERGING';
  }

  return currentStatus;
}

async function processScoring(job: Job<ScoringJob>): Promise<void> {
  const { storyId } = job.data;

  logger.info({ storyId }, 'Scoring story');

  const story = await prisma.story.findUnique({
    where: { id: storyId },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping scoring');
    return;
  }

  // Calculate all scores
  const [breakingScore, trendingScore, confidenceScore, localityScore] = await Promise.all([
    calculateBreakingScore(storyId),
    calculateTrendingScore(storyId),
    calculateConfidenceScore(storyId),
    calculateLocalityScore(storyId),
  ]);

  // Composite score
  const compositeScore =
    0.35 * breakingScore +
    0.25 * trendingScore +
    0.20 * confidenceScore +
    0.20 * localityScore;

  // Determine status
  const ageMs = Date.now() - story.firstSeenAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const previousStatus = story.status;
  const newStatus = determineStatus(previousStatus, breakingScore, trendingScore, ageHours);

  // Update story with scores
  await prisma.story.update({
    where: { id: storyId },
    data: {
      breakingScore,
      trendingScore,
      confidenceScore,
      localityScore,
      compositeScore,
      status: newStatus as 'EMERGING' | 'BREAKING' | 'TRENDING' | 'ACTIVE' | 'STALE' | 'ARCHIVED',
    },
  });

  // Create score snapshot
  await prisma.scoreSnapshot.create({
    data: {
      storyId,
      breakingScore,
      trendingScore,
      confidenceScore,
      localityScore,
      compositeScore,
    },
  });

  // Log status changes
  if (previousStatus !== newStatus) {
    logger.info({
      storyId,
      previousStatus,
      newStatus,
      breakingScore,
      trendingScore,
    }, 'Story status changed');
  }

  logger.info({
    storyId,
    breakingScore: breakingScore.toFixed(3),
    trendingScore: trendingScore.toFixed(3),
    confidenceScore: confidenceScore.toFixed(3),
    localityScore: localityScore.toFixed(3),
    compositeScore: compositeScore.toFixed(3),
    status: newStatus,
  }, 'Scoring complete');
}

export function createScoringWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<ScoringJob>(
    'scoring',
    async (job) => {
      await processScoring(job);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Scoring job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Scoring job failed');
  });

  return worker;
}
