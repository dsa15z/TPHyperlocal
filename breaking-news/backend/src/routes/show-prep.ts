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

export async function showPrepRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // List rundowns
  app.get('/show-prep', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const rundowns = await prisma.showPrepRundown.findMany({
      where: { accountId: payload.accountId },
      orderBy: { showDate: 'desc' },
      take: 50,
    });
    return reply.send({ data: rundowns });
  });

  // Create rundown
  app.post('/show-prep', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      showDate: z.string().transform((s) => new Date(s)),
      items: z.array(z.object({
        storyId: z.string(),
        notes: z.string().optional(),
        duration: z.number().optional(),
      })).default([]),
    }).parse(request.body);

    const rundown = await prisma.showPrepRundown.create({
      data: { ...data, accountId: payload.accountId, createdBy: payload.userId },
    });
    return reply.status(201).send({ data: rundown });
  });

  // Update rundown
  app.patch('/show-prep/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const data = z.object({
      name: z.string().optional(),
      items: z.array(z.unknown()).optional(),
      status: z.enum(['DRAFT', 'FINAL', 'ARCHIVED']).optional(),
    }).parse(request.body);

    const rundown = await prisma.showPrepRundown.update({ where: { id }, data });
    return reply.send({ data: rundown });
  });

  // Delete rundown
  app.delete('/show-prep/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.showPrepRundown.delete({ where: { id } });
    return reply.status(204).send();
  });
}
