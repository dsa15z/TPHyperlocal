// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('deadline-alert');

interface DeadlineAlertJob {
  accountId: string;
  showDeadlineId: string;
  alertType: 'SCRIPT_DUE' | 'AIR_IMMINENT' | 'OVERDUE';
}

/**
 * Compute minutes until air for a show deadline, using basic Date math.
 */
function computeMinutesToAir(airTime: string, timezone: string): number {
  const now = new Date();
  const [airH, airM] = airTime.split(':').map(Number);

  // Get today's date in the show's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const tzYear = parseInt(get('year'));
  const tzMonth = parseInt(get('month'));
  const tzDay = parseInt(get('day'));

  // Build the air time as an ISO string in the target timezone
  const isoStr = `${tzYear}-${String(tzMonth).padStart(2, '0')}-${String(tzDay).padStart(2, '0')}T${String(airH).padStart(2, '0')}:${String(airM).padStart(2, '0')}:00`;

  // Get UTC offset for the timezone
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const targetParts = targetFormatter.formatToParts(now);
  const tzName = targetParts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
  const offsetMatch = tzName.match(/GMT([+-]\d{2}):?(\d{2})/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    offsetMinutes = parseInt(offsetMatch[1]) * 60 + parseInt(offsetMatch[2]) * Math.sign(parseInt(offsetMatch[1]));
  }

  const airUTC = new Date(isoStr + 'Z');
  airUTC.setMinutes(airUTC.getMinutes() - offsetMinutes);

  return Math.round((airUTC.getTime() - now.getTime()) / 60000);
}

async function processDeadlineAlert(job: Job<DeadlineAlertJob>): Promise<void> {
  const { accountId, showDeadlineId, alertType } = job.data;

  logger.info({ accountId, showDeadlineId, alertType }, 'Processing deadline alert');

  // 1. Fetch the ShowDeadline
  const deadline = await prisma.showDeadline.findUnique({
    where: { id: showDeadlineId },
  });

  if (!deadline || !deadline.isActive) {
    logger.warn({ showDeadlineId }, 'Show deadline not found or inactive, skipping');
    return;
  }

  const minutesToAir = computeMinutesToAir(deadline.airTime, deadline.timezone);
  const minutesToScript = minutesToAir - deadline.scriptDeadlineMin;

  // 2. Fetch active assignments that haven't been filed or aired
  const unfiledAssignments = await prisma.assignment.findMany({
    where: {
      accountId,
      status: { notIn: ['FILED', 'AIRED', 'CANCELLED'] },
    },
    include: {
      reporter: { select: { name: true, email: true } },
      story: { select: { id: true, title: true } },
    },
  });

  // 3. Fetch today's ShowPrepRundown for this show
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const rundowns = await prisma.showPrepRundown.findMany({
    where: {
      accountId,
      showDate: { gte: todayStart, lte: todayEnd },
      name: { contains: deadline.showName, mode: 'insensitive' },
    },
  });

  // Extract story IDs from rundown items
  const rundownStoryIds: string[] = [];
  for (const rundown of rundowns) {
    const items = (rundown.items as any[]) || [];
    for (const item of items) {
      if (item.storyId) rundownStoryIds.push(item.storyId);
    }
  }

  // Count stories without breaking packages
  let storiesWithoutPackage = 0;
  if (rundownStoryIds.length > 0) {
    const packages = await prisma.breakingPackage.findMany({
      where: { storyId: { in: rundownStoryIds }, accountId },
      select: { storyId: true },
    });
    const coveredIds = new Set(packages.map(p => p.storyId));
    storiesWithoutPackage = rundownStoryIds.filter(id => !coveredIds.has(id)).length;
  }

  // 4. Build alert message
  const alertTypeLabels: Record<string, string> = {
    SCRIPT_DUE: 'SCRIPT DEADLINE',
    AIR_IMMINENT: 'AIR IMMINENT',
    OVERDUE: 'OVERDUE',
  };

  const unfiledReporters = unfiledAssignments.map(a =>
    `${a.reporter?.name || 'Unknown'} - "${a.story?.title?.substring(0, 50) || 'Untitled'}" [${a.status}]`
  );

  const message = [
    `[${alertTypeLabels[alertType]}] ${deadline.showName} (${deadline.airTime} ${deadline.timezone})`,
    `Time to air: ${minutesToAir} minutes`,
    `Script deadline: ${minutesToScript > 0 ? `${minutesToScript} minutes remaining` : `${Math.abs(minutesToScript)} minutes overdue`}`,
    `Rundown stories: ${rundownStoryIds.length}`,
    storiesWithoutPackage > 0 ? `Stories without breaking package: ${storiesWithoutPackage}` : null,
    unfiledReporters.length > 0 ? `\nUnfiled assignments (${unfiledReporters.length}):` : null,
    ...unfiledReporters.map(r => `  - ${r}`),
  ].filter(Boolean).join('\n');

  logger.info({ showName: deadline.showName, alertType, minutesToAir, storiesWithoutPackage }, 'Deadline alert built');

  // 5. Create a Notification record (the frontend SSE layer will pick this up via polling)
  // The Notification model requires a storyId. Use the first rundown story if available,
  // otherwise we need a sentinel story. If no story is available, log and skip notification creation.
  const alertPayload = {
    type: 'DEADLINE_ALERT',
    alertType,
    showDeadlineId: deadline.id,
    showName: deadline.showName,
    airTime: deadline.airTime,
    timezone: deadline.timezone,
    minutesToAir,
    minutesToScript,
    storiesWithoutPackage,
    totalRundownStories: rundownStoryIds.length,
    unfiledAssignments: unfiledAssignments.map(a => ({
      id: a.id,
      reporter: a.reporter?.name || 'Unknown',
      story: a.story?.title || 'Unknown',
      status: a.status,
    })),
    message,
  };

  if (rundownStoryIds.length > 0) {
    // Create a notification for the first story in the rundown as the anchor
    await prisma.notification.create({
      data: {
        storyId: rundownStoryIds[0],
        type: 'DEADLINE_ALERT',
        channel: 'SYSTEM',
        recipient: accountId,
        payload: alertPayload as unknown as Record<string, unknown>,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    logger.info({ showDeadlineId, alertType, storyId: rundownStoryIds[0] }, 'Deadline alert notification created');
  } else {
    // No rundown stories — log the alert but skip Notification creation (requires storyId)
    logger.info({ showDeadlineId, alertType }, 'Deadline alert processed (no rundown stories to link notification to)');
  }
}

export function createDeadlineAlertWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<DeadlineAlertJob>(
    'deadline-alerts',
    async (job) => {
      await processDeadlineAlert(job);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Deadline alert job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Deadline alert job failed');
  });

  return worker;
}
