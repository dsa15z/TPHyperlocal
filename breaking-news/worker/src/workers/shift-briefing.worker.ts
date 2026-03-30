// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('shift-briefing');

interface ShiftBriefingJob {
  accountId: string;
  shiftName: string;
}

async function processShiftBriefing(job: Job<ShiftBriefingJob>): Promise<void> {
  const { accountId, shiftName } = job.data;

  logger.info({ accountId, shiftName }, 'Generating shift briefing');

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  // Gather all active stories
  const stories = await prisma.story.findMany({
    where: { mergedIntoId: null, status: { in: ['ALERT', 'BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING'] } },
    orderBy: { compositeScore: 'desc' },
    take: 20,
    select: {
      id: true, title: true, status: true, category: true,
      locationName: true, compositeScore: true, sourceCount: true,
      firstSeenAt: true, lastUpdatedAt: true,
    },
  });

  // Get recent state transitions
  const transitions = await prisma.storyStateTransition.findMany({
    where: { createdAt: { gte: sixHoursAgo } },
    include: { story: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  // Get coverage gaps
  const gaps = await prisma.coverageMatch.findMany({
    where: { accountId, isCovered: false },
    include: { story: { select: { id: true, title: true, status: true, compositeScore: true } } },
    orderBy: { matchedAt: 'desc' },
    take: 10,
  });

  // Get pending assignments
  const assignments = await prisma.assignment.findMany({
    where: { accountId, status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'] } },
    include: {
      story: { select: { title: true } },
      reporter: { select: { name: true } },
    },
  });

  // Get public data alerts from last 6 hours
  const publicAlerts = await prisma.publicDataAlert.findMany({
    where: { detectedAt: { gte: sixHoursAgo }, severity: { in: ['CRITICAL', 'WARNING'] } },
    orderBy: { detectedAt: 'desc' },
    take: 10,
  });

  // Build the prompt
  const storyList = stories.map((s, i) =>
    `${i + 1}. [${s.status}] ${s.title} (${s.category || 'Unknown'}, ${s.locationName || 'Unknown'}, score: ${Math.round(s.compositeScore * 100)}%, ${s.sourceCount} sources)`
  ).join('\n');

  const changeList = transitions.map((t) =>
    `- "${t.story?.title?.substring(0, 50)}" changed from ${t.fromState} → ${t.toState} (${t.trigger})`
  ).join('\n');

  const gapList = gaps.map((g) =>
    `- ${g.story?.title} (score: ${Math.round((g.story?.compositeScore || 0) * 100)}%)`
  ).join('\n');

  const assignmentList = assignments.map((a) =>
    `- ${a.reporter?.name}: ${a.story?.title?.substring(0, 40)} [${a.status}]`
  ).join('\n');

  const alertList = publicAlerts.map((a) =>
    `- [${a.severity}] ${a.title} (${a.location || 'Unknown location'})`
  ).join('\n');

  const prompt = `Generate a comprehensive shift briefing for the "${shiftName}" shift at a local TV news station. Use clear, direct newsroom language.

## ACTIVE STORIES (Top 20 by score):
${storyList || 'No active stories.'}

## RECENT STATUS CHANGES (last 6 hours):
${changeList || 'No recent changes.'}

## COVERAGE GAPS (stories we haven't covered):
${gapList || 'No coverage gaps detected.'}

## ACTIVE ASSIGNMENTS:
${assignmentList || 'No active assignments.'}

## PUBLIC ALERTS:
${alertList || 'No active public alerts.'}

Write the briefing in this format:
1. **LEAD STORIES** - What should lead the next show and why
2. **DEVELOPING** - Stories that are still building
3. **COVERAGE GAPS** - What we're missing that competitors have
4. **ACTIVE ASSIGNMENTS** - Where reporters are and what they're working on
5. **WEATHER & ALERTS** - Any active weather or public safety alerts
6. **FOLLOW-UPS NEEDED** - Stories from yesterday that need updates
7. **HEADS UP** - Anything the incoming team should watch for`;

  const result = await generate(prompt, {
    maxTokens: 1500,
    temperature: 0.5,
    systemPrompt: 'You are an experienced TV news assignment editor writing a shift handoff briefing. Be direct, factual, and actionable.',
  });

  await prisma.shiftBriefing.create({
    data: {
      accountId,
      shiftName,
      content: result.text,
      storyCount: stories.length,
      gapCount: gaps.length,
      model: result.model,
    },
  });

  logger.info({ accountId, shiftName, storyCount: stories.length, gapCount: gaps.length }, 'Shift briefing generated');
}

export function createShiftBriefingWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<ShiftBriefingJob>('shift-briefing', async (job) => {
    await processShiftBriefing(job);
  }, { connection, concurrency: 2 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Shift briefing job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Shift briefing job failed'));
  return worker;
}
