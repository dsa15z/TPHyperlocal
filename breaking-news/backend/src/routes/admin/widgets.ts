// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function widgetRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/widgets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const widgets = await prisma.widget.findMany({ where: { accountId: au.accountId }, orderBy: { createdAt: 'desc' } });
    return reply.send({ data: widgets });
  });

  app.post('/widgets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      type: z.enum(['PULSE', 'SMART_PULSE', 'CATEGORY', 'BREAKING']),
      config: z.record(z.unknown()),
    }).parse(request.body);

    const widget = await prisma.widget.create({
      data: {
        ...data,
        accountId: au.accountId,
        embedCode: `<script src="/api/v1/widgets/${Date.now()}/embed.js"></script>`,
      },
    });
    return reply.status(201).send({ data: widget });
  });

  app.delete('/widgets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.widget.deleteMany({ where: { id, accountId: au.accountId } });
    return reply.status(204).send();
  });
}
