// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';

const logger = createChildLogger('newscatcher');

interface NewscatcherJob {
  sourceId: string;
  query: string;       // search query (e.g., "Houston Texas")
  market?: string;     // market name for logging
}

interface NewscatcherArticle {
  title: string;
  author: string | null;
  published_date: string;
  link: string;
  excerpt: string | null;
  summary: string | null;
  rights: string | null;
  topic: string | null;
  country: string | null;
  language: string | null;
  media: string | null;
  _score: number | null;
}

interface NewscatcherResponse {
  status: string;
  total_hits: number;
  articles: NewscatcherArticle[];
}

/**
 * Map Newscatcher topic strings to our internal category enum values
 */
function mapTopicToCategory(topic: string | null): string | null {
  if (!topic) return null;

  const mapping: Record<string, string> = {
    'POLITICS': 'POLITICS',
    'BUSINESS': 'BUSINESS',
    'ECONOMICS': 'BUSINESS',
    'FINANCE': 'BUSINESS',
    'SPORT': 'SPORTS',
    'SPORTS': 'SPORTS',
    'TECH': 'TECHNOLOGY',
    'TECHNOLOGY': 'TECHNOLOGY',
    'SCIENCE': 'TECHNOLOGY',
    'ENTERTAINMENT': 'ENTERTAINMENT',
    'GAMING': 'ENTERTAINMENT',
    'MUSIC': 'ENTERTAINMENT',
    'HEALTH': 'HEALTH',
    'FOOD': 'HEALTH',
    'WORLD': 'GENERAL',
    'NATION': 'GENERAL',
    'NEWS': 'GENERAL',
    'LIFESTYLE': 'GENERAL',
    'TRAVEL': 'GENERAL',
    'WEATHER': 'WEATHER',
    'ENERGY': 'ENERGY',
    'EDUCATION': 'EDUCATION',
  };

  return mapping[topic.toUpperCase()] || null;
}

async function handleNewscatcherPoll(job: Job<NewscatcherJob>): Promise<void> {
  const { sourceId, query, market } = job.data;

  const apiKey = process.env['NEWSCATCHER_API_KEY'];
  const baseUrl = process.env['NEWSCATCHER_BASE_URL'] || 'https://futuri.newscatcherapi.xyz/api/search';

  if (!apiKey) {
    logger.error('NEWSCATCHER_API_KEY environment variable not set');
    throw new Error('NEWSCATCHER_API_KEY not configured');
  }

  const params = new URLSearchParams({
    q: query,
    lang: 'en',
    sort_by: 'date',
    page_size: '50',
  });

  logger.info({ sourceId, query, market }, 'Polling Newscatcher API');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        'x-api-key': apiKey,
        'User-Agent': 'BreakingNewsBot/1.0',
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    logger.error({ sourceId, query, err }, 'Failed to fetch Newscatcher API');
    throw err;
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
    logger.warn({ sourceId, delay }, 'Newscatcher rate limit hit, will retry');
    throw new Error(`Newscatcher rate limit. Retry after ${delay}ms`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Newscatcher fetch failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as NewscatcherResponse;

  if (data.status !== 'ok') {
    throw new Error(`Newscatcher returned status: ${data.status}`);
  }

  const articles = data.articles || [];
  logger.info({ sourceId, articleCount: articles.length, totalHits: data.total_hits }, 'Received Newscatcher articles');

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const article of articles) {
    try {
      if (!article.link || !article.title) {
        logger.debug({ title: article.title }, 'Skipping article with missing link or title');
        continue;
      }

      const platformPostId = `newscatcher::${generateContentHash(article.link)}`;

      // Check dedup by platformPostId
      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const content = `${article.title}\n\n${article.summary || article.excerpt || ''}`;
      const contentHash = generateContentHash(content);

      // Content-hash dedup: skip if same content already ingested from this source
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) {
        logger.debug({ sourceId, title: article.title.substring(0, 60) }, 'Skipping duplicate content (same source, same hash)');
        continue;
      }

      const mediaUrls = article.media ? [article.media] : [];
      const category = mapTopicToCategory(article.topic);

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000),
          contentHash,
          title: article.title.substring(0, 500),
          url: article.link,
          authorName: article.author || article.rights || undefined,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: article as unknown as Record<string, unknown>,
          publishedAt: article.published_date ? new Date(article.published_date) : new Date(),
          ...(category ? { category } : {}),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // Unique constraint — dedup
      logger.warn({ err, title: article.title }, 'Failed to process Newscatcher article');
    }
  }

  // Update last polled timestamp
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({ sourceId, query, market, ingested, total: articles.length }, 'Newscatcher poll complete');
}

export function createNewscatcherWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<NewscatcherJob>(
    'newscatcher',
    async (job: Job<NewscatcherJob>) => {
      logger.info({ jobId: job.id, query: job.data.query }, 'Processing Newscatcher job');
      await handleNewscatcherPoll(job);
    },
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000, // Max 5 jobs per minute (API rate limits)
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, query: job.data.query }, 'Newscatcher job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Newscatcher job failed');
  });

  return worker;
}
