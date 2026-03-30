// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { createHmac } from 'crypto';

const logger = createChildLogger('beat-alert');

interface BeatAlertJob {
  storyId: string;
  accountId: string;
  gapDetectedAt: string;
}

async function processBeatAlert(job: Job<BeatAlertJob>): Promise<void> {
  const { storyId, accountId, gapDetectedAt } = job.data;

  logger.info({ storyId, accountId }, 'Processing beat alert');

  // 1. Fetch the story
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      title: true,
      category: true,
      compositeScore: true,
      sourceCount: true,
      status: true,
      firstSeenAt: true,
      url: true,
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping beat alert');
    return;
  }

  // 2. Fetch CoverageMatch records for this story
  const coverageMatches = await prisma.coverageMatch.findMany({
    where: { storyId, accountId, isCovered: false },
    include: { coverageFeed: { select: { name: true } } },
    orderBy: { matchedAt: 'desc' },
    take: 3,
  });

  const competitorInfo = coverageMatches.length > 0
    ? coverageMatches.map((m) => m.matchedTitle || m.coverageFeed.name).join(', ')
    : 'Unknown competitor';

  // Calculate relative time
  const firstSeenMs = story.firstSeenAt.getTime();
  const minutesAgo = Math.round((Date.now() - firstSeenMs) / 60000);
  const relativeTime = minutesAgo < 60
    ? `${minutesAgo}m ago`
    : `${Math.round(minutesAgo / 60)}h ago`;

  // 3. Find Slack integrations for the account that have states including BREAKING or DEVELOPING
  const slackIntegrations = await prisma.slackIntegration.findMany({
    where: {
      accountId,
      isActive: true,
    },
  });

  // Filter to integrations whose states array includes BREAKING or DEVELOPING
  const relevantSlack = slackIntegrations.filter((slack) => {
    const states = (slack.states as string[]) || [];
    return states.includes('BREAKING') || states.includes('DEVELOPING');
  });

  // 4. Send Slack webhook with formatted message
  const slackMessage = [
    `🚨 COVERAGE GAP: ${story.title}`,
    `Score: ${story.compositeScore.toFixed(2)} | Sources: ${story.sourceCount} | Category: ${story.category || 'Unknown'}`,
    `Competitor covered: ${competitorInfo}`,
    `First seen: ${relativeTime}`,
  ].join('\n');

  for (const slack of relevantSlack) {
    try {
      const response = await fetch(slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slackMessage }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn(
          { slackId: slack.id, status: response.status },
          'Slack webhook delivery returned non-OK status',
        );
      } else {
        logger.info({ slackId: slack.id, storyId }, 'Beat alert sent to Slack');
      }
    } catch (err) {
      logger.error(
        { slackId: slack.id, storyId, err: err instanceof Error ? err.message : String(err) },
        'Slack webhook delivery failed',
      );
    }
  }

  // 5. Create a Notification record with type BEAT_ALERT
  await prisma.notification.create({
    data: {
      storyId,
      type: 'BEAT_ALERT',
      channel: 'SLACK',
      recipient: accountId,
      payload: {
        title: story.title,
        category: story.category,
        compositeScore: story.compositeScore,
        sourceCount: story.sourceCount,
        competitorInfo,
        gapDetectedAt,
      },
      status: relevantSlack.length > 0 ? 'SENT' : 'PENDING',
      sentAt: relevantSlack.length > 0 ? new Date() : null,
    },
  });

  // 6. Broadcast via webhook subscriptions that include BEAT_ALERT events
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: {
      accountId,
      isActive: true,
      events: { has: 'BEAT_ALERT' },
    },
  });

  for (const subscription of subscriptions) {
    const webhookPayload = {
      event: 'BEAT_ALERT',
      story: {
        id: story.id,
        title: story.title,
        category: story.category,
        scores: {
          composite: story.compositeScore,
        },
        sourceCount: story.sourceCount,
        url: story.url,
      },
      coverageGap: {
        competitorInfo,
        gapDetectedAt,
      },
    };

    const body = JSON.stringify(webhookPayload);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BreakingNewsBot/1.0',
      };

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

      await prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: { lastDeliveredAt: new Date() },
      });

      logger.info({ subscriptionId: subscription.id, storyId }, 'Beat alert webhook delivered');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      const updated = await prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: { failCount: { increment: 1 } },
      });

      logger.error(
        { subscriptionId: subscription.id, storyId, err: errorMessage },
        'Beat alert webhook delivery failed',
      );

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
  }

  logger.info(
    { storyId, slackCount: relevantSlack.length, webhookCount: subscriptions.length },
    'Beat alert processing complete',
  );
}

export function createBeatAlertWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<BeatAlertJob>(
    'beat-alerts',
    async (job) => {
      await processBeatAlert(job);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Beat alert job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Beat alert job failed');
  });

  return worker;
}
