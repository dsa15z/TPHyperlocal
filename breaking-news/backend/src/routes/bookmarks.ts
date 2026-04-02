// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getUserId } from '../lib/route-helpers.js';


export async function bookmarkRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/bookmarks
  app.get('/bookmarks', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        story: {
          select: { id: true, title: true, status: true, category: true, compositeScore: true, firstSeenAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: bookmarks });
  });

  // POST /api/v1/bookmarks
  app.post('/bookmarks', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { storyId, folder, notes } = z.object({
      storyId: z.string(),
      folder: z.string().optional(),
      notes: z.string().optional(),
    }).parse(request.body);

    const bookmark = await prisma.bookmark.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId, folder, notes },
      update: { folder, notes },
    });

    return reply.status(201).send({ data: bookmark });
  });

  // DELETE /api/v1/bookmarks/:storyId
  app.delete('/bookmarks/:storyId', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { storyId } = request.params as { storyId: string };
    await prisma.bookmark.deleteMany({ where: { userId, storyId } });
    return reply.status(204).send();
  });
}
