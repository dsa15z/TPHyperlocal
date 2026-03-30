// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getQueue } from '../lib/queue.js';

function getUserId(req: any): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)).userId; } catch { return null; }
}

export async function factCheckRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/fact-checks
  app.get('/stories/:id/fact-checks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const checks = await prisma.factCheck.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: checks });
  });

  // POST /api/v1/stories/:id/fact-checks/auto - trigger AI fact-check
  app.post('/stories/:id/fact-checks/auto', async (request, reply) => {
    const { id } = request.params as { id: string };
    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true, title: true, summary: true, aiSummary: true },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Queue fact-check job
    const queue = getQueue('first-draft' as any);
    await queue.add(`fact-check-${id}`, {
      type: 'fact_check',
      storyId: id,
      title: story.title,
      content: story.aiSummary || story.summary || '',
    });
    await queue.close();

    return reply.send({ message: 'Fact-check analysis queued' });
  });

  // POST /api/v1/stories/:id/fact-checks - manual fact-check entry
  app.post('/stories/:id/fact-checks', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const data = z.object({
      claim: z.string().min(1),
      verdict: z.enum(['VERIFIED', 'UNVERIFIED', 'FALSE', 'MISLEADING', 'NEEDS_CONTEXT']),
      evidence: z.string().optional(),
      sources: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).default(1),
    }).parse(request.body);

    const check = await prisma.factCheck.create({
      data: {
        storyId: id,
        ...data,
        model: 'manual',
        checkedBy: userId,
      },
    });

    return reply.status(201).send({ data: check });
  });

  // GET /api/v1/fact-checks/flagged - stories with FALSE or MISLEADING claims
  app.get('/fact-checks/flagged', async (_request, reply) => {
    const flagged = await prisma.factCheck.findMany({
      where: { verdict: { in: ['FALSE', 'MISLEADING'] } },
      include: {
        story: {
          select: { id: true, title: true, status: true, compositeScore: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return reply.send({ data: flagged });
  });
}
