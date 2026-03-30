// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function dashboardLayoutRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/dashboards', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const layouts = await prisma.dashboardLayout.findMany({
      where: { accountId: au.accountId },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: layouts });
  });

  app.post('/dashboards', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      role: z.string().optional(),
      layout: z.record(z.unknown()),
      isDefault: z.boolean().default(false),
    }).parse(request.body);

    const layout = await prisma.dashboardLayout.create({
      data: { ...data, accountId: au.accountId },
    });
    return reply.status(201).send({ data: layout });
  });

  app.patch('/dashboards/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      name: z.string().optional(),
      layout: z.record(z.unknown()).optional(),
      isDefault: z.boolean().optional(),
    }).parse(request.body);
    const layout = await prisma.dashboardLayout.update({ where: { id }, data });
    return reply.send({ data: layout });
  });

  app.delete('/dashboards/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.dashboardLayout.delete({ where: { id } });
    return reply.status(204).send();
  });
}
