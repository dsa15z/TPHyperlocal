// @ts-nocheck
/**
 * HyperLocal Intel ingestion worker.
 *
 * Polls the HyperLocal Intel API for each active market, ingesting curated
 * news items from 12 sources (Google News, Reddit, TikTok, X/Twitter,
 * Facebook, YouTube, Threads, Patch.com, etc.) into the story pipeline.
 *
 * Each curated item arrives pre-scored by geographic proximity (0=hyperlocal,
 * 50=broad), pre-deduplicated, and grouped by topic with related articles.
 */
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';
import { lookupAndCollect, submitBatch, getBatchStatus, type CuratedItem } from '../lib/hyperlocal-intel.js';

const logger = createChildLogger('hyperlocal-intel');

// ─── Types ─────────────────────────────────────────────────────────────────

interface HyperLocalIntelJob {
  type: 'single_lookup' | 'batch_markets';
  // For single_lookup:
  sourceId?: string;
  lat?: number;
  lng?: number;
  marketName?: string;
  // For batch_markets:
  accountId?: string;
}

// ─── Source platform mapping ───────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  'Google News': 'RSS',
  'Google News RSS': 'RSS',
  'Newsdata.io': 'NEWSAPI',
  'Reddit': 'TWITTER',         // Social platform bucket
  'TikTok': 'TWITTER',
  'Threads': 'TWITTER',
  'YouTube': 'TWITTER',
  'X / Twitter': 'TWITTER',
  'X Local Feeds': 'TWITTER',
  'Facebook Local': 'FACEBOOK',
  'Apify': 'RSS',
  'RSS Discovery': 'RSS',
  'Serper': 'NEWSAPI',
};

// Map distance_score to locality boost (lower distance = more local)
function distanceToLocalityScore(distanceScore: number): number {
  if (distanceScore <= 5) return 1.0;    // Hyperlocal
  if (distanceScore <= 15) return 0.85;  // Local
  if (distanceScore <= 30) return 0.60;  // Regional
  if (distanceScore <= 40) return 0.35;  // State-level
  return 0.15;                           // Broad/national
}

// ─── Process curated items into source posts ───────────────────────────────

async function ingestCuratedItems(
  items: CuratedItem[],
  sourceId: string,
  marketName: string,
): Promise<number> {
  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  const extractionQueue = new Queue('article-extraction', { connection: getSharedConnection() });

  let ingested = 0;

  for (const item of items) {
    try {
      if (!item.title || !item.url) continue;

      const content = `${item.title}\n\n${item.summary || ''}`;
      const contentHash = generateContentHash(content);
      const platformPostId = `hyperlocal::${contentHash.substring(0, 24)}`;

      // Dedup by platformPostId
      const existingById = await prisma.sourcePost.findUnique({ where: { platformPostId } });
      if (existingById) continue;

      // Dedup by content hash within same source
      const existingByHash = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByHash) continue;

      // Determine best platform label from the sources array
      const primaryPlatform = PLATFORM_MAP[item.source] || 'RSS';

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000),
          contentHash,
          title: item.title.substring(0, 500),
          url: item.url,
          authorName: item.source || 'HyperLocal Intel',
          publishedAt: item.published ? new Date(item.published) : new Date(),
          rawData: {
            hyperlocal: true,
            distance_score: item.distance_score,
            source_count: item.source_count,
            sources: item.sources,
            related: item.related,
            locality_score: distanceToLocalityScore(item.distance_score),
            market: marketName,
          },
        },
      });

      ingested++;

      // Queue enrichment
      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      // Queue full article extraction
      if (item.url) {
        await extractionQueue.add('extract_article', { sourcePostId: post.id }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: 2000,
        });
      }
    } catch (err) {
      if ((err as any)?.code === 'P2002') continue; // Unique constraint = dedup
      logger.warn({ err: (err as Error).message, title: item.title }, 'Failed to ingest curated item');
    }
  }

  await enrichmentQueue.close();
  await extractionQueue.close();

  return ingested;
}

// ─── Single market lookup ──────────────────────────────────────────────────

async function handleSingleLookup(job: Job<HyperLocalIntelJob>): Promise<void> {
  const { sourceId, lat, lng, marketName } = job.data;

  if (!sourceId || lat === undefined || lng === undefined) {
    throw new Error('Missing required fields: sourceId, lat, lng');
  }

  logger.info({ sourceId, lat, lng, marketName }, 'Starting HyperLocal Intel lookup');

  const results = await lookupAndCollect(lat, lng);

  logger.info({
    sourceId,
    marketName,
    curatedItems: results.curated.length,
    sources: results.sources,
    location: results.location?.display_name,
  }, 'HyperLocal Intel lookup complete');

  if (results.curated.length === 0) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastPolledAt: new Date() },
    });
    return;
  }

  const ingested = await ingestCuratedItems(results.curated, sourceId, marketName || 'Unknown');

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  logger.info({
    sourceId,
    marketName,
    ingested,
    total: results.curated.length,
    sources: results.sources,
  }, 'HyperLocal Intel ingestion complete');
}

// ─── Batch markets lookup ──────────────────────────────────────────────────

async function handleBatchMarkets(job: Job<HyperLocalIntelJob>): Promise<void> {
  const { accountId } = job.data;

  // Find all active markets
  const markets = await prisma.market.findMany({
    where: accountId ? { accountId, isActive: true } : { isActive: true },
    select: { id: true, name: true, state: true, latitude: true, longitude: true },
  });

  if (markets.length === 0) {
    logger.info('No active markets found for batch lookup');
    return;
  }

  logger.info({ marketCount: markets.length }, 'Starting batch HyperLocal Intel lookup');

  // Submit batch
  const locations = markets.map((m) => ({
    city: m.name,
    state: m.state || undefined,
    country: 'US',
  }));

  const batch = await submitBatch(locations);
  logger.info({ batchId: batch.batch_id, locations: batch.location_count }, 'Batch submitted');

  // Poll until done (max 2 minutes)
  const maxWait = 120000;
  const pollInterval = 5000;
  let elapsed = 0;
  let result;

  while (elapsed < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;

    result = await getBatchStatus(batch.batch_id);
    if (result.status === 'done') break;
    logger.debug({ batchId: batch.batch_id, status: result.status, elapsed }, 'Batch polling...');
  }

  if (!result || result.status !== 'done') {
    logger.warn({ batchId: batch.batch_id }, 'Batch timed out after 2 minutes');
    return;
  }

  // Find or create a HyperLocal Intel source for each market
  let totalIngested = 0;
  for (const loc of result.locations) {
    if (loc.status === 'error' || loc.curated.length === 0) continue;

    const market = markets.find(
      (m) => m.name.toLowerCase() === loc.city.toLowerCase()
    );

    // Find existing source or use first market's source
    let source = await prisma.source.findFirst({
      where: {
        name: { contains: 'HyperLocal Intel' },
        isActive: true,
        marketId: market?.id,
      },
    });

    if (!source) {
      // Auto-create the source
      source = await prisma.source.create({
        data: {
          name: `HyperLocal Intel - ${loc.resolved?.display_name || loc.city}`,
          platform: 'NEWSAPI' as any,
          sourceType: 'API_PROVIDER' as any,
          url: `${process.env.HYPERLOCAL_INTEL_URL || 'https://futurilabs.com/hyperlocalhyperrecent'}/api/lookup`,
          trustScore: 0.80,
          isActive: true,
          marketId: market?.id,
          accountId: accountId || undefined,
        },
      });
      logger.info({ sourceId: source.id, city: loc.city }, 'Auto-created HyperLocal Intel source');
    }

    const ingested = await ingestCuratedItems(loc.curated, source.id, loc.resolved?.display_name || loc.city);
    totalIngested += ingested;

    logger.info({
      city: loc.city,
      items: loc.curated.length,
      ingested,
    }, 'Market batch results ingested');
  }

  logger.info({
    batchId: batch.batch_id,
    markets: result.locations.length,
    totalIngested,
  }, 'Batch ingestion complete');
}

// ─── Worker ────────────────────────────────────────────────────────────────

async function processJob(job: Job<HyperLocalIntelJob>): Promise<void> {
  switch (job.data.type) {
    case 'single_lookup':
      await handleSingleLookup(job);
      break;
    case 'batch_markets':
      await handleBatchMarkets(job);
      break;
    default:
      logger.error({ type: job.data.type }, 'Unknown HyperLocal Intel job type');
  }
}

export function createHyperLocalIntelWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<HyperLocalIntelJob>(
    'hyperlocal-intel',
    async (job) => { await processJob(job); },
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 6,
        duration: 60000, // Max 6 lookups per minute
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'HyperLocal Intel job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'HyperLocal Intel job failed');
  });

  return worker;
}
