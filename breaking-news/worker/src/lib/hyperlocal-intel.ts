// @ts-nocheck
/**
 * HyperLocal Intel API client.
 * Aggregates real-time news from 12 sources (Google News, Reddit, TikTok,
 * Twitter/X, Facebook, YouTube, Threads, Patch.com, etc.) scored by
 * geographic proximity.
 *
 * API docs: https://futurilabs.com/hyperlocalhyperrecent/api/describe
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('hyperlocal-intel');

const BASE_URL = process.env.HYPERLOCAL_INTEL_URL || 'https://futurilabs.com/hyperlocalhyperrecent';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CuratedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
  distance_score: number;
  source_count: number;
  sources: string[];
  related: Array<{ source: string; url: string; title: string }>;
}

export interface BatchLocation {
  city: string;
  state?: string;
  country?: string;
}

export interface BatchResult {
  batch_id: string;
  status: 'queued' | 'active' | 'done';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  webhook_url: string | null;
  webhook_status: number | string | null;
  locations: Array<{
    city: string;
    state: string;
    country: string;
    status: 'queued' | 'active' | 'done' | 'error';
    resolved: { city: string; state: string; country: string; display_name: string };
    lat: number;
    lng: number;
    error?: string;
    result_count: number;
    curated: CuratedItem[];
  }>;
}

export interface LookupResponse {
  lookup_id: string;
}

// ─── API Client ────────────────────────────────────────────────────────────

/**
 * Start a real-time lookup for a geographic point.
 * Returns a lookup_id that can be used with the SSE stream.
 */
export async function startLookup(lat: number, lng: number): Promise<LookupResponse> {
  const res = await fetch(`${BASE_URL}/api/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HyperLocal lookup failed: ${res.status} ${body}`);
  }

  return res.json();
}

/**
 * Submit a batch of locations for async processing.
 * Optionally provide a webhook URL for completion notification.
 */
export async function submitBatch(
  locations: BatchLocation[],
  webhookUrl?: string
): Promise<{ batch_id: string; location_count: number; status: string; poll_url: string }> {
  const res = await fetch(`${BASE_URL}/api/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: locations.slice(0, 20), // Max 20 per batch
      webhook_url: webhookUrl || undefined,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HyperLocal batch submit failed: ${res.status} ${body}`);
  }

  return res.json();
}

/**
 * Poll batch status and retrieve results.
 */
export async function getBatchStatus(batchId: string): Promise<BatchResult> {
  const res = await fetch(`${BASE_URL}/api/batch/${batchId}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HyperLocal batch status failed: ${res.status} ${body}`);
  }

  return res.json();
}

/**
 * Stream results from a lookup via SSE.
 * Collects all curated items and returns them when the stream completes.
 */
export async function collectStreamResults(lookupId: string): Promise<{
  location: { city: string; state: string; display_name: string } | null;
  curated: CuratedItem[];
  sources: string[];
}> {
  const res = await fetch(`${BASE_URL}/api/stream/${lookupId}`, {
    headers: { 'Accept': 'text/event-stream' },
    signal: AbortSignal.timeout(60000), // Streams can take up to 30s
  });

  if (!res.ok) {
    throw new Error(`HyperLocal stream failed: ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split('\n');

  let location: any = null;
  const curated: CuratedItem[] = [];
  const sources: string[] = [];

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'location') {
        location = { city: data.city, state: data.state, display_name: data.display_name };
      } else if (data.type === 'progress' && data.source) {
        if (!sources.includes(data.source)) sources.push(data.source);
      } else if (data.type === 'curated') {
        if (Array.isArray(data.items)) {
          curated.push(...data.items);
        } else if (data.title) {
          curated.push(data);
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { location, curated, sources };
}

/**
 * Convenience: run a full lookup for a lat/lng and return curated results.
 * Combines startLookup + collectStreamResults.
 */
export async function lookupAndCollect(lat: number, lng: number): Promise<{
  location: { city: string; state: string; display_name: string } | null;
  curated: CuratedItem[];
  sources: string[];
}> {
  logger.info({ lat, lng }, 'Starting HyperLocal Intel lookup');
  const { lookup_id } = await startLookup(lat, lng);
  logger.info({ lookup_id }, 'Lookup started, collecting stream');
  const results = await collectStreamResults(lookup_id);
  logger.info({ items: results.curated.length, sources: results.sources.length }, 'Lookup complete');
  return results;
}
