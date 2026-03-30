// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function featureFlagRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/feature-flags', async (request, reply) => {
    const flags = await prisma.featureFlag.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ data: flags });
  });

  app.post('/feature-flags', async (request, reply) => {
    const data = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      defaultValue: z.boolean().default(false),
    }).parse(request.body);
    const flag = await prisma.featureFlag.create({ data });
    return reply.status(201).send({ data: flag });
  });

  app.patch('/feature-flags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      defaultValue: z.boolean().optional(),
      overrides: z.record(z.unknown()).optional(),
    }).parse(request.body);
    const flag = await prisma.featureFlag.update({ where: { id }, data });
    return reply.send({ data: flag });
  });
}
