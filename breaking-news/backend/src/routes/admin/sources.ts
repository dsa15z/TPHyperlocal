// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const platformEnum = z.enum([
  'FACEBOOK', 'TWITTER', 'RSS', 'NEWSAPI', 'GDELT',
  'LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI', 'MANUAL',
]);

const sourceTypeEnum = z.enum([
  'NEWS_ORG', 'GOV_AGENCY', 'PUBLIC_PAGE', 'RSS_FEED', 'API_PROVIDER', 'LLM_PROVIDER',
]);

const createSourceSchema = z.object({
  platform: platformEnum,
  sourceType: sourceTypeEnum,
  name: z.string().min(1).max(255),
  url: z.string().url().optional(),
  marketId: z.string().optional(),
  trustScore: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.unknown()).optional(),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional().nullable(),
  trustScore: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const listSourcesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  platform: platformEnum.optional(),
  sourceType: sourceTypeEnum.optional(),
  marketId: z.string().optional(),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z.enum(['name', 'trustScore', 'lastPolledAt', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    const err = new Error('Forbidden: ADMIN role or higher required');
    (err as any).statusCode = 403;
    throw err;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function sourceRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/sources — list sources available to account (global + account markets)
  app.get('/sources', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const query = listSourcesSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }
    const { limit, offset, platform, sourceType, marketId, search, isActive, sort, order } = query.data;

    // Build where clause with server-side filtering
    const where: any = { AND: [] };
    if (platform) where.AND.push({ platform });
    if (sourceType) where.AND.push({ sourceType });
    if (marketId) where.AND.push({ marketId });
    if (isActive !== undefined) where.AND.push({ isActive });
    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { url: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    // Remove empty AND
    if (where.AND.length === 0) delete where.AND;

    const [sources, total, activeCount] = await Promise.all([
      prisma.source.findMany({
        where,
        include: {
          accountSources: {
            where: { accountId: au.accountId },
            select: { id: true, isEnabled: true, pollIntervalMs: true },
          },
          market: { select: { id: true, name: true } },
        },
        orderBy: { [sort]: order },
        take: limit,
        skip: offset,
      }),
      prisma.source.count({ where }),
      prisma.source.count({ where: { ...where, isActive: true } }),
    ]);

    return reply.status(200).send({
      data: sources.map((s) => {
        const accountSource = s.accountSources[0] ?? null;
        return {
          id: s.id,
          platform: s.platform,
          sourceType: s.sourceType,
          name: s.name,
          url: s.url,
          platformId: s.platformId,
          trustScore: s.trustScore,
          isActive: s.isActive,
          isGlobal: s.isGlobal,
          marketId: s.marketId,
          metadata: s.metadata,
          lastPolledAt: s.lastPolledAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          enabled: accountSource?.isEnabled ?? false,
          accountSourceId: accountSource?.id ?? null,
          pollIntervalMs: accountSource?.pollIntervalMs ?? null,
        };
      }),
      total,
      active: activeCount,
      limit,
      offset,
      totalPages: Math.ceil(total / limit),
      page: Math.floor(offset / limit) + 1,
    });
  });

  // POST /admin/sources — create a new source for a market
  app.post('/sources', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const parsed = createSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    // If marketId provided, verify it belongs to account
    if (data.marketId) {
      const market = await prisma.market.findFirst({
        where: { id: data.marketId, accountId: au.accountId },
      });
      if (!market) {
        return reply.status(400).send({ error: 'Market not found or does not belong to this account' });
      }
    }

    // Check account source limit
    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { maxSources: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const currentSourceCount = await prisma.accountSource.count({
      where: { accountId: au.accountId, isEnabled: true },
    });
    if (currentSourceCount >= account.maxSources) {
      return reply.status(400).send({
        error: `Source limit reached (${account.maxSources}). Upgrade your plan or disable an existing source.`,
      });
    }

    const source = await prisma.source.create({
      data: {
        platform: data.platform as any,
        sourceType: data.sourceType as any,
        name: data.name,
        url: data.url,
        marketId: data.marketId,
        trustScore: data.trustScore,
        metadata: data.metadata ?? undefined,
        isGlobal: false,
      },
    });

    // Automatically enable it for the account
    await prisma.accountSource.create({
      data: {
        accountId: au.accountId,
        sourceId: source.id,
        isEnabled: true,
      },
    });

    return reply.status(201).send(source);
  });

  // PATCH /admin/sources/:id — update source fields
  app.patch('/sources/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const parsed = updateSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    // Verify the source is accessible to this account (global or belongs to account's market)
    const accountMarkets = await prisma.market.findMany({
      where: { accountId: au.accountId },
      select: { id: true },
    });
    const marketIds = accountMarkets.map((m) => m.id);

    const existing = await prisma.source.findFirst({
      where: {
        id,
        OR: [
          { isGlobal: true },
          { marketId: { in: marketIds } },
        ],
      },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Do not allow editing global sources
    // Allow admins to edit any source (including global ones)

    const source = await prisma.source.update({
      where: { id },
      data: parsed.data,
    });

    return reply.status(200).send(source);
  });

  // POST /admin/sources/:id/enable — enable source for account
  app.post('/sources/:id/enable', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id: sourceId } = request.params as { id: string };

    // Verify source exists
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Check account source limit
    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { maxSources: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const currentEnabled = await prisma.accountSource.count({
      where: { accountId: au.accountId, isEnabled: true },
    });

    // Upsert: create or re-enable
    const existing = await prisma.accountSource.findUnique({
      where: { accountId_sourceId: { accountId: au.accountId, sourceId } },
    });

    if (existing) {
      if (existing.isEnabled) {
        return reply.status(200).send({ message: 'Source is already enabled', accountSourceId: existing.id });
      }
      // Re-enabling: check limit
      if (currentEnabled >= account.maxSources) {
        return reply.status(400).send({
          error: `Source limit reached (${account.maxSources}). Disable an existing source first.`,
        });
      }
      const updated = await prisma.accountSource.update({
        where: { id: existing.id },
        data: { isEnabled: true },
      });
      return reply.status(200).send({ message: 'Source enabled', accountSourceId: updated.id });
    }

    // Creating new: check limit
    if (currentEnabled >= account.maxSources) {
      return reply.status(400).send({
        error: `Source limit reached (${account.maxSources}). Disable an existing source first.`,
      });
    }

    const accountSource = await prisma.accountSource.create({
      data: {
        accountId: au.accountId,
        sourceId,
        isEnabled: true,
      },
    });

    return reply.status(201).send({ message: 'Source enabled', accountSourceId: accountSource.id });
  });

  // POST /admin/sources/:id/disable — disable source for account
  app.post('/sources/:id/disable', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id: sourceId } = request.params as { id: string };

    const existing = await prisma.accountSource.findUnique({
      where: { accountId_sourceId: { accountId: au.accountId, sourceId } },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Source is not associated with this account' });
    }

    if (!existing.isEnabled) {
      return reply.status(200).send({ message: 'Source is already disabled' });
    }

    await prisma.accountSource.update({
      where: { id: existing.id },
      data: { isEnabled: false },
    });

    return reply.status(200).send({ message: 'Source disabled' });
  });

  // GET /admin/sources/by-type — group sources by sourceType with counts
  app.get('/sources/by-type', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    // Get account's market IDs
    const accountMarkets = await prisma.market.findMany({
      where: { accountId: au.accountId },
      select: { id: true },
    });
    const marketIds = accountMarkets.map((m) => m.id);

    const groups = await prisma.source.groupBy({
      by: ['sourceType'],
      where: {
        OR: [
          { isGlobal: true },
          { marketId: { in: marketIds } },
        ],
      },
      _count: { id: true },
      orderBy: { sourceType: 'asc' },
    });

    return reply.status(200).send({
      data: groups.map((g) => ({
        sourceType: g.sourceType,
        count: g._count.id,
      })),
    });
  });
}
