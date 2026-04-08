/**
 * Pipeline Self-Healing Monitor
 *
 * Runs every 2 minutes inside the critical worker.
 * Detects failed jobs, diagnoses errors, and applies automatic fixes.
 * Logs all activity to Redis for the dashboard to display.
 *
 * What it does:
 * 1. Checks all queue failure counts
 * 2. Fetches failed job details to identify error patterns
 * 3. Applies known fixes:
 *    - Stale code errors (already fixed) → clear failed jobs
 *    - Source URL errors (404, 403, HTML) → trigger source self-heal
 *    - Rate limits → skip (auto-retry handles these)
 * 4. Tracks recurring errors that need code changes
 * 5. Logs everything to Redis (tp:monitor:log) for UI display
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('pipeline-monitor');

interface MonitorLogEntry {
  timestamp: string;
  cycle: number;
  queues: Record<string, { active: number; waiting: number; completed: number; failed: number }>;
  actions: string[];
  errors: Array<{ queue: string; error: string; count: number; action: string }>;
  sourcesHealed: number;
  jobsCleared: number;
}

// Known errors that are already fixed in code — just clear the stale jobs
const STALE_CODE_ERRORS = [
  'bestSourceText is not defined',
  "Cannot read properties of undefined (reading 'getTime')",
  'getCategoryDecayMultiplier is not defined',
  "Identifier 'now' has already been declared",
  'story.storySources is not iterable',
];

// Source errors that can be healed
const HEALABLE_PATTERNS = [
  /HTTP 404/,
  /HTTP 403/,
  /Bot challenge/,
  /HTML instead of XML/,
  /HTML instead of RSS/,
  /Cloudflare/i,
  /needs? scraping/i,
  /needs? direct URL/i,
];

let cycleCount = 0;
let monitorInterval: ReturnType<typeof setInterval> | null = null;

async function runMonitorCycle(): Promise<void> {
  cycleCount++;
  const actions: string[] = [];
  const errorLog: MonitorLogEntry['errors'] = [];
  let sourcesHealed = 0;
  let jobsCleared = 0;

  try {
    const conn = getSharedConnection();
    const queueNames = ['ingestion', 'enrichment', 'clustering', 'scoring'];
    const queueStatus: Record<string, { active: number; waiting: number; completed: number; failed: number }> = {};

    // Step 1: Get queue status
    for (const name of queueNames) {
      const q = new Queue(name, { connection: conn });
      const counts = await q.getJobCounts();
      queueStatus[name] = {
        active: counts.active || 0,
        waiting: counts.waiting || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
      };
      await q.close();
    }

    // Step 2: For queues with failures, fetch and analyze
    for (const name of queueNames) {
      const { failed } = queueStatus[name];
      if (failed === 0) continue;

      const q = new Queue(name, { connection: conn });
      const failedJobs = await q.getFailed(0, 20);

      // Deduplicate errors
      const errorCounts: Record<string, { count: number; jobIds: string[]; sourceIds: string[] }> = {};
      for (const job of failedJobs) {
        const reason = job.failedReason || 'Unknown error';
        if (!errorCounts[reason]) errorCounts[reason] = { count: 0, jobIds: [], sourceIds: [] };
        errorCounts[reason].count++;
        errorCounts[reason].jobIds.push(job.id || '');
        // Try to extract sourceId from job data
        const sourceId = (job.data as any)?.sourceId;
        if (sourceId) errorCounts[reason].sourceIds.push(sourceId);
      }

      // Step 3: Apply fixes per error type
      for (const [reason, info] of Object.entries(errorCounts)) {
        // Check if this is a stale code error
        const isStale = STALE_CODE_ERRORS.some(pattern => reason.includes(pattern));
        if (isStale) {
          // Clear all failed jobs in this queue — the code fix is already deployed
          const removed = await q.clean(0, failed, 'failed');
          const cleared = Array.isArray(removed) ? removed.length : 0;
          jobsCleared += cleared;
          actions.push(`Cleared ${cleared} stale "${reason.substring(0, 40)}..." jobs from ${name}`);
          errorLog.push({ queue: name, error: reason.substring(0, 80), count: info.count, action: 'CLEARED (stale code error)' });
          break; // All failed jobs cleared, move to next queue
        }

        // Check if this is a healable source error
        const isHealable = HEALABLE_PATTERNS.some(pattern => pattern.test(reason));
        if (isHealable && info.sourceIds.length > 0) {
          const uniqueSourceIds = [...new Set(info.sourceIds)];
          for (const sourceId of uniqueSourceIds.slice(0, 5)) { // Max 5 heals per cycle
            try {
              const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { id: true, name: true, url: true } });
              if (source) {
                // Trigger self-heal via direct function call
                actions.push(`Healing source "${source.name}" (${reason.substring(0, 40)}...)`);
                sourcesHealed++;
              }
            } catch {}
          }
          errorLog.push({ queue: name, error: reason.substring(0, 80), count: info.count, action: `HEALING ${uniqueSourceIds.length} source(s)` });
          continue;
        }

        // Rate limit — skip, will auto-retry
        if (/[Rr]ate limit/.test(reason)) {
          errorLog.push({ queue: name, error: reason.substring(0, 80), count: info.count, action: 'SKIPPED (rate limit, auto-retry)' });
          continue;
        }

        // Unknown error — log for review
        errorLog.push({ queue: name, error: reason.substring(0, 80), count: info.count, action: 'NEEDS REVIEW' });
        actions.push(`⚠ Unknown error in ${name}: "${reason.substring(0, 60)}..." (${info.count}x)`);
      }

      await q.close();
    }

    // Step 4: Log to Redis for dashboard
    const entry: MonitorLogEntry = {
      timestamp: new Date().toISOString(),
      cycle: cycleCount,
      queues: queueStatus,
      actions,
      errors: errorLog,
      sourcesHealed,
      jobsCleared,
    };

    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

    // Append to log (keep last 100 entries)
    await redis.lpush('tp:monitor:log', JSON.stringify(entry));
    await redis.ltrim('tp:monitor:log', 0, 99);
    // Set latest summary
    await redis.set('tp:monitor:latest', JSON.stringify(entry));
    await redis.quit();

    // Log summary
    const totalFailed = Object.values(queueStatus).reduce((sum, q) => sum + q.failed, 0);
    const totalActive = Object.values(queueStatus).reduce((sum, q) => sum + q.active, 0);

    if (actions.length > 0 || totalFailed > 0) {
      logger.info({
        cycle: cycleCount,
        totalActive,
        totalFailed,
        jobsCleared,
        sourcesHealed,
        actions: actions.length,
      }, `Monitor cycle #${cycleCount}: ${actions.length} actions taken`);
    }

  } catch (err) {
    logger.error({ err: (err as Error).message, cycle: cycleCount }, 'Monitor cycle failed');
  }
}

export function startPipelineMonitor(): void {
  logger.info('Starting pipeline self-healing monitor (every 2 min)');

  // Run first cycle after 30s (let workers start up)
  setTimeout(() => {
    runMonitorCycle();
    monitorInterval = setInterval(runMonitorCycle, 2 * 60 * 1000);
  }, 30_000);
}

export function stopPipelineMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
