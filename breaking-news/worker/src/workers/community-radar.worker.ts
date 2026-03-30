// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { XMLParser } from 'fast-xml-parser';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { calculateJaccardSimilarity } from '../utils/text.js';

const logger = createChildLogger('community-radar');

interface CommunityRadarJob {
  configId: string;
  accountId: string;
}

// Simple heuristic sentiment analysis (v1)
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

  // Score ranges from -1 (all negative) to 1 (all positive)
  const score = (positiveCount - negativeCount) / total;

  let label: string;
  if (score > 0.3) label = 'positive';
  else if (score < -0.3) label = 'negative';
  else if (positiveCount > 0 && negativeCount > 0) label = 'mixed';
  else label = 'neutral';

  return { score: Math.round(score * 100) / 100, label };
}

function calculateEngagement(likes: number, shares: number, comments: number): number {
  return likes + shares * 2 + comments;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count: number };
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
}

interface TwitterTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
  };
}

interface ParsedPost {
  platformPostId: string;
  content: string;
  authorName: string | null;
  likes: number;
  shares: number;
  comments: number;
  postedAt: Date;
}

async function fetchFacebookPosts(config: any, accessToken: string): Promise<ParsedPost[]> {
  // Extract page/group ID from URL
  const urlParts = config.url.replace(/\/$/, '').split('/');
  const entityId = urlParts[urlParts.length - 1];

  const endpoint = config.urlType === 'FB_GROUP'
    ? `https://graph.facebook.com/v18.0/${entityId}/feed`
    : `https://graph.facebook.com/v18.0/${entityId}/posts`;

  const fields = 'id,message,story,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)';
  const url = `${endpoint}?fields=${fields}&access_token=${accessToken}&limit=25`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { data: FacebookPost[] };
  const posts: ParsedPost[] = [];

  for (const fbPost of data.data) {
    const content = fbPost.message || fbPost.story || '';
    if (!content) continue;

    const likes = fbPost.likes?.summary?.total_count || 0;
    const shares = fbPost.shares?.count || 0;
    const comments = fbPost.comments?.summary?.total_count || 0;

    posts.push({
      platformPostId: `cr-fb::${fbPost.id}`,
      content,
      authorName: null,
      likes,
      shares,
      comments,
      postedAt: new Date(fbPost.created_time),
    });
  }

  return posts;
}

async function fetchTwitterPosts(config: any, bearerToken: string): Promise<ParsedPost[]> {
  let url: string;

  if (config.urlType === 'TWITTER_LIST') {
    // Extract list ID from URL
    const match = config.url.match(/lists\/(\d+)/);
    const listId = match ? match[1] : config.url;
    url = `https://api.twitter.com/2/lists/${listId}/tweets?max_results=25&tweet.fields=created_at,public_metrics,author_id`;
  } else {
    // TWITTER_SEARCH
    const query = encodeURIComponent(config.url);
    url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=25&tweet.fields=created_at,public_metrics,author_id`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitter API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { data?: TwitterTweet[] };
  const tweets = data.data || [];
  const posts: ParsedPost[] = [];

  for (const tweet of tweets) {
    const metrics = tweet.public_metrics || { like_count: 0, retweet_count: 0, reply_count: 0, quote_count: 0 };

    posts.push({
      platformPostId: `cr-tw::${tweet.id}`,
      content: tweet.text,
      authorName: tweet.author_id || null,
      likes: metrics.like_count,
      shares: metrics.retweet_count + metrics.quote_count,
      comments: metrics.reply_count,
      postedAt: new Date(tweet.created_at),
    });
  }

  return posts;
}

async function fetchRSSFallback(config: any): Promise<ParsedPost[]> {
  logger.info({ url: config.url }, 'Using RSS fallback for community radar');

  let response: Response;
  try {
    response = await fetch(config.url, {
      headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.warn({ url: config.url, err }, 'RSS fallback fetch failed');
    return [];
  }

  if (!response.ok) return [];

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);

  let items: any[] = [];
  if (parsed.rss?.channel?.item) {
    items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];
  } else if (parsed.feed?.entry) {
    items = Array.isArray(parsed.feed.entry)
      ? parsed.feed.entry
      : [parsed.feed.entry];
  }

  const posts: ParsedPost[] = [];
  for (const item of items.slice(0, 25)) {
    const content = item['content:encoded'] || item.description || item.title || '';
    const guid = typeof item.guid === 'string' ? item.guid : item.guid?.['#text'] || item.link || '';
    const pubDate = item.pubDate || item['dc:date'];

    posts.push({
      platformPostId: `cr-rss::${guid || content.substring(0, 50)}`,
      content: typeof content === 'string' ? content : String(content),
      authorName: item.author || item['dc:creator'] || null,
      likes: 0,
      shares: 0,
      comments: 0,
      postedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }

  return posts;
}

async function tryMatchToStory(content: string): Promise<string | null> {
  // Get recent stories from the last 48 hours
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

async function processConfig(job: Job<CommunityRadarJob>): Promise<void> {
  const { configId, accountId } = job.data;

  const config = await prisma.communityRadarConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    logger.warn({ configId }, 'Community radar config not found');
    return;
  }

  if (!config.isActive) {
    logger.info({ configId }, 'Config is inactive, skipping');
    return;
  }

  logger.info({ configId, name: config.name, urlType: config.urlType }, 'Processing community radar scan');

  let posts: ParsedPost[] = [];

  // Try platform-specific API first, fall back to RSS
  try {
    if (config.urlType === 'FB_PAGE' || config.urlType === 'FB_GROUP') {
      // Look for Facebook credentials
      const credential = await prisma.accountCredential.findFirst({
        where: { accountId, platform: 'FACEBOOK' },
      });

      if (credential?.credentials && (credential.credentials as any).accessToken) {
        posts = await fetchFacebookPosts(config, (credential.credentials as any).accessToken);
      } else {
        logger.info({ configId }, 'No Facebook credentials, trying RSS fallback');
        posts = await fetchRSSFallback(config);
      }
    } else if (config.urlType === 'TWITTER_LIST' || config.urlType === 'TWITTER_SEARCH') {
      const credential = await prisma.accountCredential.findFirst({
        where: { accountId, platform: 'TWITTER' },
      });

      const bearerToken = (credential?.credentials as any)?.bearerToken || process.env.TWITTER_BEARER_TOKEN;

      if (bearerToken) {
        posts = await fetchTwitterPosts(config, bearerToken);
      } else {
        logger.info({ configId }, 'No Twitter credentials, trying RSS fallback');
        posts = await fetchRSSFallback(config);
      }
    } else {
      posts = await fetchRSSFallback(config);
    }
  } catch (err) {
    logger.warn({ configId, err: (err as Error).message }, 'Platform API failed, trying RSS fallback');
    try {
      posts = await fetchRSSFallback(config);
    } catch (fallbackErr) {
      logger.error({ configId, err: (fallbackErr as Error).message }, 'RSS fallback also failed');
      posts = [];
    }
  }

  logger.info({ configId, postCount: posts.length }, 'Fetched posts');

  let created = 0;

  for (const post of posts) {
    try {
      // Dedup by platformPostId
      const existing = await prisma.communityRadarPost.findUnique({
        where: { platformPostId: post.platformPostId },
      });
      if (existing) continue;

      const sentiment = analyzeSentiment(post.content);
      const engagementScore = calculateEngagement(post.likes, post.shares, post.comments);

      // Try to match to existing story if high engagement or strongly negative
      let storyId: string | null = null;
      if (engagementScore > 100 || sentiment.score < -0.5) {
        storyId = await tryMatchToStory(post.content);
        if (storyId) {
          logger.info({ configId, storyId, engagementScore, sentiment: sentiment.label }, 'Matched community post to story');
        }
      }

      await prisma.communityRadarPost.create({
        data: {
          configId: config.id,
          platformPostId: post.platformPostId,
          content: post.content.substring(0, 50000),
          authorName: post.authorName,
          engagementScore,
          sentimentScore: sentiment.score,
          sentimentLabel: sentiment.label,
          storyId,
          postedAt: post.postedAt,
        },
      });

      created++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // Dedup unique constraint
      logger.warn({ configId, platformPostId: post.platformPostId, err: (err as Error).message }, 'Failed to create community radar post');
    }
  }

  // Update lastScrapedAt
  await prisma.communityRadarConfig.update({
    where: { id: configId },
    data: { lastScrapedAt: new Date() },
  });

  logger.info({ configId, name: config.name, created, total: posts.length }, 'Community radar scan complete');
}

export function createCommunityRadarWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<CommunityRadarJob>(
    'community-radar',
    async (job: Job<CommunityRadarJob>) => {
      logger.info({ jobId: job.id, configId: job.data.configId }, 'Processing community radar job');
      await processConfig(job);
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, configId: job.data.configId }, 'Community radar job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Community radar job failed');
  });

  return worker;
}
