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

export async function pulseRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // List pulses
  app.get('/pulses', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const pulses = await prisma.smartPulse.findMany({
      where: { OR: [{ accountId: payload.accountId }, { isSystem: true }] },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: pulses });
  });

  // Create pulse
  app.post('/pulses', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      topics: z.record(z.unknown()),
      filters: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const pulse = await prisma.smartPulse.create({
      data: { ...data, accountId: payload.accountId, userId: payload.userId },
    });
    return reply.status(201).send({ data: pulse });
  });

  // Get pulse stories (matches stories based on pulse config)
  app.get('/pulses/:id/stories', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pulse = await prisma.smartPulse.findUnique({ where: { id } });
    if (!pulse) return reply.status(404).send({ error: 'Pulse not found' });

    const filters = (pulse.filters as Record<string, any>) || {};
    const topics = (pulse.topics as Record<string, any>) || {};
    const keywords = topics.keywords || [];

    const where: any = { mergedIntoId: null };
    if (filters.category) where.category = filters.category;
    if (filters.minScore) where.compositeScore = { gte: filters.minScore };
    if (keywords.length > 0) {
      where.OR = keywords.map((kw: string) => ({
        OR: [
          { title: { contains: kw, mode: 'insensitive' } },
          { summary: { contains: kw, mode: 'insensitive' } },
        ],
      }));
    }

    const stories = await prisma.story.findMany({
      where,
      orderBy: { compositeScore: 'desc' },
      take: 25,
      include: { _count: { select: { storySources: true } } },
    });

    return reply.send({ data: stories });
  });

  // Delete pulse
  app.delete('/pulses/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.smartPulse.delete({ where: { id } });
    return reply.status(204).send();
  });
}
