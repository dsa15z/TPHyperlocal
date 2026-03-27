// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  TokenPayload,
} from '../lib/auth.js';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  displayName: z.string().min(1).max(255).optional(),
  accountName: z
    .string()
    .min(1, 'Account name is required')
    .max(255, 'Account name must be at most 255 characters'),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const RefreshSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const SwitchAccountSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a URL-friendly slug from a string.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensure a unique account slug by appending a random suffix if needed.
 */
async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  const existing = await prisma.account.findUnique({ where: { slug } });
  if (existing) {
    const suffix = Math.random().toString(36).slice(2, 8);
    slug = `${slug}-${suffix}`;
  }
  return slug;
}

/**
 * Strip sensitive fields from a user object for API responses.
 */
function sanitizeUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Auth Routes Plugin ─────────────────────────────────────────────────────

export async function authRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // ── POST /auth/register ─────────────────────────────────────────────────
  app.post('/auth/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password, displayName, accountName } = parseResult.data;

    // Check for existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await hashPassword(password);
    const slug = await uniqueSlug(accountName);

    // Create user, account, and account membership in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          displayName: displayName ?? null,
          lastLoginAt: new Date(),
        },
      });

      const account = await tx.account.create({
        data: {
          name: accountName,
          slug,
        },
      });

      await tx.accountUser.create({
        data: {
          accountId: account.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      return { user, account };
    });

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      accountId: result.account.id,
      role: 'OWNER',
    });

    return reply.status(201).send({
      token,
      user: sanitizeUser(result.user),
      account: {
        id: result.account.id,
        name: result.account.name,
        slug: result.account.slug,
        plan: result.account.plan,
      },
    });
  });

  // ── POST /auth/login ───────────────────────────────────────────────────
  app.post('/auth/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        accounts: {
          where: { isActive: true },
          include: {
            account: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Account has been deactivated',
      });
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Update lastLoginAt (fire and forget)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {
        // Swallow errors from background update
      });

    // Pick the first active account for the default token
    const activeAccounts = user.accounts.filter((au) => au.account.isActive);
    const primaryMembership = activeAccounts[0];

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
    };

    if (primaryMembership) {
      tokenPayload.accountId = primaryMembership.accountId;
      tokenPayload.role = primaryMembership.role;
    }

    const token = generateToken(tokenPayload);

    const accounts = activeAccounts.map((au) => ({
      id: au.account.id,
      name: au.account.name,
      slug: au.account.slug,
      plan: au.account.plan,
      role: au.role,
    }));

    return reply.send({
      token,
      user: sanitizeUser(user),
      accounts,
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────
  app.post('/auth/refresh', async (request, reply) => {
    const parseResult = RefreshSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { token } = parseResult.data;

    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Ensure the user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found or deactivated',
      });
    }

    // If token had an accountId, verify membership is still active
    let accountId = payload.accountId;
    let role = payload.role;

    if (accountId) {
      const membership = await prisma.accountUser.findUnique({
        where: {
          accountId_userId: {
            accountId,
            userId: user.id,
          },
        },
        select: { isActive: true, role: true },
      });

      if (!membership || !membership.isActive) {
        // Account membership no longer valid; issue token without accountId
        accountId = undefined;
        role = undefined;
      } else {
        role = membership.role;
      }
    }

    const newToken = generateToken({
      userId: user.id,
      email: user.email,
      accountId,
      role,
    });

    return reply.send({ token: newToken });
  });

  // ── GET /auth/me ───────────────────────────────────────────────────────
  app.get('/auth/me', async (request, reply) => {
    // This route requires authentication (not in public paths)
    // The jwt-auth middleware will have already set request.user
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);
    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        accounts: {
          where: { isActive: true },
          include: {
            account: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found or deactivated',
      });
    }

    const memberships = user.accounts
      .filter((au) => au.account.isActive)
      .map((au) => ({
        accountId: au.account.id,
        accountName: au.account.name,
        accountSlug: au.account.slug,
        plan: au.account.plan,
        role: au.role,
        isActive: au.isActive,
      }));

    return reply.send({
      user: sanitizeUser(user),
      accounts: memberships,
      currentAccountId: payload.accountId ?? null,
    });
  });

  // ── POST /auth/switch-account ──────────────────────────────────────────
  app.post('/auth/switch-account', async (request, reply) => {
    const parseResult = SwitchAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { accountId } = parseResult.data;

    // Extract and verify current token
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);
    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found or deactivated',
      });
    }

    // Verify user has active membership in the target account
    const membership = await prisma.accountUser.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: user.id,
        },
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            isActive: true,
          },
        },
      },
    });

    if (!membership || !membership.isActive) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this account',
      });
    }

    if (!membership.account.isActive) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'This account has been deactivated',
      });
    }

    const newToken = generateToken({
      userId: user.id,
      email: user.email,
      accountId: membership.account.id,
      role: membership.role,
    });

    return reply.send({
      token: newToken,
      account: {
        id: membership.account.id,
        name: membership.account.name,
        slug: membership.account.slug,
        plan: membership.account.plan,
        role: membership.role,
      },
    });
  });
}
