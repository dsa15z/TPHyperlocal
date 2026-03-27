// @ts-nocheck
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.enum(['BREAKING', 'TRENDING', 'NEW_STORY'])).min(1),
  filters: z.object({
    category: z.string().optional(),
    minScore: z.number().min(0).max(1).optional(),
  }).optional(),
});

const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  secret: z.string().min(16).max(256).optional().nullable(),
  events: z.array(z.enum(['BREAKING', 'TRENDING', 'NEW_STORY'])).min(1).optional(),
  filters: z.object({
    category: z.string().optional(),
    minScore: z.number().min(0).max(1).optional(),
  }).optional().nullable(),
  isActive: z.boolean().optional(),
});

const CreateDigestSchema = z.object({
  email: z.string().email(),
  frequency: z.enum(['HOURLY', 'TWICE_DAILY', 'DAILY', 'WEEKLY']),
  timezone: z.string().default('America/Chicago'),
  filters: z.object({
    category: z.string().optional(),
    minScore: z.number().min(0).max(1).optional(),
  }).optional(),
});

function getAccountId(request: FastifyRequest): string {
  const accountUser = (request as any).accountUser;
  if (!accountUser?.accountId) throw { statusCode: 401, message: 'No account context' };
  return accountUser.accountId;
}

function getUserId(request: FastifyRequest): string {
  const user = (request as any).user;
  if (!user?.id) throw { statusCode: 401, message: 'Not authenticated' };
  return user.id;
}

function assertAdmin(request: FastifyRequest): void {
  const accountUser = (request as any).accountUser;
  if (!accountUser || !['ADMIN', 'OWNER'].includes(accountUser.role)) {
    throw { statusCode: 403, message: 'ADMIN role required' };
  }
}

export async function webhookRoutes(app: FastifyInstance) {

  // --- Webhook Subscriptions ---

  app.get('/admin/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);

    const webhooks = await prisma.webhookSubscription.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: webhooks };
  });

  app.post('/admin/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);
    const body = CreateWebhookSchema.parse(request.body);

    const webhook = await prisma.webhookSubscription.create({
      data: {
        accountId,
        name: body.name,
        url: body.url,
        secret: body.secret || crypto.randomBytes(32).toString('hex'),
        events: body.events,
        filters: body.filters || null,
      },
    });

    return reply.status(201).send({ data: webhook });
  });

  app.patch('/admin/webhooks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);
    const body = UpdateWebhookSchema.parse(request.body);

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: request.params.id, accountId },
    });
    if (!existing) return reply.status(404).send({ error: 'Webhook not found' });

    const updated = await prisma.webhookSubscription.update({
      where: { id: request.params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.url !== undefined && { url: body.url }),
        ...(body.secret !== undefined && { secret: body.secret }),
        ...(body.events !== undefined && { events: body.events }),
        ...(body.filters !== undefined && { filters: body.filters }),
        ...(body.isActive !== undefined && { isActive: body.isActive, failCount: 0 }),
      },
    });

    return { data: updated };
  });

  app.delete('/admin/webhooks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: request.params.id, accountId },
    });
    if (!existing) return reply.status(404).send({ error: 'Webhook not found' });

    await prisma.webhookSubscription.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  // --- Digest Subscriptions ---

  app.get('/admin/digests', async (request: FastifyRequest, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);

    const digests = await prisma.digestSubscription.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: digests };
  });

  app.post('/admin/digests', async (request: FastifyRequest, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);
    const userId = getUserId(request);
    const body = CreateDigestSchema.parse(request.body);

    const digest = await prisma.digestSubscription.create({
      data: {
        accountId,
        userId,
        email: body.email,
        frequency: body.frequency,
        timezone: body.timezone,
        filters: body.filters || null,
      },
    });

    return reply.status(201).send({ data: digest });
  });

  app.delete('/admin/digests/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertAdmin(request);
    const accountId = getAccountId(request);

    const existing = await prisma.digestSubscription.findFirst({
      where: { id: request.params.id, accountId },
    });
    if (!existing) return reply.status(404).send({ error: 'Digest subscription not found' });

    await prisma.digestSubscription.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
}
