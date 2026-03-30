// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

function getPayload(req: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

export async function reporterAnalyticsRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/analytics/reporters — Reporter performance summary
  app.get('/analytics/reporters', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const accountId = payload.accountId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const reporters = await prisma.reporter.findMany({
      where: { accountId },
      include: {
        assignments: {
          include: {
            story: { select: { id: true, title: true, category: true } },
          },
        },
      },
    });

    const results = reporters.map((reporter) => {
      const assignments = reporter.assignments;
      const totalAssignments = assignments.length;

      // Last 30 days
      const last30Days = assignments.filter(
        (a) => new Date(a.createdAt) >= thirtyDaysAgo
      ).length;

      // Completion rate: (FILED + AIRED) / (total - CANCELLED)
      const completed = assignments.filter(
        (a) => a.status === 'FILED' || a.status === 'AIRED'
      ).length;
      const nonCancelled = assignments.filter(
        (a) => a.status !== 'CANCELLED'
      ).length;
      const completionRate = nonCancelled > 0 ? completed / nonCancelled : 0;

      // Avg turnaround in minutes (createdAt -> filedAt for FILED/AIRED)
      const turnarounds: number[] = [];
      for (const a of assignments) {
        if ((a.status === 'FILED' || a.status === 'AIRED') && a.filedAt) {
          const mins = (new Date(a.filedAt).getTime() - new Date(a.createdAt).getTime()) / 60000;
          if (mins > 0) turnarounds.push(mins);
        }
      }
      const avgTurnaroundMin = turnarounds.length > 0
        ? Math.round(turnarounds.reduce((s, v) => s + v, 0) / turnarounds.length)
        : null;

      // Exclusive count: stories where reporter was the only assignee
      const storyIds = assignments.map((a) => a.storyId);
      const storyIdCounts: Record<string, number> = {};
      // We need to count across ALL assignments in the account for those stories
      // For now, count within this reporter's assignments and cross-check later
      const uniqueStoryIds = [...new Set(storyIds)];

      // Beat distribution: group by story category
      const beatDistribution: Record<string, number> = {};
      for (const a of assignments) {
        const cat = a.story?.category || 'uncategorized';
        beatDistribution[cat] = (beatDistribution[cat] || 0) + 1;
      }

      // On-time rate: filed before deadline / total with deadlines
      const withDeadline = assignments.filter((a) => a.deadline != null);
      const onTime = withDeadline.filter(
        (a) => a.filedAt && new Date(a.filedAt) <= new Date(a.deadline!)
      ).length;
      const onTimeRate = withDeadline.length > 0 ? onTime / withDeadline.length : null;

      return {
        reporterId: reporter.id,
        name: reporter.name,
        email: reporter.email,
        beats: reporter.beats,
        currentStatus: reporter.status,
        totalAssignments,
        last30Days,
        completionRate: Math.round(completionRate * 1000) / 1000,
        avgTurnaroundMin,
        beatDistribution,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 1000) / 1000 : null,
        uniqueStoryIds, // needed for exclusive count second pass
      };
    });

    // Second pass: compute exclusive counts by checking all assignments per story
    const allStoryIds = [...new Set(results.flatMap((r) => r.uniqueStoryIds))];
    const allAssignments = await prisma.assignment.findMany({
      where: { accountId, storyId: { in: allStoryIds } },
      select: { storyId: true, reporterId: true },
    });

    // Map storyId -> set of reporterIds
    const storyReporterMap: Record<string, Set<string>> = {};
    for (const a of allAssignments) {
      if (!storyReporterMap[a.storyId]) storyReporterMap[a.storyId] = new Set();
      storyReporterMap[a.storyId].add(a.reporterId);
    }

    const data = results
      .map(({ uniqueStoryIds, ...rest }) => {
        const exclusiveCount = uniqueStoryIds.filter(
          (sid) => storyReporterMap[sid] && storyReporterMap[sid].size === 1
        ).length;
        return { ...rest, exclusiveCount };
      })
      .sort((a, b) => b.last30Days - a.last30Days);

    return reply.send({ data });
  });

  // GET /api/v1/analytics/reporters/:id — Individual reporter deep dive
  app.get('/analytics/reporters/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const accountId = payload.accountId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);

    const reporter = await prisma.reporter.findFirst({
      where: { id, accountId },
    });
    if (!reporter) return reply.status(404).send({ error: 'Reporter not found' });

    const assignments = await prisma.assignment.findMany({
      where: { reporterId: id, accountId },
      include: {
        story: { select: { id: true, title: true, status: true, category: true, compositeScore: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalAssignments = assignments.length;

    // Last 30 days
    const last30Days = assignments.filter(
      (a) => new Date(a.createdAt) >= thirtyDaysAgo
    ).length;

    // Completion rate
    const completed = assignments.filter(
      (a) => a.status === 'FILED' || a.status === 'AIRED'
    ).length;
    const nonCancelled = assignments.filter(
      (a) => a.status !== 'CANCELLED'
    ).length;
    const completionRate = nonCancelled > 0 ? completed / nonCancelled : 0;

    // Avg turnaround
    const turnarounds: number[] = [];
    for (const a of assignments) {
      if ((a.status === 'FILED' || a.status === 'AIRED') && a.filedAt) {
        const mins = (new Date(a.filedAt).getTime() - new Date(a.createdAt).getTime()) / 60000;
        if (mins > 0) turnarounds.push(mins);
      }
    }
    const avgTurnaroundMin = turnarounds.length > 0
      ? Math.round(turnarounds.reduce((s, v) => s + v, 0) / turnarounds.length)
      : null;

    // Exclusive count
    const storyIds = [...new Set(assignments.map((a) => a.storyId))];
    const allStoryAssignments = await prisma.assignment.findMany({
      where: { accountId, storyId: { in: storyIds } },
      select: { storyId: true, reporterId: true },
    });
    const storyReporterMap: Record<string, Set<string>> = {};
    for (const a of allStoryAssignments) {
      if (!storyReporterMap[a.storyId]) storyReporterMap[a.storyId] = new Set();
      storyReporterMap[a.storyId].add(a.reporterId);
    }
    const exclusiveCount = storyIds.filter(
      (sid) => storyReporterMap[sid] && storyReporterMap[sid].size === 1
    ).length;

    // Beat distribution
    const beatDistribution: Record<string, number> = {};
    for (const a of assignments) {
      const cat = a.story?.category || 'uncategorized';
      beatDistribution[cat] = (beatDistribution[cat] || 0) + 1;
    }

    // On-time rate
    const withDeadline = assignments.filter((a) => a.deadline != null);
    const onTime = withDeadline.filter(
      (a) => a.filedAt && new Date(a.filedAt) <= new Date(a.deadline!)
    ).length;
    const onTimeRate = withDeadline.length > 0 ? onTime / withDeadline.length : null;

    // Recent assignments (last 20)
    const recentAssignments = assignments.slice(0, 20).map((a) => ({
      id: a.id,
      storyId: a.storyId,
      storyTitle: a.story?.title || null,
      status: a.status,
      priority: a.priority,
      createdAt: a.createdAt,
      filedAt: a.filedAt,
      airedAt: a.airedAt,
      deadline: a.deadline,
      turnaroundMin: a.filedAt
        ? Math.round((new Date(a.filedAt).getTime() - new Date(a.createdAt).getTime()) / 60000)
        : null,
    }));

    // Weekly trend: assignments per week for last 8 weeks
    const weeklyTrend: { weekStart: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const count = assignments.filter((a) => {
        const d = new Date(a.createdAt);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyTrend.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        count,
      });
    }

    // Priority breakdown
    const priorityBreakdown: Record<string, number> = {};
    for (const a of assignments) {
      priorityBreakdown[a.priority] = (priorityBreakdown[a.priority] || 0) + 1;
    }

    return reply.send({
      data: {
        reporterId: reporter.id,
        name: reporter.name,
        email: reporter.email,
        phone: reporter.phone,
        beats: reporter.beats,
        currentStatus: reporter.status,
        totalAssignments,
        last30Days,
        completionRate: Math.round(completionRate * 1000) / 1000,
        avgTurnaroundMin,
        exclusiveCount,
        beatDistribution,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 1000) / 1000 : null,
        recentAssignments,
        weeklyTrend,
        priorityBreakdown,
      },
    });
  });
}
