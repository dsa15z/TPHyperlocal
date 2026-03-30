// @ts-nocheck
/**
 * Redis cache service for hot API routes.
 * Cache-aside pattern with TTL management.
 */
import { getRedis } from './redis.js';

const redis = getRedis();

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 30): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Swallow cache errors — cache is not critical
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Swallow
  }
}

// TTL presets
export const CACHE_TTL = {
  STORIES_LIST: 15,      // 15s for story listings
  BREAKING: 5,           // 5s for breaking stories (fast refresh)
  FACETS: 30,            // 30s for facet counts
  PIPELINE_STATUS: 10,   // 10s for pipeline status
  STORY_DETAIL: 30,      // 30s for single story
  SOURCES: 60,           // 60s for source lists
  USER_PROFILE: 300,     // 5min for user profiles
};
