// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { broadcastSSE } from '../lib/sse.js';
import { getUserId } from '../lib/route-helpers.js';


export async function collaborativeRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/editors - who is currently editing this story
  app.get('/stories/:id/editors', async (request, reply) => {
    const { id } = request.params as { id: string };
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const sessions = await prisma.storyEditSession.findMany({
      where: { storyId: id, isActive: true, lastHeartbeat: { gte: fiveMinAgo } },
    });

    return reply.send({ data: sessions, count: sessions.length });
  });

  // POST /api/v1/stories/:id/editors/join - join editing session
  app.post('/stories/:id/editors/join', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    // Upsert session
    const existing = await prisma.storyEditSession.findFirst({
      where: { storyId: id, userId, isActive: true },
    });

    if (existing) {
      await prisma.storyEditSession.update({
        where: { id: existing.id },
        data: { lastHeartbeat: new Date() },
      });
      return reply.send({ data: existing });
    }

    const session = await prisma.storyEditSession.create({
      data: { storyId: id, userId },
    });

    // Broadcast to other editors
    broadcastSSE('editor-joined', { storyId: id, userId, sessionId: session.id });

    return reply.status(201).send({ data: session });
  });

  // POST /api/v1/stories/:id/editors/heartbeat - keep session alive
  app.post('/stories/:id/editors/heartbeat', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const cursor = z.object({
      field: z.string().optional(),
      position: z.number().optional(),
    }).optional().parse(request.body);

    await prisma.storyEditSession.updateMany({
      where: { storyId: id, userId, isActive: true },
      data: { lastHeartbeat: new Date(), cursor: cursor || undefined },
    });

    return reply.send({ ok: true });
  });

  // POST /api/v1/stories/:id/editors/leave - leave editing session
  app.post('/stories/:id/editors/leave', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    await prisma.storyEditSession.updateMany({
      where: { storyId: id, userId, isActive: true },
      data: { isActive: false },
    });

    broadcastSSE('editor-left', { storyId: id, userId });
    return reply.send({ ok: true });
  });

  // PATCH /api/v1/stories/:id/collaborative-edit - apply an edit and broadcast
  app.patch('/stories/:id/collaborative-edit', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const data = z.object({
      editedTitle: z.string().optional(),
      editedSummary: z.string().optional(),
    }).parse(request.body);

    const story = await prisma.story.update({
      where: { id },
      data: {
        ...data,
        editedBy: userId,
        editedAt: new Date(),
      },
    });

    // Broadcast edit to other connected editors
    broadcastSSE('story-edited', { storyId: id, userId, changes: data });

    return reply.send({ data: { id: story.id, editedTitle: story.editedTitle, editedSummary: story.editedSummary } });
  });
}
