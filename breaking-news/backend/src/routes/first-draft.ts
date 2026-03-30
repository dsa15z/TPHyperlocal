// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getQueue } from '../lib/queue.js';

const QUEUE_NAME = 'first-draft';

const GenerateSchema = z.object({
  type: z.enum(['summary', 'short_summary', 'rewrite', 'tweet', 'bullets', 'idea_starter']),
  voiceId: z.string().optional(),
});

export async function firstDraftRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/stories/:id/first-drafts - list generated drafts for a story
  app.get('/stories/:id/first-drafts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const drafts = await prisma.firstDraft.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: drafts });
  });

  // POST /api/v1/stories/:id/first-drafts - generate a new draft
  app.post('/stories/:id/first-drafts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = GenerateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten() });
    }

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const queue = getQueue(QUEUE_NAME as any);
    await queue.add(`first-draft-${id}-${parseResult.data.type}`, {
      storyId: id,
      type: parseResult.data.type,
      voiceId: parseResult.data.voiceId,
      userId: (request as any).tokenPayload?.userId,
    });
    await queue.close();

    return reply.send({ message: `Generating ${parseResult.data.type} draft` });
  });
}
