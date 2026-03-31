// @ts-nocheck
/**
 * Web Scraper Worker — creates RSS-like feeds from websites without native RSS.
 *
 * For each configured scrape source, fetches the page HTML, extracts article
 * links and titles using CSS selectors or heuristic patterns, then creates
 * SourcePost records that flow through the normal pipeline.
 */
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';

const logger = createChildLogger('web-scraper');

interface WebScraperJob {
  sourceId: string;
  url: string;
  name: string;
  /** CSS selector for article links. If not provided, uses heuristic extraction. */
  selector?: string;
  /** Base URL for resolving relative links */
  baseUrl?: string;
}

interface ScrapedArticle {
  title: string;
  url: string;
  description?: string;
  publishedAt?: string;
}

// ─── Heuristic article extraction ──────────────────────────────────────────

/**
 * Extract article links from HTML using multiple strategies:
 * 1. CSS selector (if provided)
 * 2. <article> tags with <a> links
 * 3. <h2>/<h3> tags with <a> links (common news site pattern)
 * 4. <a> tags with long text content (likely article titles)
 */
function extractArticles(html: string, baseUrl: string, selector?: string): ScrapedArticle[] {
  const articles: ScrapedArticle[] = [];
  const seen = new Set<string>();

  // Strategy 1: Look for article-like patterns using regex
  // Match <a href="...">TITLE</a> inside article/h2/h3/li elements
  const patterns = [
    // <article> containing <a href="...">title</a>
    /<article[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>([^<]{15,200})<\/a>/gi,
    // <h2> or <h3> containing <a href="...">title</a>
    /<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]{15,200})<\/a>/gi,
    // <a> with class containing "title", "headline", "story"
    /<a\s+[^>]*(?:class="[^"]*(?:title|headline|story|article)[^"]*")[^>]*href="([^"]+)"[^>]*>([^<]{15,200})<\/a>/gi,
    // <a href="..."> with long text (likely article titles)
    /<a\s+href="([^"]+)"[^>]*>([^<]{30,200})<\/a>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].replace(/\s+/g, ' ').trim();

      // Skip non-article links
      if (url.includes('javascript:') || url.includes('#') || url.includes('mailto:')) continue;
      if (title.length < 15) continue;
      if (/sign in|log in|subscribe|cookie|privacy|terms/i.test(title)) continue;

      // Resolve relative URLs
      if (url.startsWith('/')) {
        url = baseUrl.replace(/\/$/, '') + url;
      } else if (!url.startsWith('http')) {
        url = baseUrl.replace(/\/$/, '') + '/' + url;
      }

      // Deduplicate
      if (seen.has(url)) continue;
      seen.add(url);

      articles.push({ title, url });
    }

    // Stop after first pattern that yields results
    if (articles.length >= 5) break;
  }

  // Also try to extract publication dates from nearby <time> elements
  const timePattern = /<time[^>]*datetime="([^"]+)"[^>]*>/gi;
  const dates: string[] = [];
  let timeMatch;
  while ((timeMatch = timePattern.exec(html)) !== null) {
    dates.push(timeMatch[1]);
  }

  // Assign dates to articles if we found them
  for (let i = 0; i < Math.min(articles.length, dates.length); i++) {
    articles[i].publishedAt = dates[i];
  }

  // Limit to top 20 articles per scrape
  return articles.slice(0, 20);
}

/**
 * Extract a text snippet from the page near the article link
 */
function extractSnippet(html: string, articleUrl: string): string {
  const escapedUrl = articleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<a[^>]*href="${escapedUrl}"[^>]*>[^<]*</a>[\\s\\S]{0,500}?<p[^>]*>([^<]{20,300})</p>`,
    'i'
  );
  const match = pattern.exec(html);
  if (match) return match[1].trim();

  // Try the reverse — paragraph before the link
  const pattern2 = new RegExp(
    `<p[^>]*>([^<]{20,300})</p>[\\s\\S]{0,200}?<a[^>]*href="${escapedUrl}"`,
    'i'
  );
  const match2 = pattern2.exec(html);
  if (match2) return match2[1].trim();

  return '';
}

// ─── Process scrape job ────────────────────────────────────────────────────

async function processWebScraper(job: Job<WebScraperJob>): Promise<void> {
  const { sourceId, url, name, selector, baseUrl } = job.data;
  const resolvedBase = baseUrl || new URL(url).origin;

  logger.info({ sourceId, url, name }, 'Scraping website for articles');

  // Fetch the page — try ScrapFly (JS rendering) first, then ScrapingFish, then basic fetch
  let html: string;
  const scrapflyKey = process.env.SCRAPFLY_KEY;
  const scrapingfishKey = process.env.SCRAPINGFISH_KEY;

  if (scrapflyKey) {
    // ScrapFly: renders JavaScript, bypasses anti-bot
    try {
      const sfParams = new URLSearchParams({
        key: scrapflyKey,
        url: url,
        render_js: 'true',
        asp: 'true', // anti-scraping protection bypass
        country: 'us',
      });
      const response = await fetch(`https://api.scrapfly.io/scrape?${sfParams}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const data = await response.json();
        html = data.result?.content || '';
        logger.info({ sourceId, url, via: 'scrapfly' }, 'Fetched via ScrapFly');
      } else {
        throw new Error(`ScrapFly ${response.status}`);
      }
    } catch (sfErr) {
      logger.warn({ url, err: (sfErr as Error).message }, 'ScrapFly failed, trying fallback');
      html = '';
    }
  }

  // Fallback: ScrapingFish
  if (!html && scrapingfishKey) {
    try {
      const response = await fetch('https://scraping.narf.ai/api/v1/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: scrapingfishKey, url, js_rendering: true }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        html = await response.text();
        logger.info({ sourceId, url, via: 'scrapingfish' }, 'Fetched via ScrapingFish');
      } else {
        throw new Error(`ScrapingFish ${response.status}`);
      }
    } catch (fishErr) {
      logger.warn({ url, err: (fishErr as Error).message }, 'ScrapingFish failed, trying basic fetch');
      html = '';
    }
  }

  // Final fallback: basic fetch (no JS rendering)
  if (!html) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BreakingNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
      logger.info({ sourceId, url, via: 'basic-fetch' }, 'Fetched via basic fetch');
    } catch (err) {
      logger.error({ sourceId, url, err: (err as Error).message }, 'All fetch methods failed');
      throw err;
    }
  }

  // Extract articles
  const articles = extractArticles(html, resolvedBase, selector);

  if (articles.length === 0) {
    logger.info({ sourceId, url }, 'No articles found on page');
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastPolledAt: new Date() },
    });
    return;
  }

  logger.info({ sourceId, url, articleCount: articles.length }, 'Extracted articles');

  // Ingest each article as a SourcePost
  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  const extractionQueue = new Queue('article-extraction', { connection: getSharedConnection() });

  let ingested = 0;

  for (const article of articles) {
    try {
      const content = article.description || article.title;
      const contentHash = generateContentHash(`${article.title} ${content}`);
      const platformPostId = `scrape::${generateContentHash(article.url)}`;

      // Dedup by platformPostId
      const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
      if (existing) continue;

      // Dedup by content hash within same source
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      // Get snippet if available
      const snippet = extractSnippet(html, article.url);

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: (snippet || content).substring(0, 50000),
          contentHash,
          title: article.title.substring(0, 500),
          url: article.url,
          authorName: name,
          publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
          rawData: {
            scraped: true,
            sourceUrl: url,
            extractedAt: new Date().toISOString(),
          },
        },
      });

      ingested++;

      // Queue enrichment
      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      // Queue full article extraction (will fetch the actual article page)
      await extractionQueue.add('extract_article', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        delay: 2000,
      });
    } catch (err) {
      if ((err as any)?.code === 'P2002') continue; // dedup
      logger.warn({ err: (err as Error).message, title: article.title }, 'Failed to ingest scraped article');
    }
  }

  await enrichmentQueue.close();
  await extractionQueue.close();

  // Update source
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  logger.info({ sourceId, url, ingested, total: articles.length }, 'Web scrape complete');
}

// ─── Worker ────────────────────────────────────────────────────────────────

export function createWebScraperWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<WebScraperJob>(
    'web-scraper',
    async (job) => { await processWebScraper(job); },
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 10,
        duration: 60000, // Max 10 scrapes per minute (be polite)
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, url: job.data.url }, 'Web scraper job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Web scraper job failed');
  });

  return worker;
}
