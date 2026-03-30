// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('similarweb-scoring');

interface SimilarWebScoringJob {
  domain: string;
  sourceId?: string;
}

interface SimilarRankResponse {
  similar_rank: {
    rank: number;
  };
}

interface TrafficResponse {
  visits: Array<{
    date: string;
    visits: number;
  }>;
}

/**
 * Convert SimilarWeb global rank to a 0.0-1.0 trust score.
 * Higher-ranked (lower number) domains get higher scores.
 */
function rankToTrustScore(rank: number | null): number {
  if (rank === null || rank <= 0) return 0.50;

  if (rank <= 1000) return 0.95;
  if (rank <= 10000) return 0.85;
  if (rank <= 50000) return 0.75;
  if (rank <= 100000) return 0.65;
  if (rank <= 500000) return 0.55;
  return 0.45;
}

async function processSimilarWebScoring(job: Job<SimilarWebScoringJob>): Promise<void> {
  const { domain, sourceId } = job.data;

  const apiKey = process.env['SIMILARWEB_API_KEY'];
  if (!apiKey) {
    logger.error('SIMILARWEB_API_KEY environment variable not set');
    throw new Error('SIMILARWEB_API_KEY not configured');
  }

  logger.info({ domain, sourceId }, 'Fetching SimilarWeb data');

  let rank: number | null = null;
  let rankRawData: Record<string, unknown> | null = null;
  let trafficRawData: Record<string, unknown> | null = null;

  // 1. Fetch global rank
  try {
    const rankUrl = `https://api.similarweb.com/v1/similar-rank/${domain}/rank?api_key=${apiKey}`;
    const rankResponse = await fetch(rankUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
    });

    if (rankResponse.ok) {
      const rankData = (await rankResponse.json()) as SimilarRankResponse;
      rank = rankData?.similar_rank?.rank ?? null;
      rankRawData = rankData as unknown as Record<string, unknown>;
      logger.info({ domain, rank }, 'Got SimilarWeb rank');
    } else if (rankResponse.status === 429) {
      logger.warn({ domain }, 'SimilarWeb rate limit hit on rank endpoint');
      throw new Error('SimilarWeb rate limit hit');
    } else {
      logger.warn({ domain, status: rankResponse.status }, 'SimilarWeb rank request failed');
    }
  } catch (err) {
    if ((err as Error).message === 'SimilarWeb rate limit hit') throw err;
    logger.warn({ domain, err: (err as Error).message }, 'Failed to fetch SimilarWeb rank');
  }

  // 2. Fetch traffic data (best-effort, don't fail the job if this errors)
  try {
    const now = new Date();
    const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 2);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

    const trafficUrl = `https://api.similarweb.com/v1/website/${domain}/total-traffic-and-engagement/visits?api_key=${apiKey}&start_date=${startMonth}&end_date=${endMonth}&country=us&granularity=monthly`;
    const trafficResponse = await fetch(trafficUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
    });

    if (trafficResponse.ok) {
      trafficRawData = (await trafficResponse.json()) as Record<string, unknown>;
      logger.info({ domain }, 'Got SimilarWeb traffic data');
    } else {
      logger.debug({ domain, status: trafficResponse.status }, 'SimilarWeb traffic request failed (non-critical)');
    }
  } catch (err) {
    logger.debug({ domain, err: (err as Error).message }, 'Failed to fetch SimilarWeb traffic (non-critical)');
  }

  // 3. Calculate trust score from rank
  const score = rankToTrustScore(rank);

  // 4. Build combined raw data for storage
  const rawData: Record<string, unknown> = {
    ...(rankRawData ? { rank: rankRawData } : {}),
    ...(trafficRawData ? { traffic: trafficRawData } : {}),
    fetchedAt: new Date().toISOString(),
  };

  // 5. Upsert DomainScore record
  await prisma.domainScore.upsert({
    where: { domain },
    create: {
      domain,
      score,
      appearances: rank || 0,
      lastUpdated: new Date(),
    },
    update: {
      score,
      appearances: rank || 0,
      lastUpdated: new Date(),
    },
  });

  logger.info({ domain, rank, score }, 'Upserted DomainScore');

  // 6. If sourceId provided, update the Source's trustScore
  if (sourceId) {
    try {
      await prisma.source.update({
        where: { id: sourceId },
        data: { trustScore: score },
      });
      logger.info({ sourceId, domain, score }, 'Updated source trustScore from SimilarWeb');
    } catch (err) {
      logger.warn({ sourceId, err: (err as Error).message }, 'Failed to update source trustScore');
    }
  }
}

export function createSimilarWebScoringWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<SimilarWebScoringJob>(
    'similarweb-scoring',
    async (job: Job<SimilarWebScoringJob>) => {
      logger.info({ jobId: job.id, domain: job.data.domain }, 'Processing SimilarWeb scoring job');
      await processSimilarWebScoring(job);
    },
    {
      connection,
      concurrency: 1, // API rate limits: ~440 requests/day
      limiter: {
        max: 2,
        duration: 60000, // Max 2 per minute to stay well under daily limit
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, domain: job.data.domain }, 'SimilarWeb scoring job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, domain: job?.data?.domain, err: err.message }, 'SimilarWeb scoring job failed');
  });

  return worker;
}
