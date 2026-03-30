// @ts-nocheck
/**
 * Twitter/X API v2 client for news ingestion.
 * Uses Bearer token auth with search/recent endpoint.
 * Rate limit: 450 requests/15min for search, 300 for user lookup.
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('twitter-client');

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  authorName?: string;
  authorUsername?: string;
  createdAt: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
  };
  entities?: {
    hashtags?: string[];
    urls?: string[];
    mentions?: string[];
  };
  url: string;
}

export async function searchRecentTweets(
  query: string,
  bearerToken: string,
  maxResults: number = 25,
  sinceId?: string,
): Promise<Tweet[]> {
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'created_at,public_metrics,entities,author_id',
    'user.fields': 'name,username',
    expansions: 'author_id',
  });
  if (sinceId) params.set('since_id', sinceId);

  const url = `https://api.twitter.com/2/tweets/search/recent?${params}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 429) {
    const resetAt = response.headers.get('x-rate-limit-reset');
    logger.warn({ resetAt }, 'Twitter rate limit hit');
    throw new Error('Twitter rate limit exceeded');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitter API ${response.status}: ${body}`);
  }

  const data = await response.json();
  const tweets = data.data || [];
  const users = new Map<string, { name: string; username: string }>();

  // Build user lookup from includes
  for (const user of (data.includes?.users || [])) {
    users.set(user.id, { name: user.name, username: user.username });
  }

  return tweets.map((tweet: any) => {
    const user = users.get(tweet.author_id);
    const metrics = tweet.public_metrics || {};

    return {
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      authorName: user?.name,
      authorUsername: user?.username,
      createdAt: tweet.created_at,
      metrics: {
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        quotes: metrics.quote_count || 0,
      },
      entities: {
        hashtags: (tweet.entities?.hashtags || []).map((h: any) => h.tag),
        urls: (tweet.entities?.urls || []).map((u: any) => u.expanded_url),
        mentions: (tweet.entities?.mentions || []).map((m: any) => m.username),
      },
      url: `https://x.com/${user?.username || 'i'}/status/${tweet.id}`,
    };
  });
}

export async function getUserTweets(
  userId: string,
  bearerToken: string,
  maxResults: number = 10,
): Promise<Tweet[]> {
  const params = new URLSearchParams({
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'created_at,public_metrics,entities',
  });

  const url = `https://api.twitter.com/2/users/${userId}/tweets?${params}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Twitter user tweets API ${response.status}`);

  const data = await response.json();
  return (data.data || []).map((tweet: any) => ({
    id: tweet.id,
    text: tweet.text,
    authorId: userId,
    createdAt: tweet.created_at,
    metrics: {
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0,
      replies: tweet.public_metrics?.reply_count || 0,
      quotes: tweet.public_metrics?.quote_count || 0,
    },
    url: `https://x.com/i/status/${tweet.id}`,
  }));
}
