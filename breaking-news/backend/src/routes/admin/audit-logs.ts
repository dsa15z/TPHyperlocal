// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function auditLogRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/audit-logs', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      entityType: z.string().optional(),
      action: z.string().optional(),
    }).parse(request.query);

    const where: any = { accountId: au.accountId };
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: { user: { select: { displayName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.send({ data: logs, total });
  });
}
