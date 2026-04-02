// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


export async function assignmentDeskRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/assignments - list assignments
  app.get('/assignments', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const assignments = await prisma.assignment.findMany({
      where: { accountId: payload.accountId },
      include: {
        story: { select: { id: true, title: true, status: true, category: true, compositeScore: true, locationName: true } },
        reporter: { select: { id: true, name: true, status: true, beats: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return reply.send({ data: assignments });
  });

  // POST /api/v1/assignments - create assignment
  app.post('/assignments', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      storyId: z.string(),
      reporterId: z.string(),
      priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
      notes: z.string().optional(),
      deadline: z.string().optional(),
    }).parse(request.body);

    const assignment = await prisma.assignment.create({
      data: {
        accountId: payload.accountId,
        storyId: data.storyId,
        reporterId: data.reporterId,
        priority: data.priority,
        notes: data.notes,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        assignedBy: payload.userId,
      },
    });

    // Update reporter status
    await prisma.reporter.update({
      where: { id: data.reporterId },
      data: { status: 'ON_ASSIGNMENT' },
    });

    return reply.status(201).send({ data: assignment });
  });

  // PATCH /api/v1/assignments/:id/status - update assignment status
  app.patch('/assignments/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({
      status: z.enum(['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'FILED', 'AIRED', 'CANCELLED']),
    }).parse(request.body);

    const assignment = await prisma.assignment.update({
      where: { id },
      data: {
        status,
        ...(status === 'FILED' ? { filedAt: new Date() } : {}),
        ...(status === 'AIRED' ? { airedAt: new Date() } : {}),
      },
    });

    // Free up reporter when filed/aired/cancelled
    if (['FILED', 'AIRED', 'CANCELLED'].includes(status)) {
      await prisma.reporter.update({
        where: { id: assignment.reporterId },
        data: { status: 'AVAILABLE' },
      });
    }

    return reply.send({ data: assignment });
  });

  // GET /api/v1/reporters - list reporters
  app.get('/reporters', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const reporters = await prisma.reporter.findMany({
      where: { accountId: payload.accountId },
      include: {
        assignments: {
          where: { status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'] } },
          include: { story: { select: { title: true } } },
          take: 3,
        },
      },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: reporters });
  });

  // POST /api/v1/reporters - add reporter
  app.post('/reporters', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      beats: z.array(z.string()).optional(),
    }).parse(request.body);

    const reporter = await prisma.reporter.create({
      data: { ...data, accountId: payload.accountId },
    });
    return reply.status(201).send({ data: reporter });
  });

  // GET /api/v1/assignments/suggest/:storyId - AI reporter suggestion
  app.get('/assignments/suggest/:storyId', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { category: true, locationName: true, latitude: true, longitude: true },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const reporters = await prisma.reporter.findMany({
      where: { accountId: payload.accountId, status: 'AVAILABLE' },
    });

    // Score each reporter by beat match + proximity
    const scored = reporters.map((r) => {
      let score = 0;
      const beats = (r.beats as string[]) || [];

      // Beat match
      if (story.category && beats.some((b) => b.toLowerCase() === story.category!.toLowerCase())) {
        score += 50;
      }

      // Proximity (if both have coordinates)
      if (r.currentLat && r.currentLon && story.latitude && story.longitude) {
        const dist = Math.sqrt(
          Math.pow(r.currentLat - story.latitude, 2) +
          Math.pow(r.currentLon - story.longitude, 2)
        ) * 69; // rough miles
        score += Math.max(0, 30 - dist); // closer = higher score
      }

      return { reporter: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return reply.send({
      data: scored.slice(0, 5).map((s) => ({
        ...s.reporter,
        matchScore: s.score,
        reason: s.score >= 50 ? 'Beat match' : s.score >= 30 ? 'Proximity' : 'Available',
      })),
    });
  });
}
