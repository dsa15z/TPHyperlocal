// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

function getPayload(request: any) {
  const auth = request.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

/**
 * Compute the next air time for a show given its airTime (HH:MM), daysOfWeek, and timezone.
 * Returns { nextAirTime, scriptDeadline, minutesToAir, minutesToScript, isScriptDue, isAirImminent }
 */
function computeShowTiming(airTime: string, daysOfWeek: number[], timezone: string, scriptDeadlineMin: number) {
  const now = new Date();

  // Get current date/time in the show's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const tzYear = parseInt(get('year'));
  const tzMonth = parseInt(get('month'));
  const tzDay = parseInt(get('day'));
  const tzHour = parseInt(get('hour'));
  const tzMin = parseInt(get('minute'));

  const [airH, airM] = airTime.split(':').map(Number);

  // Build a reference date in the timezone to figure out day-of-week
  // JS getDay(): 0=Sun, 1=Mon ... 6=Sat. daysOfWeek uses 1=Mon ... 7=Sun
  const refDate = new Date(tzYear, tzMonth - 1, tzDay);
  const jsDow = refDate.getDay(); // 0=Sun
  const isoDow = jsDow === 0 ? 7 : jsDow; // 1=Mon ... 7=Sun

  // Check if today qualifies (show airs today and hasn't passed yet)
  const nowMinutes = tzHour * 60 + tzMin;
  const airMinutes = airH * 60 + airM;

  let daysAhead = -1;
  if (daysOfWeek.includes(isoDow) && airMinutes > nowMinutes) {
    daysAhead = 0;
  } else {
    // Find the next day in daysOfWeek
    for (let offset = 1; offset <= 7; offset++) {
      let checkDow = ((isoDow - 1 + offset) % 7) + 1;
      if (daysOfWeek.includes(checkDow)) {
        daysAhead = offset;
        break;
      }
    }
  }

  if (daysAhead === -1) {
    // No matching days at all
    return { nextAirTime: null, scriptDeadline: null, minutesToAir: null, minutesToScript: null, isScriptDue: false, isAirImminent: false };
  }

  // Build the next air time as a Date using timezone offset math
  // Create date in local tz, then adjust to get a proper ISO string
  const nextAirDate = new Date(tzYear, tzMonth - 1, tzDay + daysAhead);
  // Build an ISO-like string in the target timezone, then parse it
  const isoStr = `${nextAirDate.getFullYear()}-${String(nextAirDate.getMonth() + 1).padStart(2, '0')}-${String(nextAirDate.getDate()).padStart(2, '0')}T${String(airH).padStart(2, '0')}:${String(airM).padStart(2, '0')}:00`;

  // Use Intl to get the UTC offset for the timezone on that date
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const targetParts = targetFormatter.formatToParts(nextAirDate);
  const tzName = targetParts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
  // tzName looks like "GMT-05:00" or "GMT+05:30"
  const offsetMatch = tzName.match(/GMT([+-]\d{2}):?(\d{2})/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    offsetMinutes = parseInt(offsetMatch[1]) * 60 + parseInt(offsetMatch[2]) * Math.sign(parseInt(offsetMatch[1]));
  }

  // Create the actual UTC time
  const nextAirUTC = new Date(isoStr + 'Z');
  nextAirUTC.setMinutes(nextAirUTC.getMinutes() - offsetMinutes);

  const scriptDeadlineUTC = new Date(nextAirUTC.getTime() - scriptDeadlineMin * 60 * 1000);

  const minutesToAir = Math.round((nextAirUTC.getTime() - now.getTime()) / 60000);
  const minutesToScript = Math.round((scriptDeadlineUTC.getTime() - now.getTime()) / 60000);

  return {
    nextAirTime: nextAirUTC.toISOString(),
    scriptDeadline: scriptDeadlineUTC.toISOString(),
    minutesToAir,
    minutesToScript,
    isScriptDue: minutesToScript <= 0,
    isAirImminent: minutesToAir >= 0 && minutesToAir <= 15,
  };
}

/** Check if a show airs on a given ISO day-of-week (1=Mon ... 7=Sun) */
function airsOnDay(daysOfWeek: number[], isoDow: number): boolean {
  return daysOfWeek.includes(isoDow);
}

export async function showDeadlineRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /show-deadlines — list all deadlines with computed timing
  app.get('/show-deadlines', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const deadlines = await prisma.showDeadline.findMany({
      where: { accountId: payload.accountId },
      orderBy: { createdAt: 'desc' },
    });

    const data = deadlines.map((d) => {
      const daysOfWeek = (d.daysOfWeek as number[]) || [];
      const timing = computeShowTiming(d.airTime, daysOfWeek, d.timezone, d.scriptDeadlineMin);
      return { ...d, ...timing };
    });

    return reply.send({ data });
  });

  // POST /show-deadlines — create a new deadline
  app.post('/show-deadlines', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      showName: z.string().min(1),
      airTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
      timezone: z.string().default('America/Chicago'),
      daysOfWeek: z.array(z.number().min(1).max(7)),
      scriptDeadlineMin: z.number().min(1).default(30),
    }).parse(request.body);

    const deadline = await prisma.showDeadline.create({
      data: { ...data, accountId: payload.accountId },
    });

    return reply.status(201).send({ data: deadline });
  });

  // PATCH /show-deadlines/:id — update a deadline
  app.patch('/show-deadlines/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const data = z.object({
      showName: z.string().min(1).optional(),
      airTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
      timezone: z.string().optional(),
      daysOfWeek: z.array(z.number().min(1).max(7)).optional(),
      scriptDeadlineMin: z.number().min(1).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const deadline = await prisma.showDeadline.update({
      where: { id, accountId: payload.accountId },
      data,
    });

    return reply.send({ data: deadline });
  });

  // DELETE /show-deadlines/:id — delete a deadline
  app.delete('/show-deadlines/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    await prisma.showDeadline.deleteMany({
      where: { id, accountId: payload.accountId },
    });

    return reply.status(204).send();
  });

  // GET /show-deadlines/status — control room: real-time status for all shows airing today
  app.get('/show-deadlines/status', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    // Get all active deadlines for the account
    const deadlines = await prisma.showDeadline.findMany({
      where: { accountId: payload.accountId, isActive: true },
    });

    // Determine today's ISO day-of-week in each show's timezone
    const now = new Date();

    const showStatuses = [];

    for (const d of deadlines) {
      const daysOfWeek = (d.daysOfWeek as number[]) || [];

      // Get today's day-of-week in the show's timezone
      const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone, weekday: 'short' });
      const dayStr = dayFormatter.format(now);
      const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      const todayIsoDow = dayMap[dayStr] || 1;

      if (!airsOnDay(daysOfWeek, todayIsoDow)) continue;

      const timing = computeShowTiming(d.airTime, daysOfWeek, d.timezone, d.scriptDeadlineMin);

      // Only include shows that air today (minutesToAir should be for today, not future days)
      // If daysAhead > 0, the next air time is not today
      if (timing.minutesToAir === null || timing.minutesToAir > 24 * 60) continue;

      // Find today's rundown for this show (match by showDate = today and name contains show name)
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const rundowns = await prisma.showPrepRundown.findMany({
        where: {
          accountId: payload.accountId,
          showDate: { gte: todayStart, lte: todayEnd },
          name: { contains: d.showName, mode: 'insensitive' },
        },
      });

      // Count stories in rundowns and check which have breaking packages
      let totalStories = 0;
      let storiesWithoutPackage = 0;
      const storyIds: string[] = [];

      for (const rundown of rundowns) {
        const items = (rundown.items as any[]) || [];
        for (const item of items) {
          if (item.storyId) {
            totalStories++;
            storyIds.push(item.storyId);
          }
        }
      }

      if (storyIds.length > 0) {
        const packages = await prisma.breakingPackage.findMany({
          where: { storyId: { in: storyIds }, accountId: payload.accountId },
          select: { storyId: true },
        });
        const coveredStoryIds = new Set(packages.map(p => p.storyId));
        storiesWithoutPackage = storyIds.filter(id => !coveredStoryIds.has(id)).length;
      }

      // Get unfiled assignments for this account
      const unfiledAssignments = await prisma.assignment.findMany({
        where: {
          accountId: payload.accountId,
          status: { notIn: ['FILED', 'AIRED', 'CANCELLED'] },
          storyId: storyIds.length > 0 ? { in: storyIds } : undefined,
        },
        include: {
          reporter: { select: { name: true } },
          story: { select: { title: true } },
        },
      });

      showStatuses.push({
        showDeadlineId: d.id,
        showName: d.showName,
        airTime: d.airTime,
        timezone: d.timezone,
        ...timing,
        rundownCount: rundowns.length,
        totalStories,
        storiesWithoutPackage,
        unfiledAssignments: unfiledAssignments.map(a => ({
          id: a.id,
          reporter: a.reporter?.name || 'Unknown',
          story: a.story?.title || 'Unknown',
          status: a.status,
        })),
      });
    }

    // Sort by minutesToAir ascending (most urgent first)
    showStatuses.sort((a, b) => (a.minutesToAir ?? Infinity) - (b.minutesToAir ?? Infinity));

    return reply.send({ data: showStatuses });
  });
}
