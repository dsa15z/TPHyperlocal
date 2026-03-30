// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

function getUserId(req: any): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)).userId; } catch { return null; }
}

export async function annotationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/annotations
  app.get('/stories/:id/annotations', async (request, reply) => {
    const { id } = request.params as { id: string };
    const annotations = await prisma.storyAnnotation.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: annotations });
  });

  // POST /api/v1/stories/:id/annotations
  app.post('/stories/:id/annotations', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const data = z.object({
      type: z.enum(['NOTE', 'TAG', 'FLAG', 'ASSIGNMENT']).default('NOTE'),
      content: z.string().min(1),
      tags: z.array(z.string()).optional(),
    }).parse(request.body);

    const annotation = await prisma.storyAnnotation.create({
      data: { storyId: id, userId, ...data },
    });
    return reply.status(201).send({ data: annotation });
  });

  // DELETE /api/v1/stories/:id/annotations/:annotationId
  app.delete('/stories/:id/annotations/:annotationId', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { annotationId } = request.params as { annotationId: string };
    await prisma.storyAnnotation.deleteMany({ where: { id: annotationId, userId } });
    return reply.status(204).send();
  });
}
