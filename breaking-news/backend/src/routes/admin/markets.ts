import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createMarketSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  state: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(500).default(80),
  timezone: z.string().default('America/Chicago'),
  keywords: z.array(z.string()).optional(),
  neighborhoods: z.array(z.string()).optional(),
});

const updateMarketSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  state: z.string().max(10).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(500).optional(),
  timezone: z.string().optional(),
  keywords: z.array(z.string()).optional().nullable(),
  neighborhoods: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
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

export async function marketRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/markets — list markets for current account
  app.get('/markets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }
    const { limit, offset } = query.data;

    const [markets, total] = await Promise.all([
      prisma.market.findMany({
        where: { accountId: au.accountId },
        include: {
          _count: { select: { sources: true, stories: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.market.count({ where: { accountId: au.accountId } }),
    ]);

    return reply.status(200).send({
      data: markets.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        state: m.state,
        latitude: m.latitude,
        longitude: m.longitude,
        radiusKm: m.radiusKm,
        timezone: m.timezone,
        isActive: m.isActive,
        keywords: m.keywords,
        neighborhoods: m.neighborhoods,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        sourceCount: m._count.sources,
        storyCount: m._count.stories,
      })),
      total,
      limit,
      offset,
    });
  });

  // POST /admin/markets — create market
  app.post('/markets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const parsed = createMarketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    // Check maxMarkets limit
    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { maxMarkets: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const currentCount = await prisma.market.count({
      where: { accountId: au.accountId, isActive: true },
    });
    if (currentCount >= account.maxMarkets) {
      return reply.status(400).send({
        error: `Market limit reached (${account.maxMarkets}). Upgrade your plan or deactivate an existing market.`,
      });
    }

    // Check slug uniqueness within account
    const existingSlug = await prisma.market.findUnique({
      where: { accountId_slug: { accountId: au.accountId, slug: data.slug } },
    });
    if (existingSlug) {
      return reply.status(400).send({ error: 'A market with this slug already exists in your account' });
    }

    const market = await prisma.market.create({
      data: {
        accountId: au.accountId,
        name: data.name,
        slug: data.slug,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        radiusKm: data.radiusKm,
        timezone: data.timezone,
        keywords: data.keywords ?? undefined,
        neighborhoods: data.neighborhoods ?? undefined,
      },
    });

    return reply.status(201).send(market);
  });

  // GET /admin/markets/:id — get market details
  app.get('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const market = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
      include: {
        _count: { select: { sources: true, stories: true } },
      },
    });

    if (!market) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    return reply.status(200).send({
      id: market.id,
      name: market.name,
      slug: market.slug,
      state: market.state,
      latitude: market.latitude,
      longitude: market.longitude,
      radiusKm: market.radiusKm,
      timezone: market.timezone,
      isActive: market.isActive,
      keywords: market.keywords,
      neighborhoods: market.neighborhoods,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
      sourceCount: market._count.sources,
      storyCount: market._count.stories,
    });
  });

  // PATCH /admin/markets/:id — update market
  app.patch('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const parsed = updateMarketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    // Verify market belongs to account
    const existing = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const data = parsed.data;

    // If slug is changing, check uniqueness within account
    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await prisma.market.findUnique({
        where: { accountId_slug: { accountId: au.accountId, slug: data.slug } },
      });
      if (slugTaken) {
        return reply.status(400).send({ error: 'A market with this slug already exists in your account' });
      }
    }

    const market = await prisma.market.update({
      where: { id },
      data,
    });

    return reply.status(200).send(market);
  });

  // DELETE /admin/markets/:id — soft delete (set isActive=false)
  app.delete('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const existing = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const market = await prisma.market.update({
      where: { id },
      data: { isActive: false },
    });

    return reply.status(200).send({ message: 'Market deactivated', id: market.id });
  });
}
