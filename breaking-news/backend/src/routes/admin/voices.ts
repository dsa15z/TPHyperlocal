// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function voiceRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/voices', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const voices = await prisma.voice.findMany({ where: { accountId: au.accountId }, orderBy: { name: 'asc' } });
    return reply.send({ data: voices });
  });

  app.post('/voices', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      systemPrompt: z.string().min(1),
      sampleText: z.string().optional(),
      interests: z.array(z.string()).optional(),
      tone: z.array(z.string()).optional(),
    }).parse(request.body);
    const voice = await prisma.voice.create({ data: { ...data, accountId: au.accountId } });
    return reply.status(201).send({ data: voice });
  });

  app.delete('/voices/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.voice.deleteMany({ where: { id, accountId: au.accountId } });
    return reply.status(204).send();
  });
}
