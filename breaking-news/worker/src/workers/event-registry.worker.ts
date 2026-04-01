// @ts-nocheck
/**
 * Event Registry news source worker.
 * Uses the Event Registry API (eventregistry.org) to search for news articles
 * by location and topic, similar to NewsAPI but with different data.
 */
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';

const logger = createChildLogger('event-registry');

const API_KEY = process.env.EVENT_REGISTRY_KEY || process.env.EVENT_REGISTRY_API_KEY || '';
const BASE_URL = process.env.EVENT_REGISTRY_BASE_URL || 'http://eventregistry.org/api/v1/';

interface EventRegistryJob {
  sourceId: string;
  query: string;
  market?: string;
}

interface ERArticle {
  uri: string;
  title: string;
  body: string;
  url: string;
  source: { uri: string; title: string };
  dateTime: string;
  lang: string;
  categories?: Array<{ uri: string; label: string }>;
  concepts?: Array<{ uri: string; label: { eng: string }; type: string }>;
}

async function processEventRegistry(job: Job<EventRegistryJob>): Promise<void> {
  const { sourceId, query, market } = job.data;

  if (!API_KEY) {
    logger.warn('EVENT_REGISTRY_KEY not set, skipping');
    return;
  }

  logger.info({ sourceId, query, market }, 'Polling Event Registry');

  // Search for recent articles
  const params = new URLSearchParams({
    apiKey: API_KEY,
    resultType: 'articles',
    articlesCount: '30',
    articlesSortBy: 'date',
    articlesSortByAsc: 'false',
    lang: 'eng',
    keyword: query,
    keywordLoc: 'title',
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}article/getArticles?${params}`, {
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    logger.error({ sourceId, err: (err as Error).message }, 'Event Registry fetch failed');
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Event Registry API error: ${response.status}`);
  }

  const data = await response.json();
  const articles: ERArticle[] = data.articles?.results || [];

  logger.info({ sourceId, count: articles.length }, 'Event Registry articles received');

  if (articles.length === 0) {
    await prisma.source.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } });
    return;
  }

  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  const extractionQueue = new Queue('article-extraction', { connection: getSharedConnection() });
  let ingested = 0;

  for (const article of articles) {
    try {
      if (!article.title || !article.url) continue;

      const content = `${article.title}\n\n${article.body || ''}`.substring(0, 50000);
      const contentHash = generateContentHash(content);
      const platformPostId = `eventregistry::${generateContentHash(article.uri || article.url)}`;

      // Dedup
      const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
      if (existing) continue;

      const existingByHash = await prisma.sourcePost.findFirst({ where: { sourceId, contentHash } });
      if (existingByHash) continue;

      // Map ER categories to our categories
      let category = 'OTHER';
      const cats = (article.categories || []).map(c => c.label.toLowerCase());
      if (cats.some(c => c.includes('crime') || c.includes('law'))) category = 'CRIME';
      else if (cats.some(c => c.includes('weather'))) category = 'WEATHER';
      else if (cats.some(c => c.includes('politic'))) category = 'POLITICS';
      else if (cats.some(c => c.includes('sport'))) category = 'SPORTS';
      else if (cats.some(c => c.includes('business') || c.includes('econom'))) category = 'BUSINESS';
      else if (cats.some(c => c.includes('health'))) category = 'HEALTH';
      else if (cats.some(c => c.includes('tech'))) category = 'TECHNOLOGY';

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content,
          contentHash,
          title: article.title.substring(0, 500),
          url: article.url,
          authorName: article.source?.title || 'Event Registry',
          category,
          publishedAt: article.dateTime ? new Date(article.dateTime) : new Date(),
          rawData: {
            eventRegistry: true,
            uri: article.uri,
            concepts: article.concepts?.slice(0, 10),
            categories: article.categories?.slice(0, 5),
            market,
          },
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      if (article.url) {
        await extractionQueue.add('extract_article', { sourcePostId: post.id }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: 2000,
        });
      }
    } catch (err) {
      if ((err as any)?.code === 'P2002') continue;
      logger.warn({ err: (err as Error).message, title: article.title }, 'Failed to ingest ER article');
    }
  }

  await enrichmentQueue.close();
  await extractionQueue.close();

  await prisma.source.update({ where: { id: sourceId }, data: { lastPolledAt: new Date() } });

  logger.info({ sourceId, ingested, total: articles.length, market }, 'Event Registry poll complete');
}

export function createEventRegistryWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<EventRegistryJob>(
    'event-registry',
    async (job) => { await processEventRegistry(job); },
    {
      connection,
      concurrency: 2,
      limiter: { max: 5, duration: 60000 },
    },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Event Registry job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Event Registry job failed'));

  return worker;
}
