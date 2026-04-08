// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { XMLParser } from 'fast-xml-parser';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash, decodeHTMLEntities } from '../utils/text.js';
import { searchRecentTweets, type Tweet } from '../lib/twitter-client.js';

const logger = createChildLogger('ingestion');

const MAX_CONSECUTIVE_FAILURES = 10; // Auto-deactivate after this many failures
const HEAL_AT_FAILURE = 3; // Attempt self-healing at this failure count

// ── Rotating User-Agent pool ────────────────────────────────────────────────
// Real browser UAs from 2024-2026. Rotated per-request to avoid fingerprinting.
// Includes Chrome, Firefox, Safari, Edge across Windows/Mac/Linux.
const UA_POOL = [
  // Chrome (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  // Chrome (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Firefox (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  // Firefox (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  // Safari (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  // Edge (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  // Chrome (Linux)
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// ─── Poll Audit Trail ───────────────────────────────────────────────────────
// Logs each poll to source.metadata.pollLog (kept to last 48h / 100 entries)

async function logPollAudit(sourceId: string, result: {
  status: 'success' | 'partial' | 'error';
  fetched: number;
  ingested: number;
  error?: string;
  subreddits?: number;
}) {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } });
    const meta = ((source?.metadata || {}) as Record<string, unknown>);
    const pollLog = ((meta.pollLog || []) as Array<any>);

    // Add new entry
    pollLog.push({
      at: new Date().toISOString(),
      ...result,
    });

    // Keep last 100 entries or 48h, whichever is fewer
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const trimmed = pollLog
      .filter((e: any) => !e.at || new Date(e.at).getTime() > cutoff)
      .slice(-100);

    await prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { ...meta, pollLog: trimmed } },
    });
  } catch {
    // Non-fatal
  }
}

// ─── Content Filter ──────────────────────────────────────────────────────────
// Per-source content filtering via metadata.contentFilter settings.
// Supports: includeKeywords, excludeKeywords, includeHashtags, excludeHashtags,
//           minScore (Reddit), minEngagement, requireImage

interface ContentFilter {
  includeKeywords?: string[];   // Post must contain at least one of these
  excludeKeywords?: string[];   // Post must NOT contain any of these
  includeHashtags?: string[];   // Post must have at least one of these hashtags/flairs
  excludeHashtags?: string[];   // Post must NOT have any of these
  minScore?: number;            // Reddit: minimum upvote score
  minEngagement?: number;       // Minimum likes+shares+comments
  requireImage?: boolean;       // Only posts with images
}

function loadContentFilter(metadata: Record<string, unknown>): ContentFilter | null {
  const cf = metadata.contentFilter as Record<string, unknown> | undefined;
  if (!cf) return null;
  return {
    includeKeywords: (cf.includeKeywords as string[]) || undefined,
    excludeKeywords: (cf.excludeKeywords as string[]) || undefined,
    includeHashtags: (cf.includeHashtags as string[]) || undefined,
    excludeHashtags: (cf.excludeHashtags as string[]) || undefined,
    minScore: (cf.minScore as number) || undefined,
    minEngagement: (cf.minEngagement as number) || undefined,
    requireImage: (cf.requireImage as boolean) || undefined,
  };
}

function passesContentFilter(filter: ContentFilter | null, content: {
  title: string;
  body: string;
  hashtags?: string[];
  flair?: string;
  score?: number;
  engagement?: number;
  hasImage?: boolean;
}): boolean {
  if (!filter) return true;

  const text = `${content.title} ${content.body}`.toLowerCase();

  if (filter.includeKeywords && filter.includeKeywords.length > 0) {
    if (!filter.includeKeywords.some(kw => text.includes(kw.toLowerCase()))) return false;
  }
  if (filter.excludeKeywords && filter.excludeKeywords.length > 0) {
    if (filter.excludeKeywords.some(kw => text.includes(kw.toLowerCase()))) return false;
  }
  if (filter.includeHashtags && filter.includeHashtags.length > 0) {
    const allTags = [...(content.hashtags || []), content.flair || ''].map(t => t.toLowerCase());
    if (!filter.includeHashtags.some(ht => allTags.some(t => t.includes(ht.toLowerCase())))) return false;
  }
  if (filter.excludeHashtags && filter.excludeHashtags.length > 0) {
    const allTags = [...(content.hashtags || []), content.flair || ''].map(t => t.toLowerCase());
    if (filter.excludeHashtags.some(ht => allTags.some(t => t.includes(ht.toLowerCase())))) return false;
  }
  if (filter.minScore !== undefined && (content.score || 0) < filter.minScore) return false;
  if (filter.minEngagement !== undefined && (content.engagement || 0) < filter.minEngagement) return false;
  if (filter.requireImage && !content.hasImage) return false;

  return true;
}

/** Get a random browser User-Agent from the pool */
function getRandomUA(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/** Build realistic browser-like request headers for RSS fetching */
function buildFetchHeaders(ua?: string): Record<string, string> {
  const userAgent = ua || getRandomUA();
  return {
    'User-Agent': userAgent,
    'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}

// Keep BROWSER_UA for backward compatibility (metadata flag references it)
const BROWSER_UA = UA_POOL[0];

/**
 * Known RSS proxy services that are often Cloudflare-blocked.
 * Maps proxy URL patterns to direct source RSS URLs.
 */
const PROXY_TO_DIRECT: Array<{ pattern: RegExp; resolve: (url: string) => string | null }> = [
  // rsshub.app/apnews/topics/X → apnews.com direct RSS
  {
    pattern: /rsshub\.app\/apnews\/topics\/(.+)/,
    resolve: (url) => {
      const m = url.match(/rsshub\.app\/apnews\/topics\/(.+)/);
      if (!m) return null;
      const topic = m[1].replace(/\/$/, '');
      // AP News direct RSS: https://apnews.com/hub/{topic}?format=rss
      // or https://feedx.net/rss/ap-{topic}.xml (public mirror)
      return `https://apnews.com/hub/${topic.replace('apf-', '')}?format=rss`;
    },
  },
  // rsshub.app/* → try the source domain directly
  {
    pattern: /rsshub\.app\/(.+)/,
    resolve: (url) => {
      const m = url.match(/rsshub\.app\/([^/]+)\/(.*)/);
      if (!m) return null;
      const domain = m[1];
      const path = m[2];
      return `https://${domain}.com/${path}/feed`;
    },
  },
];

/**
 * Detect if a response is a Cloudflare challenge page (not real content).
 */
function isCloudflareChallenge(status: number, body: string): boolean {
  if (status === 403 || status === 503) {
    return body.includes('cloudflare') || body.includes('Cloudflare') ||
           body.includes('cf-browser-verification') || body.includes('security verification') ||
           body.includes('Just a moment') || body.includes('checking your browser');
  }
  return false;
}

/**
 * Detect bot challenge pages beyond Cloudflare (Akamai, PerimeterX, DataDome, Anubis).
 */
function isBotChallenge(status: number, body: string): string | null {
  if (status === 403 || status === 503 || status === 202) {
    if (body.includes('cloudflare') || body.includes('Cloudflare') || body.includes('cf-browser-verification')) return 'cloudflare';
    if (body.includes('akamai') || body.includes('Akamai')) return 'akamai';
    if (body.includes('perimeterx') || body.includes('PerimeterX') || body.includes('_pxhd')) return 'perimeterx';
    if (body.includes('datadome') || body.includes('DataDome')) return 'datadome';
    if (body.includes('anubis') || body.includes('Anubis') || body.includes('checking your browser')) return 'anubis';
    if (body.includes('Just a moment') || body.includes('security verification') || body.includes('Verify you are human')) return 'generic-challenge';
  }
  return null;
}

/**
 * Auto-discover RSS feed URLs from an HTML page by parsing <link> tags.
 * e.g., <link rel="alternate" type="application/rss+xml" href="..." />
 */
async function discoverRSSFromHTML(htmlUrl: string, htmlBody?: string): Promise<string[]> {
  try {
    let html = htmlBody;
    if (!html) {
      const resp = await fetch(htmlUrl, {
        headers: buildFetchHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return [];
      html = await resp.text();
    }

    const feeds: string[] = [];
    // Match <link rel="alternate" type="application/rss+xml" href="..." />
    const linkPattern = /<link[^>]*rel=["']alternate["'][^>]*>/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const tag = match[0];
      if (tag.includes('application/rss+xml') || tag.includes('application/atom+xml') || tag.includes('text/xml')) {
        const hrefMatch = tag.match(/href=["']([^"']+)["']/);
        if (hrefMatch) {
          let feedUrl = hrefMatch[1];
          // Resolve relative URLs
          if (feedUrl.startsWith('/')) {
            const base = new URL(htmlUrl);
            feedUrl = `${base.origin}${feedUrl}`;
          } else if (!feedUrl.startsWith('http')) {
            feedUrl = new URL(feedUrl, htmlUrl).href;
          }
          feeds.push(feedUrl);
        }
      }
    }
    return feeds;
  } catch {
    return [];
  }
}

/**
 * Per-domain request throttle — prevents banning from aggressive polling.
 * Uses Redis to track last request time per domain.
 */
const MIN_DOMAIN_INTERVAL_MS = 3000; // 3 seconds between requests to same domain

async function throttleDomain(url: string): Promise<void> {
  try {
    const domain = new URL(url).hostname;
    const redis = getSharedConnection();
    const key = `throttle:${domain}`;
    const lastReq = await redis.get(key);

    if (lastReq) {
      const elapsed = Date.now() - parseInt(lastReq, 10);
      if (elapsed < MIN_DOMAIN_INTERVAL_MS) {
        const wait = MIN_DOMAIN_INTERVAL_MS - elapsed;
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
    await redis.set(key, String(Date.now()), 'EX', 60); // Expire after 60s
  } catch {
    // Redis unavailable — skip throttle
  }
}

/**
 * Try fetching with www/non-www and https/http variants.
 */
function getProtocolVariants(url: string): string[] {
  const variants: string[] = [];
  try {
    const u = new URL(url);
    // www ↔ non-www
    if (u.hostname.startsWith('www.')) {
      variants.push(url.replace('www.', ''));
    } else {
      variants.push(url.replace(u.hostname, `www.${u.hostname}`));
    }
    // https ↔ http
    if (u.protocol === 'https:') {
      variants.push(url.replace('https:', 'http:'));
    } else {
      variants.push(url.replace('http:', 'https:'));
    }
  } catch {}
  return variants;
}

// Common RSS URL variants to try when the original URL fails
const RSS_URL_VARIANTS = [
  (base: string) => base.replace(/\/?$/, '/feed'),
  (base: string) => base.replace(/\/?$/, '/feed/'),
  (base: string) => base.replace(/\/?$/, '/rss'),
  (base: string) => base.replace(/\/?$/, '/rss.xml'),
  (base: string) => base.replace(/\/?$/, '/atom.xml'),
  (base: string) => base.replace(/\/?$/, '/index.xml'),
  (base: string) => base.replace(/\/?$/, '/feeds/posts/default'),
  (base: string) => {
    try {
      const u = new URL(base);
      return `${u.origin}/feed`;
    } catch { return ''; }
  },
  (base: string) => {
    try {
      const u = new URL(base);
      return `${u.origin}/rss`;
    } catch { return ''; }
  },
];

/**
 * Attempt to self-heal a failing RSS source by:
 * 1. Trying alternate RSS URL patterns
 * 2. If all RSS variants fail, switch platform to web scraping
 * Returns true if healed, false if not.
 */
async function attemptSelfHeal(source: { id: string; name: string; url: string | null; platform: string; metadata: unknown }): Promise<boolean> {
  const meta = (source.metadata || {}) as Record<string, unknown>;
  const healAttempts = ((meta.healAttempts as number) || 0) + 1;

  // Allow re-healing after 24 hours (in case URL comes back or site changes)
  const lastHealAt = meta.healedAt || meta.healFailedAt;
  if (healAttempts > 1 && lastHealAt) {
    const hoursSinceLastHeal = (Date.now() - new Date(lastHealAt as string).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastHeal < 24) {
      await prisma.source.update({
        where: { id: source.id },
        data: { metadata: { ...meta, healAttempts, healResult: 'skipped-too-recent' } },
      });
      return false;
    }
  }

  const originalUrl = source.url || '';
  logger.info({ sourceId: source.id, name: source.name, originalUrl }, 'Attempting self-heal for failing source');

  // Strategy -1: If URL is from a known proxy (rsshub.app, etc.), try the direct source
  if (source.platform === 'RSS' && originalUrl) {
    for (const mapping of PROXY_TO_DIRECT) {
      if (mapping.pattern.test(originalUrl)) {
        const directUrl = mapping.resolve(originalUrl);
        if (directUrl && directUrl !== originalUrl) {
          try {
            const resp = await fetch(directUrl, {
              headers: buildFetchHeaders(),
              signal: AbortSignal.timeout(10000),
            });
            if (resp.ok) {
              const text = await resp.text();
              if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
                await prisma.source.update({
                  where: { id: source.id },
                  data: {
                    url: directUrl,
                    metadata: {
                      ...meta,
                      consecutiveFailures: 0,
                      healAttempts,
                      healResult: 'proxy-to-direct',
                      previousUrl: originalUrl,
                      useBrowserUA: true,
                      healedAt: new Date().toISOString(),
                    },
                  },
                });
                logger.info({ sourceId: source.id, name: source.name, oldUrl: originalUrl, newUrl: directUrl }, 'Self-healed: switched from proxy to direct RSS');
                return true;
              }
            }
          } catch {
            // Try next strategy
          }
        }
      }
    }
  }

  // Strategy 0: Try original URL with browser User-Agent (many 403s are UA blocks)
  if (source.platform === 'RSS' && originalUrl) {
    try {
      const resp = await fetch(originalUrl, {
        headers: buildFetchHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
          // Original URL works with browser UA! Update metadata to use browser UA
          await prisma.source.update({
            where: { id: source.id },
            data: {
              metadata: {
                ...meta,
                consecutiveFailures: 0,
                healAttempts,
                healResult: 'ua-fix',
                useBrowserUA: true,
                healedAt: new Date().toISOString(),
              },
            },
          });
          logger.info({ sourceId: source.id, name: source.name }, 'Self-healed: original URL works with browser User-Agent');
          return true;
        }

        // URL returns 200 but HTML instead of RSS — switch directly to web scraping
        if (text.includes('<!DOCTYPE html') || text.includes('<html')) {
          const scrapeUrl = new URL(originalUrl).origin + new URL(originalUrl).pathname;
          await prisma.source.update({
            where: { id: source.id },
            data: {
              platform: 'WEB_SCRAPE' as any,
              url: scrapeUrl,
              metadata: {
                ...meta,
                consecutiveFailures: 0,
                healAttempts,
                healResult: 'html-not-rss-switched-to-scrape',
                previousPlatform: 'RSS',
                previousUrl: originalUrl,
                useBrowserUA: true,
                healedAt: new Date().toISOString(),
              },
            },
          });
          logger.info({ sourceId: source.id, name: source.name, scrapeUrl }, 'Self-healed: URL returns HTML not RSS — switched to web scraping');
          return true;
        }
      }
    } catch {
      // Try next strategy
    }
  }

  // Strategy 1: Try alternate RSS URLs (for RSS sources)
  if (source.platform === 'RSS' && originalUrl) {
    for (const variant of RSS_URL_VARIANTS) {
      const altUrl = variant(originalUrl);
      if (!altUrl || altUrl === originalUrl) continue;

      try {
        const resp = await fetch(altUrl, {
          headers: buildFetchHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) continue;

        const text = await resp.text();
        // Check if it looks like valid RSS/Atom
        if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
          // Found a working RSS feed at an alternate URL!
          await prisma.source.update({
            where: { id: source.id },
            data: {
              url: altUrl,
              metadata: {
                ...meta,
                consecutiveFailures: 0,
                healAttempts,
                healResult: `rss-url-fixed`,
                previousUrl: originalUrl,
                healedAt: new Date().toISOString(),
              },
            },
          });
          logger.info({ sourceId: source.id, name: source.name, oldUrl: originalUrl, newUrl: altUrl }, 'Self-healed: found working RSS URL');
          return true;
        }
      } catch {
        // Try next variant
      }
    }

    // Strategy 1.5: Try www/non-www and https/http protocol variants
    for (const variant of getProtocolVariants(originalUrl)) {
      try {
        const resp = await fetch(variant, {
          headers: buildFetchHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const text = await resp.text();
          if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
            await prisma.source.update({
              where: { id: source.id },
              data: {
                url: variant,
                metadata: { ...meta, consecutiveFailures: 0, healAttempts, healResult: 'protocol-variant', previousUrl: originalUrl, healedAt: new Date().toISOString() },
              },
            });
            logger.info({ sourceId: source.id, oldUrl: originalUrl, newUrl: variant }, 'Self-healed: protocol/www variant');
            return true;
          }
        }
      } catch { /* next */ }
    }

    // Strategy 2: Auto-discover RSS from the site's HTML <link> tags
    try {
      const baseUrl = new URL(originalUrl).origin;
      const discoveredFeeds = await discoverRSSFromHTML(baseUrl);
      for (const feedUrl of discoveredFeeds) {
        if (feedUrl === originalUrl) continue;
        try {
          const resp = await fetch(feedUrl, { headers: buildFetchHeaders(), signal: AbortSignal.timeout(10000) });
          if (resp.ok) {
            const text = await resp.text();
            if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
              await prisma.source.update({
                where: { id: source.id },
                data: {
                  url: feedUrl,
                  metadata: { ...meta, consecutiveFailures: 0, healAttempts, healResult: 'auto-discovered', previousUrl: originalUrl, discoveredFrom: baseUrl, healedAt: new Date().toISOString() },
                },
              });
              logger.info({ sourceId: source.id, oldUrl: originalUrl, newUrl: feedUrl }, 'Self-healed: auto-discovered RSS from HTML link tags');
              return true;
            }
          }
        } catch { /* next feed */ }
      }
    } catch { /* discovery failed */ }

    // Strategy 3: Switch to web scraping (site is up but RSS is broken)
    try {
      const baseUrl = new URL(originalUrl).origin;
      const siteResp = await fetch(baseUrl, {
        headers: buildFetchHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (siteResp.ok) {
        await prisma.source.update({
          where: { id: source.id },
          data: {
            platform: 'WEB_SCRAPE' as any,
            url: baseUrl,
            metadata: {
              ...meta,
              consecutiveFailures: 0,
              healAttempts,
              healResult: 'switched-to-scrape',
              previousPlatform: 'RSS',
              previousUrl: originalUrl,
              healedAt: new Date().toISOString(),
            },
          },
        });
        logger.info({ sourceId: source.id, name: source.name, baseUrl }, 'Self-healed: switched from RSS to web scraping');
        return true;
      }
    } catch {
      // Site unreachable — cannot heal
    }
  }

  // Record failed heal attempt
  await prisma.source.update({
    where: { id: source.id },
    data: {
      metadata: {
        ...meta,
        healAttempts,
        healResult: 'failed',
        healFailedAt: new Date().toISOString(),
      },
    },
  });
  logger.warn({ sourceId: source.id, name: source.name }, 'Self-heal failed — no working alternative found');
  return false;
}

/**
 * Track a source failure. At HEAL_AT_FAILURE, attempts self-healing.
 * At MAX_CONSECUTIVE_FAILURES, auto-deactivates the source.
 */
async function trackSourceFailure(sourceId: string, reason: string): Promise<void> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return;

    const meta = (source.metadata || {}) as Record<string, unknown>;
    // Ensure failures is always a number (guard against string concatenation)
    const failures = (parseInt(String(meta.consecutiveFailures || 0), 10) || 0) + 1;

    // ── Audit log: record every failure with timestamp ──
    const auditLog = ((meta.failureLog || []) as Array<{ at: string; reason: string; failure: number }>).slice(-20); // Keep last 20
    auditLog.push({ at: new Date().toISOString(), reason: reason.substring(0, 200), failure: failures });

    logger.info({ sourceId, name: source.name, failures, reason: reason.substring(0, 100) }, `Source failure #${failures}`);

    // At failure thresholds, try to self-heal (>= so we never miss the trigger)
    if (failures >= HEAL_AT_FAILURE && failures <= MAX_CONSECUTIVE_FAILURES) {
      logger.info({ sourceId, name: source.name, failures }, `Self-heal attempt triggered at failure #${failures}`);
      auditLog.push({ at: new Date().toISOString(), reason: `SELF-HEAL ATTEMPT at failure #${failures}`, failure: failures });
      const healed = await attemptSelfHeal(source);
      if (healed) {
        auditLog.push({ at: new Date().toISOString(), reason: 'SELF-HEAL SUCCESS', failure: failures });
        // Re-read metadata after heal (it was modified by attemptSelfHeal)
        const freshMeta = ((await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } }))?.metadata || {}) as Record<string, unknown>;
        const healStats = (freshMeta.healStats || {}) as Record<string, number>;
        const healResult = (freshMeta.healResult as string) || 'unknown';
        healStats[healResult] = (healStats[healResult] || 0) + 1;
        await prisma.source.update({
          where: { id: sourceId },
          data: { metadata: { ...freshMeta, healStats, failureLog: auditLog } },
        });
        logger.info({ sourceId, name: source.name, healResult }, 'Self-heal succeeded');
        return;
      } else {
        auditLog.push({ at: new Date().toISOString(), reason: 'SELF-HEAL FAILED', failure: failures });
        logger.warn({ sourceId, name: source.name, failures }, 'Self-heal failed');
      }
    }

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      auditLog.push({ at: new Date().toISOString(), reason: `AUTO-DEACTIVATED at failure #${failures}: ${reason.substring(0, 100)}`, failure: failures });

      // Auto-deactivate
      auditLog.push({ at: new Date().toISOString(), reason: `AUTO-DEACTIVATED after ${failures} failures`, failure: failures });
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          metadata: {
            ...meta,
            consecutiveFailures: failures,
            failureLog: auditLog,
            deactivatedAt: new Date().toISOString(),
            deactivateReason: reason,
            lastFailure: reason,
            lastFailureAt: new Date().toISOString(),
            failureLog: auditLog,
          },
        },
      });
      logger.warn({ sourceId, name: source.name, failures, reason }, `Source auto-deactivated after ${failures} consecutive failures`);

      // Purge pending queue jobs for this source
      await purgeSourceJobs(sourceId);
    } else {
      // Increment failure count with audit log
      await prisma.source.update({
        where: { id: sourceId },
        data: { metadata: { ...meta, consecutiveFailures: failures, failureLog: auditLog, lastFailure: reason, lastFailureAt: new Date().toISOString() } },
      });
    }
  } catch (err) {
    logger.error({ sourceId, err: (err as Error).message }, 'Failed to track source failure');
  }
}

/**
 * Reset consecutive failure count on successful poll.
 */
async function resetSourceFailures(sourceId: string): Promise<void> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return;
    const meta = (source.metadata || {}) as Record<string, unknown>;
    if (meta.consecutiveFailures) {
      await prisma.source.update({
        where: { id: sourceId },
        data: { metadata: { ...meta, consecutiveFailures: 0 } },
      });
    }
  } catch {
    // Non-critical
  }
}

/**
 * Remove all pending ingestion queue jobs for a deactivated source.
 */
async function purgeSourceJobs(sourceId: string): Promise<void> {
  try {
    const queue = new Queue('ingestion', { connection: getSharedConnection() });
    const waiting = await queue.getWaiting(0, 500);
    let removed = 0;

    for (const job of waiting) {
      if (job.data?.sourceId === sourceId) {
        await job.remove();
        removed++;
      }
    }

    await queue.close();
    if (removed > 0) {
      logger.info({ sourceId, removed }, 'Purged pending jobs for deactivated source');
    }
  } catch (err) {
    logger.error({ sourceId, err: (err as Error).message }, 'Failed to purge source jobs');
  }
}

/**
 * Get an API key by checking env vars first, then the AccountCredential table.
 * This ensures keys configured on the backend service (via admin UI) work
 * even if the worker service doesn't have them as env vars.
 */
async function getApiKey(platform: string, envVarNames: string[]): Promise<string | null> {
  // Check env vars first
  for (const name of envVarNames) {
    if (process.env[name]) return process.env[name]!;
  }

  // Fall back to database credentials
  try {
    const credential = await prisma.accountCredential.findFirst({
      where: { platform, isActive: true },
      select: { apiKey: true },
    });
    if (credential?.apiKey) return credential.apiKey;
  } catch {
    // Table may not exist yet
  }

  return null;
}

// Types for job data
interface RSSPollJob {
  type: 'rss_poll';
  sourceId: string;
  feedUrl: string;
}

interface NewsAPIPollJob {
  type: 'newsapi_poll';
  sourceId: string;
  query?: string;
}

interface FacebookPagePollJob {
  type: 'facebook_page_poll';
  sourceId: string;
  pageId: string;
  accessToken: string;
}

interface TwitterPollJob {
  type: 'twitter_poll';
  sourceId: string;
  query: string;
  bearerToken?: string;
}

interface RedditPollJob {
  type: 'reddit_poll';
  sourceId: string;
  subreddits: string[]; // e.g. ['news', 'worldnews', 'localhouston']
}

type IngestionJob = RSSPollJob | NewsAPIPollJob | FacebookPagePollJob | TwitterPollJob | RedditPollJob;

// RSS item shape after parsing
interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  'dc:date'?: string;
  guid?: string | { '#text': string };
  author?: string;
  'dc:creator'?: string;
  'media:content'?: { '@_url'?: string } | Array<{ '@_url'?: string }>;
  enclosure?: { '@_url'?: string };
  'content:encoded'?: string;
}

interface NewsAPIArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count: number };
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  full_picture?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function getGuid(item: RSSItem, feedUrl: string): string {
  if (item.guid) {
    return typeof item.guid === 'string' ? item.guid : item.guid['#text'];
  }
  if (item.link) return item.link;
  // Fallback: hash of title + pubDate
  const raw = `${feedUrl}::${item.title || ''}::${item.pubDate || ''}`;
  return generateContentHash(raw);
}

function extractMediaUrls(item: RSSItem): string[] {
  const urls: string[] = [];
  if (item['media:content']) {
    const media = Array.isArray(item['media:content'])
      ? item['media:content']
      : [item['media:content']];
    for (const m of media) {
      if (m['@_url']) urls.push(m['@_url']);
    }
  }
  if (item.enclosure?.['@_url']) {
    urls.push(item.enclosure['@_url']);
  }
  return urls;
}

async function handleRSSPoll(job: Job<RSSPollJob>): Promise<void> {
  const { sourceId, feedUrl } = job.data;
  logger.info({ sourceId, feedUrl }, 'Polling RSS feed');

  // Load source metadata for conditional fetch headers (ETag, Last-Modified)
  const sourceMeta = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { metadata: true, lastPolledAt: true },
  });
  const meta = (sourceMeta?.metadata || {}) as Record<string, unknown>;

  // Build headers — use browser UA if self-healing flagged it, otherwise rotate
  const useBrowserUA = !!(meta.useBrowserUA);
  const preferredUA = (meta.healedUA as string) || undefined;
  const headers = buildFetchHeaders(useBrowserUA ? BROWSER_UA : preferredUA);
  if (meta.lastETag) headers['If-None-Match'] = meta.lastETag as string;
  if (meta.lastModified) headers['If-Modified-Since'] = meta.lastModified as string;

  // Per-domain throttle — prevents banning from aggressive polling
  await throttleDomain(feedUrl);

  let response: Response;
  try {
    response = await fetch(feedUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    await trackSourceFailure(sourceId, (err as Error).message);
    logger.error({ sourceId, feedUrl, err }, 'Failed to fetch RSS feed');
    throw err;
  }

  // 304 Not Modified — feed hasn't changed since last poll, skip processing
  if (response.status === 304) {
    logger.debug({ sourceId, feedUrl }, 'Feed not modified (304), skipping');
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastPolledAt: new Date() },
    });
    return;
  }

  // 429 Too Many Requests — respect Retry-After header
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delaySec = retryAfter
      ? (isNaN(+retryAfter) ? Math.max(60, (new Date(retryAfter).getTime() - Date.now()) / 1000) : parseInt(retryAfter))
      : 300; // default 5 min
    await trackSourceFailure(sourceId, `Rate limited (429). Retry after ${delaySec}s`);
    logger.warn({ sourceId, feedUrl, delaySec }, 'Rate limited by server');
    throw new Error(`Rate limited: retry after ${delaySec}s`);
  }

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch {}
    const challenge = isBotChallenge(response.status, body);
    const reason = challenge
      ? `Bot challenge: ${challenge} (HTTP ${response.status}) — source may need direct URL or scraping`
      : `HTTP ${response.status}`;
    await trackSourceFailure(sourceId, reason);
    throw new Error(`RSS fetch failed: ${reason}`);
  }

  // Track redirect: if feed redirected, update the URL for future polls
  const finalUrl = response.url || feedUrl;
  if (finalUrl !== feedUrl) {
    logger.info({ sourceId, originalUrl: feedUrl, redirectedTo: finalUrl }, 'Feed redirected — updating source URL');
    await prisma.source.update({
      where: { id: sourceId },
      data: { url: finalUrl, metadata: { ...meta, previousUrl: feedUrl, redirectDetectedAt: new Date().toISOString() } },
    });
  }

  const xml = await response.text();

  // Content-hash skip: if feed body is identical to last poll, skip parsing
  const { createHash } = await import('crypto');
  const feedHash = createHash('md5').update(xml).digest('hex');
  if (meta.lastFeedHash === feedHash) {
    logger.debug({ sourceId, feedUrl }, 'Feed content unchanged (hash match), skipping');
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastPolledAt: new Date() },
    });
    return;
  }

  // Detect HTML served instead of RSS (site doesn't have RSS for this URL)
  if (!xml.includes('<rss') && !xml.includes('<feed') && !xml.includes('<channel') && !xml.includes('<?xml')) {
    if (xml.includes('<!DOCTYPE html') || xml.includes('<html') || xml.includes('<head>')) {
      await trackSourceFailure(sourceId, 'HTML page returned instead of RSS — site may not have RSS feed for this URL');
      throw new Error('RSS feed returned HTML instead of XML — needs scraping');
    }
  }

  // Store caching headers + content hash for next poll
  const cacheUpdate: Record<string, unknown> = { ...meta, lastFeedHash: feedHash };
  const respETag = response.headers.get('ETag');
  const respLastMod = response.headers.get('Last-Modified');
  if (respETag) cacheUpdate.lastETag = respETag;
  if (respLastMod) cacheUpdate.lastModified = respLastMod;
  await prisma.source.update({
    where: { id: sourceId },
    data: { metadata: cacheUpdate },
  });

  // Reset failure count on success
  await resetSourceFailures(sourceId);

  const parsed = xmlParser.parse(xml);

  // Support both RSS 2.0 and Atom formats
  let items: RSSItem[] = [];
  if (parsed.rss?.channel?.item) {
    items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];
  } else if (parsed.feed?.entry) {
    items = Array.isArray(parsed.feed.entry)
      ? parsed.feed.entry
      : [parsed.feed.entry];
  }

  // Time-bound filtering: only process items published since last poll
  // Uses the shorter of: lastPolledAt or the UI time setting (default 24h)
  const uiMaxAgeHours = (meta.pollMaxAgeHours as number) || 24;
  const lastPolled = (sourceMeta as any)?.lastPolledAt ? new Date((sourceMeta as any).lastPolledAt).getTime() : 0;
  const uiCutoff = Date.now() - uiMaxAgeHours * 60 * 60 * 1000;
  const effectiveCutoff = Math.max(lastPolled, uiCutoff); // Whichever is more recent

  const beforeFilter = items.length;
  items = items.filter(item => {
    const pubDate = item.pubDate || item['dc:date'];
    if (!pubDate) return true; // No date = include (can't filter)
    const pubTime = new Date(pubDate).getTime();
    if (isNaN(pubTime)) return true; // Invalid date = include
    return pubTime >= effectiveCutoff;
  });
  if (items.length < beforeFilter) {
    logger.info({ sourceId, before: beforeFilter, after: items.length, cutoffAge: Math.round((Date.now() - effectiveCutoff) / 60000) + 'min' }, 'Filtered old items by time bound');
  }

  // Content filter: apply keyword/hashtag filtering from source metadata
  const contentFilter = loadContentFilter(meta);
  if (contentFilter) {
    const beforeCF = items.length;
    items = items.filter(item => {
      const title = decodeHTMLEntities(item.title || '');
      const body = decodeHTMLEntities(item.description || item['content:encoded'] || '');
      return passesContentFilter(contentFilter, { title, body });
    });
    if (items.length < beforeCF) {
      logger.info({ sourceId, before: beforeCF, after: items.length }, 'Filtered items by content filter');
    }
  }

  logger.info({ sourceId, itemCount: items.length }, 'Processing RSS items');

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });
  const extractionQueue = new Queue('article-extraction', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const item of items) {
    try {
      const content = decodeHTMLEntities(item['content:encoded'] || item.description || item.title || '');
      const title = decodeHTMLEntities(item.title || '');
      const guid = getGuid(item, feedUrl);
      const platformPostId = `rss::${feedUrl}::${guid}`;

      // Check for duplicate by platformPostId
      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(`${title} ${content}`);

      // Check for duplicate by content hash within the same source —
      // prevents the same article from being stored multiple times when
      // the RSS guid changes between polls but the content is identical.
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) {
        logger.debug({ sourceId, title: title.substring(0, 60) }, 'Skipping duplicate content (same source, same hash)');
        continue;
      }

      const publishedAt = item.pubDate || item['dc:date']
        ? new Date(item.pubDate || item['dc:date'] || Date.now())
        : new Date();

      const mediaUrls = extractMediaUrls(item);

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000), // Limit content length
          contentHash,
          title: title.substring(0, 500),
          url: item.link || undefined,
          authorName: item.author || item['dc:creator'] || undefined,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: item as Record<string, unknown>,
          publishedAt,
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      // Queue full article extraction if the post has a URL
      if (item.link) {
        await extractionQueue.add('extract_article', { sourcePostId: post.id }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: 2000, // Small delay to let enrichment start first
        });
      }
    } catch (err) {
      logger.warn({ err, item: item.title }, 'Failed to process RSS item');
    }
  }

  // Update last polled timestamp
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();
  await extractionQueue.close();

  await logPollAudit(sourceId, { status: ingested > 0 ? 'success' : 'partial', fetched: items.length, ingested });

  logger.info({ sourceId, ingested, total: items.length }, 'RSS poll complete');
}

async function handleNewsAPIPoll(job: Job<NewsAPIPollJob>): Promise<void> {
  const { sourceId, query } = job.data;
  const apiKey = await getApiKey('NEWSAPI', ['NEWSAPI_KEY']);

  if (!apiKey) {
    await trackSourceFailure(sourceId, 'NEWSAPI_KEY not configured (env or DB)');
    return;
  }

  const searchQuery = query || 'Houston Texas';
  const params = new URLSearchParams({
    q: searchQuery,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '50',
    apiKey,
  });

  logger.info({ sourceId, query: searchQuery }, 'Polling NewsAPI');

  let response: Response;
  try {
    response = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ sourceId, err }, 'Failed to fetch NewsAPI');
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NewsAPI fetch failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { status: string; articles: NewsAPIArticle[] };

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI returned status: ${data.status}`);
  }

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const article of data.articles) {
    try {
      article.title = decodeHTMLEntities(article.title || '');
      const content = decodeHTMLEntities(article.content || article.description || article.title);
      const platformPostId = `newsapi::${generateContentHash(article.url)}`;

      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(`${article.title} ${content}`);

      // Content-hash dedup: skip if same content already ingested from this source
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const mediaUrls = article.urlToImage ? [article.urlToImage] : [];

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: `${article.title}\n\n${content}`.substring(0, 50000),
          contentHash,
          title: article.title.substring(0, 500),
          url: article.url,
          authorName: article.author || article.source.name || undefined,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: article as unknown as Record<string, unknown>,
          publishedAt: new Date(article.publishedAt),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      logger.warn({ err, title: article.title }, 'Failed to process NewsAPI article');
    }
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({ sourceId, ingested, total: data.articles.length }, 'NewsAPI poll complete');
}

async function handleTwitterPoll(job: Job<TwitterPollJob>): Promise<void> {
  const { sourceId, query } = job.data;
  const bearerToken = job.data.bearerToken || await getApiKey('TWITTER', ['TWITTER_BEARER_TOKEN']);

  if (!bearerToken) {
    await trackSourceFailure(sourceId, 'TWITTER_BEARER_TOKEN not configured (env or DB)');
    return;
  }

  logger.info({ sourceId, query }, 'Polling Twitter/X');

  const tweets = await searchRecentTweets(query, bearerToken, 25);

  logger.info({ sourceId, tweetCount: tweets.length }, 'Fetched tweets');

  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  let ingested = 0;

  for (const tweet of tweets) {
    try {
      const platformPostId = `twitter::${tweet.id}`;
      const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
      if (existing) continue;

      const content = tweet.text;
      const contentHash = generateContentHash(content);

      // Content-hash dedup
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content,
          contentHash,
          title: content.substring(0, 100),
          url: tweet.url,
          authorName: tweet.authorName || tweet.authorUsername || 'Unknown',
          authorId: tweet.authorId,
          engagementLikes: tweet.metrics.likes,
          engagementShares: tweet.metrics.retweets + tweet.metrics.quotes,
          engagementComments: tweet.metrics.replies,
          publishedAt: new Date(tweet.createdAt),
          rawData: tweet,
          entities: tweet.entities ? {
            hashtags: tweet.entities.hashtags,
            urls: tweet.entities.urls,
            mentions: tweet.entities.mentions,
          } : undefined,
        },
      });

      await enrichmentQueue.add('enrich', { sourcePostId: post.id });
      ingested++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // Dedup
      logger.error({ sourceId, tweetId: tweet.id, err: (err as Error).message }, 'Failed to ingest tweet');
    }
  }

  await enrichmentQueue.close();

  // Update source last polled
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  logger.info({ sourceId, query, ingested, total: tweets.length }, 'Twitter poll complete');
}

// ─── Reddit Handler ─────────────────────────────────────────────────────────
// Polls multiple subreddits from a single consolidated source.
// Uses Reddit's public JSON API (no auth needed for public subreddits).
// Each source has metadata.subreddits = ['news', 'worldnews', 'houston', ...]

// ─── Reddit OAuth Helper ─────────────────────────────────────────────────────
// Reddit blocks unauthenticated server requests (403 from cloud IPs).
// OAuth "script" app type gives 60 req/min for free.
// Env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
// Falls back to unauthenticated if no credentials (works from residential IPs).

let redditAccessToken: string | null = null;
let redditTokenExpiry = 0;

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env['REDDIT_CLIENT_ID'];
  const clientSecret = process.env['REDDIT_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return null;

  if (redditAccessToken && Date.now() < redditTokenExpiry) return redditAccessToken;

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TopicPulse/1.0 (news aggregation platform)',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    redditAccessToken = data.access_token;
    redditTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
    return redditAccessToken;
  } catch {
    return null;
  }
}

async function fetchRedditSubreddit(subreddit: string): Promise<any[]> {
  const token = await getRedditToken();

  // OAuth path (reliable from cloud servers)
  if (token) {
    const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=25&raw_json=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'TopicPulse/1.0 (news aggregation platform)',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.data?.children || [];
    }
    if (res.status === 401) {
      // Token expired, clear and retry once
      redditAccessToken = null;
      const newToken = await getRedditToken();
      if (newToken) {
        const retry = await fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=25&raw_json=1`, {
          headers: { 'Authorization': `Bearer ${newToken}`, 'User-Agent': 'TopicPulse/1.0 (news aggregation platform)' },
          signal: AbortSignal.timeout(10000),
        });
        if (retry.ok) {
          const data = await retry.json();
          return data?.data?.children || [];
        }
      }
    }
    // Log non-200 for debugging
    logger.warn({ subreddit, status: res.status }, 'Reddit OAuth request failed');
  }

  // Fallback: unauthenticated (works from residential IPs, blocked from most cloud servers)
  const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.json?limit=25&raw_json=1`, {
    headers: {
      'User-Agent': 'TopicPulse/1.0 (news aggregation platform; contact: support@topicpulse.ai)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status} for r/${subreddit}`);
  const data = await res.json();
  return data?.data?.children || [];
}

async function handleRedditPoll(job: Job<RedditPollJob>): Promise<void> {
  const { sourceId, subreddits } = job.data;
  logger.info({ sourceId, subreddits, count: subreddits.length }, 'Polling Reddit subreddits');

  // Load source metadata for time bounds + content filter
  const sourceData = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { metadata: true, lastPolledAt: true },
  });
  const redditMeta = ((sourceData?.metadata || {}) as Record<string, unknown>);
  const redditFilter = loadContentFilter(redditMeta);
  const redditLastPolled = (sourceData as any)?.lastPolledAt ? new Date((sourceData as any).lastPolledAt).getTime() : 0;
  const redditMaxAge = (redditMeta.pollMaxAgeHours as number) || 24;
  const redditCutoff = Math.max(redditLastPolled, Date.now() - redditMaxAge * 60 * 60 * 1000);

  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  let totalIngested = 0;
  let totalFetched = 0;
  let totalFiltered = 0;

  for (const sub of subreddits) {
    const subreddit = sub.replace(/^r\//, '').replace(/^\/r\//, '').trim();
    if (!subreddit) continue;

    try {
      const posts = await fetchRedditSubreddit(subreddit);
      totalFetched += posts.length;

      for (const item of posts) {
        const post = item.data;
        if (!post || post.stickied) continue;
        if (!post.title) continue;

        // Time filter: skip posts older than cutoff
        const postTime = (post.created_utc || 0) * 1000;
        if (postTime > 0 && postTime < redditCutoff) continue;

        // Content filter
        if (!passesContentFilter(redditFilter, {
          title: post.title || '',
          body: post.selftext || '',
          flair: post.link_flair_text || '',
          hashtags: [],
          score: post.score || 0,
          engagement: (post.num_comments || 0) + (post.ups || 0),
        })) {
          totalFiltered++;
          continue;
        }

        try {
          const platformPostId = `reddit::${post.id}`;
          const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
          if (existing) continue;

          // Build content: title + selftext for text posts, title + url for link posts
          const content = post.selftext
            ? `${post.title}\n\n${post.selftext.substring(0, 3000)}`
            : post.title;
          const contentHash = generateContentHash(content);

          // Content-hash dedup
          const existingByContent = await prisma.sourcePost.findFirst({
            where: { sourceId, contentHash },
          });
          if (existingByContent) continue;

          const permalink = `https://www.reddit.com${post.permalink}`;
          const externalUrl = post.url && !post.url.includes('reddit.com') ? post.url : permalink;

          const sourcePost = await prisma.sourcePost.create({
            data: {
              sourceId,
              platformPostId,
              content,
              contentHash,
              title: post.title?.substring(0, 500) || 'Reddit Post',
              url: externalUrl,
              authorName: post.author || 'unknown',
              authorId: post.author_fullname || null,
              engagementLikes: post.ups || 0,
              engagementShares: post.num_crossposts || 0,
              engagementComments: post.num_comments || 0,
              publishedAt: new Date(post.created_utc * 1000),
              rawData: {
                subreddit: post.subreddit,
                subreddit_name: post.subreddit_name_prefixed,
                score: post.score,
                upvote_ratio: post.upvote_ratio,
                domain: post.domain,
                flair: post.link_flair_text,
                is_self: post.is_self,
                permalink,
              },
            },
          });

          await enrichmentQueue.add('enrich', { sourcePostId: sourcePost.id });
          totalIngested++;
        } catch (err) {
          if ((err as any).code === 'P2002') continue; // Dedup
          logger.error({ sourceId, subreddit, postId: post.id, err: (err as Error).message }, 'Failed to ingest Reddit post');
        }
      }

      // Small delay between subreddits to be polite
      if (subreddits.indexOf(sub) < subreddits.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      logger.error({ sourceId, subreddit, err: (err as Error).message }, 'Failed to fetch subreddit');
    }
  }

  await enrichmentQueue.close();

  // Reset failure count on success + audit log
  const meta = ((await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } }))?.metadata || {}) as Record<string, unknown>;
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastPolledAt: new Date(),
      metadata: { ...meta, consecutiveFailures: 0, lastRedditPoll: new Date().toISOString(), lastRedditIngested: totalIngested },
    },
  });

  await logPollAudit(sourceId, { status: totalIngested > 0 ? 'success' : 'partial', fetched: totalFetched, ingested: totalIngested, subreddits: subreddits.length });

  logger.info({ sourceId, subreddits: subreddits.length, fetched: totalFetched, ingested: totalIngested }, 'Reddit poll complete');
}

async function handleFacebookPagePoll(job: Job<FacebookPagePollJob>): Promise<void> {
  const { sourceId, pageId, accessToken } = job.data;

  logger.info({ sourceId, pageId }, 'Polling Facebook page');

  const fields = 'id,message,story,created_time,permalink_url,shares,likes.summary(true),comments.summary(true),full_picture';
  const url = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=${fields}&access_token=${accessToken}&limit=25`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ sourceId, pageId, err }, 'Failed to fetch Facebook page');
    throw err;
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
    logger.warn({ sourceId, pageId, delay }, 'Facebook rate limit hit, will retry');
    throw new Error(`Facebook rate limit. Retry after ${delay}ms`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { data: FacebookPost[] };

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const fbPost of data.data) {
    try {
      const content = fbPost.message || fbPost.story || '';
      if (!content) continue; // Skip posts with no text content

      const platformPostId = `facebook::${fbPost.id}`;

      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(content);

      // Content-hash dedup
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const mediaUrls = fbPost.full_picture ? [fbPost.full_picture] : [];

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000),
          contentHash,
          url: fbPost.permalink_url || undefined,
          engagementLikes: fbPost.likes?.summary?.total_count || 0,
          engagementShares: fbPost.shares?.count || 0,
          engagementComments: fbPost.comments?.summary?.total_count || 0,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: fbPost as unknown as Record<string, unknown>,
          publishedAt: new Date(fbPost.created_time),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      logger.warn({ err, postId: fbPost.id }, 'Failed to process Facebook post');
    }
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({ sourceId, ingested, total: data.data.length }, 'Facebook poll complete');
}

export function createIngestionWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<IngestionJob>(
    'ingestion',
    async (job: Job<IngestionJob>) => {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing ingestion job');

      switch (job.data.type) {
        case 'rss_poll':
          await handleRSSPoll(job as Job<RSSPollJob>);
          break;
        case 'newsapi_poll':
          await handleNewsAPIPoll(job as Job<NewsAPIPollJob>);
          break;
        case 'facebook_page_poll':
          await handleFacebookPagePoll(job as Job<FacebookPagePollJob>);
          break;
        case 'twitter_poll':
          await handleTwitterPoll(job as Job<TwitterPollJob>);
          break;
        case 'reddit_poll':
          await handleRedditPoll(job as Job<RedditPollJob>);
          break;
        default:
          logger.error({ type: (job.data as IngestionJob).type }, 'Unknown ingestion job type');
      }
    },
    {
      connection,
      concurrency: 10,  // Moderate — each poll opens a DB connection
      limiter: {
        max: 120,
        duration: 60000, // Max 120 jobs per minute (2/sec)
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Ingestion job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Ingestion job failed');
  });

  return worker;
}
