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
import { createFirstDraftWorker } from './workers/first-draft.worker.js';
import { createPushNotificationWorker } from './workers/push-notification.worker.js';
import { createDomainScoringWorker } from './workers/domain-scoring.worker.js';
import { createAudioTranscriptionWorker } from './workers/audio-transcription.worker.js';
import { createPredictionWorker } from './workers/prediction.worker.js';
import { createStockMonitorWorker } from './workers/stock-monitor.worker.js';
import { createPublicDataWorker } from './workers/public-data.worker.js';
import { createShiftBriefingWorker } from './workers/shift-briefing.worker.js';
import { createBreakingPackageWorker } from './workers/breaking-package.worker.js';
import { createDeadlineAlertWorker } from './workers/deadline-alert.worker.js';
import { createBeatAlertWorker } from './workers/beat-alert.worker.js';
import { createCourtRecordWorker } from './workers/court-record.worker.js';
import { createCommunityRadarWorker } from './workers/community-radar.worker.js';
import { createVideoGenerationWorker } from './workers/video-generation.worker.js';
import { createEngagementTrackingWorker } from './workers/engagement-tracking.worker.js';
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

  const firstDraftWorker = createFirstDraftWorker();
  workers.push(firstDraftWorker);
  logger.info('First draft worker started');

  const pushNotificationWorker = createPushNotificationWorker();
  workers.push(pushNotificationWorker);
  logger.info('Push notification worker started');

  const domainScoringWorker = createDomainScoringWorker();
  workers.push(domainScoringWorker);
  logger.info('Domain scoring worker started');

  const audioTranscriptionWorker = createAudioTranscriptionWorker();
  workers.push(audioTranscriptionWorker);
  logger.info('Audio transcription worker started');

  const predictionWorker = createPredictionWorker();
  workers.push(predictionWorker);
  logger.info('Prediction worker started');

  const stockMonitorWorker = createStockMonitorWorker();
  workers.push(stockMonitorWorker);
  logger.info('Stock monitor worker started');

  const publicDataWorker = createPublicDataWorker();
  workers.push(publicDataWorker);
  logger.info('Public data worker started');

  const shiftBriefingWorker = createShiftBriefingWorker();
  workers.push(shiftBriefingWorker);
  logger.info('Shift briefing worker started');

  const breakingPackageWorker = createBreakingPackageWorker();
  workers.push(breakingPackageWorker);
  logger.info('Breaking package worker started');

  const deadlineAlertWorker = createDeadlineAlertWorker();
  workers.push(deadlineAlertWorker);
  logger.info('Deadline alert worker started');

  const beatAlertWorker = createBeatAlertWorker();
  workers.push(beatAlertWorker);
  logger.info('Beat alert worker started');

  const courtRecordWorker = createCourtRecordWorker();
  workers.push(courtRecordWorker);
  logger.info('Court record worker started');

  const communityRadarWorker = createCommunityRadarWorker();
  workers.push(communityRadarWorker);
  logger.info('Community radar worker started');

  const videoGenerationWorker = createVideoGenerationWorker();
  workers.push(videoGenerationWorker);
  logger.info('Video generation worker started');

  const engagementTrackingWorker = createEngagementTrackingWorker();
  workers.push(engagementTrackingWorker);
  logger.info('Engagement tracking worker started');

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
