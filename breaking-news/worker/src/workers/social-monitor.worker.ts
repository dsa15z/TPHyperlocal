// @ts-nocheck
/**
 * Social Monitor Worker
 *
 * Monitors Reddit, YouTube, and TikTok for breaking news content.
 * Creates CommunityRadarPost records and attempts Jaccard story matching
 * for high-engagement posts.
 *
 * Queue: social-monitor, concurrency: 3
 */
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { calculateJaccardSimilarity } from '../utils/text.js';
import {
  fetchRedditPosts,
  searchReddit,
  searchYouTube,
  getChannelVideos,
  fetchTikTokByHashtag,
  fetchTikTokByUser,
  type RedditPost,
  type YouTubeVideo,
  type TikTokVideo,
} from '../lib/social-platforms.js';

const logger = createChildLogger('social-monitor');

// ─── Job Interface ─────────────────────────────────────────────────────────

interface SocialMonitorJob {
  configId: string;
  accountId: string;
  platform: 'REDDIT' | 'YOUTUBE' | 'TIKTOK';
  target: string; // subreddit name, channel ID, or hashtag
  targetType: 'SUBREDDIT' | 'REDDIT_SEARCH' | 'YOUTUBE_CHANNEL' | 'YOUTUBE_SEARCH' | 'TIKTOK_HASHTAG' | 'TIKTOK_USER';
}

// ─── Sentiment Analysis (reused from community-radar pattern) ──────────────

const POSITIVE_WORDS = new Set([
  'great', 'good', 'love', 'amazing', 'awesome', 'excellent', 'wonderful',
  'best', 'happy', 'excited', 'thank', 'support', 'proud', 'beautiful', 'incredible',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'worst', 'hate', 'angry', 'dangerous', 'kill',
  'dead', 'crash', 'fire', 'shooting', 'arrest', 'murder', 'storm', 'flood', 'emergency',
]);

function analyzeSentiment(text: string): { score: number; label: string } {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positiveCount++;
    if (NEGATIVE_WORDS.has(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return { score: 0, label: 'neutral' };

  const score = (positiveCount - negativeCount) / total;

  let label: string;
  if (score > 0.3) label = 'positive';
  else if (score < -0.3) label = 'negative';
  else if (positiveCount > 0 && negativeCount > 0) label = 'mixed';
  else label = 'neutral';

  return { score: Math.round(score * 100) / 100, label };
}

// ─── Engagement Scoring ────────────────────────────────────────────────────

function calculateRedditEngagement(post: RedditPost): number {
  return post.score + post.numComments * 2;
}

function calculateYouTubeEngagement(video: YouTubeVideo): number {
  return Math.floor(video.viewCount / 100) + video.likeCount + video.commentCount * 3;
}

function calculateTikTokEngagement(video: TikTokVideo): number {
  return Math.floor(video.plays / 1000) + video.likes + video.comments * 2 + video.shares * 3;
}

// ─── Story Matching ────────────────────────────────────────────────────────

async function tryMatchToStory(content: string): Promise<string | null> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const stories = await prisma.story.findMany({
    where: { lastUpdated: { gte: since } },
    select: { id: true, title: true, summary: true },
    take: 50,
    orderBy: { lastUpdated: 'desc' },
  });

  if (stories.length === 0) return null;

  const postWords = new Set(
    content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3)
  );

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const story of stories) {
    const storyText = `${story.title} ${story.summary || ''}`;
    const storyWords = new Set(
      storyText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3)
    );

    const similarity = calculateJaccardSimilarity(postWords, storyWords);
    if (similarity > bestScore && similarity >= 0.15) {
      bestScore = similarity;
      bestMatch = story.id;
    }
  }

  return bestMatch;
}

// ─── Normalized Post ───────────────────────────────────────────────────────

interface NormalizedPost {
  platformPostId: string;
  content: string;
  authorName: string | null;
  engagementScore: number;
  postedAt: Date;
}

// ─── Platform Fetchers ─────────────────────────────────────────────────────

async function fetchForPlatform(job: SocialMonitorJob): Promise<NormalizedPost[]> {
  const { platform, target, targetType } = job;

  switch (targetType) {
    case 'SUBREDDIT': {
      const posts = await fetchRedditPosts(target, 25);
      return posts.map((p) => ({
        platformPostId: `reddit::${p.id}`,
        content: `${p.title}\n\n${p.selftext}`.trim(),
        authorName: p.author,
        engagementScore: calculateRedditEngagement(p),
        postedAt: new Date(p.createdUtc * 1000),
      }));
    }

    case 'REDDIT_SEARCH': {
      const posts = await searchReddit(target, 25);
      return posts.map((p) => ({
        platformPostId: `reddit::${p.id}`,
        content: `${p.title}\n\n${p.selftext}`.trim(),
        authorName: p.author,
        engagementScore: calculateRedditEngagement(p),
        postedAt: new Date(p.createdUtc * 1000),
      }));
    }

    case 'YOUTUBE_CHANNEL': {
      const videos = await getChannelVideos(target, 10);
      return videos.map((v) => ({
        platformPostId: `youtube::${v.id}`,
        content: `${v.title}\n\n${v.description}`.trim(),
        authorName: v.channelName,
        engagementScore: calculateYouTubeEngagement(v),
        postedAt: new Date(v.publishedAt),
      }));
    }

    case 'YOUTUBE_SEARCH': {
      const videos = await searchYouTube(target, 10);
      return videos.map((v) => ({
        platformPostId: `youtube::${v.id}`,
        content: `${v.title}\n\n${v.description}`.trim(),
        authorName: v.channelName,
        engagementScore: calculateYouTubeEngagement(v),
        postedAt: new Date(v.publishedAt),
      }));
    }

    case 'TIKTOK_HASHTAG': {
      const videos = await fetchTikTokByHashtag(target);
      return videos.map((v) => ({
        platformPostId: `tiktok::${v.id}`,
        content: v.description,
        authorName: v.author,
        engagementScore: calculateTikTokEngagement(v),
        postedAt: new Date(v.createTime * 1000),
      }));
    }

    case 'TIKTOK_USER': {
      const videos = await fetchTikTokByUser(target);
      return videos.map((v) => ({
        platformPostId: `tiktok::${v.id}`,
        content: v.description,
        authorName: v.author,
        engagementScore: calculateTikTokEngagement(v),
        postedAt: new Date(v.createTime * 1000),
      }));
    }

    default:
      logger.warn({ platform, targetType }, 'Unknown target type');
      return [];
  }
}

// ─── Main Processing ───────────────────────────────────────────────────────

async function processSocialMonitorJob(job: Job<SocialMonitorJob>): Promise<void> {
  const { configId, accountId, platform, target, targetType } = job.data;

  // Verify config exists and is active
  const config = await prisma.communityRadarConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    logger.warn({ configId }, 'Social monitor config not found');
    return;
  }

  if (!config.isActive) {
    logger.info({ configId }, 'Config is inactive, skipping');
    return;
  }

  logger.info({ configId, platform, target, targetType }, 'Processing social monitor job');

  // Fetch posts from the target platform
  const posts = await fetchForPlatform(job.data);

  logger.info({ configId, platform, postCount: posts.length }, 'Fetched social posts');

  let created = 0;

  for (const post of posts) {
    try {
      // Dedup by platformPostId
      const existing = await prisma.communityRadarPost.findUnique({
        where: { platformPostId: post.platformPostId },
      });
      if (existing) continue;

      const sentiment = analyzeSentiment(post.content);

      // Try to match high-engagement or strongly negative posts to stories
      let storyId: string | null = null;
      if (post.engagementScore > 100 || sentiment.score < -0.5) {
        storyId = await tryMatchToStory(post.content);
        if (storyId) {
          logger.info(
            { configId, storyId, platform, engagementScore: post.engagementScore, sentiment: sentiment.label },
            'Matched social post to story'
          );
        }
      }

      await prisma.communityRadarPost.create({
        data: {
          configId: config.id,
          platformPostId: post.platformPostId,
          content: post.content.substring(0, 50000),
          authorName: post.authorName,
          engagementScore: post.engagementScore,
          sentimentScore: sentiment.score,
          sentimentLabel: sentiment.label,
          storyId,
          postedAt: post.postedAt,
        },
      });

      created++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // Dedup unique constraint
      logger.warn(
        { configId, platformPostId: post.platformPostId, err: (err as Error).message },
        'Failed to create social monitor post'
      );
    }
  }

  // Update lastScrapedAt on the config
  await prisma.communityRadarConfig.update({
    where: { id: configId },
    data: { lastScrapedAt: new Date() },
  });

  logger.info({ configId, platform, target, created, total: posts.length }, 'Social monitor scan complete');
}

// ─── Worker Export ─────────────────────────────────────────────────────────

export function createSocialMonitorWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<SocialMonitorJob>(
    'social-monitor',
    async (job: Job<SocialMonitorJob>) => {
      logger.info({ jobId: job.id, configId: job.data.configId, platform: job.data.platform }, 'Processing social monitor job');
      await processSocialMonitorJob(job);
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, platform: job.data.platform, target: job.data.target }, 'Social monitor job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, platform: job?.data?.platform, err: err.message }, 'Social monitor job failed');
  });

  return worker;
}
