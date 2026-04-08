/**
 * Worker Critical — Hot path pipeline workers only.
 * Handles: ingestion, enrichment, clustering, scoring
 * + poll schedulers (RSS, Reddit, Twitter, etc.)
 *
 * Deploy as a separate Railway service for isolation + dedicated connection pool.
 */
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
import { startSchedulers, stopSchedulers } from './schedulers/poll-scheduler.js';
import { startPipelineMonitor, stopPipelineMonitor } from './schedulers/pipeline-monitor.js';
import { startMetricsCollector, stopMetricsCollector } from './schedulers/metrics-collector.js';
import { startCredibilityTracker, stopCredibilityTracker } from './schedulers/credibility-tracker.js';

const SERVICE_NAME = 'worker-critical';
const workers: Worker[] = [];
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info({ service: SERVICE_NAME }, 'Starting Critical Pipeline Workers');

  if (!process.env['DATABASE_URL']) { logger.error('Missing DATABASE_URL'); process.exit(1); }
  if (!process.env['REDIS_URL']) { logger.error('Missing REDIS_URL'); process.exit(1); }

  await prisma.$connect();
  logger.info('Database connected');

  const workerFactories: Array<[string, () => Worker]> = [
    ['ingestion', createIngestionWorker],
    ['enrichment', createEnrichmentWorker],
    ['clustering', createClusteringWorker],
    ['scoring', createScoringWorker],
  ];

  for (const [name, factory] of workerFactories) {
    try {
      workers.push(factory());
      logger.info(`${name} worker started`);
    } catch (err) {
      logger.error({ err: (err as Error).message, worker: name }, `Failed to start ${name}`);
    }
  }

  // Schedulers run here (they queue jobs for all workers)
  startSchedulers();

  // Self-healing monitor — checks for failures every 2 min and auto-fixes
  startPipelineMonitor();

  // Metrics collector — records time-series every 60s, hourly rollup
  startMetricsCollector();

  // Source credibility tracker — adjusts trust scores every 6h
  startCredibilityTracker();

  logger.info({ workers: workers.length }, 'Critical workers + schedulers running');

  // Health server
  const PORT = parseInt(process.env['PORT'] || '3002', 10);
  http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: SERVICE_NAME,
      status: 'running',
      workers: workers.map(w => w.name),
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    }));
  }).listen(PORT);
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal, service: SERVICE_NAME }, 'Shutting down...');
  const timeout = setTimeout(() => process.exit(1), 30000);
  try {
    stopCredibilityTracker();
    stopMetricsCollector();
    stopPipelineMonitor();
    await stopSchedulers();
    await Promise.all(workers.map(w => w.close().catch(() => {})));
    await closeRedisConnection();
    await prisma.$disconnect();
    clearTimeout(timeout);
    process.exit(0);
  } catch { process.exit(1); }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught exception'); void shutdown('uncaughtException'); });
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled rejection'); void shutdown('unhandledRejection'); });

main().catch((err) => { logger.fatal({ err }, 'Failed to start'); process.exit(1); });
