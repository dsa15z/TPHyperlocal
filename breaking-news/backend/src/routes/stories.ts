import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma.js';
import { Prisma, StoryStatus } from '@prisma/client';

const ListStoriesQuerySchema = z.object({
  status: z.string().optional(), // comma-separated statuses
  category: z.string().optional(), // comma-separated categories
  sourceIds: z.string().optional(), // comma-separated source IDs
  marketIds: z.string().optional(), // comma-separated market IDs
  nlp: z.string().optional(), // natural language query — parsed into structured filters via LLM
  uncoveredOnly: z.coerce.boolean().optional(),
  trend: z.enum(['rising', 'declining', 'all']).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  maxAge: z.coerce.number().int().positive().optional(), // in hours
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z
    .enum([
      'compositeScore',
      'breakingScore',
      'trendingScore',
      'firstSeenAt',
      'lastUpdatedAt',
    ])
    .default('compositeScore'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const StoryIdParamsSchema = z.object({
  id: z.string().min(1),
});

export async function storiesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/stories - list stories with filtering and pagination
  // If authenticated, includes account derivative data (edits, status, assignments)
  app.get('/stories', async (request, reply) => {
    // Optional auth — if present, we include account derivative overlay
    const accountId = (request as any).accountUser?.accountId || null;

    const parseResult = ListStoriesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    let { status, category, sourceIds, marketIds, uncoveredOnly, trend, minScore, maxAge, limit, offset, sort, order } =
      parseResult.data;
    const nlpQuery = parseResult.data.nlp;

    // ── NLP Query Parsing ────────────────────────────────────────────────
    // If an NLP query is provided, parse it into structured filters via LLM
    // These MERGE with (override) any existing dropdown selections
    let nlpTextSearch: string | undefined;

    if (nlpQuery && nlpQuery.length > 3) {
      try {
        const { generateWithFallback } = await import('../lib/llm-factory.js');
        const nlpResult = await generateWithFallback(
          `Parse this newsroom search query into structured filters. Return ONLY valid JSON, no explanation.

Query: "${nlpQuery}"

Return JSON with these optional fields:
- textSearch: string (keywords to search in title/summary, only if the query mentions specific topics)
- category: string (one of: CRIME, POLITICS, WEATHER, TRAFFIC, BUSINESS, HEALTH, SPORTS, ENTERTAINMENT, TECHNOLOGY, EDUCATION, COMMUNITY, ENVIRONMENT, EMERGENCY)
- status: string (one of: BREAKING, DEVELOPING, TOP_STORY, ONGOING, STALE)
- market: string (city name if a location is mentioned)
- minScore: number 0-1 (if they say "high scoring" or "important" use 0.5, "viral" use 0.7)
- maxAge: number in hours (if they say "last hour" use 1, "today" use 24, "this week" use 168)
- sort: string (one of: compositeScore, breakingScore, trendingScore, firstSeenAt)
- trend: string (one of: rising, declining)

Only include fields that the query clearly implies. Omit fields that aren't mentioned.`,
          { maxTokens: 200, temperature: 0.1 }
        );

        const jsonMatch = nlpResult.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          // Merge NLP results into filter params (NLP overrides dropdowns)
          if (parsed.textSearch) nlpTextSearch = parsed.textSearch;
          // NLP values OVERRIDE dropdown selections (NLP is more specific)
          if (parsed.category) category = parsed.category;
          if (parsed.status) status = parsed.status;
          if (parsed.minScore) minScore = parsed.minScore;
          if (parsed.maxAge) maxAge = parsed.maxAge;
          if (parsed.sort) sort = parsed.sort;
          if (parsed.trend) trend = parsed.trend;
          // Market resolution: look up market ID from city name
          if (parsed.market && !marketIds) {
            const market = await prisma.market.findFirst({
              where: { name: { contains: parsed.market, mode: 'insensitive' }, isActive: true },
              select: { id: true },
            });
            if (market) marketIds = market.id;
          }
        }
      } catch {
        // LLM unavailable — heuristic fallback: extract obvious filters from query
        const lower = nlpQuery.toLowerCase();

        // Category detection
        const categoryMap: Record<string, string> = {
          'crime': 'CRIME', 'sports': 'SPORTS', 'politics': 'POLITICS', 'political': 'POLITICS',
          'weather': 'WEATHER', 'business': 'BUSINESS', 'health': 'HEALTH', 'technology': 'TECHNOLOGY',
          'tech': 'TECHNOLOGY', 'entertainment': 'ENTERTAINMENT', 'education': 'EDUCATION',
          'traffic': 'TRAFFIC', 'environment': 'ENVIRONMENT', 'emergency': 'EMERGENCY',
          'community': 'COMMUNITY',
        };
        for (const [word, cat] of Object.entries(categoryMap)) {
          if (lower.includes(word) && !category) { category = cat; break; }
        }

        // Status detection
        if (lower.includes('breaking') && !status) status = 'BREAKING';
        else if (lower.includes('trending') && !status) status = 'TOP_STORY';
        else if (lower.includes('developing') && !status) status = 'DEVELOPING';

        // Time detection — NLP time OVERRIDES dropdown time range
        const minMatch = lower.match(/(\d+)\s*min/);
        const hrMatch = lower.match(/(\d+)\s*hour/);
        if (minMatch) maxAge = parseInt(minMatch[1]) / 60;
        else if (hrMatch) maxAge = parseInt(hrMatch[1]);
        else if (lower.includes('last 15 min')) maxAge = 0.25;
        else if (lower.includes('last 30 min')) maxAge = 0.5;
        else if (lower.includes('last hour') || lower.includes('past hour')) maxAge = 1;
        else if (lower.includes('last 2 hour')) maxAge = 2;
        else if (lower.includes('last 6 hour')) maxAge = 6;
        else if (lower.includes('today') || lower.includes('last 24')) maxAge = 24;
        else if (lower.includes('this week') || lower.includes('last 7 day') || lower.includes('past week')) maxAge = 168;

        // Market detection — check if query mentions a known market name
        if (!marketIds) {
          const marketNames = await prisma.market.findMany({ where: { isActive: true }, select: { id: true, name: true } });
          for (const m of marketNames) {
            if (lower.includes(m.name.toLowerCase())) { marketIds = m.id; break; }
          }
          if (lower.includes('national') && !marketIds) {
            const natl = marketNames.find(m => m.name.toLowerCase() === 'national');
            if (natl) marketIds = natl.id;
          }
        }

        // Remaining text after removing detected filters → text search
        let remaining = lower
          .replace(/\b(breaking|trending|developing|national|local|show|find|get|list|search|stories|news|from|in|the|last|past|hour|hours|minute|minutes|min|today|this|week|days|with|high|top|recent|about|all|me)\b/gi, '')
          .replace(/\b(crime|sports|politics|weather|business|health|technology|entertainment|education|traffic|environment|emergency|community)\b/gi, '')
          .replace(/\d+/g, '') // Remove numbers (already captured in time detection)
          .trim().replace(/\s+/g, ' ').trim();
        if (remaining.length > 2) nlpTextSearch = remaining;
      }
    }

    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null, // exclude merged stories
    };

    // Apply NLP text search if present
    if (nlpTextSearch) {
      if (!where.AND) where.AND = [];
      (where.AND as Prisma.StoryWhereInput[]).push({
        OR: [
          { title: { contains: nlpTextSearch, mode: 'insensitive' } },
          { summary: { contains: nlpTextSearch, mode: 'insensitive' } },
          { aiSummary: { contains: nlpTextSearch, mode: 'insensitive' } },
          { locationName: { contains: nlpTextSearch, mode: 'insensitive' } },
        ],
      });
    }

    // Market filter: match story location against market name, neighborhoods, and keywords
    let marketOrConditions: Prisma.StoryWhereInput[] | null = null;

    if (marketIds) {
      const rawIds = marketIds.split(',').map((s) => s.trim()).filter(Boolean);
      const includeNational = rawIds.includes('__national__');
      const ids = rawIds.filter((id) => id !== '__national__');

      const orConditions: Prisma.StoryWhereInput[] = [];

      if (includeNational) {
        orConditions.push({ locationName: { equals: 'National', mode: 'insensitive' as const } });
        orConditions.push({ locationName: null });
      }

      if (ids.length > 0) {
        const markets = await prisma.market.findMany({
          where: { id: { in: ids } },
          select: { name: true, state: true, keywords: true, neighborhoods: true },
        });

        const exactTerms: string[] = [];
        const containsTerms: string[] = [];

        for (const m of markets) {
          exactTerms.push(m.name.toLowerCase());
          containsTerms.push(m.name.toLowerCase());
          if (m.state) exactTerms.push(m.state.toLowerCase());

          const keywords = (m.keywords || []) as string[];
          for (const kw of keywords) {
            const normalized = kw.toLowerCase().trim();
            if (normalized.split(/\s+/).length >= 2) exactTerms.push(normalized);
            if (normalized.length >= 6) exactTerms.push(normalized);
          }

          const neighborhoods = (m.neighborhoods || []) as string[];
          for (const nb of neighborhoods) {
            const normalized = nb.toLowerCase().trim();
            if (normalized.split(/\s+/).length >= 2 || normalized.length >= 8) exactTerms.push(normalized);
          }
        }

        for (const term of [...new Set(exactTerms)]) {
          orConditions.push({ locationName: { equals: term, mode: 'insensitive' as const } });
          orConditions.push({ neighborhood: { equals: term, mode: 'insensitive' as const } });
        }
        for (const term of [...new Set(containsTerms)]) {
          orConditions.push({ locationName: { contains: term, mode: 'insensitive' as const } });
        }
      }

      if (orConditions.length > 0) {
        marketOrConditions = orConditions;
        if (!where.AND) where.AND = [];
        (where.AND as Prisma.StoryWhereInput[]).push({ OR: orConditions });
      }
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.status = statuses[0] as StoryStatus;
      } else if (statuses.length > 1) {
        where.status = { in: statuses as StoryStatus[] };
      }
    }

    if (category) {
      const categories = category.split(',').map((s) => s.trim()).filter(Boolean);
      const hasUnknown = categories.includes('Unknown');
      const named = categories.filter((c) => c !== 'Unknown');

      if (hasUnknown && named.length > 0) {
        where.OR = [
          { category: { in: named } },
          { category: null },
        ];
      } else if (hasUnknown) {
        where.category = null;
      } else if (named.length === 1) {
        where.category = named[0];
      } else if (named.length > 1) {
        where.category = { in: named };
      }
    }

    if (sourceIds) {
      const ids = sourceIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.storySources = {
          some: {
            sourcePost: {
              sourceId: { in: ids },
            },
          },
        };
      }
    }

    if (uncoveredOnly) {
      where.coverageMatches = {
        none: { isCovered: true },
      };
    }

    if (minScore !== undefined) {
      where.compositeScore = { gte: minScore };
    }

    if (maxAge !== undefined) {
      const cutoff = new Date(Date.now() - maxAge * 60 * 60 * 1000);
      where.firstSeenAt = { gte: cutoff };
    }

    // ── Cross-cutting facet queries ───────────────────────────────────────
    // Each facet includes ALL other filters except its own, so selecting
    // BUSINESS category updates source/status counts, and vice versa.
    // Filters stack: market + category + status + source + time + score.

    // Helper: build a fresh base with shared non-facet filters
    function makeFacetBase(): Prisma.StoryWhereInput {
      const w: Prisma.StoryWhereInput = { mergedIntoId: null };
      const conditions: Prisma.StoryWhereInput[] = [];

      if (maxAge !== undefined) {
        w.firstSeenAt = { gte: new Date(Date.now() - maxAge * 60 * 60 * 1000) };
      }
      if (minScore !== undefined) {
        w.compositeScore = { gte: minScore };
      }
      if (marketOrConditions) {
        conditions.push({ OR: marketOrConditions });
      }
      if (conditions.length > 0) w.AND = conditions;
      return w;
    }

    // Helper: apply status filter
    function applyStatusFilter(w: Prisma.StoryWhereInput) {
      if (!status) return;
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      w.status = statuses.length === 1 ? (statuses[0] as StoryStatus) : { in: statuses as StoryStatus[] };
    }

    // Helper: apply category filter (handles Unknown → null)
    function applyCategoryFilter(w: Prisma.StoryWhereInput) {
      if (!category) return;
      const cats = category.split(',').map((s) => s.trim()).filter(Boolean);
      const hasUnknown = cats.includes('Unknown');
      const named = cats.filter((c) => c !== 'Unknown');
      if (hasUnknown && named.length > 0) {
        if (!w.AND) w.AND = [];
        (w.AND as Prisma.StoryWhereInput[]).push({ OR: [{ category: { in: named } }, { category: null }] });
      } else if (hasUnknown) {
        w.category = null;
      } else if (named.length === 1) {
        w.category = named[0];
      } else if (named.length > 1) {
        w.category = { in: named };
      }
    }

    // Helper: apply source filter
    function applySourceFilter(w: Prisma.StoryWhereInput) {
      if (!sourceIds) return;
      const ids = sourceIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        w.storySources = { some: { sourcePost: { sourceId: { in: ids } } } };
      }
    }

    // Category facet: includes status + source + market, excludes category
    const catFacetWhere = makeFacetBase();
    applyStatusFilter(catFacetWhere);
    applySourceFilter(catFacetWhere);

    // Status facet: includes category + source + market, excludes status
    const statusFacetWhere = makeFacetBase();
    applyCategoryFilter(statusFacetWhere);
    applySourceFilter(statusFacetWhere);

    // Source facet: includes status + category + market, excludes source
    const sourceFacetWhere = makeFacetBase();
    applyStatusFilter(sourceFacetWhere);
    applyCategoryFilter(sourceFacetWhere);

    // Build market location SQL filter for source facet raw query
    let marketSql = Prisma.empty;
    if (marketOrConditions && marketIds) {
      const rawIds = marketIds.split(',').map((s) => s.trim()).filter(Boolean);
      const includeNational = rawIds.includes('__national__');
      const mktIds = rawIds.filter((id) => id !== '__national__');
      const sqlParts: string[] = [];
      if (includeNational) {
        sqlParts.push(`LOWER(st."locationName") = 'national'`);
        sqlParts.push(`st."locationName" IS NULL`);
      }
      if (mktIds.length > 0) {
        const mkts = await prisma.market.findMany({
          where: { id: { in: mktIds } },
          select: { name: true, state: true, keywords: true, neighborhoods: true },
        });
        for (const m of mkts) {
          sqlParts.push(`LOWER(st."locationName") LIKE '%' || LOWER('${m.name.replace(/'/g, "''")}') || '%'`);
          if (m.state) sqlParts.push(`LOWER(st."locationName") = LOWER('${m.state.replace(/'/g, "''")}')`);
          const terms: string[] = [];
          for (const kw of ((m.keywords || []) as string[])) { const n = kw.trim(); if (n.split(/\s+/).length >= 2 || n.length >= 6) terms.push(n); }
          for (const nb of ((m.neighborhoods || []) as string[])) { const n = nb.trim(); if (n.split(/\s+/).length >= 2 || n.length >= 8) terms.push(n); }
          for (const t of terms) {
            sqlParts.push(`LOWER(st."locationName") = LOWER('${t.replace(/'/g, "''")}')`);
            sqlParts.push(`LOWER(st."neighborhood") = LOWER('${t.replace(/'/g, "''")}')`);
          }
        }
      }
      if (sqlParts.length > 0) {
        marketSql = Prisma.sql`AND (${Prisma.raw(sqlParts.join(' OR '))})`;
      }
    }

    const [stories, total, categoryFacets, statusFacets, sourceData] = await Promise.all([
      prisma.story.findMany({
        where,
        orderBy: { [sort]: order },
        take: limit,
        skip: offset,
        include: {
          storySources: {
            include: {
              sourcePost: {
                select: {
                  id: true,
                  authorName: true,
                  url: true,
                  publishedAt: true,
                  source: {
                    select: { name: true, platform: true },
                  },
                },
              },
            },
            orderBy: { similarityScore: 'desc' },
            take: 5,
          },
          coverageMatches: {
            select: {
              isCovered: true,
              accountId: true,
              coverageFeed: { select: { name: true } },
            },
          },
          scoreSnapshots: {
            select: { compositeScore: true, snapshotAt: true },
            orderBy: { snapshotAt: 'desc' as const },
            take: 12,
          },
          parentStory: {
            select: { id: true, title: true, status: true, compositeScore: true, firstSeenAt: true },
          },
          followUps: {
            select: { id: true, title: true, status: true, compositeScore: true, firstSeenAt: true },
            where: { mergedIntoId: null },
            orderBy: { firstSeenAt: 'desc' },
            take: 10,
          },
          _count: {
            select: { storySources: true },
          },
          // Include account derivative if authenticated
          ...(accountId ? {
            accountStories: {
              where: { accountId },
              select: {
                id: true,
                editedTitle: true,
                editedSummary: true,
                accountStatus: true,
                assignedTo: true,
                notes: true,
                coveredAt: true,
                tags: true,
                aiDrafts: true,
                aiScripts: true,
                aiVideos: true,
              },
              take: 1,
            },
          } : {}),
        },
      }),
      prisma.story.count({ where }),
      prisma.story.groupBy({
        by: ['category'],
        where: { ...catFacetWhere, category: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      prisma.story.groupBy({
        by: ['status'],
        where: statusFacetWhere,
        _count: { _all: true },
        orderBy: { _count: { status: 'desc' } },
      }),
      // Source facet raw query (uses pre-built marketSql)
      prisma.$queryRaw<Array<{ id: string; name: string; platform: string; count: bigint }>>`
        SELECT s.id, s.name, s.platform, COUNT(DISTINCT st.id)::bigint as count
        FROM "Source" s
        JOIN "SourcePost" sp ON sp."sourceId" = s.id
        JOIN "StorySource" ss ON ss."sourcePostId" = sp.id
        JOIN "Story" st ON st.id = ss."storyId"
        WHERE s."isActive" = true
          AND st."mergedIntoId" IS NULL
          ${maxAge !== undefined ? Prisma.sql`AND st."firstSeenAt" >= ${new Date(Date.now() - maxAge * 60 * 60 * 1000)}` : Prisma.empty}
          ${minScore !== undefined ? Prisma.sql`AND st."compositeScore" >= ${minScore}` : Prisma.empty}
          ${status ? Prisma.sql`AND st.status IN (${Prisma.join(status.split(',').map(s => s.trim()).filter(Boolean))})` : Prisma.empty}
          ${category ? (() => {
            const cats = category.split(',').map(s => s.trim()).filter(Boolean);
            const hasUnknown = cats.includes('Unknown');
            const named = cats.filter(c => c !== 'Unknown');
            if (hasUnknown && named.length > 0) {
              return Prisma.sql`AND (st.category IN (${Prisma.join(named)}) OR st.category IS NULL)`;
            } else if (hasUnknown) {
              return Prisma.sql`AND st.category IS NULL`;
            } else {
              return Prisma.sql`AND st.category IN (${Prisma.join(named)})`;
            }
          })() : Prisma.empty}
          ${marketSql}
        GROUP BY s.id, s.name, s.platform
        ORDER BY count DESC
      `,
    ]);

    // Compute trend direction for each story from snapshots
    let filteredStories = stories;
    if (trend && trend !== 'all') {
      filteredStories = stories.filter((s: any) => {
        const snaps = s.scoreSnapshots || [];
        if (snaps.length < 2) return trend === 'rising'; // new stories counted as rising
        const latest = snaps[0]?.compositeScore || 0;
        const previous = snaps[Math.min(snaps.length - 1, 3)]?.compositeScore || 0;
        return trend === 'rising' ? latest >= previous : latest < previous;
      });
    }

    // Merge account derivative overlay into story response
    const mergedStories = filteredStories.map((s: any) => {
      const deriv = s.accountStories?.[0] || null;
      if (!deriv) return s;
      return {
        ...s,
        // Account derivative overlay
        accountStory: {
          id: deriv.id,
          editedTitle: deriv.editedTitle,
          editedSummary: deriv.editedSummary,
          accountStatus: deriv.accountStatus,
          assignedTo: deriv.assignedTo,
          notes: deriv.notes,
          coveredAt: deriv.coveredAt,
          tags: deriv.tags,
          aiDraftCount: Array.isArray(deriv.aiDrafts) ? deriv.aiDrafts.length : 0,
          aiScriptCount: Array.isArray(deriv.aiScripts) ? deriv.aiScripts.length : 0,
          aiVideoCount: Array.isArray(deriv.aiVideos) ? deriv.aiVideos.length : 0,
        },
        // Override title/summary with account edits if present
        editedTitle: deriv.editedTitle || s.editedTitle,
        editedSummary: deriv.editedSummary || s.editedSummary,
      };
    });

    return reply.send({
      data: mergedStories,
      pagination: {
        total: trend && trend !== 'all' ? filteredStories.length : total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      facets: {
        categories: categoryFacets.map((r) => ({
          name: r.category || 'Unknown',
          count: r._count._all,
        })),
        statuses: statusFacets.map((r) => ({
          name: r.status,
          count: r._count._all,
        })),
        sources: sourceData.map((r) => ({
          id: r.id,
          name: r.name,
          platform: r.platform,
          storyCount: Number(r.count),
        })),
      },
    });
  });

  // GET /api/v1/stories/sources - list sources with story counts
  app.get('/stories/sources', async (_request, reply) => {
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        platform: true,
        _count: {
          select: {
            posts: {
              where: {
                storySources: { some: {} },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Map to a simpler shape with story count
    const result = sources.map((s) => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      storyCount: s._count.posts,
    }));

    return reply.send({ data: result });
  });

  // GET /api/v1/stories/facets - category and status counts
  app.get('/stories/facets', async (_request, reply) => {
    const [categoryRows, statusRows] = await Promise.all([
      prisma.story.groupBy({
        by: ['category'],
        where: { mergedIntoId: null, category: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      prisma.story.groupBy({
        by: ['status'],
        where: { mergedIntoId: null },
        _count: { _all: true },
        orderBy: { _count: { status: 'desc' } },
      }),
    ]);

    return reply.send({
      categories: categoryRows.map((r) => ({
        name: r.category || 'Unknown',
        count: r._count._all,
      })),
      statuses: statusRows.map((r) => ({
        name: r.status,
        count: r._count._all,
      })),
    });
  });

  // GET /api/v1/stories/breaking - top breaking stories
  app.get('/stories/breaking', async (_request, reply) => {
    const stories = await prisma.story.findMany({
      where: {
        breakingScore: { gt: 0.5 },
        mergedIntoId: null,
        status: { in: ['ALERT', 'BREAKING', 'DEVELOPING'] },
      },
      orderBy: { breakingScore: 'desc' },
      take: 20,
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: { source: true },
            },
          },
          orderBy: { similarityScore: 'desc' },
          take: 5,
        },
        _count: {
          select: { storySources: true },
        },
      },
    });

    return reply.send({ data: stories });
  });

  // GET /api/v1/stories/trending - top trending stories
  app.get('/stories/trending', async (_request, reply) => {
    const stories = await prisma.story.findMany({
      where: {
        trendingScore: { gt: 0.3 },
        mergedIntoId: null,
        status: { in: ['TOP_STORY', 'BREAKING', 'ONGOING'] },
      },
      orderBy: { trendingScore: 'desc' },
      take: 20,
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: { source: true },
            },
          },
          orderBy: { similarityScore: 'desc' },
          take: 5,
        },
        _count: {
          select: { storySources: true },
        },
      },
    });

    return reply.send({ data: stories });
  });

  // GET /api/v1/stories/:id - get a single story with source posts
  app.get('/stories/:id', async (request, reply) => {
    const parseResult = StoryIdParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid story ID',
      });
    }

    const { id } = parseResult.data;

    const story = await prisma.story.findUnique({
      where: { id },
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: { source: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { similarityScore: 'desc' }],
        },
        scoreSnapshots: {
          orderBy: { snapshotAt: 'desc' },
          take: 50,
        },
        parentStory: {
          select: { id: true, title: true, status: true, compositeScore: true, firstSeenAt: true },
        },
        followUps: {
          select: { id: true, title: true, status: true, compositeScore: true, firstSeenAt: true },
          where: { mergedIntoId: null },
          orderBy: { firstSeenAt: 'desc' },
          take: 20,
        },
        mergedFrom: {
          select: { id: true, title: true, compositeScore: true },
        },
        _count: {
          select: { storySources: true, scoreSnapshots: true },
        },
      },
    });

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    return reply.send({ data: story });
  });

  // POST /api/v1/stories/:id/summarize - trigger on-demand AI summary generation
  app.post('/stories/:id/summarize', async (request, reply) => {
    const parseResult = StoryIdParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid story ID' });
    }

    const { id } = parseResult.data;

    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true, title: true, _count: { select: { storySources: true } } },
    });

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Queue summarization job
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue('summarization', { connection });

    await queue.add('summarize', { storyId: id, force: true }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    await queue.close();
    await connection.quit();

    return reply.send({
      message: 'Summary generation queued',
      storyId: id,
      sourceCount: story._count.storySources,
    });
  });
}
