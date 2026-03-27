import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Request type augmentation ────────────────────────────────────────────────
// Assumes JWT auth middleware has already set these on every request.
declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string };
    accountUser?: { accountId: string; userId: string; role: string };
  }
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireOwner(role: string) {
  if (role !== 'OWNER') {
    const err = new Error('Forbidden: OWNER role required');
    (err as any).statusCode = 403;
    throw err;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function accountRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/account — current account details with counts
  app.get('/account', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      include: {
        _count: {
          select: {
            markets: true,
            accountSources: true,
            users: true,
          },
        },
      },
    });

    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    return reply.status(200).send({
      id: account.id,
      name: account.name,
      slug: account.slug,
      isActive: account.isActive,
      plan: account.plan,
      maxMarkets: account.maxMarkets,
      maxSources: account.maxSources,
      metadata: account.metadata,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      marketCount: account._count.markets,
      sourceCount: account._count.accountSources,
      userCount: account._count.users,
    });
  });

  // PATCH /admin/account — update account name/slug
  app.patch('/account', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const parsed = updateAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    if (!data.name && !data.slug) {
      return reply.status(400).send({ error: 'At least one field (name or slug) is required' });
    }

    // If slug is changing, check uniqueness
    if (data.slug) {
      const existing = await prisma.account.findUnique({ where: { slug: data.slug } });
      if (existing && existing.id !== au.accountId) {
        return reply.status(400).send({ error: 'Slug already in use' });
      }
    }

    const account = await prisma.account.update({
      where: { id: au.accountId },
      data,
    });

    return reply.status(200).send(account);
  });

  // GET /admin/account/users — list users in account
  app.get('/account/users', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }
    const { limit, offset } = query.data;

    const [users, total] = await Promise.all([
      prisma.accountUser.findMany({
        where: { accountId: au.accountId },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true, isActive: true, lastLoginAt: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.accountUser.count({ where: { accountId: au.accountId } }),
    ]);

    return reply.status(200).send({
      data: users.map((u) => ({
        id: u.id,
        userId: u.userId,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        user: u.user,
      })),
      total,
      limit,
      offset,
    });
  });

  // POST /admin/account/users/invite — invite user by email
  app.post('/account/users/invite', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const parsed = inviteUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const { email, role } = parsed.data;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(404).send({ error: 'User not found with that email' });
    }

    // Check if already a member
    const existing = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: au.accountId, userId: user.id } },
    });
    if (existing) {
      return reply.status(400).send({ error: 'User is already a member of this account' });
    }

    const accountUser = await prisma.accountUser.create({
      data: {
        accountId: au.accountId,
        userId: user.id,
        role: role as any,
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return reply.status(201).send({
      id: accountUser.id,
      userId: accountUser.userId,
      role: accountUser.role,
      isActive: accountUser.isActive,
      createdAt: accountUser.createdAt,
      user: accountUser.user,
    });
  });

  // PATCH /admin/account/users/:userId — update user role
  app.patch('/account/users/:userId', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const { userId } = request.params as { userId: string };

    const parsed = updateUserRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const accountUser = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: au.accountId, userId } },
    });
    if (!accountUser) {
      return reply.status(404).send({ error: 'User not found in this account' });
    }

    const updated = await prisma.accountUser.update({
      where: { id: accountUser.id },
      data: { role: parsed.data.role as any },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return reply.status(200).send({
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
      isActive: updated.isActive,
      user: updated.user,
    });
  });

  // DELETE /admin/account/users/:userId — remove user from account
  app.delete('/account/users/:userId', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireOwner(au.role);

    const { userId } = request.params as { userId: string };

    // Cannot remove yourself
    if (userId === au.userId) {
      return reply.status(400).send({ error: 'Cannot remove yourself from the account' });
    }

    const accountUser = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: au.accountId, userId } },
    });
    if (!accountUser) {
      return reply.status(404).send({ error: 'User not found in this account' });
    }

    await prisma.accountUser.delete({ where: { id: accountUser.id } });

    return reply.status(200).send({ message: 'User removed from account' });
  });
}
