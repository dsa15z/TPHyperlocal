import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { createHmac } from 'crypto';

const logger = createChildLogger('notification');

interface NotificationJob {
  storyId: string;
  type: 'BREAKING_ALERT' | 'TRENDING_ALERT' | 'DIGEST';
}

interface WebhookPayload {
  event: string;
  story: {
    id: string;
    title: string;
    category: string;
    scores: {
      breaking: number;
      trending: number;
      confidence: number;
      locality: number;
      composite: number;
    };
    sourceCount: number;
    url: string | null;
  };
}

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { storyId, type } = job.data;

  logger.info({ storyId, type }, 'Processing notification');

  // Fetch story with market info
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { market: true },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping notification');
    return;
  }

  // Find all active webhook subscriptions for the account that include this event type
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: {
      accountId: story.accountId,
      isActive: true,
      events: { has: type },
    },
  });

  if (subscriptions.length === 0) {
    logger.info({ storyId, type }, 'No active subscriptions found for event');
    return;
  }

  logger.info({ storyId, type, subscriptionCount: subscriptions.length }, 'Sending notifications');

  for (const subscription of subscriptions) {
    const payload: WebhookPayload = {
      event: type,
      story: {
        id: story.id,
        title: story.title,
        category: story.category,
        scores: {
          breaking: story.breakingScore,
          trending: story.trendingScore,
          confidence: story.confidenceScore,
          locality: story.localityScore,
          composite: story.compositeScore,
        },
        sourceCount: story.sourceCount,
        url: story.url,
      },
    };

    const body = JSON.stringify(payload);
    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BreakingNewsBot/1.0',
      };

      // Compute HMAC-SHA256 signature if secret is configured
      if (subscription.secret) {
        const signature = createHmac('sha256', subscription.secret)
          .update(body)
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(subscription.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
      }

      // Update last delivered timestamp
      await prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: { lastDeliveredAt: new Date() },
      });

      logger.info({ subscriptionId: subscription.id, storyId }, 'Webhook delivered successfully');
    } catch (err) {
      status = 'FAILED';
      errorMessage = err instanceof Error ? err.message : String(err);

      // Increment fail count
      const updated = await prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: {
          failCount: { increment: 1 },
        },
      });

      logger.error(
        { subscriptionId: subscription.id, storyId, err: errorMessage },
        'Webhook delivery failed',
      );

      // Deactivate subscription if fail count exceeds threshold
      if (updated.failCount > 10) {
        await prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: { isActive: false },
        });

        logger.warn(
          { subscriptionId: subscription.id, failCount: updated.failCount },
          'Subscription deactivated due to excessive failures',
        );
      }
    }

    // Create notification record
    await prisma.notification.create({
      data: {
        storyId,
        webhookSubscriptionId: subscription.id,
        type,
        status,
        payload: payload as unknown as Record<string, unknown>,
        error: errorMessage,
      },
    });
  }

  logger.info({ storyId, type, subscriptionCount: subscriptions.length }, 'Notification processing complete');
}

export function createNotificationWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<NotificationJob>(
    'notifications',
    async (job) => {
      await processNotification(job);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Notification job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Notification job failed');
  });

  return worker;
}
