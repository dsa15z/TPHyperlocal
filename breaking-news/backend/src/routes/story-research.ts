// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getQueue } from '../lib/queue.js';

const QUEUE_NAME = 'story-research';

const ResearchParamsSchema = z.object({
  id: z.string().min(1),
});

export async function storyResearchRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // POST /api/v1/stories/:id/research — Trigger AI deep research
  app.post('/stories/:id/research', async (request, reply) => {
    const parseResult = ResearchParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const { id } = parseResult.data;

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Check if research is already in progress (look for pending first draft)
    const existing = await prisma.firstDraft.findFirst({
      where: { storyId: id, type: 'story_research' },
      orderBy: { createdAt: 'desc' },
    });

    // Extract accountId from token if available
    const tokenPayload = (request as any).tokenPayload;
    const accountId = tokenPayload?.accountId || null;

    const queue = getQueue(QUEUE_NAME as any);
    await queue.add(`story-research-${id}`, {
      storyId: id,
      accountId,
    });
    await queue.close();

    return reply.send({
      message: 'Research job queued',
      storyId: id,
      hasExisting: !!existing,
    });
  });

  // GET /api/v1/stories/:id/research — Get research results
  app.get('/stories/:id/research', async (request, reply) => {
    const parseResult = ResearchParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const { id } = parseResult.data;

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Get the latest research result from FirstDraft table
    const research = await prisma.firstDraft.findFirst({
      where: { storyId: id, type: 'story_research' },
      orderBy: { createdAt: 'desc' },
    });

    if (!research) {
      return reply.send({
        data: null,
        message: 'No research available. Trigger research first via POST.',
      });
    }

    // Parse the content — it's stored as a JSON string
    let parsed = null;
    try {
      parsed = typeof research.content === 'string' ? JSON.parse(research.content) : research.content;
    } catch {
      parsed = { raw: research.content };
    }

    return reply.send({
      data: {
        id: research.id,
        storyId: research.storyId,
        research: parsed,
        model: research.model,
        tokens: research.tokens,
        createdAt: research.createdAt,
      },
    });
  });
}
