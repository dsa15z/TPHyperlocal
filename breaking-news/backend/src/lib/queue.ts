import { Queue, QueueOptions } from 'bullmq';
import { getRedis } from './redis.js';

const QUEUE_NAMES = {
  INGESTION: 'ingestion',
  ENRICHMENT: 'enrichment',
  CLUSTERING: 'clustering',
  SCORING: 'scoring',
  ALERTS: 'alerts',
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<QueueName, Queue>();

function getQueueOptions(): QueueOptions {
  return {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600,
      },
    },
  };
}

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, getQueueOptions());
    queues.set(name, queue);
  }
  return queue;
}

export const ingestionQueue = () => getQueue(QUEUE_NAMES.INGESTION);
export const enrichmentQueue = () => getQueue(QUEUE_NAMES.ENRICHMENT);
export const clusteringQueue = () => getQueue(QUEUE_NAMES.CLUSTERING);
export const scoringQueue = () => getQueue(QUEUE_NAMES.SCORING);
export const alertsQueue = () => getQueue(QUEUE_NAMES.ALERTS);

export async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const queue of queues.values()) {
    closePromises.push(queue.close());
  }
  await Promise.all(closePromises);
  queues.clear();
}

export { QUEUE_NAMES };
