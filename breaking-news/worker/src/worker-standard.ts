/**
 * Worker Standard — Important secondary workers.
 * Handles: first-draft, notification, coverage, summarization,
 *          sentiment, embeddings, article-extraction, llm-ingestion,
 *          newscatcher, hyperlocal-intel, web-scraper, event-registry,
 *          news-director, account-story-sync
 *
 * Deploy as a separate Railway service.
 */
import 'dotenv/config';
import http from 'node:http';
import { Worker } from 'bullmq';
import logger from './lib/logger.js';
import { closeRedisConnection } from './lib/redis.js';
import prisma from './lib/prisma.js';
import { createFirstDraftWorker } from './workers/first-draft.worker.js';
import { createNotificationWorker } from './workers/notification.worker.js';
import { createCoverageWorker } from './workers/coverage.worker.js';
import { createSummarizationWorker } from './workers/summarization.worker.js';
import { createSentimentWorker } from './workers/sentiment.worker.js';
import { createEmbeddingsWorker } from './workers/embeddings.worker.js';
import { createArticleExtractionWorker } from './workers/article-extraction.worker.js';
import { createLLMIngestionWorker } from './workers/llm-ingestion.worker.js';
import { createNewscatcherWorker } from './workers/newscatcher.worker.js';
import { createHyperLocalIntelWorker } from './workers/hyperlocal-intel.worker.js';
import { createWebScraperWorker } from './workers/web-scraper.worker.js';
import { createEventRegistryWorker } from './workers/event-registry.worker.js';
import { createNewsDirectorWorker } from './workers/news-director.worker.js';
import { createAccountStorySyncWorker } from './workers/account-story-sync.worker.js';

const SERVICE_NAME = 'worker-standard';
const workers: Worker[] = [];
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info({ service: SERVICE_NAME }, 'Starting Standard Workers');

  if (!process.env['DATABASE_URL']) { logger.error('Missing DATABASE_URL'); process.exit(1); }
  if (!process.env['REDIS_URL']) { logger.error('Missing REDIS_URL'); process.exit(1); }

  await prisma.$connect();

  const workerFactories: Array<[string, () => Worker]> = [
    ['first-draft', createFirstDraftWorker],
    ['notification', createNotificationWorker],
    ['coverage', createCoverageWorker],
    ['summarization', createSummarizationWorker],
    ['sentiment', createSentimentWorker],
    ['embeddings', createEmbeddingsWorker],
    ['article-extraction', createArticleExtractionWorker],
    ['llm-ingestion', createLLMIngestionWorker],
    ['newscatcher', createNewscatcherWorker],
    ['hyperlocal-intel', createHyperLocalIntelWorker],
    ['web-scraper', createWebScraperWorker],
    ['event-registry', createEventRegistryWorker],
    ['news-director', createNewsDirectorWorker],
    ['account-story-sync', createAccountStorySyncWorker],
  ];

  for (const [name, factory] of workerFactories) {
    try { workers.push(factory()); } catch (err) {
      logger.error({ err: (err as Error).message, worker: name }, `Failed to start ${name} — skipping`);
    }
  }

  logger.info({ workers: workers.length, service: SERVICE_NAME }, 'Standard workers running');

  const PORT = parseInt(process.env['PORT'] || '3003', 10);
  http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: SERVICE_NAME, status: 'running', workers: workers.map(w => w.name), uptime: process.uptime(), memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB' }));
  }).listen(PORT);
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 30000);
  try {
    await Promise.all(workers.map(w => w.close().catch(() => {})));
    await closeRedisConnection();
    await prisma.$disconnect();
    clearTimeout(timeout);
    process.exit(0);
  } catch { process.exit(1); }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught'); void shutdown('uncaughtException'); });
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled'); void shutdown('unhandledRejection'); });

main().catch((err) => { logger.fatal({ err }, 'Failed to start'); process.exit(1); });
