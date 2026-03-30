// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getQueue } from '../lib/queue.js';

export async function translationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/translations
  app.get('/stories/:id/translations', async (request, reply) => {
    const { id } = request.params as { id: string };
    const translations = await prisma.translatedContent.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: translations });
  });

  // POST /api/v1/stories/:id/translate - request translation
  app.post('/stories/:id/translate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      targetLanguage: z.string().min(2).max(5), // es, fr, zh, pt, etc.
    }).parse(request.body);

    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true, title: true, summary: true, aiSummary: true },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Check if translation already exists
    const existing = await prisma.translatedContent.findUnique({
      where: { storyId_targetLanguage: { storyId: id, targetLanguage: data.targetLanguage } },
    });
    if (existing) return reply.send({ data: existing, cached: true });

    // Queue translation job
    const queue = getQueue('first-draft' as any);
    await queue.add(`translate-${id}-${data.targetLanguage}`, {
      type: 'translation',
      storyId: id,
      title: story.title,
      content: story.aiSummary || story.summary || '',
      targetLanguage: data.targetLanguage,
    });
    await queue.close();

    return reply.send({ message: `Translation to ${data.targetLanguage} queued` });
  });

  // GET /api/v1/stories/multilingual - stories available in multiple languages
  app.get('/stories/multilingual', async (_request, reply) => {
    const translated = await prisma.translatedContent.findMany({
      include: {
        story: {
          select: { id: true, title: true, status: true, compositeScore: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      distinct: ['storyId'],
    });

    return reply.send({ data: translated });
  });
}
