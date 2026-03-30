// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { sendBatchNotifications } from '../lib/fcm.js';

const logger = createChildLogger('push-notification');

// ─── Types ──────────────────────────────────────────────────────────────────

interface PushNotificationJob {
  storyId: string;
  event: string; // ALERT, BREAKING, TOP_STORY
}

interface QuietHours {
  enabled: boolean;
  start: string; // "22:00"
  end: string;   // "07:00"
  timezone?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build notification title based on story status/event.
 */
function buildTitle(event: string, storyTitle: string): string {
  const truncated = storyTitle.substring(0, 80);
  switch (event) {
    case 'BREAKING':
      return `🔴 BREAKING: ${truncated}`;
    case 'ALERT':
      return `⚡ ALERT: ${truncated}`;
    case 'TOP_STORY':
      return `📰 ${truncated}`;
    default:
      return truncated;
  }
}

/**
 * Build notification body from story data.
 */
function buildBody(story: { summary?: string | null; category?: string | null; sourceCount?: number }): string {
  if (story.summary) {
    return story.summary.substring(0, 150);
  }
  const parts: string[] = [];
  if (story.category) parts.push(story.category);
  if (story.sourceCount && story.sourceCount > 1) parts.push(`${story.sourceCount} sources`);
  return parts.join(' · ') || 'Tap to read more';
}

/**
 * Check if the current time falls within a user's quiet hours.
 */
function isInQuietHours(quietHours: QuietHours | null | undefined): boolean {
  if (!quietHours || !quietHours.enabled) return false;

  try {
    const tz = quietHours.timezone || 'America/Chicago';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = quietHours.start.split(':').map(Number);
    const [endH, endM] = quietHours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight ranges (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch (err) {
    logger.warn({ err }, 'Failed to check quiet hours, allowing notification');
    return false;
  }
}

// ─── Processor ──────────────────────────────────────────────────────────────

async function processPushNotification(job: Job<PushNotificationJob>): Promise<void> {
  const { storyId, event } = job.data;

  // 1. Fetch story
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      compositeScore: true,
      summary: true,
      _count: { select: { sources: true } },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping push notification');
    return;
  }

  // 2. Find notification preferences matching event + minScore + channel includes 'push'
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      minStates: { path: '$', array_contains: [event] },
      minScore: { lte: story.compositeScore },
    },
    include: {
      user: {
        select: { id: true, metadata: true },
      },
    },
  });

  if (preferences.length === 0) {
    logger.info({ storyId, event }, 'No matching notification preferences');
    return;
  }

  // 3. Filter by quiet hours and channels
  const pushUserIds: string[] = [];
  const emailUserIds: string[] = [];

  for (const pref of preferences) {
    const channels = (pref.channels as string[]) || [];
    const quietHours = (pref.user?.metadata as Record<string, unknown>)?.quietHours as QuietHours | undefined;

    if (isInQuietHours(quietHours)) {
      logger.debug({ userId: pref.userId, storyId }, 'Skipping notification — quiet hours');
      continue;
    }

    if (channels.includes('push')) {
      pushUserIds.push(pref.userId);
    }

    if (channels.includes('email')) {
      emailUserIds.push(pref.userId);
    }
  }

  // 4. Get active devices for push users
  const devices = pushUserIds.length > 0
    ? await prisma.device.findMany({
        where: { userId: { in: pushUserIds }, isActive: true },
      })
    : [];

  logger.info({
    storyId,
    event,
    matchedPrefs: preferences.length,
    pushUsers: pushUserIds.length,
    emailUsers: emailUserIds.length,
    devices: devices.length,
  }, 'Processing push notifications');

  // 5. Send FCM push notifications
  if (devices.length > 0) {
    const title = buildTitle(event, story.title);
    const body = buildBody({
      summary: story.summary,
      category: story.category,
      sourceCount: story._count.sources,
    });

    const fcmMessage = {
      title,
      body,
      data: {
        storyId: story.id,
        status: story.status,
        category: story.category || '',
        url: `/stories/${story.id}`,
      },
    };

    const tokens = devices.map((d) => ({
      token: d.token,
      platform: d.platform,
    }));

    const fcmResult = await sendBatchNotifications(tokens, fcmMessage);

    logger.info(
      { storyId, sent: fcmResult.sent, failed: fcmResult.failed },
      'FCM batch send complete',
    );

    // 6. Create notification records and update delivery status
    for (const device of devices) {
      // Find the FCM result for this token by checking if the send was successful
      // Since batch doesn't return per-token results, we track overall success
      const notification = await prisma.notification.create({
        data: {
          storyId,
          type: `${event}_ALERT`,
          channel: 'PUSH',
          recipient: device.token,
          payload: {
            title: fcmMessage.title,
            body: fcmMessage.body,
            storyId: story.id,
          },
          status: fcmResult.sent > 0 ? 'SENT' : 'FAILED',
          sentAt: new Date(),
        },
      });

      // 7. If FCM returns "NotRegistered" error, mark device as inactive
      if (fcmResult.errors.some((e) => e === 'NotRegistered' || e === 'InvalidRegistration')) {
        logger.info({ deviceId: device.id, token: device.token.slice(0, 12) + '...' }, 'Marking device as inactive — token not registered');
        await prisma.device.update({
          where: { id: device.id },
          data: { isActive: false },
        });
      }
    }
  }

  // 8. Create email notification records (actual email sending is separate)
  for (const userId of emailUserIds) {
    await prisma.notification.create({
      data: {
        storyId,
        type: `${event}_ALERT`,
        channel: 'EMAIL',
        recipient: userId,
        payload: {
          title: story.title,
          storyId: story.id,
          category: story.category,
          compositeScore: story.compositeScore,
        },
        status: 'PENDING',
        sentAt: null,
      },
    });
  }

  logger.info({ storyId, event, pushDevices: devices.length, emailUsers: emailUserIds.length }, 'Push notification job complete');
}

// ─── Worker Export ───────────────────────────────────────────────────────────

export function createPushNotificationWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<PushNotificationJob>('push-notifications', async (job) => {
    await processPushNotification(job);
  }, { connection, concurrency: 5 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Push notification job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Push notification job failed'));
  return worker;
}
