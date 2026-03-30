// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('domain-scoring');

/**
 * Domain scoring worker — calculates reliability scores for news domains
 * based on corroboration history, story coverage, and accuracy.
 * Ported from TopicPulse's calculate_domain_popularity.php
 */
async function processDomainScoring(): Promise<void> {
  logger.info('Running domain scoring calculation');

  // Get all sources with their story counts and corroboration data
  const sources = await prisma.source.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      url: true,
      trustScore: true,
      posts: {
        select: {
          storySources: { select: { storyId: true } },
        },
        take: 500,
      },
    },
  });

  for (const source of sources) {
    if (!source.url) continue;

    // Extract domain from URL
    let domain: string;
    try {
      domain = new URL(source.url).hostname.replace('www.', '');
    } catch {
      continue;
    }

    // Count unique stories this source contributed to
    const storyIds = new Set<string>();
    for (const post of source.posts) {
      for (const ss of post.storySources) {
        storyIds.add(ss.storyId);
      }
    }

    const appearances = storyIds.size;
    // Score = trust score * log(appearances + 1) — rewards both trust and volume
    const score = Math.min(1.0, source.trustScore * Math.log10(appearances + 1) / 2);

    await prisma.domainScore.upsert({
      where: { domain },
      create: { domain, score, appearances, lastUpdated: new Date() },
      update: { score, appearances, lastUpdated: new Date() },
    });
  }

  logger.info({ sourcesProcessed: sources.length }, 'Domain scoring complete');
}

export function createDomainScoringWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker('domain-scoring', async () => {
    await processDomainScoring();
  }, { connection, concurrency: 1 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Domain scoring job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Domain scoring job failed'));
  return worker;
}
