// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getQueue } from '../lib/queue.js';

function getPayload(req: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

export async function radioGPTRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/radio/scripts - list generated scripts
  app.get('/radio/scripts', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const scripts = await prisma.radioScript.findMany({
      where: { accountId: payload.accountId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return reply.send({ data: scripts });
  });

  // POST /api/v1/radio/generate - generate a radio script from top stories
  app.post('/radio/generate', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      showName: z.string().min(1),
      format: z.enum(['NEWS', 'TALK', 'SPORTS', 'WEATHER']).default('NEWS'),
      storyCount: z.number().int().min(1).max(10).default(5),
      voiceId: z.string().optional(),
      durationSeconds: z.number().int().min(30).max(600).default(120),
    }).parse(request.body);

    // Get top stories for the script
    const stories = await prisma.story.findMany({
      where: { mergedIntoId: null, status: { in: ['ALERT', 'BREAKING', 'TOP_STORY', 'DEVELOPING'] } },
      orderBy: { compositeScore: 'desc' },
      take: data.storyCount,
      select: { id: true, title: true, summary: true, aiSummary: true, category: true, locationName: true },
    });

    if (stories.length === 0) {
      return reply.status(404).send({ error: 'No stories available for script generation' });
    }

    // Queue the generation job
    const queue = getQueue('first-draft' as any);
    const jobData = {
      type: 'radio_script',
      accountId: payload.accountId,
      showName: data.showName,
      format: data.format,
      voiceId: data.voiceId,
      durationSeconds: data.durationSeconds,
      stories: stories.map((s) => ({
        id: s.id,
        title: s.title,
        summary: s.aiSummary || s.summary || '',
        category: s.category,
        location: s.locationName,
      })),
    };

    await queue.add(`radio-${data.showName}`, jobData);
    await queue.close();

    return reply.send({
      message: `Generating ${data.format} script for "${data.showName}" with ${stories.length} stories`,
      storyCount: stories.length,
    });
  });

  // GET /api/v1/radio/history-of-the-day - today's historical events
  app.get('/radio/history-of-the-day', async (_request, reply) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const events = await prisma.historyEvent.findMany({
      where: { month, day },
      orderBy: { significance: 'desc' },
    });

    return reply.send({ data: events, date: { month, day } });
  });

  // POST /api/v1/radio/history-of-the-day - add a historical event
  app.post('/radio/history-of-the-day', async (request, reply) => {
    const data = z.object({
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      year: z.number().int().optional(),
      title: z.string().min(1),
      description: z.string().min(1),
      category: z.string().optional(),
      significance: z.number().int().min(1).max(10).default(5),
      isLocal: z.boolean().default(false),
    }).parse(request.body);

    const event = await prisma.historyEvent.create({ data });
    return reply.status(201).send({ data: event });
  });
}
