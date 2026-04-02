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
  marketId: z.string().optional(), // Legacy single market
  marketIds: z.array(z.string()).optional(), // M:N market IDs via SourceMarket
  trustScore: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.unknown()).optional(),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional().nullable(),
  trustScore: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  marketIds: z.array(z.string()).optional(), // Replace market links
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

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sources, total, activeCount] = await Promise.all([
      prisma.source.findMany({
        where,
        include: {
          accountSources: {
            where: { accountId: au.accountId },
            select: { id: true, isEnabled: true, pollIntervalMs: true },
          },
          market: { select: { id: true, name: true } },
          sourceMarkets: { select: { marketId: true, market: { select: { id: true, name: true, state: true } } } },
          _count: { select: { posts: true } },
        },
        orderBy: { [sort]: order },
        take: limit,
        skip: offset,
      }),
      prisma.source.count({ where }),
      prisma.source.count({ where: { ...where, isActive: true } }),
    ]);

    // Get 24h post counts for all returned sources in one query
    const sourceIds = sources.map((s) => s.id);
    const recentCounts = sourceIds.length > 0
      ? await prisma.sourcePost.groupBy({
          by: ['sourceId'],
          where: {
            sourceId: { in: sourceIds },
            createdAt: { gte: twentyFourHoursAgo },
          },
          _count: { id: true },
        })
      : [];
    const recentCountMap = new Map(recentCounts.map((r) => [r.sourceId, r._count.id]));

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
          market: s.market,
          marketIds: (s as any).sourceMarkets?.map((sm: any) => sm.marketId) || [],
          markets: (s as any).sourceMarkets?.map((sm: any) => sm.market) || [],
          metadata: s.metadata,
          lastPolledAt: s.lastPolledAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          enabled: accountSource?.isEnabled ?? false,
          accountSourceId: accountSource?.id ?? null,
          pollIntervalMs: accountSource?.pollIntervalMs ?? null,
          totalPosts: s._count.posts,
          recentPosts: recentCountMap.get(s.id) || 0,
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
        marketId: data.marketIds?.[0] || data.marketId, // Primary market (backward compat)
        trustScore: data.trustScore,
        metadata: data.metadata ?? undefined,
        isGlobal: false,
      },
    });

    // Link to markets via SourceMarket M:N
    if (data.marketIds && data.marketIds.length > 0) {
      for (const mktId of data.marketIds) {
        await prisma.sourceMarket.create({
          data: { sourceId: source.id, marketId: mktId },
        }).catch(() => {}); // Ignore unique constraint
      }
    }

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

    // Find the source — admins can edit any source (global, local, or linked via SourceMarket)
    const existing = await prisma.source.findUnique({
      where: { id },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Do not allow editing global sources
    // Allow admins to edit any source (including global ones)

    // When re-activating a source, reset failure count so it gets a fresh start
    const updateData: any = { ...parsed.data };
    if (parsed.data.isActive === true && !existing.isActive) {
      const meta = (existing.metadata || {}) as Record<string, unknown>;
      updateData.metadata = {
        ...meta,
        consecutiveFailures: 0,
        reactivatedAt: new Date().toISOString(),
        deactivateReason: undefined,
      };
    }

    // Remove marketIds from updateData — it's handled separately via SourceMarket
    const { marketIds: newMarketIds, ...sourceUpdateData } = updateData;

    // Update primary market (backward compat)
    if (newMarketIds && newMarketIds.length > 0) {
      sourceUpdateData.marketId = newMarketIds[0];
    }

    const source = await prisma.source.update({
      where: { id },
      data: sourceUpdateData,
    });

    // Sync SourceMarket records if marketIds provided
    if (newMarketIds !== undefined) {
      // Delete existing links and recreate
      await prisma.sourceMarket.deleteMany({ where: { sourceId: id } });
      for (const mktId of (newMarketIds || [])) {
        await prisma.sourceMarket.create({
          data: { sourceId: id, marketId: mktId },
        }).catch(() => {});
      }
    }

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

  // DELETE /admin/sources/:id — delete a source and its related data
  app.delete('/sources/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Don't allow deleting global sources unless the user is OWNER
    if (source.isGlobal && au.role !== 'OWNER') {
      return reply.status(403).send({ error: 'Only account owners can delete global sources' });
    }

    // Delete in order: accountSources -> storySources -> sourcePosts -> source
    await prisma.$transaction(async (tx) => {
      // Remove account-source links
      await tx.accountSource.deleteMany({ where: { sourceId: id } });
      // Remove story-source links
      await tx.storySource.deleteMany({ where: { sourceId: id } });
      // Remove source posts
      await tx.sourcePost.deleteMany({ where: { sourceId: id } });
      // Remove the source itself
      await tx.source.delete({ where: { id } });
    });

    return reply.status(200).send({ message: 'Source deleted', id });
  });

  // POST /admin/sources/test — test a feed URL before saving
  app.post('/sources/test', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const body = z.object({
      url: z.string().min(1),
      platform: platformEnum,
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });
    }

    const { url, platform } = body.data;

    if (platform === 'RSS') {
      // Use browser UA to avoid 403 blocks from news sites
      const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': browserUA,
            'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const isChallenge = body.includes('cloudflare') || body.includes('Cloudflare') ||
            body.includes('Just a moment') || body.includes('security verification');

          // If Cloudflare blocked, try to suggest the direct URL
          let suggestion: string | undefined;
          if (isChallenge && url.includes('rsshub.app')) {
            const apMatch = url.match(/rsshub\.app\/apnews\/topics\/(.+)/);
            if (apMatch) {
              suggestion = `https://apnews.com/hub/${apMatch[1].replace('apf-', '').replace(/\/$/, '')}?format=rss`;
            }
          }

          return reply.status(200).send({
            success: false,
            error: isChallenge
              ? `Cloudflare bot protection — this proxy URL is blocked. ${suggestion ? `Try the direct URL instead: ${suggestion}` : 'Try a direct RSS URL from the source site.'}`
              : `HTTP ${res.status}: ${res.statusText}`,
            url,
            ...(suggestion ? { suggestedUrl: suggestion } : {}),
          });
        }

        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        const isXml = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom') ||
          text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<rss') || text.trimStart().startsWith('<feed');

        if (!isXml) {
          // Check if it's HTML (site doesn't serve RSS at this URL)
          const isHtml = text.includes('<!DOCTYPE html') || text.includes('<html');
          return reply.status(200).send({
            success: false,
            error: isHtml
              ? 'This URL returns an HTML page, not an RSS feed. The site may not offer RSS at this URL. The system will auto-switch to web scraping if needed.'
              : 'Response is not valid RSS/Atom XML',
            contentType,
            url,
          });
        }

        // Count items
        const itemCount = (text.match(/<item[\s>]/g) || []).length + (text.match(/<entry[\s>]/g) || []).length;

        // Extract title
        const titleMatch = text.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
        const feedTitle = titleMatch ? titleMatch[1].trim() : null;

        return reply.status(200).send({
          success: true,
          feedTitle,
          itemCount,
          contentType,
          url,
          message: `Valid RSS feed with ${itemCount} items`,
        });
      } catch (err: any) {
        const message = err.name === 'AbortError' ? 'Request timed out (10s)' : (err.message || 'Unknown error');
        return reply.status(200).send({
          success: false,
          error: message,
          url,
        });
      }
    }

    // For non-RSS platforms, just check if URL is reachable
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'TopicPulse/1.0' },
      });
      clearTimeout(timeout);

      return reply.status(200).send({
        success: res.ok,
        statusCode: res.status,
        url,
        message: res.ok ? 'URL is reachable' : `HTTP ${res.status}: ${res.statusText}`,
      });
    } catch (err: any) {
      const message = err.name === 'AbortError' ? 'Request timed out (10s)' : (err.message || 'Unknown error');
      return reply.status(200).send({
        success: false,
        error: message,
        url,
      });
    }
  });

  // POST /admin/sources/bulk — bulk actions on multiple sources
  app.post('/sources/bulk', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const schema = z.object({
      ids: z.array(z.string()).min(1).max(500),
      action: z.enum(['activate', 'deactivate', 'delete', 'assign_markets']),
      marketIds: z.array(z.string()).optional(), // for assign_markets
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const { ids, action, marketIds } = parsed.data;

    try {
      switch (action) {
        case 'activate': {
          const result = await prisma.source.updateMany({
            where: { id: { in: ids } },
            data: { isActive: true },
          });
          return reply.send({ message: `Activated ${result.count} sources`, count: result.count });
        }

        case 'deactivate': {
          const result = await prisma.source.updateMany({
            where: { id: { in: ids } },
            data: { isActive: false },
          });
          return reply.send({ message: `Deactivated ${result.count} sources`, count: result.count });
        }

        case 'delete': {
          // Cascading delete in a transaction
          await prisma.$transaction(async (tx) => {
            await tx.accountSource.deleteMany({ where: { sourceId: { in: ids } } });
            await tx.storySource.deleteMany({ where: { sourceId: { in: ids } } });
            await tx.sourcePost.deleteMany({ where: { sourceId: { in: ids } } });
            await tx.source.deleteMany({ where: { id: { in: ids } } });
          });
          return reply.send({ message: `Deleted ${ids.length} sources`, count: ids.length });
        }

        case 'assign_markets': {
          if (!marketIds || marketIds.length === 0) {
            // Clear market assignment (set to global)
            const result = await prisma.source.updateMany({
              where: { id: { in: ids } },
              data: { marketId: null },
            });
            return reply.send({ message: `Cleared market from ${result.count} sources`, count: result.count });
          }

          // For now, assign to the first market (single marketId field).
          // Also store all marketIds in metadata for multi-market support.
          const updates = [];
          for (const sourceId of ids) {
            updates.push(
              prisma.source.update({
                where: { id: sourceId },
                data: {
                  marketId: marketIds[0], // Primary market
                  metadata: {
                    // Preserve existing metadata and add marketIds
                    ...(await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } })
                      .then(s => (s?.metadata as Record<string, unknown>) || {})),
                    marketIds, // All assigned markets
                  },
                },
              })
            );
          }
          await Promise.all(updates);
          return reply.send({
            message: `Assigned ${ids.length} sources to ${marketIds.length} market(s)`,
            count: ids.length,
          });
        }
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Bulk action failed' });
    }
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
