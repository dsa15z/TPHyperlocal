// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { XMLParser } from 'fast-xml-parser';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('coverage');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

interface CoverageJob {
  coverageFeedId: string;
}

// ─── Jaccard Similarity ─────────────────────────────────────────────────────

/**
 * Tokenize text into lowercase word set, removing stop words and punctuation.
 */
function tokenize(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or',
    'nor', 'not', 'no', 'so', 'than', 'too', 'very', 'just', 'about',
    'up', 'its', 'it', 'he', 'she', 'they', 'we', 'you', 'i', 'my',
    'your', 'his', 'her', 'our', 'their', 'this', 'that', 'these',
    'those', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
    'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'only', 'own', 'same', 'new', 'says',
    'said', 'also', 'get', 'got', 'one', 'two', 's', 't', 're',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return new Set(words);
}

/**
 * Calculate Jaccard similarity between two strings.
 * Returns 0-1 where 1 = identical token sets.
 */
function jaccardSimilarity(textA: string, textB: string): number {
  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Feed Fetching ──────────────────────────────────────────────────────────

interface FeedItem {
  title: string;
  url: string;
}

async function fetchRSSItems(url: string): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'BreakingNewsBot/1.0 CoverageChecker' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`RSS fetch failed: ${response.status}`);

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);

  const items: FeedItem[] = [];
  const channel = parsed?.rss?.channel || parsed?.feed;
  const entries = channel?.item || channel?.entry || [];
  const entryList = Array.isArray(entries) ? entries : [entries];

  for (const entry of entryList) {
    const title = entry.title || '';
    const url = entry.link?.['@_href'] || entry.link || entry.guid || '';
    if (title && typeof title === 'string') {
      items.push({ title: title.trim(), url: typeof url === 'string' ? url.trim() : '' });
    }
  }

  return items;
}

async function fetchAPIItems(url: string, authConfig: any): Promise<FeedItem[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'BreakingNewsBot/1.0',
    'Accept': 'application/json',
  };

  if (authConfig?.apiKey) {
    headers['Authorization'] = `Bearer ${authConfig.apiKey}`;
  }
  if (authConfig?.headers) {
    Object.assign(headers, authConfig.headers);
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`API fetch failed: ${response.status}`);

  const data = await response.json();

  // Try common response shapes
  const articles = data.articles || data.items || data.results || data.data || [];
  const list = Array.isArray(articles) ? articles : [];

  return list.map((item: any) => ({
    title: (item.title || item.headline || item.name || '').trim(),
    url: (item.url || item.link || item.href || '').trim(),
  })).filter((item: FeedItem) => item.title);
}

async function fetchScrapeItems(url: string, cssSelector?: string): Promise<FeedItem[]> {
  // Simple HTML scrape: fetch the page, extract links with titles
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BreakingNewsBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Scrape fetch failed: ${response.status}`);

  const html = await response.text();
  const items: FeedItem[] = [];

  // Extract <a> tags with href and text content using regex (no DOM parser needed)
  // Focus on article-like links (longer titles, news-like URLs)
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].trim();

    // Filter: title > 20 chars (likely a headline, not a nav link)
    if (text.length > 20 && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
      items.push({ title: text, url: fullUrl });
    }
  }

  return items;
}

// ─── Coverage Processing ────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.35; // Jaccard threshold for "covered"

async function processCoverage(job: Job<CoverageJob>): Promise<void> {
  const { coverageFeedId } = job.data;

  const feed = await prisma.coverageFeed.findUnique({
    where: { id: coverageFeedId },
  });

  if (!feed || !feed.isActive) {
    logger.warn({ coverageFeedId }, 'Coverage feed not found or inactive');
    return;
  }

  logger.info({ feedId: feed.id, name: feed.name, type: feed.type }, 'Processing coverage feed');

  // Fetch items from the feed
  let feedItems: FeedItem[];
  try {
    switch (feed.type) {
      case 'RSS':
        feedItems = await fetchRSSItems(feed.url);
        break;
      case 'API':
        feedItems = await fetchAPIItems(feed.url, feed.authConfig);
        break;
      case 'SCRAPE':
        feedItems = await fetchScrapeItems(feed.url, feed.cssSelector || undefined);
        break;
      default:
        throw new Error(`Unknown feed type: ${feed.type}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ feedId: feed.id, err: errorMsg }, 'Failed to fetch coverage feed');
    await prisma.coverageFeed.update({
      where: { id: feed.id },
      data: { lastError: errorMsg, lastPolledAt: new Date() },
    });
    throw err;
  }

  logger.info({ feedId: feed.id, itemCount: feedItems.length }, 'Fetched coverage feed items');

  // Get recent stories (last 7 days) that don't have a coverage match yet for this feed
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stories = await prisma.story.findMany({
    where: {
      mergedIntoId: null,
      firstSeenAt: { gte: sevenDaysAgo },
    },
    select: {
      id: true,
      title: true,
      coverageMatches: {
        where: { coverageFeedId: feed.id },
        select: { id: true },
      },
    },
  });

  // Filter to stories not yet matched against this feed
  const unmatchedStories = stories.filter((s) => s.coverageMatches.length === 0);

  let matchCount = 0;
  let coveredCount = 0;

  for (const story of unmatchedStories) {
    // Find the best matching feed item for this story
    let bestScore = 0;
    let bestItem: FeedItem | null = null;

    for (const item of feedItems) {
      const score = jaccardSimilarity(story.title, item.title);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    const isCovered = bestScore >= SIMILARITY_THRESHOLD;

    // Create match record
    await prisma.coverageMatch.create({
      data: {
        coverageFeedId: feed.id,
        storyId: story.id,
        accountId: feed.accountId,
        matchedTitle: bestItem?.title || null,
        matchedUrl: bestItem?.url || null,
        similarityScore: bestScore,
        isCovered,
      },
    });

    matchCount++;
    if (isCovered) coveredCount++;
  }

  // Update feed metadata
  await prisma.coverageFeed.update({
    where: { id: feed.id },
    data: {
      lastPolledAt: new Date(),
      lastError: null,
      itemCount: feedItems.length,
    },
  });

  logger.info({
    feedId: feed.id,
    name: feed.name,
    feedItems: feedItems.length,
    storiesChecked: unmatchedStories.length,
    matched: matchCount,
    covered: coveredCount,
    gaps: matchCount - coveredCount,
  }, 'Coverage check complete');
}

// ─── Worker Export ──────────────────────────────────────────────────────────

export function createCoverageWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<CoverageJob>(
    'coverage',
    async (job) => {
      await processCoverage(job);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Coverage job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Coverage job failed');
  });

  return worker;
}
