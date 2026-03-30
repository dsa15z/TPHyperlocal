import 'dotenv/config';
import { Worker } from 'bullmq';
import logger from './lib/logger.js';
import { closeRedisConnection } from './lib/redis.js';
import prisma from './lib/prisma.js';
import { createIngestionWorker } from './workers/ingestion.worker.js';
import { createEnrichmentWorker } from './workers/enrichment.worker.js';
import { createClusteringWorker } from './workers/clustering.worker.js';
import { createScoringWorker } from './workers/scoring.worker.js';
import { createLLMIngestionWorker } from './workers/llm-ingestion.worker.js';
import { createArticleExtractionWorker } from './workers/article-extraction.worker.js';
import { createGeocodingWorker } from './workers/geocoding.worker.js';
import { createEmbeddingsWorker } from './workers/embeddings.worker.js';
import { createNotificationWorker } from './workers/notification.worker.js';
import { createSummarizationWorker } from './workers/summarization.worker.js';
import { createSentimentWorker } from './workers/sentiment.worker.js';
import { createCredibilityWorker } from './workers/credibility.worker.js';
import { createRSSDiscoveryWorker } from './workers/rss-discovery.worker.js';
import { createDigestWorker } from './workers/digest.worker.js';
import { createCoverageWorker } from './workers/coverage.worker.js';
import { startSchedulers, stopSchedulers } from './schedulers/poll-scheduler.js';

const workers: Worker[] = [];
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info('Starting Breaking News Worker Service');

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error({ envVar }, 'Missing required environment variable');
      process.exit(1);
    }
  }

  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connection established');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    process.exit(1);
  }

  // Initialize all workers
  logger.info('Initializing workers...');

  const ingestionWorker = createIngestionWorker();
  workers.push(ingestionWorker);
  logger.info('Ingestion worker started');

  const enrichmentWorker = createEnrichmentWorker();
  workers.push(enrichmentWorker);
  logger.info('Enrichment worker started');

  const clusteringWorker = createClusteringWorker();
  workers.push(clusteringWorker);
  logger.info('Clustering worker started');

  const scoringWorker = createScoringWorker();
  workers.push(scoringWorker);
  logger.info('Scoring worker started');

  const llmIngestionWorker = createLLMIngestionWorker();
  workers.push(llmIngestionWorker);
  logger.info('LLM ingestion worker started');

  const articleExtractionWorker = createArticleExtractionWorker();
  workers.push(articleExtractionWorker);
  logger.info('Article extraction worker started');

  const geocodingWorker = createGeocodingWorker();
  workers.push(geocodingWorker);
  logger.info('Geocoding worker started');

  const embeddingsWorker = createEmbeddingsWorker();
  workers.push(embeddingsWorker);
  logger.info('Embeddings worker started');

  const notificationWorker = createNotificationWorker();
  workers.push(notificationWorker);
  logger.info('Notification worker started');

  const summarizationWorker = createSummarizationWorker();
  workers.push(summarizationWorker);
  logger.info('Summarization worker started');

  const sentimentWorker = createSentimentWorker();
  workers.push(sentimentWorker);
  logger.info('Sentiment worker started');

  const credibilityWorker = createCredibilityWorker();
  workers.push(credibilityWorker);
  logger.info('Credibility worker started');

  const rssDiscoveryWorker = createRSSDiscoveryWorker();
  workers.push(rssDiscoveryWorker);
  logger.info('RSS discovery worker started');

  const digestWorker = createDigestWorker();
  workers.push(digestWorker);
  logger.info('Digest worker started');

  const coverageWorker = createCoverageWorker();
  workers.push(coverageWorker);
  logger.info('Coverage worker started');

  // Start poll schedulers
  startSchedulers();

  logger.info('All workers and schedulers are running');
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Received shutdown signal, gracefully shutting down...');

  // Set a hard timeout for graceful shutdown
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds

  try {
    // Stop schedulers first (no new jobs)
    await stopSchedulers();
    logger.info('Schedulers stopped');

    // Close all workers (finish current jobs, stop accepting new ones)
    await Promise.all(
      workers.map(async (worker) => {
        try {
          await worker.close();
        } catch (err) {
          logger.error({ err, workerName: worker.name }, 'Error closing worker');
        }
      })
    );
    logger.info('All workers closed');

    // Close Redis connection
    await closeRedisConnection();
    logger.info('Redis connection closed');

    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info('Database connection closed');

    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});

// Start the service
main().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker service');
  process.exit(1);
});
