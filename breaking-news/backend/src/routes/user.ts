// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken, TokenPayload } from '../lib/auth.js';
import { extractToken } from '../lib/route-helpers.js';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const UpdatePreferencesSchema = z.object({
  defaultMarketId: z.string().nullable().optional(),
  categories: z.array(z.string()).nullable().optional(),
  minScore: z.number().min(0).max(1).optional(),
  keywords: z.array(z.string()).nullable().optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────


// ─── User Routes Plugin ─────────────────────────────────────────────────────

export async function userRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/user/profile - full user profile with account, markets, preferences
  app.get('/user/profile', async (request, reply) => {
    const payload = extractToken(request);
    if (!payload?.userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // If we have an account context, load account details
    let account = null;
    let markets: any[] = [];
    let preferences = null;

    if (payload.accountId) {
      account = await prisma.account.findUnique({
        where: { id: payload.accountId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
        },
      });

      markets = await prisma.market.findMany({
        where: { accountId: payload.accountId, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          state: true,
          latitude: true,
          longitude: true,
          radiusKm: true,
          keywords: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });

      preferences = await prisma.userPreference.findUnique({
        where: {
          userId_accountId: {
            userId: payload.userId,
            accountId: payload.accountId,
          },
        },
      });
    }

    return reply.send({
      user,
      account,
      markets,
      preferences: preferences
        ? {
            defaultMarketId: preferences.defaultMarketId,
            categories: preferences.categories,
            minScore: preferences.minScore,
            keywords: preferences.keywords,
          }
        : null,
    });
  });

  // GET /api/v1/user/preferences - get current preferences
  app.get('/user/preferences', async (request, reply) => {
    const payload = extractToken(request);
    if (!payload?.userId || !payload.accountId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const preferences = await prisma.userPreference.findUnique({
      where: {
        userId_accountId: {
          userId: payload.userId,
          accountId: payload.accountId,
        },
      },
    });

    return reply.send({
      preferences: preferences
        ? {
            defaultMarketId: preferences.defaultMarketId,
            categories: preferences.categories,
            minScore: preferences.minScore,
            keywords: preferences.keywords,
          }
        : {
            defaultMarketId: null,
            categories: null,
            minScore: 0,
            keywords: null,
          },
    });
  });

  // PATCH /api/v1/user/preferences - update preferences (upsert)
  app.patch('/user/preferences', async (request, reply) => {
    const payload = extractToken(request);
    if (!payload?.userId || !payload.accountId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parseResult = UpdatePreferencesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = parseResult.data;

    // If defaultMarketId is set, verify it belongs to the account
    if (data.defaultMarketId) {
      const market = await prisma.market.findFirst({
        where: {
          id: data.defaultMarketId,
          accountId: payload.accountId,
          isActive: true,
        },
      });
      if (!market) {
        return reply.status(400).send({
          error: 'Invalid market ID',
          message: 'Market not found or does not belong to this account',
        });
      }
    }

    const preferences = await prisma.userPreference.upsert({
      where: {
        userId_accountId: {
          userId: payload.userId,
          accountId: payload.accountId,
        },
      },
      create: {
        userId: payload.userId,
        accountId: payload.accountId,
        ...data,
      },
      update: data,
    });

    return reply.send({
      preferences: {
        defaultMarketId: preferences.defaultMarketId,
        categories: preferences.categories,
        minScore: preferences.minScore,
        keywords: preferences.keywords,
      },
    });
  });
}
