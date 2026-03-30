// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function digestSubscriptionRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/digests', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const subs = await prisma.digestSubscription.findMany({
      where: { accountId: au.accountId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: subs });
  });

  app.post('/digests', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      email: z.string().email(),
      frequency: z.enum(['HOURLY', 'TWICE_DAILY', 'DAILY', 'WEEKLY']),
      timezone: z.string().default('America/Chicago'),
      filters: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const sub = await prisma.digestSubscription.create({
      data: { ...data, accountId: au.accountId, userId: (request as any).tokenPayload?.userId || '' },
    });
    return reply.status(201).send({ data: sub });
  });

  app.delete('/digests/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.digestSubscription.delete({ where: { id } });
    return reply.status(204).send();
  });
}
