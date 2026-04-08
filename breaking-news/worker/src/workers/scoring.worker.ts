// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { metrics } from '../lib/metrics.js';
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

// ─── Social Engagement Score (ported from TopicPulse) ──────────────────────
// TopicPulse formula: 2×facebook + 2×twitter + sources
// We extend with all available engagement metrics.

async function calculateSocialScore(storyId: string): Promise<{
  socialScore: number;
  rawSocialTotal: number;
  engagementLikes: number;
  engagementShares: number;
  engagementComments: number;
}> {
  const storySources = await prisma.storySource.findMany({
    where: { storyId },
    include: { sourcePost: true },
  });

  let totalLikes = 0;
  let totalShares = 0;
  let totalComments = 0;

  for (const ss of storySources) {
    totalLikes += ss.sourcePost.engagementLikes || 0;
    totalShares += ss.sourcePost.engagementShares || 0;
    totalComments += ss.sourcePost.engagementComments || 0;
  }

  // TopicPulse formula: 2×(social) + sources
  // Shares are most valuable (equivalent to Twitter retweets + Facebook shares)
  // Comments indicate engagement depth
  const rawSocialTotal = 2 * (totalShares + totalLikes) + totalComments + storySources.length;

  // Normalize to 0-1 range
  // Local stories: 50 = strong signal. National: 500+ = strong.
  const socialScore = Math.min(1.0, rawSocialTotal / 200);

  return { socialScore, rawSocialTotal, engagementLikes: totalLikes, engagementShares: totalShares, engagementComments: totalComments };
}

// ─── Local Market Detection ────────────────────────────────────────────────
// TopicPulse uses much lower thresholds for local market stories.
// A local story with score 85 = trending. National needs 120+.

function isLocalMarketStory(story: any): boolean {
  return !!story.marketId || !!story.neighborhood || (story.locationName && !story.locationName?.toLowerCase().includes('national'));
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
  socialScore: number,
  growthPercent15: number,
  growthPercent60: number,
  ageMinutes: number,
  lastStatusChangeMinutes: number,
  isLocal: boolean,
): string {
  // TopicPulse uses MUCH lower thresholds for local markets
  // National: hot=5250, trending=120. Local: hot=165, trending=85
  // Our 0-1 scale equivalent:
  const HOT = isLocal ? 0.35 : 0.6;
  const TRENDING = isLocal ? 0.25 : 0.4;
  const BREAKING_HIGH = isLocal ? 0.45 : 0.7;
  const BREAKING_MED = isLocal ? 0.30 : 0.5;

  // Social score boost: high social engagement can push stories up
  const boostedBreaking = breakingScore + socialScore * 0.15;
  const boostedTrending = trendingScore + socialScore * 0.20;

  // ── Tier 1: Very fresh (< 15 minutes) ──
  if (ageMinutes < 15) {
    if (boostedBreaking > HOT) return 'BREAKING';
    if (boostedTrending > TRENDING || boostedBreaking > TRENDING) return 'TOP_STORY';
    return 'DEVELOPING';
  }

  // ── Tier 2: Developing (15-60 minutes) ──
  if (ageMinutes < 60) {
    // Breaking: high score OR (moderate score + rapid growth)
    if (boostedBreaking > BREAKING_HIGH) return 'BREAKING';
    if (boostedBreaking > BREAKING_MED && growthPercent15 > 30) return 'BREAKING';

    // Breaking retention (ported from TopicPulse level_stay_hot)
    if (currentStatus === 'BREAKING') {
      if (shouldRetainBreaking(breakingScore, lastStatusChangeMinutes, growthPercent15)) {
        return 'BREAKING';
      }
      return 'TOP_STORY'; // Graceful decay to trending
    }

    // Trending: sustained growth or high score
    if (boostedTrending > TRENDING) return 'TOP_STORY';
    if (growthPercent15 > 50) return 'TOP_STORY';

    return 'DEVELOPING';
  }

  // ── Tier 3: Maturing (> 60 minutes) ──

  // Breaking with retention check
  if (boostedBreaking > BREAKING_HIGH) return 'BREAKING';
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
    if (boostedTrending > TRENDING) return 'TOP_STORY';
    return 'ONGOING';
  }

  // New trending detection
  if (boostedTrending > (isLocal ? 0.30 : 0.5)) return 'TOP_STORY';
  if (growthPercent15 > 50 && boostedTrending > (isLocal ? 0.20 : 0.3)) return 'TOP_STORY';

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

// ─── Fast In-Memory Score Calculators (single DB fetch) ────────────────────
// These operate on pre-fetched source data — no additional DB queries needed.

function calculateBreakingScoreFast(sources: any[], now: number): number {
  const thirtyMinAgo = now - WINDOWS.BREAKING;
  const fifteenMinAgo = now - WINDOWS.RECENT;

  const recentSources = sources.filter(s => new Date(s.addedAt).getTime() >= thirtyMinAgo);
  const veryRecentCount = recentSources.filter(s => new Date(s.addedAt).getTime() >= fifteenMinAgo).length;
  const velocityScore = Math.min(1.0, veryRecentCount / 3);

  // Source diversity: unique platforms in recent window
  const platforms = new Set(recentSources.map(s => s.sourcePost?.source?.platform).filter(Boolean));
  const diversityScore = Math.min(1.0, platforms.size / 3);

  // Trust-weighted velocity
  const trustWeighted = recentSources.reduce((sum, s) => sum + (s.sourcePost?.source?.trustScore || 0.5), 0);
  const trustScore = recentSources.length > 0 ? Math.min(1.0, trustWeighted / (recentSources.length * 0.7)) : 0;

  return 0.5 * velocityScore + 0.3 * diversityScore + 0.2 * trustScore;
}

function calculateTrendingScoreFast(sources: any[], story: any, now: number): { score: number; growthPercent15: number; growthPercent60: number } {
  const oneHourAgo = now - WINDOWS.TRENDING;
  const twoHoursAgo = now - WINDOWS.MEDIUM;
  const fifteenMinAgo = now - WINDOWS.RECENT;

  const last15 = sources.filter(s => new Date(s.addedAt).getTime() >= fifteenMinAgo).length;
  const last60 = sources.filter(s => new Date(s.addedAt).getTime() >= oneHourAgo).length;
  const prev60 = sources.filter(s => {
    const t = new Date(s.addedAt).getTime();
    return t >= twoHoursAgo && t < oneHourAgo;
  }).length;

  const growthPercent15 = calculateGrowthPercent(last15, Math.max(1, last60 - last15));
  const growthPercent60 = calculateGrowthPercent(last60, Math.max(1, prev60));

  const ageMs = now - new Date(story.firstSeenAt).getTime();
  const category = story.category || 'OTHER';
  const decayMultiplier = getCategoryDecay(category, ageMs / 60000);

  const rawTrending = Math.min(1.0, (growthPercent60 > 0 ? 0.4 : 0) + (growthPercent15 > 50 ? 0.3 : growthPercent15 > 0 ? 0.15 : 0) + (last60 >= 3 ? 0.3 : last60 / 10));
  return { score: rawTrending * decayMultiplier, growthPercent15, growthPercent60 };
}

function calculateConfidenceScoreFast(sources: any[]): number {
  if (sources.length === 0) return 0;
  const uniqueSourceIds = new Set(sources.map(s => s.sourcePost?.source?.id).filter(Boolean));
  const diversityScore = Math.min(1.0, uniqueSourceIds.size / 5);

  const avgTrust = sources.reduce((sum, s) => sum + (s.sourcePost?.source?.trustScore || 0.5), 0) / sources.length;
  const platforms = new Set(sources.map(s => s.sourcePost?.source?.platform).filter(Boolean));
  const platformDiversity = Math.min(1.0, platforms.size / 3);

  return 0.4 * diversityScore + 0.35 * avgTrust + 0.25 * platformDiversity;
}

function calculateLocalityScoreFast(story: any): number {
  const hasLocation = !!story.locationName && !story.locationName?.toLowerCase().includes('national');
  const hasNeighborhood = !!story.neighborhood;
  if (!hasLocation && !hasNeighborhood) return 0.2; // National story
  return hasNeighborhood ? 1.0 : 0.7;
}

function calculateSocialScoreFast(sources: any[]): { socialScore: number; rawSocialTotal: number } {
  let totalLikes = 0, totalShares = 0, totalComments = 0;
  for (const ss of sources) {
    totalLikes += ss.sourcePost?.engagementLikes || 0;
    totalShares += ss.sourcePost?.engagementShares || 0;
    totalComments += ss.sourcePost?.engagementComments || 0;
  }
  const hasEngagement = totalLikes > 0 || totalShares > 0 || totalComments > 0;
  const sourceCount = sources.length;

  if (hasEngagement) {
    // Has real engagement data (Twitter, Reddit, Facebook sources)
    const rawSocialTotal = 2 * (totalShares + totalLikes) + totalComments + sourceCount;
    return { socialScore: Math.min(1.0, rawSocialTotal / 200), rawSocialTotal };
  }

  // RSS-only: no engagement data — use source count as primary signal
  // 1 source = 0.1, 2 = 0.25, 3 = 0.4, 5 = 0.6, 8 = 0.8, 12+ = 1.0
  const sourceSignal = Math.min(1.0, Math.sqrt(sourceCount / 12));
  return { socialScore: sourceSignal, rawSocialTotal: sourceCount };
}

// ─── Main Processing ────────────────────────────────────────────────────────

async function processScoring(job: Job<ScoringJob>): Promise<void> {
  const { storyId } = job.data;

  // Single DB fetch: story + all sources with engagement data
  let story: any;
  try {
    story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: { source: { select: { id: true, name: true, platform: true, trustScore: true } } },
            },
          },
        },
      },
    });
  } catch {
    // Fallback: fetch story without relations
    story = await prisma.story.findUnique({ where: { id: storyId } });
    if (story) story.storySources = [];
  }

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping scoring');
    return;
  }

  const sources = story.storySources || [];
  const now = Date.now();

  // Calculate all scores in-memory (no additional DB queries)
  const breakingScore = calculateBreakingScoreFast(sources, now);
  const trendingResult = calculateTrendingScoreFast(sources, story, now);
  const confidenceScore = calculateConfidenceScoreFast(sources);
  const localityScore = calculateLocalityScoreFast(story);
  const socialResult = calculateSocialScoreFast(sources);

  const trendingScore = trendingResult.score;
  const socialScore = socialResult.socialScore;
  const isLocal = isLocalMarketStory(story);

  // Composite score (now includes social engagement)
  // TopicPulse's score was purely social. Ours blends source velocity + social.
  const compositeScore =
    0.25 * breakingScore +
    0.20 * trendingScore +
    0.15 * confidenceScore +
    0.15 * localityScore +
    0.25 * socialScore; // Social engagement is a major signal

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
    socialScore,
    trendingResult.growthPercent15,
    trendingResult.growthPercent60,
    ageMinutes,
    lastStatusChangeMinutes,
    isLocal,
  );

  // Build pastScores snapshot BEFORE the update (was causing ReferenceError)
  const pastScores = (story.pastScores || {}) as Record<string, any>;
  pastScores[String(now)] = {
    composite: compositeScore,
    social: socialScore,
    rawSocial: socialResult.rawSocialTotal,
    breaking: breakingScore,
    trending: trendingScore,
    sources: story.sourceCount,
  };
  // Keep only last 2 hours of snapshots (cleanup old entries)
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  for (const ts of Object.keys(pastScores)) {
    if (Number(ts) < twoHoursAgo) delete pastScores[ts];
  }

  // ── Story Verification ───────────────────────────────────────────────────
  // Determine verification status based on source diversity and confidence
  const sourceCount = story.sourceCount || 0;
  const uniqueSources = await prisma.storySource.count({
    where: { storyId },
  });

  let verificationStatus = 'UNVERIFIED';
  let verificationScore = 0;

  if (uniqueSources >= 3 && confidenceScore >= 0.5) {
    // 3+ independent sources with decent confidence → VERIFIED
    verificationStatus = 'VERIFIED';
    verificationScore = Math.min(1, 0.5 + (uniqueSources * 0.1) + (confidenceScore * 0.3));
  } else if (uniqueSources >= 2) {
    // 2 sources → partially verified
    verificationStatus = 'UNVERIFIED';
    verificationScore = 0.3 + (confidenceScore * 0.2);
  } else if (uniqueSources <= 1) {
    // Single source → flag it
    verificationStatus = 'SINGLE_SOURCE';
    verificationScore = Math.max(0.1, confidenceScore * 0.3);
  }

  const verificationDetails = {
    sourceCount: uniqueSources,
    confidenceScore,
    reasons: [
      uniqueSources >= 3 ? `Corroborated by ${uniqueSources} independent sources` : `Only ${uniqueSources} source(s)`,
      confidenceScore >= 0.5 ? 'High source trust' : 'Low source trust',
    ],
  };

  // Update story with all scores — use raw SQL to avoid Prisma schema mismatch
  try {
    await prisma.$executeRaw`
      UPDATE "Story" SET
        "breakingScore" = ${breakingScore},
        "trendingScore" = ${trendingScore},
        "confidenceScore" = ${confidenceScore},
        "localityScore" = ${localityScore},
        "compositeScore" = ${compositeScore},
        "status" = ${newStatus}::"StoryStatus",
        "lastUpdatedAt" = NOW()
      WHERE id = ${storyId}
    `;
  } catch (updateErr) {
    logger.error({ storyId, err: (updateErr as Error).message }, 'Story score update failed');
    return; // Don't continue if core update failed
  }

  // Update verification fields via raw SQL (Prisma client not yet regenerated with these columns)
  try {
    const detailsJson = JSON.stringify(verificationDetails);
    if (verificationStatus === 'VERIFIED') {
      await prisma.$executeRawUnsafe(
        `UPDATE "Story" SET "verificationStatus" = $1, "verificationScore" = $2, "verificationDetails" = $3::jsonb, "verifiedAt" = NOW() WHERE id = $4`,
        verificationStatus, verificationScore, detailsJson, storyId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "Story" SET "verificationStatus" = $1, "verificationScore" = $2, "verificationDetails" = $3::jsonb WHERE id = $4`,
        verificationStatus, verificationScore, detailsJson, storyId
      );
    }
  } catch (verifyErr) {
    // Non-fatal: log and continue — scoring still works without verification
    logger.debug({ storyId, err: (verifyErr as Error).message }, 'Verification update skipped');
  }

  // ── Story Propagation Score ──────────────────────────────────────
  // Track how many distinct markets this story has been detected in.
  // Stories spreading across markets are more significant.
  try {
    // Count distinct market locations from source posts
    const marketLocations = await prisma.$queryRawUnsafe<Array<{count: bigint}>>(
      `SELECT COUNT(DISTINCT sp."locationName") as count
       FROM "StorySource" ss
       JOIN "SourcePost" sp ON sp.id = ss."sourcePostId"
       WHERE ss."storyId" = $1 AND sp."locationName" IS NOT NULL`,
      storyId
    );
    const marketSpread = Number(marketLocations[0]?.count || 0);

    // Propagation boost: stories in 3+ markets get a score boost
    const propagationBoost = marketSpread >= 5 ? 0.15 : marketSpread >= 3 ? 0.10 : marketSpread >= 2 ? 0.05 : 0;

    if (propagationBoost > 0) {
      // Apply propagation boost to composite score
      const boostedComposite = Math.min(1, compositeScore + propagationBoost);
      await prisma.$executeRawUnsafe(
        `UPDATE "Story" SET "compositeScore" = $1 WHERE id = $2`,
        boostedComposite, storyId
      );
      logger.info({ storyId, marketSpread, propagationBoost, boostedComposite }, 'Applied propagation boost');
    }
  } catch (propErr) {
    logger.debug({ storyId, err: (propErr as Error).message }, 'Propagation tracking skipped');
  }

  // ── Audience-Aware Scoring ──────────────────────────────────────
  // Boost stories that match the account's most-covered categories.
  // Learn from what the newsroom actually publishes.
  try {
    // Get the top 5 most-covered categories across all accounts
    const categoryWeights = await prisma.$queryRawUnsafe<Array<{category: string, coverCount: bigint}>>(
      `SELECT s.category, COUNT(acs.id) as "coverCount"
       FROM "AccountStory" acs
       JOIN "Story" s ON s.id = acs."baseStoryId"
       WHERE acs."coveredAt" IS NOT NULL AND s.category IS NOT NULL
       GROUP BY s.category
       ORDER BY COUNT(acs.id) DESC
       LIMIT 5`,
    );

    if (categoryWeights.length > 0 && story.category) {
      const totalCovered = categoryWeights.reduce((sum, c) => sum + Number(c.coverCount), 0);
      const match = categoryWeights.find(c => c.category === story.category);
      if (match && totalCovered > 0) {
        const audienceAffinity = Number(match.coverCount) / totalCovered;
        const audienceBoost = audienceAffinity * 0.10; // Max 10% boost
        if (audienceBoost > 0.02) {
          const boosted = Math.min(1, compositeScore + audienceBoost);
          await prisma.$executeRawUnsafe(
            `UPDATE "Story" SET "compositeScore" = $1 WHERE id = $2`,
            boosted, storyId
          );
          logger.debug({ storyId, category: story.category, audienceBoost: audienceBoost.toFixed(3) }, 'Applied audience affinity boost');
        }
      }
    }
  } catch (audErr) {
    logger.debug({ storyId, err: (audErr as Error).message }, 'Audience scoring skipped');
  }

  // ── Pre-Break Detection ─────────────────────────────────────────
  // Detect stories that are ABOUT to break based on velocity patterns.
  // If source velocity is accelerating AND story is < 60 min old, flag as pre-breaking.
  try {
    if (ageMinutes < 60 && breakingScore > 0.3) {
      // Check source arrival velocity: count sources in last 15 min vs previous 15 min
      const fifteenMinAgoDate = new Date(Date.now() - 15 * 60 * 1000);
      const thirtyMinAgoDate = new Date(Date.now() - 30 * 60 * 1000);

      const recentSourcesCount = await prisma.storySource.count({
        where: { storyId, createdAt: { gte: fifteenMinAgoDate } },
      });
      const olderSourcesCount = await prisma.storySource.count({
        where: { storyId, createdAt: { gte: thirtyMinAgoDate, lt: fifteenMinAgoDate } },
      });

      // Accelerating: more sources in recent 15 min than previous 15 min
      const isAccelerating = recentSourcesCount > olderSourcesCount && recentSourcesCount >= 2;

      if (isAccelerating) {
        const velocityBoost = Math.min(0.15, recentSourcesCount * 0.03);
        const boosted = Math.min(1, compositeScore + velocityBoost);
        await prisma.$executeRawUnsafe(
          `UPDATE "Story" SET "compositeScore" = $1 WHERE id = $2`,
          boosted, storyId
        );
        logger.info({ storyId, recentSources: recentSourcesCount, olderSources: olderSourcesCount, velocityBoost, title: story.title?.substring(0, 50) }, 'Pre-break detection: story accelerating');
      }
    }
  } catch (preBreakErr) {
    logger.debug({ storyId, err: (preBreakErr as Error).message }, 'Pre-break detection skipped');
  }

  // Create score snapshot (non-fatal if table doesn't exist)
  try {
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
  } catch {
    // ScoreSnapshot table may not exist — non-fatal
  }

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
    socialScore: socialScore.toFixed(3),
    rawSocial: socialResult.rawSocialTotal,
    compositeScore: compositeScore.toFixed(3),
    isLocal,
    status: newStatus,
  }, 'Scoring complete');

  // Auto-generate multi-source synthesis summary for stories with 5+ sources
  if (sources.length >= 5 && !story.aiSummary) {
    try {
      const { Queue } = await import('bullmq');
      const summaryQueue = new Queue('first-draft', { connection: getSharedConnection() });
      await summaryQueue.add('multi-source-summary', {
        storyId,
        type: 'summary',
        sourceCount: sources.length,
      }, { jobId: `summary-${storyId}`, removeOnComplete: 50, attempts: 2 });
      await summaryQueue.close();
      metrics.increment('scoring.summary_triggered', 1);
    } catch {}
  }

  // Auto-trigger prediction after scoring (for stories < 6h old)
  if (ageMinutes < 360) {
    try {
      const { Queue } = await import('bullmq');
      const predQueue = new Queue('prediction', { connection: getSharedConnection() });
      await predQueue.add(`predict-${storyId}`, { storyId }, { removeOnComplete: 50 });
      await predQueue.close();
    } catch {
      // Non-critical — prediction is best-effort
    }
  }

  // Auto-trigger push notifications + alert channels for ALERT/BREAKING
  if (previousStatus !== newStatus && (newStatus === 'ALERT' || newStatus === 'BREAKING')) {
    try {
      const { Queue } = await import('bullmq');
      const pushQueue = new Queue('push-notifications', { connection: getSharedConnection() });
      await pushQueue.add(`push-${storyId}`, { storyId, event: newStatus }, { removeOnComplete: 50 });
      await pushQueue.close();
    } catch {}

    // Dispatch to alert channels (Slack, email, webhook)
    try {
      const { dispatchAlert } = await import('../lib/alert-channels.js');
      const frontendUrl = process.env['FRONTEND_URL'] || 'https://tp-hyperlocal.vercel.app';
      await dispatchAlert({
        id: storyId,
        title: story.title || 'Breaking Story',
        status: newStatus,
        category: story.category || 'UNKNOWN',
        location: story.locationName || 'National',
        compositeScore,
        sourceCount: sources.length,
        url: `${frontendUrl}/stories/${storyId}`,
      });
    } catch {}
  }
}

// ─── Batch Scoring ──────────────────────────────────────────────────────────
// Scores up to 100 stories in 2 SQL round-trips (1 fetch + 1 batch UPDATE).

async function processBatchScoring(storyIds: string[]): Promise<number> {
  if (storyIds.length === 0) return 0;

  let stories: any[];
  try {
    stories = await prisma.story.findMany({
      where: { id: { in: storyIds } },
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: { source: { select: { id: true, platform: true, trustScore: true } } },
            },
          },
        },
      },
    });
  } catch {
    stories = await prisma.story.findMany({ where: { id: { in: storyIds } } });
    stories = stories.map((s: any) => ({ ...s, storySources: [] }));
  }

  if (stories.length === 0) return 0;
  const now = Date.now();

  // Calculate scores for all stories in memory
  const updates: string[] = [];
  for (const story of stories) {
    const sources = story.storySources || [];
    const breakingScore = calculateBreakingScoreFast(sources, now);
    const trendingResult = calculateTrendingScoreFast(sources, story, now);
    const confidenceScore = calculateConfidenceScoreFast(sources);
    const localityScore = calculateLocalityScoreFast(story);
    const socialResult = calculateSocialScoreFast(sources);
    const compositeScore = 0.25 * breakingScore + 0.20 * trendingResult.score + 0.15 * confidenceScore + 0.15 * localityScore + 0.25 * socialResult.socialScore;

    const ageMs = now - new Date(story.firstSeenAt).getTime();
    const lastChangeMs = story.lastUpdatedAt ? now - new Date(story.lastUpdatedAt).getTime() : ageMs;
    const newStatus = determineStatus(
      story.status, breakingScore, trendingResult.score, socialResult.socialScore,
      trendingResult.growthPercent15, trendingResult.growthPercent60,
      ageMs / 60000, lastChangeMs / 60000, isLocalMarketStory(story),
    );

    // Escape the ID for SQL safety (cuid format — alphanumeric only)
    const id = story.id.replace(/[^a-zA-Z0-9_]/g, '');
    updates.push(`('${id}', ${breakingScore}, ${trendingResult.score}, ${confidenceScore}, ${localityScore}, ${compositeScore}, '${newStatus}')`);
  }

  // Single batch UPDATE using VALUES + JOIN pattern
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "Story" AS s SET
        "breakingScore" = v.breaking,
        "trendingScore" = v.trending,
        "confidenceScore" = v.confidence,
        "localityScore" = v.locality,
        "compositeScore" = v.composite,
        "status" = v.status::"StoryStatus",
        "lastUpdatedAt" = NOW()
      FROM (VALUES ${updates.join(',')}) AS v(id, breaking, trending, confidence, locality, composite, status)
      WHERE s.id = v.id
    `);
  } catch (err) {
    logger.error({ err: (err as Error).message, count: updates.length }, 'Batch update failed — falling back to individual');
    for (const story of stories) {
      try { await processScoring({ data: { storyId: story.id } } as any); } catch {}
    }
  }

  metrics.record('scoring.batch_size', updates.length);
  metrics.increment('scoring.processed', updates.length);
  logger.info({ batchSize: storyIds.length, scored: updates.length }, 'Batch scoring complete');
  return updates.length;
}

export function createScoringWorker(): Worker {
  const connection = getSharedConnection();

  // Batch collection: accumulate jobs for 150ms then score them all at once
  const pending: Array<{ storyId: string; resolve: () => void; reject: (e: Error) => void }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    timer = null;
    if (pending.length === 0) return;
    const batch = pending.splice(0, 100);
    try {
      await processBatchScoring(batch.map(b => b.storyId));
      batch.forEach(b => b.resolve());
    } catch (err) {
      batch.forEach(b => b.reject(err as Error));
    }
  }

  const worker = new Worker<ScoringJob>(
    'scoring',
    async (job) => {
      return new Promise<void>((resolve, reject) => {
        pending.push({ storyId: job.data.storyId, resolve, reject });
        if (pending.length >= 100) {
          if (timer) clearTimeout(timer);
          flush();
        } else if (!timer) {
          timer = setTimeout(flush, 150);
        }
      });
    },
    {
      connection,
      concurrency: 100,
      removeOnComplete: { count: 100, age: 3600 },
      removeOnFail: { count: 50, age: 86400 },
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
