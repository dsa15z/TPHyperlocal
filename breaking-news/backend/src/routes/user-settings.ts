// @ts-nocheck
/**
 * User Settings & Server-Side Views & View Email Subscriptions
 *
 * Profile: update name, contact info, avatar, password
 * Views: CRUD for persisted views per user (replaces localStorage)
 * Subscriptions: email delivery of views on a schedule
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken, hashPassword, verifyPassword } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


export async function userSettingsRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // ═══════════════════════════════════════════════════════════════════════
  // PROFILE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  // PATCH /user/settings/profile — update display name, phone, timezone
  app.patch('/user/settings/profile', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      displayName: z.string().min(1).max(100).optional(),
      phone: z.string().max(20).optional(),
      timezone: z.string().max(50).optional(),
      avatarUrl: z.string().url().optional().nullable(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: body.data,
      select: { id: true, email: true, displayName: true, phone: true, timezone: true, avatarUrl: true },
    });

    return reply.send({ message: 'Profile updated', user });
  });

  // POST /user/settings/password — change password
  app.post('/user/settings/password', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { passwordHash: true } });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Verify current password
    const valid = await verifyPassword(body.data.currentPassword, user.passwordHash);
    if (!valid) return reply.status(403).send({ error: 'Current password is incorrect' });

    // Hash and save new password
    const newHash = await hashPassword(body.data.newPassword);
    await prisma.user.update({ where: { id: payload.userId }, data: { passwordHash: newHash } });

    return reply.send({ message: 'Password changed successfully' });
  });

  // GET /user/settings/access — see what the user has access to
  app.get('/user/settings/access', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const memberships = await prisma.accountUser.findMany({
      where: { userId: payload.userId },
      include: {
        account: {
          select: { id: true, name: true, plan: true },
          include: { markets: { where: { isActive: true }, select: { id: true, name: true, state: true } } },
        },
      },
    });

    return reply.send({
      userId: payload.userId,
      accounts: memberships.map(m => ({
        accountId: m.accountId,
        accountName: m.account.name,
        plan: m.account.plan,
        role: m.role,
        markets: m.account.markets,
      })),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SERVER-SIDE PERSISTED VIEWS (per user)
  // ═══════════════════════════════════════════════════════════════════════

  // GET /user/views — list all saved views for current user
  app.get('/user/views', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const views = await prisma.$queryRaw<any[]>`
        SELECT * FROM "UserView"
        WHERE "userId" = ${payload.userId}
        ORDER BY "updatedAt" DESC
      `;
      return reply.send({ data: views });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // POST /user/views — create a new view
  app.post('/user/views', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      name: z.string().min(1).max(100),
      columns: z.any(), // JSON column config
      filters: z.any(), // JSON saved filters (including nlpPrompt)
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const id = `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await prisma.$executeRaw`
        INSERT INTO "UserView" (id, "userId", name, columns, filters, "createdAt", "updatedAt")
        VALUES (${id}, ${payload.userId}, ${body.data.name}, ${JSON.stringify(body.data.columns)}::jsonb, ${JSON.stringify(body.data.filters)}::jsonb, NOW(), NOW())
      `;
      return reply.status(201).send({ message: 'View created', id });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // PUT /user/views/:id — update a view
  app.put('/user/views/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      columns: z.any().optional(),
      filters: z.any().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      // Use parameterized query to prevent SQL injection
      const name = body.data.name || null;
      const columns = body.data.columns ? JSON.stringify(body.data.columns) : null;
      const filters = body.data.filters ? JSON.stringify(body.data.filters) : null;

      await prisma.$executeRaw`
        UPDATE "UserView" SET
          "updatedAt" = NOW(),
          name = COALESCE(${name}, name),
          columns = COALESCE(${columns}::jsonb, columns),
          filters = COALESCE(${filters}::jsonb, filters)
        WHERE id = ${id} AND "userId" = ${payload.userId}
      `;
      return reply.send({ message: 'View updated' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /user/views/:id — delete a view
  app.delete('/user/views/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    try {
      await prisma.$executeRaw`DELETE FROM "UserView" WHERE id = ${id} AND "userId" = ${payload.userId}`;
      // Also delete any subscriptions for this view
      await prisma.$executeRaw`DELETE FROM "ViewSubscription" WHERE "viewId" = ${id}`.catch(() => {});
      return reply.send({ message: 'View deleted' });
    } catch {
      return reply.status(404).send({ error: 'View not found' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // VIEW EMAIL SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════

  // GET /user/subscriptions — list email subscriptions
  app.get('/user/subscriptions', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const subs = await prisma.$queryRaw<any[]>`
        SELECT vs.*, uv.name as "viewName"
        FROM "ViewSubscription" vs
        JOIN "UserView" uv ON uv.id = vs."viewId"
        WHERE vs."userId" = ${payload.userId}
        ORDER BY vs."createdAt" DESC
      `;
      return reply.send({ data: subs });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // POST /user/subscriptions — subscribe to a view
  app.post('/user/subscriptions', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      viewId: z.string(),
      email: z.string().email(),
      frequency: z.enum(['HOURLY', 'TWICE_DAILY', 'DAILY', 'WEEKLY']),
      maxStories: z.number().int().min(5).max(50).default(20),
      timezone: z.string().default('America/Chicago'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const id = `vsub_${Date.now()}`;
    try {
      await prisma.$executeRaw`
        INSERT INTO "ViewSubscription" (id, "userId", "viewId", email, frequency, "maxStories", timezone, "isActive", "createdAt", "updatedAt")
        VALUES (${id}, ${payload.userId}, ${body.data.viewId}, ${body.data.email}, ${body.data.frequency}, ${body.data.maxStories}, ${body.data.timezone}, true, NOW(), NOW())
        ON CONFLICT ("userId", "viewId") DO UPDATE SET
          email = ${body.data.email},
          frequency = ${body.data.frequency},
          "maxStories" = ${body.data.maxStories},
          timezone = ${body.data.timezone},
          "isActive" = true,
          "updatedAt" = NOW()
      `;
      return reply.status(201).send({ message: 'Subscribed to view', id });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // PATCH /user/subscriptions/:id — update subscription (change frequency, pause)
  app.patch('/user/subscriptions/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const body = z.object({
      frequency: z.enum(['HOURLY', 'TWICE_DAILY', 'DAILY', 'WEEKLY']).optional(),
      maxStories: z.number().int().min(5).max(50).optional(),
      isActive: z.boolean().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      const freq = body.data.frequency || null;
      const maxStories = body.data.maxStories ?? null;
      const isActive = body.data.isActive ?? null;

      await prisma.$executeRaw`
        UPDATE "ViewSubscription" SET
          "updatedAt" = NOW(),
          frequency = COALESCE(${freq}, frequency),
          "maxStories" = COALESCE(${maxStories}::int, "maxStories"),
          "isActive" = COALESCE(${isActive}::boolean, "isActive")
        WHERE id = ${id} AND "userId" = ${payload.userId}
      `;
      return reply.send({ message: 'Subscription updated' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /user/subscriptions/:id — unsubscribe
  app.delete('/user/subscriptions/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    try {
      await prisma.$executeRaw`DELETE FROM "ViewSubscription" WHERE id = ${id} AND "userId" = ${payload.userId}`;
      return reply.send({ message: 'Unsubscribed' });
    } catch {
      return reply.status(404).send({ error: 'Subscription not found' });
    }
  });
}
