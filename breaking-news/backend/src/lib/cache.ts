// @ts-nocheck
/**
 * Redis cache layer for hot API endpoints.
 * Built on top of the existing redis.ts which exports getRedis().
 *
 * Features:
 * - Cache-aside pattern with TTL management
 * - Namespaced keys with `bn:cache:` prefix
 * - Pattern-based invalidation using SCAN (not KEYS)
 * - Graceful fallback on Redis connection failures
 * - Cache hit/miss logging via pino
 */
import { getRedis } from './redis.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CacheOptions {
  ttlSeconds?: number;  // default 300 (5 min)
  prefix?: string;      // namespace prefix
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TTL = 300; // 5 minutes
const KEY_PREFIX = 'bn:cache:';
const SCAN_BATCH_SIZE = 100;

// TTL presets for common use cases
export const CACHE_TTL = {
  STORIES_LIST: 15,      // 15s for story listings
  BREAKING: 5,           // 5s for breaking stories (fast refresh)
  FACETS: 30,            // 30s for facet counts
  PIPELINE_STATUS: 10,   // 10s for pipeline status
  STORY_DETAIL: 30,      // 30s for single story
  SOURCES: 60,           // 60s for source lists
  USER_PROFILE: 300,     // 5min for user profiles
};

// Simple logger (avoids importing pino directly for lightweight lib)
const log = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env['LOG_LEVEL'] === 'debug') {
      console.log(`[cache] ${msg}`, data ? JSON.stringify(data) : '');
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[cache] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a fully qualified cache key with prefix and optional namespace.
 */
function buildKey(key: string, prefix?: string): string {
  if (prefix) {
    return `${KEY_PREFIX}${prefix}:${key}`;
  }
  return `${KEY_PREFIX}${key}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get from cache, or compute and cache the result.
 *
 * If the key exists in Redis, returns the cached value.
 * Otherwise, calls computeFn, stores the result, and returns it.
 * On Redis failure, falls through to computeFn transparently.
 */
export async function cacheGet<T>(
  key: string,
  computeFn: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const fullKey = buildKey(key, options?.prefix);
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL;

  try {
    const redis = getRedis();
    const cached = await redis.get(fullKey);

    if (cached !== null) {
      log.debug('cache hit', { key: fullKey });
      return JSON.parse(cached) as T;
    }

    log.debug('cache miss', { key: fullKey });
  } catch (err) {
    log.warn('cache read error, falling through to compute', {
      key: fullKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Cache miss or error — compute the value
  const value = await computeFn();

  // Store in cache (fire and forget)
  try {
    const redis = getRedis();
    await redis.set(fullKey, JSON.stringify(value), 'EX', ttl);
    log.debug('cache set', { key: fullKey, ttl });
  } catch (err) {
    log.warn('cache write error', {
      key: fullKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return value;
}

/**
 * Invalidate a cache key or pattern.
 *
 * If the keyOrPattern contains '*', uses SCAN + DEL to avoid blocking Redis.
 * Otherwise, deletes the single key directly.
 */
export async function cacheInvalidate(keyOrPattern: string): Promise<void> {
  try {
    const redis = getRedis();
    const fullPattern = buildKey(keyOrPattern);

    if (fullPattern.includes('*')) {
      // Use SCAN to find matching keys (non-blocking, unlike KEYS)
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          SCAN_BATCH_SIZE,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      log.debug('cache invalidate pattern', { pattern: fullPattern, deleted: deletedCount });
    } else {
      await redis.del(fullPattern);
      log.debug('cache invalidate key', { key: fullPattern });
    }
  } catch (err) {
    log.warn('cache invalidate error', {
      keyOrPattern,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Proactively set a value in the cache.
 * Useful for warming cache after writes.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const fullKey = buildKey(key);
  const ttl = ttlSeconds ?? DEFAULT_TTL;

  try {
    const redis = getRedis();
    await redis.set(fullKey, JSON.stringify(value), 'EX', ttl);
    log.debug('cache warm', { key: fullKey, ttl });
  } catch (err) {
    log.warn('cache set error', {
      key: fullKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get cache statistics from Redis.
 * Returns key count, memory usage, and estimated hit rate.
 */
export async function cacheStats(): Promise<{ keys: number; memoryUsed: string; hitRate: string }> {
  try {
    const redis = getRedis();

    // Count keys matching our prefix
    let keyCount = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${KEY_PREFIX}*`,
        'COUNT',
        SCAN_BATCH_SIZE,
      );
      cursor = nextCursor;
      keyCount += keys.length;
    } while (cursor !== '0');

    // Get Redis memory info
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsed = memoryMatch?.[1] || 'unknown';

    // Get keyspace hits/misses for hit rate
    const statsInfo = await redis.info('stats');
    const hitsMatch = statsInfo.match(/keyspace_hits:(\d+)/);
    const missesMatch = statsInfo.match(/keyspace_misses:(\d+)/);
    const hits = parseInt(hitsMatch?.[1] || '0', 10);
    const misses = parseInt(missesMatch?.[1] || '0', 10);
    const total = hits + misses;
    const hitRate = total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : 'N/A';

    return { keys: keyCount, memoryUsed, hitRate };
  } catch (err) {
    log.warn('cache stats error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { keys: 0, memoryUsed: 'unknown', hitRate: 'N/A' };
  }
}
