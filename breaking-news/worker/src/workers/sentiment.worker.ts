import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('sentiment');

interface SentimentJob {
  sourcePostId: string;
}

// Positive sentiment keywords
const POSITIVE_WORDS: Set<string> = new Set([
  'safe', 'rescued', 'recovered', 'improved', 'celebrated', 'awarded', 'opened',
  'success', 'growth', 'funding', 'donation', 'rebuilt', 'resolved', 'cleared',
  'restored', 'praised', 'honored', 'upgraded', 'approved', 'supported',
  'thriving', 'flourishing', 'progress', 'achievement', 'milestone', 'record',
  'victory', 'winning', 'champion', 'hero', 'heroic', 'saved', 'reunited',
  'launched', 'innovation', 'breakthrough', 'expanding', 'booming', 'surging',
]);

// Negative sentiment keywords
const NEGATIVE_WORDS: Set<string> = new Set([
  'killed', 'murdered', 'shot', 'stabbed', 'crashed', 'destroyed', 'arrested',
  'charged', 'convicted', 'flood', 'fire', 'explosion', 'collapsed', 'missing',
  'dead', 'injured', 'victim', 'threat', 'damage', 'evacuation', 'fatal',
  'tragedy', 'devastating', 'catastrophic', 'crisis', 'emergency', 'critical',
  'severe', 'dangerous', 'hazardous', 'toxic', 'contaminated', 'bankrupt',
  'shutdown', 'closure', 'layoff', 'recession', 'scandal', 'fraud', 'corruption',
  'robbery', 'assault', 'kidnapped', 'abducted', 'vandalized', 'looted',
]);

/**
 * Analyze sentiment of text using keyword matching
 */
function analyzeSentiment(text: string): { score: number; label: string } {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    // Strip punctuation from word edges
    const cleaned = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (POSITIVE_WORDS.has(cleaned)) {
      positiveCount++;
    }
    if (NEGATIVE_WORDS.has(cleaned)) {
      negativeCount++;
    }
  }

  // Calculate score: (positive - negative) / max(positive + negative, 1)
  const total = positiveCount + negativeCount;
  const score = total > 0
    ? (positiveCount - negativeCount) / total
    : 0;

  // Clamp to [-1.0, 1.0]
  const clampedScore = Math.min(1.0, Math.max(-1.0, score));

  // Determine label
  let label: string;
  if (clampedScore > 0.2) {
    label = 'POSITIVE';
  } else if (clampedScore < -0.2) {
    label = 'NEGATIVE';
  } else {
    label = 'NEUTRAL';
  }

  return { score: clampedScore, label };
}

async function processSentiment(job: Job<SentimentJob>): Promise<void> {
  const { sourcePostId } = job.data;

  logger.info({ sourcePostId }, 'Analyzing sentiment');

  // Fetch source post
  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
    include: {
      storySources: true,
    },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found, skipping sentiment analysis');
    return;
  }

  const fullText = `${post.title || ''} ${post.content}`;

  // Analyze sentiment
  const { score, label } = analyzeSentiment(fullText);

  // Update source post with sentiment data
  await prisma.sourcePost.update({
    where: { id: sourcePostId },
    data: {
      sentimentScore: score,
      sentimentLabel: label,
    },
  });

  logger.info({ sourcePostId, score: score.toFixed(3), label }, 'Source post sentiment analyzed');

  // Update aggregate sentiment for all parent stories
  const storyIds = post.storySources.map((ss) => ss.storyId);

  for (const storyId of storyIds) {
    await updateStorySentiment(storyId);
  }
}

/**
 * Update aggregate sentiment for a story based on all its source posts
 */
async function updateStorySentiment(storyId: string): Promise<void> {
  const storySources = await prisma.storySource.findMany({
    where: { storyId },
    include: {
      sourcePost: true,
    },
  });

  // Filter to posts that have been sentiment-analyzed
  const analyzedPosts = storySources.filter(
    (ss) => ss.sourcePost.sentimentScore !== null,
  );

  if (analyzedPosts.length === 0) {
    return;
  }

  // Calculate average sentiment score
  const totalScore = analyzedPosts.reduce(
    (sum, ss) => sum + (ss.sourcePost.sentimentScore || 0),
    0,
  );
  const avgScore = totalScore / analyzedPosts.length;

  // Determine label from average
  let label: string;
  if (avgScore > 0.2) {
    label = 'POSITIVE';
  } else if (avgScore < -0.2) {
    label = 'NEGATIVE';
  } else {
    label = 'NEUTRAL';
  }

  await prisma.story.update({
    where: { id: storyId },
    data: {
      sentimentScore: avgScore,
      sentimentLabel: label,
    },
  });

  logger.info({
    storyId,
    avgScore: avgScore.toFixed(3),
    label,
    analyzedCount: analyzedPosts.length,
  }, 'Story aggregate sentiment updated');
}

export function createSentimentWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<SentimentJob>(
    'sentiment',
    async (job) => {
      await processSentiment(job);
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Sentiment job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Sentiment job failed');
  });

  return worker;
}
