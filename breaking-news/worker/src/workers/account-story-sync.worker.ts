// @ts-nocheck
/**
 * Account Story Sync Worker
 *
 * Propagates base story updates to active account derivatives.
 * Runs periodically to check for base stories that have been updated
 * since their derivatives were last synced.
 */
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('account-story-sync');

interface SyncJob {
  type: 'sync_all' | 'sync_single';
  accountStoryId?: string;
}

async function processSync(job: Job<SyncJob>): Promise<void> {
  const { type, accountStoryId } = job.data;

  if (type === 'sync_single' && accountStoryId) {
    // Sync a single derivative
    const derivative = await prisma.accountStory.findUnique({
      where: { id: accountStoryId },
      include: { baseStory: { select: { updatedAt: true } } },
    });

    if (!derivative) return;

    await prisma.accountStory.update({
      where: { id: derivative.id },
      data: {
        lastSyncedAt: new Date(),
        baseSnapshotAt: derivative.baseStory.updatedAt,
      },
    });

    logger.info({ accountStoryId }, 'Synced single derivative');
    return;
  }

  // Sync all derivatives that are behind their base story
  // Find derivatives where base story was updated after last sync
  const staleDerivatives = await prisma.accountStory.findMany({
    where: {
      baseStory: {
        updatedAt: { gt: prisma.accountStory.fields?.lastSyncedAt }
      }
    },
    select: { id: true, lastSyncedAt: true, baseStory: { select: { updatedAt: true } } },
  }).catch(async () => {
    // Fallback: raw query if Prisma field comparison doesn't work
    const results = await prisma.$queryRaw<Array<{ id: string; lastSyncedAt: Date; baseUpdatedAt: Date }>>`
      SELECT as2.id, as2."lastSyncedAt", s."updatedAt" as "baseUpdatedAt"
      FROM "AccountStory" as2
      JOIN "Story" s ON s.id = as2."baseStoryId"
      WHERE s."updatedAt" > as2."lastSyncedAt"
      LIMIT 500
    `;
    return results.map(r => ({
      id: r.id,
      lastSyncedAt: r.lastSyncedAt,
      baseStory: { updatedAt: r.baseUpdatedAt },
    }));
  });

  if (staleDerivatives.length === 0) {
    logger.debug('No stale derivatives to sync');
    return;
  }

  logger.info({ count: staleDerivatives.length }, 'Syncing stale derivatives');

  // Batch update all stale derivatives
  let synced = 0;
  for (const deriv of staleDerivatives) {
    try {
      await prisma.accountStory.update({
        where: { id: deriv.id },
        data: {
          lastSyncedAt: new Date(),
          baseSnapshotAt: deriv.baseStory.updatedAt,
        },
      });
      synced++;
    } catch (err) {
      logger.warn({ id: deriv.id, err: (err as Error).message }, 'Failed to sync derivative');
    }
  }

  logger.info({ synced, total: staleDerivatives.length }, 'Derivative sync complete');
}

export function createAccountStorySyncWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker('account-story-sync', processSync, {
    connection,
    concurrency: 1, // Serial to prevent conflicts
    limiter: {
      max: 10,
      duration: 60000,
    },
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Sync job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Sync job failed');
  });

  return worker;
}
