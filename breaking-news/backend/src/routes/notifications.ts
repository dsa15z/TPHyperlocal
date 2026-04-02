// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


export async function notificationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/notifications - user's recent notifications
  app.get('/notifications', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { recipient: payload.userId },
          { channel: 'PUSH' },
        ],
      },
      include: {
        story: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reply.send({ data: notifications });
  });

  // GET /api/v1/notifications/preferences - get user's preferences
  app.get('/notifications/preferences', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId || !payload.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId_accountId: { userId: payload.userId, accountId: payload.accountId } },
    });

    return reply.send({ data: prefs || { channels: ['email'], minStates: ['ALERT', 'BREAKING'], minScore: 0.5 } });
  });

  // PUT /api/v1/notifications/preferences - update preferences
  app.put('/notifications/preferences', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId || !payload.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      channels: z.array(z.string()),
      categories: z.array(z.string()).nullable().optional(),
      minStates: z.array(z.string()),
      minScore: z.number().min(0).max(1).default(0.5),
      quietHours: z.record(z.unknown()).nullable().optional(),
    }).parse(request.body);

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId_accountId: { userId: payload.userId, accountId: payload.accountId } },
      create: { userId: payload.userId, accountId: payload.accountId, ...data },
      update: data,
    });

    return reply.send({ data: prefs });
  });

  // POST /api/v1/notifications/devices - register a device for push
  app.post('/notifications/devices', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      token: z.string().min(1),
      platform: z.enum(['web', 'ios', 'android']),
    }).parse(request.body);

    const device = await prisma.device.upsert({
      where: { token: data.token },
      create: { userId: payload.userId, ...data },
      update: { userId: payload.userId, isActive: true, lastSeenAt: new Date() },
    });

    return reply.status(201).send({ data: device });
  });
}
