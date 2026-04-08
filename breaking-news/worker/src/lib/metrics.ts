/**
 * Lightweight metrics recording for worker processes.
 * Buffers metrics in memory and flushes to PostgreSQL periodically.
 * Workers call record() inline — it's non-blocking and never throws.
 *
 * Usage:
 *   import { metrics } from '../lib/metrics.js';
 *   metrics.record('ingestion.fetch_time_ms', 342, { source: 'CBC Toronto' });
 *   metrics.increment('ingestion.items_ingested', 1, { market: 'Toronto' });
 *   metrics.increment('enrichment.llm_calls', 1, { provider: 'openai' });
 *   metrics.record('enrichment.tokens_used', 450, { provider: 'openai' });
 */

import prisma from './prisma.js';

interface MetricPoint {
  metric: string;
  value: number;
  tags: Record<string, string>;
  time: number;
}

const buffer: MetricPoint[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL = 10_000; // Flush every 10 seconds
const MAX_BUFFER = 500; // Force flush at 500 points

function ensureFlushTimer() {
  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL);
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, Math.min(buffer.length, MAX_BUFFER));

  try {
    const values = batch.map(p =>
      `('${p.metric.replace(/'/g, "''")}', ${p.value}, '${JSON.stringify(p.tags).replace(/'/g, "''")}'::jsonb, to_timestamp(${p.time / 1000}))`
    ).join(',');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${values}`
    );
  } catch {
    // Non-fatal — metrics are best-effort
  }
}

export const metrics = {
  /** Record a gauge/timing metric */
  record(metric: string, value: number, tags: Record<string, string> = {}): void {
    buffer.push({ metric, value, tags, time: Date.now() });
    ensureFlushTimer();
    if (buffer.length >= MAX_BUFFER) flush();
  },

  /** Increment a counter metric */
  increment(metric: string, delta: number = 1, tags: Record<string, string> = {}): void {
    buffer.push({ metric, value: delta, tags, time: Date.now() });
    ensureFlushTimer();
    if (buffer.length >= MAX_BUFFER) flush();
  },

  /** Record a duration using a start time */
  timing(metric: string, startMs: number, tags: Record<string, string> = {}): void {
    const duration = Date.now() - startMs;
    buffer.push({ metric, value: duration, tags, time: Date.now() });
    ensureFlushTimer();
  },

  /** Force flush all buffered metrics */
  async flush(): Promise<void> {
    await flush();
  },

  /** Stop the flush timer */
  stop(): void {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flush(); // Final flush
  },
};
