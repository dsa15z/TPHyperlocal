// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { detectNeighborhoods } from '../utils/text.js';

const logger = createChildLogger('scoring');

interface ScoringJob {
  storyId: string;
}

// ─── Time Windows (compressed for hyperlocal breaking news) ─────────────────
// TopicPulse uses 45/60/90/120 min. We compress to 15/30/60 for faster pace.

const WINDOWS = {
  BREAKING: 30 * 60 * 1000,     // 30 min: velocity window for breaking
  RECENT: 15 * 60 * 1000,       // 15 min: very recent activity
  TRENDING: 60 * 60 * 1000,     // 1 hour: trending growth window
  MEDIUM: 2 * 60 * 60 * 1000,   // 2 hours: medium-term context
  FULL: 6 * 60 * 60 * 1000,     // 6 hours: full story window
};

// ─── Category Decay Curves (ported from TopicPulse) ─────────────────────────
// Each array = multiplier at 15-min intervals. Higher = more weight at that age.
// News peaks immediately then decays; sports/entertainment peak later.

const DECAY_CURVES: Record<string, number[]> = {
  // News/breaking: peaks immediately, decays fast
  CRIME:       [100, 100, 80, 60, 40, 30, 20, 10, 5, 2, 1],
  TRAFFIC:     [100, 100, 80, 50, 30, 15, 5, 2, 1],
  WEATHER:     [100, 100, 100, 80, 80, 60, 40, 30, 20, 10, 5],
  POLITICS:    [80, 100, 100, 80, 60, 50, 40, 30, 20, 10],
  // Sustained interest: slower decay
  BUSINESS:    [60, 80, 100, 100, 80, 60, 50, 40, 30, 20, 10],
  HEALTH:      [60, 80, 100, 100, 80, 60, 50, 40, 30, 20, 10],
  EDUCATION:   [40, 60, 80, 100, 100, 80, 60, 50, 40, 30, 20],
  TECHNOLOGY:  [40, 60, 80, 100, 100, 80, 60, 50, 40, 30, 20],
  // Entertainment/sports: peaks later, longer tail
  SPORTS:      [60, 80, 100, 100, 80, 60, 50, 40, 30, 20],
  ENTERTAINMENT: [40, 40, 60, 80, 100, 100, 80, 60, 40, 20],
  COMMUNITY:   [60, 80, 100, 100, 80, 60, 50, 40, 30, 20],
  ENVIRONMENT: [40, 60, 80, 100, 100, 80, 60, 50, 40, 30, 20],
};

const DEFAULT_CURVE = [80, 100, 100, 80, 60, 40, 30, 20, 10, 5];

/**
 * Get category decay multiplier (0-1) for a story's age.
 * Ported from TopicPulse's story_category_types time_multipliers.
 */
function getCategoryDecay(category: string | null, ageMinutes: number): number {
  const curve = DECAY_CURVES[category || ''] || DEFAULT_CURVE;
  const index = Math.floor(ageMinutes / 15); // 15-min intervals
  if (index >= curve.length) return curve[curve.length - 1] / 100;
  return curve[index] / 100;
}

/**
 * Calculate percentage-based growth (ported from TopicPulse Calculator).
 * growth = 100 × (current / past - 1)
 */
function calculateGrowthPercent(current: number, past: number): number {
  if (past === 0) return current > 0 ? 100 : 0;
  return 100 * (current / past - 1);
}

// ─── Score Calculations ─────────────────────────────────────────────────────

/**
 * Calculate breaking score with compressed time windows for hyperlocal.
 * Uses 30-min velocity (vs TopicPulse's 2h) and 15-min recency.
 */
async function calculateBreakingScore(storyId: string): Promise<number> {
  const thirtyMinAgo = new Date(Date.now() - WINDOWS.BREAKING);
  const fifteenMinAgo = new Date(Date.now() - WINDOWS.RECENT);

  const recentSources = await prisma.storySource.findMany({
    where: {
      storyId,
      addedAt: { gte: thirtyMinAgo },
    },
    include: {
      sourcePost: {
        include: { source: true },
      },
    },
  });

  // Velocity: posts per 15 min in last 30 min (more sensitive than per hour)
  const veryRecentCount = recentSources.filter((s) => s.addedAt >= fifteenMinAgo).length;
  const velocityScore = Math.min(1.0, veryRecentCount / 3); // 3 posts in 15 min = max

  // Source diversity: unique sources in 30-min window
  const uniqueSources = new Set(recentSources.map((ss) => ss.sourcePost.sourceId));
  const diversityScore = Math.min(1.0, uniqueSources.size / 3); // 3 unique sources = max

  // Recency: exponential decay with 30-min half-life (vs TopicPulse's 2h)
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) return 0;

  const ageMs = Date.now() - story.lastUpdatedAt.getTime();
  const ageMinutes = ageMs / (1000 * 60);
  const halfLifeMinutes = 30;
  const recencyScore = Math.exp((-Math.LN2 * ageMinutes) / halfLifeMinutes);

  // Category decay multiplier
  const categoryDecay = getCategoryDecay(story.category, ageMinutes);

  // Weighted combination × category decay
  const rawScore = 0.40 * velocityScore + 0.30 * diversityScore + 0.30 * recencyScore;
  const breakingScore = rawScore * categoryDecay;

  return Math.min(1.0, Math.max(0, breakingScore));
}

/**
 * Calculate trending score with growth-percentage tracking
 * (ported from TopicPulse's get_percentages_default).
 */
async function calculateTrendingScore(storyId: string): Promise<{
  score: number;
  growthPercent15: number;
  growthPercent60: number;
}> {
  const oneHourAgo = new Date(Date.now() - WINDOWS.TRENDING);
  const fifteenMinAgo = new Date(Date.now() - WINDOWS.RECENT);
  const sixHoursAgo = new Date(Date.now() - WINDOWS.FULL);

  const allSources = await prisma.storySource.findMany({
    where: {
      storyId,
      addedAt: { gte: sixHoursAgo },
    },
    include: { sourcePost: true },
  });

  // Split into time buckets for growth calculation
  const last15Min = allSources.filter((s) => s.addedAt >= fifteenMinAgo);
  const last60Min = allSources.filter((s) => s.addedAt >= oneHourAgo);
  const older60Min = allSources.filter((s) => s.addedAt < oneHourAgo);
  const older15Min = allSources.filter(
    (s) => s.addedAt < fifteenMinAgo && s.addedAt >= oneHourAgo
  );

  // TopicPulse-style percentage growth
  const growthPercent15 = calculateGrowthPercent(last15Min.length, older15Min.length);
  const growthPercent60 = calculateGrowthPercent(last60Min.length, older60Min.length);

  // Growth score: hybrid of ratio and percentage (best of both worlds)
  let growthScore = 0;
  if (older60Min.length > 0) {
    const growthRate = last60Min.length / older60Min.length;
    growthScore = Math.min(1.0, growthRate / 2); // 2x growth = max
  } else if (last60Min.length > 0) {
    growthScore = 0.5; // New story
  }
  // Boost if percentage growth is high (TopicPulse insight)
  if (growthPercent15 > 50) growthScore = Math.min(1.0, growthScore + 0.2);

  // Engagement
  const totalEngagement = allSources.reduce((sum, s) => {
    return sum +
      s.sourcePost.engagementLikes +
      s.sourcePost.engagementShares * 2 +
      s.sourcePost.engagementComments;
  }, 0);
  const engagementScore = Math.min(1.0, totalEngagement / 500); // Lower cap for hyperlocal

  // Source count
  const sourceCountScore = Math.min(1.0, allSources.length / 5); // Lower cap for hyperlocal

  const trendingScore = 0.40 * growthScore + 0.30 * engagementScore + 0.30 * sourceCountScore;

  return {
    score: Math.min(1.0, Math.max(0, trendingScore)),
    growthPercent15,
    growthPercent60,
  };
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

  const avgTrustScore = storySources.reduce(
    (sum, ss) => sum + ss.sourcePost.source.trustScore,
    0
  ) / storySources.length;

  return sourceCountFactor * avgTrustScore;
}

/**
 * Calculate locality score based on market-specific mentions
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

    const lowerText = text.toLowerCase();
    let postScore = 0;

    if (lowerText.includes('houston') || neighborhoods.length > 0) {
      postScore = 0.3;
    }

    if (neighborhoods.length > 0) {
      postScore += Math.min(0.4, neighborhoods.length * 0.15);
    }

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

// ─── Status Determination (ported from TopicPulse's tiered logic) ───────────

/**
 * Ported from TopicPulse's level_stay_hot_default.
 * Breaking stories get a minimum retention period before they can decay.
 */
function shouldRetainBreaking(
  breakingScore: number,
  minutesInBreaking: number,
  growthPercent15: number,
): boolean {
  // Minimum 15 minutes at breaking (TopicPulse: 2h; we compress to 15min)
  if (minutesInBreaking <= 15) return true;

  // Up to 2 hours: stay breaking if 15-min growth > 20%
  if (minutesInBreaking <= 120 && growthPercent15 > 20) return true;

  // Stay breaking if score still above threshold
  if (breakingScore > 0.6) return true;

  return false;
}

/**
 * Determine story status using TopicPulse-inspired tiered logic.
 *
 * Tier 1 (< 15 min): Absolute score thresholds
 * Tier 2 (15-60 min): Growth + score hybrid
 * Tier 3 (> 60 min): Growth-dominant with explicit decay
 */
function determineStatus(
  currentStatus: string,
  breakingScore: number,
  trendingScore: number,
  growthPercent15: number,
  growthPercent60: number,
  ageMinutes: number,
  lastStatusChangeMinutes: number,
): string {
  // ── Tier 1: Very fresh (< 15 minutes) ──
  if (ageMinutes < 15) {
    if (breakingScore > 0.6) return 'BREAKING';
    if (trendingScore > 0.4 || breakingScore > 0.4) return 'TOP_STORY';
    return 'DEVELOPING';
  }

  // ── Tier 2: Developing (15-60 minutes) ──
  if (ageMinutes < 60) {
    // Breaking: high score OR (moderate score + rapid growth)
    if (breakingScore > 0.7) return 'BREAKING';
    if (breakingScore > 0.5 && growthPercent15 > 30) return 'BREAKING';

    // Breaking retention (ported from TopicPulse level_stay_hot)
    if (currentStatus === 'BREAKING') {
      if (shouldRetainBreaking(breakingScore, lastStatusChangeMinutes, growthPercent15)) {
        return 'BREAKING';
      }
      return 'TOP_STORY'; // Graceful decay to trending
    }

    // Trending: sustained growth or high score
    if (trendingScore > 0.4) return 'TOP_STORY';
    if (growthPercent15 > 50) return 'TOP_STORY'; // Rapid growth alone triggers trending

    return 'DEVELOPING';
  }

  // ── Tier 3: Maturing (> 60 minutes) ──

  // Breaking with retention check
  if (breakingScore > 0.7) return 'BREAKING';
  if (currentStatus === 'BREAKING') {
    if (shouldRetainBreaking(breakingScore, lastStatusChangeMinutes, growthPercent15)) {
      return 'BREAKING';
    }
    return 'TOP_STORY';
  }

  // Trending: needs growth to stay trending (ported from TopicPulse tier3)
  if (currentStatus === 'TOP_STORY') {
    // TopicPulse: decay if 90-min growth < 8%. We use 60-min growth < 10%.
    if (growthPercent60 < 10 && lastStatusChangeMinutes > 60) {
      return 'ONGOING'; // Explicit decay: trending → active
    }
    if (trendingScore > 0.4) return 'TOP_STORY';
    return 'ONGOING';
  }

  // New trending detection
  if (trendingScore > 0.5) return 'TOP_STORY';
  if (growthPercent15 > 50 && trendingScore > 0.3) return 'TOP_STORY';

  // Age-based decay (ported from TopicPulse flat→stop→dead)
  if (ageMinutes > 48 * 60) return 'STALE';
  if (ageMinutes > 12 * 60) return 'ONGOING';
  if (ageMinutes > 3 * 60) {
    // After 3 hours at ACTIVE with no growth → STALE
    if (currentStatus === 'ONGOING' && lastStatusChangeMinutes > 180 && growthPercent60 < 5) {
      return 'STALE';
    }
    return 'ONGOING';
  }

  return currentStatus === 'DEVELOPING' ? 'DEVELOPING' : 'ONGOING';
}

// ─── Main Processing ────────────────────────────────────────────────────────

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
  const [breakingScore, trendingResult, confidenceScore, localityScore] = await Promise.all([
    calculateBreakingScore(storyId),
    calculateTrendingScore(storyId),
    calculateConfidenceScore(storyId),
    calculateLocalityScore(storyId),
  ]);

  const trendingScore = trendingResult.score;

  // Composite score
  const compositeScore =
    0.35 * breakingScore +
    0.25 * trendingScore +
    0.20 * confidenceScore +
    0.20 * localityScore;

  // Determine status with tiered logic
  const ageMs = Date.now() - story.firstSeenAt.getTime();
  const ageMinutes = ageMs / (1000 * 60);
  const previousStatus = story.status;

  // Time since last status change (for retention/decay logic)
  const lastStatusChangeMs = story.lastUpdatedAt
    ? Date.now() - story.lastUpdatedAt.getTime()
    : ageMs;
  const lastStatusChangeMinutes = lastStatusChangeMs / (1000 * 60);

  const newStatus = determineStatus(
    previousStatus,
    breakingScore,
    trendingScore,
    trendingResult.growthPercent15,
    trendingResult.growthPercent60,
    ageMinutes,
    lastStatusChangeMinutes,
  );

  // Update story with scores
  await prisma.story.update({
    where: { id: storyId },
    data: {
      breakingScore,
      trendingScore,
      confidenceScore,
      localityScore,
      compositeScore,
      status: newStatus as 'ALERT' | 'BREAKING' | 'DEVELOPING' | 'TOP_STORY' | 'ONGOING' | 'FOLLOW_UP' | 'STALE' | 'ARCHIVED',
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
      growthPercent15: trendingResult.growthPercent15.toFixed(1),
      growthPercent60: trendingResult.growthPercent60.toFixed(1),
      ageMinutes: Math.round(ageMinutes),
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
