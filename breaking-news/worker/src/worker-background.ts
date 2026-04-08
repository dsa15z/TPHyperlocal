/**
 * Worker Background — Low-priority background workers.
 * These can be slow without affecting user experience.
 *
 * Deploy as a separate Railway service (or skip entirely to save cost).
 */
import 'dotenv/config';
import http from 'node:http';
import { Worker } from 'bullmq';
import logger from './lib/logger.js';
import { closeRedisConnection } from './lib/redis.js';
import prisma from './lib/prisma.js';
import { createGeocodingWorker } from './workers/geocoding.worker.js';
import { createCredibilityWorker } from './workers/credibility.worker.js';
import { createRSSDiscoveryWorker } from './workers/rss-discovery.worker.js';
import { createDigestWorker } from './workers/digest.worker.js';
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
import { createSimilarWebScoringWorker } from './workers/similarweb-scoring.worker.js';
import { createVelocityScorerWorker } from './workers/velocity-scorer.worker.js';

const SERVICE_NAME = 'worker-background';
const workers: Worker[] = [];
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info({ service: SERVICE_NAME }, 'Starting Background Workers');

  if (!process.env['DATABASE_URL']) { logger.error('Missing DATABASE_URL'); process.exit(1); }
  if (!process.env['REDIS_URL']) { logger.error('Missing REDIS_URL'); process.exit(1); }

  await prisma.$connect();

  const workerFactories: Array<[string, () => Worker]> = [
    ['geocoding', createGeocodingWorker],
    ['credibility', createCredibilityWorker],
    ['rss-discovery', createRSSDiscoveryWorker],
    ['digest', createDigestWorker],
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
    ['similarweb-scoring', createSimilarWebScoringWorker],
    ['velocity-scorer', createVelocityScorerWorker],
  ];

  for (const [name, factory] of workerFactories) {
    try { workers.push(factory()); } catch (err) {
      logger.error({ err: (err as Error).message, worker: name }, `Failed to start ${name} — skipping`);
    }
  }

  logger.info({ workers: workers.length, service: SERVICE_NAME }, 'Background workers running');

  const PORT = parseInt(process.env['PORT'] || '3004', 10);
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
