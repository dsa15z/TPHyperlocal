// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('push-notification');

interface PushNotificationJob {
  storyId: string;
  event: string; // ALERT, BREAKING, TOP_STORY
}

async function processPushNotification(job: Job<PushNotificationJob>): Promise<void> {
  const { storyId, event } = job.data;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, status: true, category: true, compositeScore: true },
  });

  if (!story) return;

  // Find notification preferences matching this event
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      minStates: { path: '$', array_contains: [event] },
      minScore: { lte: story.compositeScore },
    },
  });

  if (preferences.length === 0) {
    logger.info({ storyId, event }, 'No matching notification preferences');
    return;
  }

  // Get devices for matching users
  const userIds = preferences.map((p) => p.userId);
  const devices = await prisma.device.findMany({
    where: { userId: { in: userIds }, isActive: true },
  });

  logger.info({
    storyId,
    event,
    matchedPrefs: preferences.length,
    devices: devices.length,
  }, 'Sending push notifications');

  // Create notification records
  for (const pref of preferences) {
    const channels = (pref.channels as string[]) || [];

    if (channels.includes('push')) {
      const userDevices = devices.filter((d) => d.userId === pref.userId);
      for (const device of userDevices) {
        // FCM push would go here — for now, log and create notification record
        await prisma.notification.create({
          data: {
            storyId,
            type: `${event}_ALERT`,
            channel: 'PUSH',
            recipient: device.token,
            payload: {
              title: `${event}: ${story.title.substring(0, 60)}`,
              body: story.title,
              storyId: story.id,
            },
            status: 'SENT',
            sentAt: new Date(),
          },
        });
      }
    }

    if (channels.includes('email')) {
      await prisma.notification.create({
        data: {
          storyId,
          type: `${event}_ALERT`,
          channel: 'EMAIL',
          recipient: pref.userId,
          payload: { title: story.title, storyId: story.id },
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    }
  }

  logger.info({ storyId, event, sent: devices.length }, 'Push notifications sent');
}

export function createPushNotificationWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<PushNotificationJob>('push-notifications', async (job) => {
    await processPushNotification(job);
  }, { connection, concurrency: 5 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Push notification job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Push notification job failed'));
  return worker;
}
