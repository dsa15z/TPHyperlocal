// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { broadcastSSE } from '../lib/sse.js';
import { getUserId } from '../lib/route-helpers.js';


function getUserRole(req: any): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)).role || null; } catch { return null; }
}

export async function annotationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/annotations
  app.get('/stories/:id/annotations', async (request, reply) => {
    const { id } = request.params as { id: string };
    const annotations = await prisma.storyAnnotation.findMany({
      where: { storyId: id },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const data = annotations.map((a) => ({
      id: a.id,
      storyId: a.storyId,
      userId: a.userId,
      displayName: a.user?.displayName || null,
      type: a.type,
      content: a.content,
      tags: a.tags,
      isPinned: a.isPinned,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return reply.send({ data });
  });

  // POST /api/v1/stories/:id/annotations
  app.post('/stories/:id/annotations', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const body = z.object({
      type: z.enum(['NOTE', 'TAG', 'FLAG', 'ASSIGNMENT']).default('NOTE'),
      content: z.string().min(1),
      tags: z.array(z.string()).optional(),
      isPinned: z.boolean().optional().default(false),
    }).parse(request.body);

    const annotation = await prisma.storyAnnotation.create({
      data: {
        storyId: id,
        userId,
        type: body.type,
        content: body.content,
        tags: body.tags,
        isPinned: body.isPinned,
      },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    broadcastSSE('annotation-added', { storyId: id, annotation });

    return reply.status(201).send({ data: annotation });
  });

  // PATCH /api/v1/stories/:id/annotations/:annotationId — Update annotation
  app.patch('/stories/:id/annotations/:annotationId', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id, annotationId } = request.params as { id: string; annotationId: string };

    const body = z.object({
      content: z.string().min(1).optional(),
      tags: z.array(z.string()).optional(),
      isPinned: z.boolean().optional(),
    }).parse(request.body);

    // Find the existing annotation
    const existing = await prisma.storyAnnotation.findUnique({
      where: { id: annotationId },
    });
    if (!existing) return reply.status(404).send({ error: 'Annotation not found' });
    if (existing.storyId !== id) return reply.status(404).send({ error: 'Annotation not found' });

    // Only the original author or an ADMIN can update
    const role = getUserRole(request);
    if (existing.userId !== userId && role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden: only the author or an admin can update' });
    }

    const updated = await prisma.storyAnnotation.update({
      where: { id: annotationId },
      data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
      },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    broadcastSSE('annotation-updated', { storyId: id, annotation: updated });

    return reply.send({ data: updated });
  });

  // POST /api/v1/stories/:id/annotations/:annotationId/pin — Toggle pin
  app.post('/stories/:id/annotations/:annotationId/pin', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id, annotationId } = request.params as { id: string; annotationId: string };

    const existing = await prisma.storyAnnotation.findUnique({
      where: { id: annotationId },
    });
    if (!existing) return reply.status(404).send({ error: 'Annotation not found' });
    if (existing.storyId !== id) return reply.status(404).send({ error: 'Annotation not found' });

    const updated = await prisma.storyAnnotation.update({
      where: { id: annotationId },
      data: { isPinned: !existing.isPinned },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    broadcastSSE('annotation-pinned', { storyId: id, annotation: updated });

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/stories/:id/annotations/:annotationId
  app.delete('/stories/:id/annotations/:annotationId', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id, annotationId } = request.params as { id: string; annotationId: string };

    // Only allow the author or an ADMIN to delete
    const existing = await prisma.storyAnnotation.findUnique({
      where: { id: annotationId },
    });
    if (!existing) return reply.status(404).send({ error: 'Annotation not found' });
    if (existing.storyId !== id) return reply.status(404).send({ error: 'Annotation not found' });

    const role = getUserRole(request);
    if (existing.userId !== userId && role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden: only the author or an admin can delete' });
    }

    await prisma.storyAnnotation.delete({ where: { id: annotationId } });

    broadcastSSE('annotation-deleted', { storyId: id, annotationId });

    return reply.status(204).send();
  });

  // GET /api/v1/annotations/recent — Recent annotations across all stories
  app.get('/annotations/recent', async (request, reply) => {
    const { limit: limitStr } = request.query as { limit?: string };
    const limit = limitStr ? Math.min(parseInt(limitStr, 10), 100) : 30;

    const annotations = await prisma.storyAnnotation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true },
        },
        story: {
          select: { id: true, title: true, status: true, category: true },
        },
      },
    });

    const data = annotations.map((a) => ({
      id: a.id,
      storyId: a.storyId,
      storyTitle: a.story?.title || null,
      storyStatus: a.story?.status || null,
      storyCategory: a.story?.category || null,
      userId: a.userId,
      displayName: a.user?.displayName || null,
      type: a.type,
      content: a.content,
      tags: a.tags,
      isPinned: a.isPinned,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return reply.send({ data });
  });
}
