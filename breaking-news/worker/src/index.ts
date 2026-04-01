import 'dotenv/config';
import http from 'node:http';
import { Worker } from 'bullmq';
import logger from './lib/logger.js';
import { closeRedisConnection, getSharedConnection } from './lib/redis.js';
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
import { createSocialMonitorWorker } from './workers/social-monitor.worker.js';
import { createStoryResearchWorker } from './workers/story-research.worker.js';
import { createStorySplitterWorker } from './workers/story-splitter.worker.js';
import { createNewscatcherWorker } from './workers/newscatcher.worker.js';
import { createSimilarWebScoringWorker } from './workers/similarweb-scoring.worker.js';
import { createHyperLocalIntelWorker } from './workers/hyperlocal-intel.worker.js';
import { createVelocityScorerWorker } from './workers/velocity-scorer.worker.js';
import { createWebScraperWorker } from './workers/web-scraper.worker.js';
import { createEventRegistryWorker } from './workers/event-registry.worker.js';
import { createAccountStorySyncWorker } from './workers/account-story-sync.worker.js';
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

  // Log which API keys are available so we can diagnose missing keys
  const keyStatus: Record<string, string> = {};
  const optionalKeys = [
    'OPENAI_API_KEY', 'XAI_API_KEY', 'GOOGLE_AI_KEY', 'ANTHROPIC_API_KEY',
    'NEWSAPI_KEY', 'TWITTER_BEARER_TOKEN', 'FACEBOOK_ACCESS_TOKEN',
    'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
    'NEWSCATCHER_API_KEY', 'EVENT_REGISTRY_KEY', 'EVENT_REGISTRY_API_KEY',
    'YOUTUBE_API_KEY', 'SCRAPFLY_API_KEY', 'SCRAPINGFISH_API_KEY',
    'SIMILARWEB_API_KEY', 'STRIPE_SECRET_KEY',
  ];
  for (const key of optionalKeys) {
    keyStatus[key] = process.env[key] ? '✓ set' : '✗ missing';
  }
  logger.info({ keys: keyStatus }, 'API key availability on worker service');

  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connection established');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    process.exit(1);
  }

  // Initialize all workers with error isolation —
  // if one worker fails to start, the others still run
  logger.info('Initializing workers...');

  const workerFactories: Array<[string, () => Worker]> = [
    ['ingestion', createIngestionWorker],
    ['enrichment', createEnrichmentWorker],
    ['clustering', createClusteringWorker],
    ['scoring', createScoringWorker],
    ['llm-ingestion', createLLMIngestionWorker],
    ['article-extraction', createArticleExtractionWorker],
    ['geocoding', createGeocodingWorker],
    ['embeddings', createEmbeddingsWorker],
    ['notification', createNotificationWorker],
    ['summarization', createSummarizationWorker],
    ['sentiment', createSentimentWorker],
    ['credibility', createCredibilityWorker],
    ['rss-discovery', createRSSDiscoveryWorker],
    ['digest', createDigestWorker],
    ['coverage', createCoverageWorker],
    ['first-draft', createFirstDraftWorker],
    ['push-notification', createPushNotificationWorker],
    ['domain-scoring', createDomainScoringWorker],
    ['audio-transcription', createAudioTranscriptionWorker],
    ['prediction', createPredictionWorker],
    ['stock-monitor', createStockMonitorWorker],
    ['public-data', createPublicDataWorker],
    ['shift-briefing', createShiftBriefingWorker],
    ['breaking-package', createBreakingPackageWorker],
    ['deadline-alert', createDeadlineAlertWorker],
    ['beat-alert', createBeatAlertWorker],
    ['court-record', createCourtRecordWorker],
    ['community-radar', createCommunityRadarWorker],
    ['video-generation', createVideoGenerationWorker],
    ['engagement-tracking', createEngagementTrackingWorker],
    ['social-monitor', createSocialMonitorWorker],
    ['story-research', createStoryResearchWorker],
    ['story-splitter', createStorySplitterWorker],
    ['newscatcher', createNewscatcherWorker],
    ['similarweb-scoring', createSimilarWebScoringWorker],
    ['hyperlocal-intel', createHyperLocalIntelWorker],
    ['web-scraper', createWebScraperWorker],
    ['event-registry', createEventRegistryWorker],
    ['velocity-scorer', createVelocityScorerWorker],
    ['account-story-sync', createAccountStorySyncWorker],
  ];

  let started = 0;
  let failed = 0;
  for (const [name, factory] of workerFactories) {
    try {
      const worker = factory();
      workers.push(worker);
      started++;
      logger.info(`${name} worker started`);
    } catch (err) {
      failed++;
      logger.error({ err: (err as Error).message, worker: name }, `Failed to start ${name} worker — skipping`);
    }
  }

  logger.info({ started, failed, total: workerFactories.length }, 'Worker initialization complete');

  // Start poll schedulers
  startSchedulers();

  logger.info('All workers and schedulers are running');

  // Health check HTTP server (for Railway health monitoring + debugging)
  const PORT = parseInt(process.env['PORT'] || '3002', 10);
  const healthServer = http.createServer((_req, res) => {
    const redisStatus = (() => {
      try {
        const conn = getSharedConnection();
        return conn.status || 'unknown';
      } catch { return 'error'; }
    })();

    // Show which API keys are configured (masked)
    const keys: Record<string, boolean> = {};
    for (const k of ['OPENAI_API_KEY', 'XAI_API_KEY', 'GOOGLE_AI_KEY', 'NEWSAPI_KEY', 'TWITTER_BEARER_TOKEN', 'FACEBOOK_ACCESS_TOKEN', 'NEWSCATCHER_API_KEY', 'EVENT_REGISTRY_KEY', 'EVENT_REGISTRY_API_KEY', 'YOUTUBE_API_KEY']) {
      keys[k] = !!process.env[k];
    }

    const body = JSON.stringify({
      status: 'running',
      workers: workers.length,
      redis: redisStatus,
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      workerNames: workers.map(w => w.name),
      apiKeys: keys,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });

  healthServer.listen(PORT, () => {
    logger.info({ port: PORT }, 'Worker health server listening');
  });
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
