// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('velocity-scorer');

interface VelocityCheckJob {
  storyId: string;
  sourcePostId: string;
}

async function processVelocityCheck(job) {
  const { storyId } = job.data;
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, status: true },
  });
  if (!story || story.status === 'ALERT') return;

  const now = new Date();
  const [s15, s30] = await Promise.all([
    prisma.storySource.count({ where: { storyId, addedAt: { gte: new Date(now.getTime() - 15*60*1000) } } }),
    prisma.storySource.count({ where: { storyId, addedAt: { gte: new Date(now.getTime() - 30*60*1000) } } }),
  ]);

  let newStatus = null;
  if (s15 >= 5 && story.status !== 'BREAKING') newStatus = 'BREAKING';
  else if (s30 >= 3 && ['STALE','ARCHIVED','ONGOING','FOLLOW_UP'].includes(story.status)) newStatus = 'DEVELOPING';

  if (newStatus) {
    await prisma.story.update({ where: { id: storyId }, data: { status: newStatus, lastUpdatedAt: now } });
    await prisma.storyStateTransition.create({
      data: { storyId, fromState: story.status, toState: newStatus, trigger: 'velocity-scorer',
        reason: `${newStatus==='BREAKING' ? s15+' sources/15min' : s30+' sources/30min'}` },
    }).catch(() => {});
    logger.info({ storyId, from: story.status, to: newStatus, s15, s30 }, `Fast-path: ${newStatus}`);
  }
}

export function createVelocityScorerWorker() {
  const worker = new Worker('velocity-check', async (job) => { await processVelocityCheck(job); },
    { connection: getSharedConnection(), concurrency: 10 });
  worker.on('failed', (job, err) => logger.error({ err: err.message }, 'Velocity check failed'));
  return worker;
}
