/**
 * Metrics Collector — Instruments the entire pipeline.
 *
 * Collects time-series metrics every 60 seconds and stores in PostgreSQL.
 * Raw metrics kept for 7 days, hourly rollups kept forever.
 *
 * Metrics collected:
 * - Pipeline: queue depths, throughput, failure rates per stage
 * - Sources: active/inactive/failing counts, posts per source
 * - Stories: new stories/hour, by category, by market
 * - LLM: calls by provider, tokens, latency, cost estimate
 * - Ingestion: dedup rate, enrichment skip rate, fetch times
 * - System: memory usage, uptime
 */

import { Queue } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('metrics');

let metricsInterval: ReturnType<typeof setInterval> | null = null;
let rollupInterval: ReturnType<typeof setInterval> | null = null;
let lastQueueCounts: Record<string, number> = {};

// Ensure metrics tables exist
async function ensureMetricsTables(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "MetricsRaw" (
      id BIGSERIAL PRIMARY KEY,
      metric TEXT NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      tags JSONB DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.catch(() => {});
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_metrics_raw_metric_time ON "MetricsRaw"(metric, "createdAt" DESC)`.catch(() => {});
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_metrics_raw_time ON "MetricsRaw"("createdAt" DESC)`.catch(() => {});

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "MetricsHourly" (
      id BIGSERIAL PRIMARY KEY,
      metric TEXT NOT NULL,
      hour TIMESTAMP(3) NOT NULL,
      avg DOUBLE PRECISION,
      min DOUBLE PRECISION,
      max DOUBLE PRECISION,
      sum DOUBLE PRECISION,
      count INTEGER,
      tags JSONB DEFAULT '{}',
      UNIQUE(metric, hour, tags)
    )
  `.catch(() => {});
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_metrics_hourly_metric_hour ON "MetricsHourly"(metric, hour DESC)`.catch(() => {});
}

// Record a single metric point
async function record(metric: string, value: number, tags: Record<string, string> = {}): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt")
      VALUES (${metric}, ${value}, ${JSON.stringify(tags)}::jsonb, NOW())
    `;
  } catch {}
}

// Batch record multiple metrics
async function recordBatch(points: Array<{ metric: string; value: number; tags?: Record<string, string> }>): Promise<void> {
  if (points.length === 0) return;
  try {
    const values = points.map(p =>
      `('${p.metric.replace(/'/g, "''")}', ${p.value}, '${JSON.stringify(p.tags || {}).replace(/'/g, "''")}'::jsonb, NOW())`
    ).join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${values}`);
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'Metrics batch insert failed (non-fatal)');
  }
}

// Collect all metrics
async function collectMetrics(): Promise<void> {
  const points: Array<{ metric: string; value: number; tags?: Record<string, string> }> = [];

  try {
    // ── Pipeline queue metrics ──
    const conn = getSharedConnection();
    for (const name of ['ingestion', 'enrichment', 'clustering', 'scoring']) {
      try {
        const q = new Queue(name, { connection: conn });
        const counts = await q.getJobCounts();
        await q.close();

        points.push({ metric: 'pipeline.active', value: counts.active || 0, tags: { queue: name } });
        points.push({ metric: 'pipeline.waiting', value: counts.waiting || 0, tags: { queue: name } });
        points.push({ metric: 'pipeline.failed', value: counts.failed || 0, tags: { queue: name } });

        // Throughput: delta of completed since last collection
        const completed = counts.completed || 0;
        const prev = lastQueueCounts[name] || completed;
        const throughput = Math.max(0, completed - prev);
        lastQueueCounts[name] = completed;
        points.push({ metric: 'pipeline.throughput', value: throughput, tags: { queue: name } });
      } catch {}
    }

    // ── Source health metrics ──
    try {
      const sourceCounts = await prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN "isActive" THEN 1 ELSE 0 END)::int as active,
          SUM(CASE WHEN NOT "isActive" THEN 1 ELSE 0 END)::int as inactive,
          SUM(CASE WHEN "isActive" AND "lastPolledAt" IS NULL THEN 1 ELSE 0 END)::int as never_polled
        FROM "Source"
      `;
      if (sourceCounts[0]) {
        points.push({ metric: 'sources.total', value: sourceCounts[0].total || 0 });
        points.push({ metric: 'sources.active', value: sourceCounts[0].active || 0 });
        points.push({ metric: 'sources.inactive', value: sourceCounts[0].inactive || 0 });
        points.push({ metric: 'sources.never_polled', value: sourceCounts[0].never_polled || 0 });
      }
    } catch {}

    // ── Story metrics ──
    try {
      const storyStats = await prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN "firstSeenAt" > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END)::int as last_hour,
          SUM(CASE WHEN status IN ('BREAKING','ALERT') THEN 1 ELSE 0 END)::int as breaking
        FROM "Story" WHERE "mergedIntoId" IS NULL
      `;
      if (storyStats[0]) {
        points.push({ metric: 'stories.total', value: storyStats[0].total || 0 });
        points.push({ metric: 'stories.last_hour', value: storyStats[0].last_hour || 0 });
        points.push({ metric: 'stories.breaking', value: storyStats[0].breaking || 0 });
      }

      // Stories by category (top 5)
      const byCat = await prisma.$queryRaw<any[]>`
        SELECT category, COUNT(*)::int as count FROM "Story"
        WHERE "mergedIntoId" IS NULL AND "firstSeenAt" > NOW() - INTERVAL '24 hours' AND category IS NOT NULL
        GROUP BY category ORDER BY count DESC LIMIT 5
      `;
      for (const c of byCat) {
        points.push({ metric: 'stories.by_category', value: c.count, tags: { category: c.category } });
      }
    } catch {}

    // ── System metrics ──
    const mem = process.memoryUsage();
    points.push({ metric: 'system.memory_mb', value: Math.round(mem.rss / 1024 / 1024) });
    points.push({ metric: 'system.uptime_min', value: Math.round(process.uptime() / 60) });

    // ── Write all points ──
    await recordBatch(points);

  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'Metrics collection failed (non-fatal)');
  }
}

// Hourly rollup: aggregate raw metrics into hourly buckets
async function runRollup(): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "MetricsHourly" (metric, hour, avg, min, max, sum, count, tags)
      SELECT
        metric,
        date_trunc('hour', "createdAt") as hour,
        AVG(value),
        MIN(value),
        MAX(value),
        SUM(value),
        COUNT(*)::int,
        tags
      FROM "MetricsRaw"
      WHERE "createdAt" < date_trunc('hour', NOW())
        AND "createdAt" > NOW() - INTERVAL '2 hours'
      GROUP BY metric, date_trunc('hour', "createdAt"), tags
      ON CONFLICT (metric, hour, tags) DO UPDATE SET
        avg = EXCLUDED.avg, min = EXCLUDED.min, max = EXCLUDED.max,
        sum = EXCLUDED.sum, count = EXCLUDED.count
    `;

    // Clean raw metrics older than 7 days
    await prisma.$executeRaw`DELETE FROM "MetricsRaw" WHERE "createdAt" < NOW() - INTERVAL '7 days'`;

  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'Metrics rollup failed (non-fatal)');
  }
}

export function startMetricsCollector(): void {
  logger.info('Starting metrics collector (60s interval, hourly rollup)');

  // Create tables on first run
  ensureMetricsTables().then(() => {
    // Collect every 60 seconds
    collectMetrics();
    metricsInterval = setInterval(collectMetrics, 60_000);

    // Rollup every hour
    rollupInterval = setInterval(runRollup, 60 * 60 * 1000);
    // Run first rollup after 5 minutes
    setTimeout(runRollup, 5 * 60 * 1000);
  });
}

export function stopMetricsCollector(): void {
  if (metricsInterval) clearInterval(metricsInterval);
  if (rollupInterval) clearInterval(rollupInterval);
}
