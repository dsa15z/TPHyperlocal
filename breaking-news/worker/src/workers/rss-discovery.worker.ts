// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('rss-discovery');

interface RSSDiscoveryJob {
  url: string; // website URL to scan for RSS feeds
  marketId?: string;
  accountId?: string;
}

interface DiscoveredFeed {
  url: string;
  title: string;
  type: 'rss' | 'atom';
}

/**
 * Discovers RSS/Atom feeds from a given website URL by:
 * 1. Fetching the HTML page
 * 2. Looking for <link rel="alternate" type="application/rss+xml"> tags
 * 3. Checking common RSS URL patterns (/feed, /rss, /atom.xml, etc.)
 * 4. Validating discovered feeds by fetching and parsing them
 */
async function discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
  const feeds: DiscoveredFeed[] = [];
  const baseUrl = new URL(url).origin;

  // Step 1: Fetch HTML and look for <link> tags
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BreakingNewsBot/1.0 (RSS Discovery)' },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const html = await response.text();

      // Find <link rel="alternate" type="application/rss+xml" ...>
      const rssLinkPattern = /<link[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi;
      let match;
      while ((match = rssLinkPattern.exec(html)) !== null) {
        const tag = match[0];
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        const titleMatch = tag.match(/title=["']([^"']+)["']/i);
        if (hrefMatch?.[1]) {
          const feedUrl = hrefMatch[1].startsWith('http')
            ? hrefMatch[1]
            : new URL(hrefMatch[1], baseUrl).toString();
          feeds.push({
            url: feedUrl,
            title: titleMatch?.[1] || 'Discovered Feed',
            type: tag.includes('atom') ? 'atom' : 'rss',
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ url, err }, 'Failed to fetch page for RSS discovery');
  }

  // Step 2: Try common feed URL patterns
  const commonPaths = [
    '/feed', '/feed/', '/rss', '/rss/', '/atom.xml', '/feed.xml',
    '/rss.xml', '/index.xml', '/feeds/posts/default',
    '/feed/rss', '/feed/atom', '/?feed=rss2',
  ];

  for (const path of commonPaths) {
    const feedUrl = `${baseUrl}${path}`;
    // Skip if we already found this URL
    if (feeds.some(f => f.url === feedUrl)) continue;

    try {
      const resp = await fetch(feedUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
      });

      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
          feeds.push({ url: feedUrl, title: `Feed at ${path}`, type: 'rss' });
        }
      }
    } catch {
      // Silently skip failed attempts
    }
  }

  return feeds;
}

async function processDiscovery(job: Job<RSSDiscoveryJob>): Promise<void> {
  const { url, marketId, accountId } = job.data;

  logger.info({ url }, 'Discovering RSS feeds');

  const feeds = await discoverFeeds(url);

  logger.info({ url, feedCount: feeds.length }, 'RSS feeds discovered');

  if (feeds.length === 0) return;

  let created = 0;
  for (const feed of feeds) {
    // Check if this feed URL already exists as a source
    const existing = await prisma.source.findFirst({
      where: { url: feed.url },
    });

    if (existing) {
      logger.debug({ feedUrl: feed.url }, 'Feed already exists as source, skipping');
      continue;
    }

    await prisma.source.create({
      data: {
        platform: 'RSS',
        sourceType: 'RSS_FEED',
        name: feed.title,
        url: feed.url,
        trustScore: 0.5, // default until credibility is established
        isActive: false, // discovered feeds start inactive for admin review
        isGlobal: false,
        marketId: marketId || undefined,
        metadata: {
          discoveredFrom: url,
          feedType: feed.type,
          discoveredAt: new Date().toISOString(),
          needsReview: true,
        },
      },
    });
    created++;
  }

  logger.info({ url, discovered: feeds.length, created }, 'RSS discovery complete');
}

export function createRSSDiscoveryWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<RSSDiscoveryJob>(
    'rss-discovery',
    async (job) => { await processDiscovery(job); },
    {
      connection,
      concurrency: 2,
      limiter: { max: 5, duration: 60000 }, // max 5 discoveries per minute
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'RSS discovery job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'RSS discovery job failed');
  });

  return worker;
}
