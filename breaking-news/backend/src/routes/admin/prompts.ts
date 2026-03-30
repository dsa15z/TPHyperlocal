// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function promptRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/prompts', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const prompts = await prisma.prompt.findMany({
      where: { OR: [{ accountId: au.accountId }, { isDefault: true, accountId: null }] },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return reply.send({ data: prompts });
  });

  app.post('/prompts', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      template: z.string().min(1),
      variables: z.array(z.string()).default([]),
    }).parse(request.body);

    const prompt = await prisma.prompt.create({
      data: { ...data, accountId: au.accountId },
    });
    return reply.status(201).send({ data: prompt });
  });

  app.patch('/prompts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      template: z.string().optional(),
      variables: z.array(z.string()).optional(),
    }).parse(request.body);

    const prompt = await prisma.prompt.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    return reply.send({ data: prompt });
  });

  app.delete('/prompts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.prompt.delete({ where: { id } });
    return reply.status(204).send();
  });
}
