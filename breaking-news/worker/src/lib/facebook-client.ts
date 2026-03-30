// @ts-nocheck
/**
 * Facebook Graph API v18.0 client for enhanced page/group integration.
 * Handles pagination, rate limiting, and error recovery.
 * Reuses keyword-based sentiment analysis from community-radar worker.
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('facebook-client');

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FacebookConfig {
  accessToken: string;
  pageId?: string;
  groupId?: string;
}

export interface FacebookPost {
  id: string;
  message: string;
  createdTime: string;
  permalink: string;
  likes: number;
  shares: number;
  comments: number;
  reactions: { like: number; love: number; wow: number; haha: number; sad: number; angry: number };
  type: 'status' | 'link' | 'photo' | 'video';
  attachments?: Array<{ url: string; type: string }>;
}

export interface FacebookGroupPost extends FacebookPost {
  authorName: string;
  authorId: string;
  isAdmin: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
  privacy: string;
  description: string;
}

export interface PageInsights {
  reach7d: number;
  engagementRate7d: number;
  impressions7d: number;
  newFollowers7d: number;
}

export interface Comment {
  id: string;
  message: string;
  authorName: string;
  createdTime: string;
  likeCount: number;
  sentiment?: { score: number; label: string };
}

// ─── Sentiment (reused from community-radar heuristic approach) ────────────

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

// ─── Rate Limit Handling ───────────────────────────────────────────────────────

let rateLimitUsagePercent = 0;

function checkRateLimitHeaders(response: Response): void {
  const appUsage = response.headers.get('x-app-usage');
  if (!appUsage) return;

  try {
    const usage = JSON.parse(appUsage);
    // Facebook returns { call_count, total_cputime, total_time } as percentages
    const maxUsage = Math.max(
      usage.call_count || 0,
      usage.total_cputime || 0,
      usage.total_time || 0,
    );
    rateLimitUsagePercent = maxUsage;

    if (maxUsage > 80) {
      logger.warn({ usage, maxUsage }, 'Facebook API rate limit >80%, backing off');
    }
  } catch {
    // Ignore parse errors on the header
  }
}

async function backoffIfNeeded(): Promise<void> {
  if (rateLimitUsagePercent > 80) {
    const backoffMs = rateLimitUsagePercent > 95 ? 60000 : 15000;
    logger.info({ rateLimitUsagePercent, backoffMs }, 'Rate limit backoff');
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

// ─── Pagination Helper ─────────────────────────────────────────────────────────

async function fetchAllPages<T>(
  initialUrl: string,
  accessToken: string,
  maxPages: number = 5,
): Promise<T[]> {
  const allItems: T[] = [];
  let url: string | null = initialUrl;
  let page = 0;

  while (url && page < maxPages) {
    await backoffIfNeeded();

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    checkRateLimitHeaders(response);

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();

      if (status === 403 || status === 190) {
        logger.error({ status, body: body.substring(0, 500) }, 'Facebook token expired or insufficient permissions');
        return allItems;
      }

      logger.warn({ status, body: body.substring(0, 500) }, 'Facebook API error during pagination');
      break;
    }

    const data = await response.json();
    const items = data.data || [];
    allItems.push(...items);

    // Follow pagination cursor
    url = data.paging?.next || null;
    page++;
  }

  return allItems;
}

// ─── API Functions ─────────────────────────────────────────────────────────────

/**
 * Fetch page posts with full engagement and reaction breakdown.
 */
export async function getPagePosts(
  config: FacebookConfig,
  limit: number = 25,
): Promise<FacebookPost[]> {
  const pageId = config.pageId;
  if (!pageId) {
    logger.warn('No pageId provided to getPagePosts');
    return [];
  }

  const fields = [
    'id', 'message', 'created_time', 'permalink_url', 'type',
    'shares', 'attachments{url,type}',
    'likes.summary(true)',
    'comments.summary(true)',
    'reactions.type(LIKE).summary(total_count).as(like_reactions)',
    'reactions.type(LOVE).summary(total_count).as(love_reactions)',
    'reactions.type(WOW).summary(total_count).as(wow_reactions)',
    'reactions.type(HAHA).summary(total_count).as(haha_reactions)',
    'reactions.type(SAD).summary(total_count).as(sad_reactions)',
    'reactions.type(ANGRY).summary(total_count).as(angry_reactions)',
  ].join(',');

  const url = `${GRAPH_API_BASE}/${pageId}/posts?fields=${fields}&limit=${Math.min(limit, 100)}&access_token=${config.accessToken}`;

  try {
    const rawPosts = await fetchAllPages<any>(url, config.accessToken, Math.ceil(limit / 25));

    return rawPosts.slice(0, limit).map((post) => ({
      id: post.id,
      message: post.message || '',
      createdTime: post.created_time,
      permalink: post.permalink_url || `https://facebook.com/${post.id}`,
      likes: post.likes?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
      comments: post.comments?.summary?.total_count || 0,
      reactions: {
        like: post.like_reactions?.summary?.total_count || 0,
        love: post.love_reactions?.summary?.total_count || 0,
        wow: post.wow_reactions?.summary?.total_count || 0,
        haha: post.haha_reactions?.summary?.total_count || 0,
        sad: post.sad_reactions?.summary?.total_count || 0,
        angry: post.angry_reactions?.summary?.total_count || 0,
      },
      type: post.type || 'status',
      attachments: post.attachments?.data?.map((a: any) => ({
        url: a.url,
        type: a.type,
      })),
    }));
  } catch (err) {
    logger.error({ pageId, err: (err as Error).message }, 'Failed to fetch page posts');
    return [];
  }
}

/**
 * Fetch group posts with member/author context.
 */
export async function getGroupPosts(
  config: FacebookConfig,
  limit: number = 25,
): Promise<FacebookGroupPost[]> {
  const groupId = config.groupId;
  if (!groupId) {
    logger.warn('No groupId provided to getGroupPosts');
    return [];
  }

  const fields = [
    'id', 'message', 'created_time', 'permalink_url', 'type',
    'from{id,name,administrator}',
    'shares', 'attachments{url,type}',
    'likes.summary(true)',
    'comments.summary(true)',
  ].join(',');

  const url = `${GRAPH_API_BASE}/${groupId}/feed?fields=${fields}&limit=${Math.min(limit, 100)}&access_token=${config.accessToken}`;

  try {
    const rawPosts = await fetchAllPages<any>(url, config.accessToken, Math.ceil(limit / 25));

    return rawPosts.slice(0, limit).map((post) => ({
      id: post.id,
      message: post.message || '',
      createdTime: post.created_time,
      permalink: post.permalink_url || `https://facebook.com/${post.id}`,
      likes: post.likes?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
      comments: post.comments?.summary?.total_count || 0,
      reactions: { like: 0, love: 0, wow: 0, haha: 0, sad: 0, angry: 0 },
      type: post.type || 'status',
      attachments: post.attachments?.data?.map((a: any) => ({
        url: a.url,
        type: a.type,
      })),
      authorName: post.from?.name || 'Unknown',
      authorId: post.from?.id || '',
      isAdmin: post.from?.administrator || false,
    }));
  } catch (err) {
    logger.error({ groupId, err: (err as Error).message }, 'Failed to fetch group posts');
    return [];
  }
}

/**
 * Fetch group info including member count and privacy settings.
 */
export async function getGroupInfo(config: FacebookConfig): Promise<GroupInfo | null> {
  const groupId = config.groupId;
  if (!groupId) {
    logger.warn('No groupId provided to getGroupInfo');
    return null;
  }

  const fields = 'id,name,member_count,privacy,description';
  const url = `${GRAPH_API_BASE}/${groupId}?fields=${fields}&access_token=${config.accessToken}`;

  try {
    await backoffIfNeeded();

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    checkRateLimitHeaders(response);

    if (!response.ok) {
      const body = await response.text();
      logger.error({ groupId, status: response.status, body: body.substring(0, 500) }, 'Failed to fetch group info');
      return null;
    }

    const data = await response.json();

    return {
      id: data.id,
      name: data.name || '',
      memberCount: data.member_count || 0,
      privacy: data.privacy || 'UNKNOWN',
      description: data.description || '',
    };
  } catch (err) {
    logger.error({ groupId, err: (err as Error).message }, 'Failed to fetch group info');
    return null;
  }
}

/**
 * Fetch page insights for the last 7 days.
 */
export async function getPageInsights(
  config: FacebookConfig,
  period: string = 'week',
): Promise<PageInsights> {
  const pageId = config.pageId;
  if (!pageId) {
    logger.warn('No pageId provided to getPageInsights');
    return { reach7d: 0, engagementRate7d: 0, impressions7d: 0, newFollowers7d: 0 };
  }

  const metrics = [
    'page_impressions',
    'page_post_engagements',
    'page_fan_adds',
    'page_impressions_unique',
  ].join(',');

  const url = `${GRAPH_API_BASE}/${pageId}/insights?metric=${metrics}&period=${period}&access_token=${config.accessToken}`;

  try {
    await backoffIfNeeded();

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    checkRateLimitHeaders(response);

    if (!response.ok) {
      const body = await response.text();
      logger.error({ pageId, status: response.status, body: body.substring(0, 500) }, 'Failed to fetch page insights');
      return { reach7d: 0, engagementRate7d: 0, impressions7d: 0, newFollowers7d: 0 };
    }

    const data = await response.json();
    const metricsData = data.data || [];

    let impressions = 0;
    let engagements = 0;
    let newFollowers = 0;
    let reach = 0;

    for (const metric of metricsData) {
      // Get the most recent value from the values array
      const latestValue = metric.values?.[metric.values.length - 1]?.value || 0;

      switch (metric.name) {
        case 'page_impressions':
          impressions = latestValue;
          break;
        case 'page_post_engagements':
          engagements = latestValue;
          break;
        case 'page_fan_adds':
          newFollowers = latestValue;
          break;
        case 'page_impressions_unique':
          reach = latestValue;
          break;
      }
    }

    const engagementRate = impressions > 0
      ? Math.round((engagements / impressions) * 10000) / 100
      : 0;

    return {
      reach7d: reach,
      engagementRate7d: engagementRate,
      impressions7d: impressions,
      newFollowers7d: newFollowers,
    };
  } catch (err) {
    logger.error({ pageId, err: (err as Error).message }, 'Failed to fetch page insights');
    return { reach7d: 0, engagementRate7d: 0, impressions7d: 0, newFollowers7d: 0 };
  }
}

/**
 * Fetch comments for a specific post with sentiment analysis.
 */
export async function getPostComments(
  accessToken: string,
  postId: string,
  limit: number = 50,
): Promise<Comment[]> {
  const fields = 'id,message,from{name},created_time,like_count';
  const url = `${GRAPH_API_BASE}/${postId}/comments?fields=${fields}&limit=${Math.min(limit, 100)}&access_token=${accessToken}`;

  try {
    const rawComments = await fetchAllPages<any>(url, accessToken, Math.ceil(limit / 25));

    return rawComments.slice(0, limit).map((comment) => {
      const sentiment = comment.message ? analyzeSentiment(comment.message) : undefined;

      return {
        id: comment.id,
        message: comment.message || '',
        authorName: comment.from?.name || 'Unknown',
        createdTime: comment.created_time,
        likeCount: comment.like_count || 0,
        sentiment,
      };
    });
  } catch (err) {
    logger.error({ postId, err: (err as Error).message }, 'Failed to fetch post comments');
    return [];
  }
}
