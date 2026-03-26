import { Queue } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('scheduler');

let ingestionQueue: Queue;
let scoringQueue: Queue;

/**
 * Initialize BullMQ queues used by the scheduler
 */
function getQueues() {
  const connection = getSharedConnection();

  if (!ingestionQueue) {
    ingestionQueue = new Queue('ingestion', { connection });
  }
  if (!scoringQueue) {
    scoringQueue = new Queue('scoring', { connection });
  }

  return { ingestionQueue, scoringQueue };
}

/**
 * Schedule RSS feed polling jobs for all active RSS sources
 */
async function scheduleRSSPolls(): Promise<void> {
  const { ingestionQueue } = getQueues();

  try {
    const rssSources = await prisma.source.findMany({
      where: {
        platform: 'RSS',
        isActive: true,
      },
    });

    logger.info({ count: rssSources.length }, 'Scheduling RSS poll jobs');

    for (const source of rssSources) {
      if (!source.url) {
        logger.warn({ sourceId: source.id, name: source.name }, 'RSS source has no URL, skipping');
        continue;
      }

      await ingestionQueue.add(
        'rss_poll',
        {
          type: 'rss_poll',
          sourceId: source.id,
          feedUrl: source.url,
        },
        {
          jobId: `rss-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 }, // Keep completed jobs for 1 hour
          removeOnFail: { age: 86400 },    // Keep failed jobs for 24 hours
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule RSS polls');
  }
}

/**
 * Schedule NewsAPI polling jobs for all active NewsAPI sources
 */
async function scheduleNewsAPIPolls(): Promise<void> {
  const { ingestionQueue } = getQueues();

  try {
    const newsapiSources = await prisma.source.findMany({
      where: {
        platform: 'NEWSAPI',
        isActive: true,
      },
    });

    logger.info({ count: newsapiSources.length }, 'Scheduling NewsAPI poll jobs');

    for (const source of newsapiSources) {
      const metadata = source.metadata as Record<string, unknown> | null;

      await ingestionQueue.add(
        'newsapi_poll',
        {
          type: 'newsapi_poll',
          sourceId: source.id,
          query: (metadata?.['query'] as string) || 'Houston Texas',
        },
        {
          jobId: `newsapi-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule NewsAPI polls');
  }
}

/**
 * Schedule Facebook Page polling jobs for all active Facebook sources
 */
async function scheduleFacebookPagePolls(): Promise<void> {
  const { ingestionQueue } = getQueues();

  try {
    const fbSources = await prisma.source.findMany({
      where: {
        platform: 'FACEBOOK',
        isActive: true,
      },
    });

    logger.info({ count: fbSources.length }, 'Scheduling Facebook page poll jobs');

    for (const source of fbSources) {
      if (!source.platformId) {
        logger.warn({ sourceId: source.id, name: source.name }, 'Facebook source has no platformId, skipping');
        continue;
      }

      const metadata = source.metadata as Record<string, unknown> | null;
      const accessToken = (metadata?.['accessToken'] as string) || process.env['FACEBOOK_ACCESS_TOKEN'];

      if (!accessToken) {
        logger.warn({ sourceId: source.id }, 'No access token available for Facebook source');
        continue;
      }

      await ingestionQueue.add(
        'facebook_page_poll',
        {
          type: 'facebook_page_poll',
          sourceId: source.id,
          pageId: source.platformId,
          accessToken,
        },
        {
          jobId: `fb-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Facebook page polls');
  }
}

/**
 * Re-score all non-archived stories to apply score decay
 */
async function runScoreDecay(): Promise<void> {
  const { scoringQueue } = getQueues();

  try {
    const activeStories = await prisma.story.findMany({
      where: {
        status: { notIn: ['ARCHIVED', 'STALE'] },
      },
      select: { id: true },
    });

    logger.info({ count: activeStories.length }, 'Scheduling score decay re-scoring');

    for (const story of activeStories) {
      await scoringQueue.add(
        'score',
        { storyId: story.id },
        {
          jobId: `decay-score-${story.id}-${Date.now()}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 1800 },
          removeOnFail: { age: 3600 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to run score decay');
  }
}

/**
 * Archive stories older than 72 hours with no recent activity
 */
async function runCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago

    const result = await prisma.story.updateMany({
      where: {
        status: { notIn: ['ARCHIVED'] },
        lastUpdatedAt: { lt: cutoff },
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    logger.info({ archivedCount: result.count }, 'Cleanup complete: archived old stories');
  } catch (err) {
    logger.error({ err }, 'Failed to run cleanup');
  }
}

// Interval handles for cleanup on shutdown
const intervals: NodeJS.Timeout[] = [];

/**
 * Set up all recurring scheduled jobs
 */
export function startSchedulers(): void {
  logger.info('Starting poll schedulers');

  // RSS feeds: every 2 minutes
  const rssInterval = setInterval(scheduleRSSPolls, 2 * 60 * 1000);
  intervals.push(rssInterval);

  // NewsAPI: every 3 minutes
  const newsapiInterval = setInterval(scheduleNewsAPIPolls, 3 * 60 * 1000);
  intervals.push(newsapiInterval);

  // Facebook Pages: every 5 minutes
  const fbInterval = setInterval(scheduleFacebookPagePolls, 5 * 60 * 1000);
  intervals.push(fbInterval);

  // Score decay: every 10 minutes
  const decayInterval = setInterval(runScoreDecay, 10 * 60 * 1000);
  intervals.push(decayInterval);

  // Cleanup: every hour
  const cleanupInterval = setInterval(runCleanup, 60 * 60 * 1000);
  intervals.push(cleanupInterval);

  // Run initial polls immediately on startup
  void scheduleRSSPolls();
  void scheduleNewsAPIPolls();
  void scheduleFacebookPagePolls();

  logger.info('All schedulers started');
}

/**
 * Stop all scheduled jobs and close queues
 */
export async function stopSchedulers(): Promise<void> {
  logger.info('Stopping schedulers');

  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;

  if (ingestionQueue) await ingestionQueue.close();
  if (scoringQueue) await scoringQueue.close();

  logger.info('Schedulers stopped');
}
