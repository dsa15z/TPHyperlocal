// @ts-nocheck
/**
 * Social Platform Clients for TikTok, Reddit, and YouTube.
 *
 * Reddit: Public JSON API (no auth needed for reading public subreddits)
 * YouTube: Data API v3 (requires YOUTUBE_API_KEY env var)
 * TikTok: RSSHub bridge (no official public search API)
 *
 * All functions return empty arrays on error -- never throw.
 */
import { XMLParser } from 'fast-xml-parser';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('social-platforms');

const USER_AGENT = 'BreakingNewsBot/1.0 (Houston Breaking News Intelligence Platform)';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

// ─── Reddit ────────────────────────────────────────────────────────────────

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  permalink: string;
  createdUtc: number;
  isVideo: boolean;
}

export async function fetchRedditPosts(subreddit: string, limit: number = 25): Promise<RedditPost[]> {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=${clampedLimit}&raw_json=1`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      logger.warn({ subreddit, retryAfter }, 'Reddit rate limit hit');
      return [];
    }

    if (!response.ok) {
      logger.warn({ subreddit, status: response.status }, 'Reddit API returned non-OK status');
      return [];
    }

    const data = await response.json();
    const children = data?.data?.children || [];

    return children.map((child: any) => {
      const d = child.data;
      return {
        id: d.id,
        title: d.title || '',
        selftext: d.selftext || '',
        author: d.author || '[deleted]',
        subreddit: d.subreddit || subreddit,
        score: d.score || 0,
        numComments: d.num_comments || 0,
        url: d.url || '',
        permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : '',
        createdUtc: d.created_utc || 0,
        isVideo: d.is_video || false,
      };
    });
  } catch (err) {
    logger.error({ subreddit, err: (err as Error).message }, 'Failed to fetch Reddit posts');
    return [];
  }
}

export async function searchReddit(query: string, limit: number = 25): Promise<RedditPost[]> {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${clampedLimit}&raw_json=1`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      logger.warn({ query }, 'Reddit search rate limit hit');
      return [];
    }

    if (!response.ok) {
      logger.warn({ query, status: response.status }, 'Reddit search returned non-OK status');
      return [];
    }

    const data = await response.json();
    const children = data?.data?.children || [];

    return children.map((child: any) => {
      const d = child.data;
      return {
        id: d.id,
        title: d.title || '',
        selftext: d.selftext || '',
        author: d.author || '[deleted]',
        subreddit: d.subreddit || '',
        score: d.score || 0,
        numComments: d.num_comments || 0,
        url: d.url || '',
        permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : '',
        createdUtc: d.created_utc || 0,
        isVideo: d.is_video || false,
      };
    });
  } catch (err) {
    logger.error({ query, err: (err as Error).message }, 'Failed to search Reddit');
    return [];
  }
}

// ─── YouTube ───────────────────────────────────────────────────────────────

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  url: string;
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function getYouTubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    logger.warn('YOUTUBE_API_KEY env var not set');
    return null;
  }
  return key;
}

async function enrichVideoStats(videoIds: string[], apiKey: string): Promise<Map<string, { viewCount: number; likeCount: number; commentCount: number }>> {
  const stats = new Map<string, { viewCount: number; likeCount: number; commentCount: number }>();
  if (videoIds.length === 0) return stats;

  // YouTube /videos endpoint accepts up to 50 IDs at a time
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  for (const batch of batches) {
    try {
      const params = new URLSearchParams({
        part: 'statistics',
        id: batch.join(','),
        key: apiKey,
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'YouTube videos stats API returned non-OK');
        continue;
      }

      const data = await response.json();
      for (const item of (data.items || [])) {
        const s = item.statistics || {};
        stats.set(item.id, {
          viewCount: parseInt(s.viewCount || '0', 10),
          likeCount: parseInt(s.likeCount || '0', 10),
          commentCount: parseInt(s.commentCount || '0', 10),
        });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Failed to fetch YouTube video stats batch');
    }
  }

  return stats;
}

export async function searchYouTube(query: string, limit: number = 10): Promise<YouTubeVideo[]> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) return [];

  const clampedLimit = Math.min(Math.max(limit, 1), 50);

  try {
    // Step 1: Search for videos
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      order: 'date',
      maxResults: String(clampedLimit),
      key: apiKey,
    });

    const searchResponse = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!searchResponse.ok) {
      const body = await searchResponse.text();
      logger.warn({ status: searchResponse.status, body: body.substring(0, 200) }, 'YouTube search API error');
      return [];
    }

    const searchData = await searchResponse.json();
    const items = searchData.items || [];

    if (items.length === 0) return [];

    // Step 2: Get video statistics
    const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean);
    const statsMap = await enrichVideoStats(videoIds, apiKey);

    // Combine into YouTubeVideo objects
    return items.map((item: any) => {
      const videoId = item.id?.videoId || '';
      const snippet = item.snippet || {};
      const stats = statsMap.get(videoId) || { viewCount: 0, likeCount: 0, commentCount: 0 };

      return {
        id: videoId,
        title: snippet.title || '',
        description: snippet.description || '',
        channelName: snippet.channelTitle || '',
        channelId: snippet.channelId || '',
        publishedAt: snippet.publishedAt || '',
        viewCount: stats.viewCount,
        likeCount: stats.likeCount,
        commentCount: stats.commentCount,
        thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  } catch (err) {
    logger.error({ query, err: (err as Error).message }, 'Failed to search YouTube');
    return [];
  }
}

export async function getChannelVideos(channelId: string, limit: number = 10): Promise<YouTubeVideo[]> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) return [];

  const clampedLimit = Math.min(Math.max(limit, 1), 50);

  try {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      channelId,
      type: 'video',
      order: 'date',
      maxResults: String(clampedLimit),
      key: apiKey,
    });

    const searchResponse = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!searchResponse.ok) {
      logger.warn({ channelId, status: searchResponse.status }, 'YouTube channel videos API error');
      return [];
    }

    const searchData = await searchResponse.json();
    const items = searchData.items || [];

    if (items.length === 0) return [];

    const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean);
    const statsMap = await enrichVideoStats(videoIds, apiKey);

    return items.map((item: any) => {
      const videoId = item.id?.videoId || '';
      const snippet = item.snippet || {};
      const stats = statsMap.get(videoId) || { viewCount: 0, likeCount: 0, commentCount: 0 };

      return {
        id: videoId,
        title: snippet.title || '',
        description: snippet.description || '',
        channelName: snippet.channelTitle || '',
        channelId: snippet.channelId || channelId,
        publishedAt: snippet.publishedAt || '',
        viewCount: stats.viewCount,
        likeCount: stats.likeCount,
        commentCount: stats.commentCount,
        thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  } catch (err) {
    logger.error({ channelId, err: (err as Error).message }, 'Failed to fetch YouTube channel videos');
    return [];
  }
}

// ─── TikTok ────────────────────────────────────────────────────────────────
// TikTok doesn't have a public search API. We use RSSHub as a bridge.
// RSSHub is an open-source RSS feed generator: https://docs.rsshub.app/

export interface TikTokVideo {
  id: string;
  description: string;
  author: string;
  authorId: string;
  likes: number;
  comments: number;
  shares: number;
  plays: number;
  createTime: number;
  url: string;
  thumbnailUrl: string;
}

const RSSHUB_BASE = process.env.RSSHUB_BASE_URL || 'https://rsshub.app';

function parseTikTokRSS(xml: string, fallbackAuthor: string): TikTokVideo[] {
  try {
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

    return items.map((item, index) => {
      const link = typeof item.link === 'string'
        ? item.link
        : item.link?.['@_href'] || '';

      // Try to extract video ID from the link URL
      const idMatch = link.match(/\/video\/(\d+)/);
      const id = idMatch ? idMatch[1] : `tiktok-${Date.now()}-${index}`;

      const description = item.title || item.description || '';
      const pubDate = item.pubDate || item.published || item['dc:date'];

      return {
        id,
        description: typeof description === 'string' ? description : String(description),
        author: item.author || item['dc:creator'] || fallbackAuthor,
        authorId: fallbackAuthor,
        likes: 0,    // RSS doesn't provide engagement metrics
        comments: 0,
        shares: 0,
        plays: 0,
        createTime: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
        url: link,
        thumbnailUrl: '',
      };
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Failed to parse TikTok RSS feed');
    return [];
  }
}

export async function fetchTikTokByHashtag(hashtag: string): Promise<TikTokVideo[]> {
  const cleanTag = hashtag.replace(/^#/, '');
  const url = `${RSSHUB_BASE}/tiktok/hashtag/${encodeURIComponent(cleanTag)}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.warn({ hashtag: cleanTag, status: response.status }, 'TikTok hashtag RSS feed unavailable');
      return [];
    }

    const xml = await response.text();
    return parseTikTokRSS(xml, cleanTag);
  } catch (err) {
    logger.warn({ hashtag: cleanTag, err: (err as Error).message }, 'Failed to fetch TikTok hashtag feed -- RSSHub may be unavailable');
    return [];
  }
}

export async function fetchTikTokByUser(username: string): Promise<TikTokVideo[]> {
  const cleanUser = username.replace(/^@/, '');
  const url = `${RSSHUB_BASE}/tiktok/user/${encodeURIComponent(cleanUser)}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.warn({ username: cleanUser, status: response.status }, 'TikTok user RSS feed unavailable');
      return [];
    }

    const xml = await response.text();
    return parseTikTokRSS(xml, cleanUser);
  } catch (err) {
    logger.warn({ username: cleanUser, err: (err as Error).message }, 'Failed to fetch TikTok user feed -- RSSHub may be unavailable');
    return [];
  }
}
