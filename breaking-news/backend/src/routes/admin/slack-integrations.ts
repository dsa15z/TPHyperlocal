// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function slackIntegrationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/slack', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const integrations = await prisma.slackIntegration.findMany({
      where: { accountId: au.accountId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: integrations });
  });

  app.post('/slack', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      channelId: z.string().min(1),
      channelName: z.string().min(1),
      webhookUrl: z.string().url(),
      states: z.array(z.string()),
      categories: z.array(z.string()).optional(),
    }).parse(request.body);

    const integration = await prisma.slackIntegration.create({
      data: { ...data, accountId: au.accountId },
    });
    return reply.status(201).send({ data: integration });
  });

  app.delete('/slack/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.slackIntegration.deleteMany({ where: { id, accountId: au.accountId } });
    return reply.status(204).send();
  });
}
