// @ts-nocheck
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
  // GET /api/v1/stories/stream — SSE stream for real-time story updates
  // Client connects and receives new/updated stories as they happen
  app.get('/stories/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial heartbeat
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    let lastCheck = Date.now();

    // Poll for new stories every 3 seconds and push to client
    const interval = setInterval(async () => {
      try {
        const since = new Date(lastCheck);
        lastCheck = Date.now();

        const newStories = await prisma.story.findMany({
          where: {
            mergedIntoId: null,
            lastUpdatedAt: { gte: since },
          },
          select: {
            id: true,
            title: true,
            status: true,
            category: true,
            locationName: true,
            compositeScore: true,
            breakingScore: true,
            sourceCount: true,
            firstSeenAt: true,
            lastUpdatedAt: true,
          },
          orderBy: { lastUpdatedAt: 'desc' },
          take: 20,
        });

        if (newStories.length > 0) {
          for (const story of newStories) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'story_update', story })}\n\n`);
          }
        }

        // Heartbeat every 30s
        reply.raw.write(`:heartbeat ${Date.now()}\n\n`);
      } catch {
        // Connection may be closed
      }
    }, 3000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(interval);
    });
  });

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

    // ── NLP Query Parsing (OpenAI Function Calling + RAG) ─────────────────
    // Uses structured function calling for guaranteed valid output.
    // RAG knowledge base injected as system prompt context.
    let nlpTextSearch: string | undefined;

    if (nlpQuery && nlpQuery.length > 3) {
      try {
        const { generateWithFallback } = await import('../lib/llm-factory.js');
        const { getCompactKnowledge } = await import('../lib/knowledge-base.js');

        // Define the filter function schema for guaranteed structured output
        const filterFunction = {
          name: 'apply_story_filters',
          description: 'Parse a natural language query into structured story filters',
          parameters: {
            type: 'object' as const,
            properties: {
              textSearch: { type: 'string', description: 'Keywords to search in story title/summary. Only set if the query mentions specific topics, people, or events.' },
              category: { type: 'string', enum: ['CRIME', 'POLITICS', 'WEATHER', 'TRAFFIC', 'BUSINESS', 'HEALTH', 'SPORTS', 'ENTERTAINMENT', 'TECHNOLOGY', 'EDUCATION', 'COMMUNITY', 'ENVIRONMENT', 'EMERGENCY'], description: 'News category filter' },
              status: { type: 'string', enum: ['BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'STALE'], description: 'Story status filter' },
              market: { type: 'string', description: 'City/market name (e.g., Houston, New York, National)' },
              minScore: { type: 'number', description: 'Minimum composite score 0-1. Use 0.3 for "notable", 0.5 for "important/high", 0.7 for "viral/top"' },
              maxAge: { type: 'number', description: 'Maximum age in hours. 0.25=15min, 0.5=30min, 1=1hr, 6=6hr, 24=today, 168=week' },
              sort: { type: 'string', enum: ['compositeScore', 'breakingScore', 'trendingScore', 'firstSeenAt'], description: 'Sort field' },
              order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' },
              trend: { type: 'string', enum: ['rising', 'declining'], description: 'Trend direction filter' },
            },
          },
        };

        const nlpResult = await generateWithFallback(
          `Parse this newsroom search query: "${nlpQuery}"`,
          {
            systemPrompt: getCompactKnowledge(),
            maxTokens: 200,
            temperature: 0.1,
            functions: [filterFunction],
            functionCall: { name: 'apply_story_filters' },
          }
        );

        // Function calling returns guaranteed structured output
        const parsed = nlpResult.functionCall?.arguments;
        if (parsed) {
          if (parsed.textSearch) nlpTextSearch = parsed.textSearch;
          if (parsed.category) category = parsed.category;
          if (parsed.status) status = parsed.status;
          if (parsed.minScore) minScore = parsed.minScore;
          if (parsed.maxAge) maxAge = parsed.maxAge;
          if (parsed.sort) sort = parsed.sort;
          if (parsed.order) order = parsed.order;
          if (parsed.trend) trend = parsed.trend;
          if (parsed.market) {
            const market = await prisma.market.findFirst({
              where: { name: { contains: parsed.market, mode: 'insensitive' }, isActive: true },
              select: { id: true },
            });
            if (market) marketIds = market.id;
          }
        } else {
          // Fallback: try to parse JSON from text response
          const jsonMatch = nlpResult.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const p = JSON.parse(jsonMatch[0]);
            if (p.textSearch) nlpTextSearch = p.textSearch;
            if (p.category) category = p.category;
            if (p.status) status = p.status;
            if (p.minScore) minScore = p.minScore;
            if (p.maxAge) maxAge = p.maxAge;
            if (p.sort) sort = p.sort;
            if (p.trend) trend = p.trend;
            if (p.market) {
              const market = await prisma.market.findFirst({
                where: { name: { contains: p.market, mode: 'insensitive' }, isActive: true },
                select: { id: true },
              });
              if (market) marketIds = market.id;
            }
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

    // Apply NLP text search if present — both keyword AND semantic
    let semanticStoryIds: string[] | null = null;

    if (nlpTextSearch) {
      // Keyword search (fast, exact)
      if (!where.AND) where.AND = [];
      (where.AND as Prisma.StoryWhereInput[]).push({
        OR: [
          { title: { contains: nlpTextSearch, mode: 'insensitive' } },
          { summary: { contains: nlpTextSearch, mode: 'insensitive' } },
          { aiSummary: { contains: nlpTextSearch, mode: 'insensitive' } },
          { locationName: { contains: nlpTextSearch, mode: 'insensitive' } },
        ],
      });

      // Semantic search (embedding similarity) — runs in parallel
      // Generates an embedding for the search query and finds similar stories
      try {
        const openaiKey = process.env['OPENAI_API_KEY'];
        if (openaiKey) {
          const embRes = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: nlpTextSearch }),
            signal: AbortSignal.timeout(5000),
          });
          if (embRes.ok) {
            const embData = await embRes.json();
            const queryEmbedding = embData.data?.[0]?.embedding;
            if (queryEmbedding && Array.isArray(queryEmbedding)) {
              // Find stories with similar embeddings using cosine similarity via raw SQL
              // Stories store embeddings in embeddingJson as JSON array
              const similarStories = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
                SELECT id,
                  1 - (
                    SELECT SUM(a * b) / (SQRT(SUM(a * a)) * SQRT(SUM(b * b)))
                    FROM unnest(ARRAY(SELECT jsonb_array_elements_text("embeddingJson"::jsonb)::float8)) WITH ORDINALITY AS t1(a, ord)
                    JOIN unnest(ARRAY(SELECT unnest(${queryEmbedding}::float8[]))) WITH ORDINALITY AS t2(b, ord) USING (ord)
                  ) as similarity
                FROM "Story"
                WHERE "embeddingJson" IS NOT NULL
                  AND "mergedIntoId" IS NULL
                  AND "firstSeenAt" >= NOW() - INTERVAL '7 days'
                ORDER BY similarity DESC
                LIMIT 20
              `.catch(() => []);

              if (similarStories.length > 0) {
                semanticStoryIds = similarStories
                  .filter(s => s.similarity > 0.3) // Only stories with >30% similarity
                  .map(s => s.id);
              }
            }
          }
        }
      } catch {
        // Semantic search is best-effort — don't block on failure
      }
    }

    // If semantic search found results, blend with keyword results
    if (semanticStoryIds && semanticStoryIds.length > 0) {
      // Expand the OR to include semantically similar stories
      const andClause = where.AND as Prisma.StoryWhereInput[];
      const lastOr = andClause[andClause.length - 1];
      if (lastOr && 'OR' in lastOr && Array.isArray(lastOr.OR)) {
        lastOr.OR.push({ id: { in: semanticStoryIds } });
      }
    }

    // Market filter: match story location against market name, neighborhoods, and keywords
    let marketOrConditions: Prisma.StoryWhereInput[] | null = null;

    if (marketIds) {
      const rawIds = marketIds.split(',').map((s) => s.trim()).filter(Boolean);
      const includeNational = rawIds.includes('__national__');
      const ids = rawIds.filter((id) => id !== '__national__');

      const orConditions: Prisma.StoryWhereInput[] = [];

      if (includeNational) {
        orConditions.push({ locationName: { contains: 'National', mode: 'insensitive' as const } });
        orConditions.push({ locationName: { equals: 'National', mode: 'insensitive' as const } });
        orConditions.push({ locationName: null });
      }

      if (ids.length > 0) {
        const markets = await prisma.market.findMany({
          where: { id: { in: ids } },
          select: { name: true, state: true, keywords: true },
        });

        // Primary filter: stories from sources linked to the selected market(s)
        // This is the most reliable — a Toronto source only produces Toronto stories
        orConditions.push({
          storySources: {
            some: {
              sourcePost: {
                source: {
                  OR: [
                    { marketId: { in: ids } },
                    { sourceMarkets: { some: { marketId: { in: ids } } } },
                  ],
                },
              },
            },
          },
        });

        // Secondary filter: location name contains the city name (e.g., "Downtown, Toronto")
        // Only match on city name and unique keywords — NOT neighborhoods (too generic)
        for (const m of markets) {
          // City name match: "Toronto" in locationName
          orConditions.push({ locationName: { contains: m.name, mode: 'insensitive' as const } });

          // Qualified location match: "Downtown, Toronto" or "Toronto, ON"
          const keywords = (m.keywords || []) as string[];
          for (const kw of keywords) {
            const normalized = kw.trim();
            // Only use keywords that are unique enough (6+ chars, multi-word, or market-specific)
            if (normalized.length >= 6 && !['downtown', 'midtown', 'uptown', 'east side', 'west side'].includes(normalized.toLowerCase())) {
              orConditions.push({ locationName: { equals: normalized, mode: 'insensitive' as const } });
            }
          }
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

    let stories: any[], total: number, categoryFacets: any[], statusFacets: any[], sourceData: any[];
    try {
      [stories, total, categoryFacets, statusFacets, sourceData] = await Promise.all([
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
          ${status ? Prisma.sql`AND st.status::text IN (${Prisma.join(status.split(',').map(s => s.trim()).filter(Boolean))})` : Prisma.empty}
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
          ${marketIds && !marketIds.includes('__national__') ? Prisma.sql`AND (s."marketId" IN (${Prisma.join(marketIds.split(',').map(s => s.trim()).filter(Boolean))}) OR EXISTS (SELECT 1 FROM "SourceMarket" sm WHERE sm."sourceId" = s.id AND sm."marketId" IN (${Prisma.join(marketIds.split(',').map(s => s.trim()).filter(Boolean))})))` : Prisma.empty}
        GROUP BY s.id, s.name, s.platform
        ORDER BY count DESC
      `,
    ]);
    } catch (primaryErr: any) {
      // Fallback: simplified query without relations that may not exist in DB
      app.log.error({ err: primaryErr.message }, 'Stories primary query failed — using simplified fallback');
      try {
        [stories, total] = await Promise.all([
          prisma.story.findMany({
            where,
            orderBy: { [sort]: order },
            take: limit,
            skip: offset,
            include: {
              storySources: {
                include: { sourcePost: { select: { id: true, url: true, publishedAt: true, source: { select: { name: true, platform: true } } } } },
                orderBy: { similarityScore: 'desc' },
                take: 5,
              },
              _count: { select: { storySources: true } },
            },
          }),
          prisma.story.count({ where }),
        ]);
        // Empty facets + fill missing relations
        stories = stories.map((s: any) => ({ ...s, coverageMatches: [], scoreSnapshots: [], parentStory: null, followUps: [], accountStories: [] }));
      } catch (fallbackErr: any) {
        app.log.error({ err: fallbackErr.message }, 'Stories fallback query also failed — trying raw SQL');
        // Ultra fallback: raw SQL
        const safeSort = ['compositeScore','breakingScore','trendingScore','firstSeenAt','lastUpdatedAt'].includes(sort) ? sort : 'compositeScore';
        const safeOrder = order === 'asc' ? 'ASC' : 'DESC';
        stories = await prisma.$queryRaw<any[]>`
          SELECT id, title, summary, "aiSummary", status, category, "locationName", neighborhood,
                 "breakingScore", "trendingScore", "confidenceScore", "localityScore", "compositeScore",
                 "sourceCount", "firstSeenAt", "lastUpdatedAt"
          FROM "Story" WHERE "mergedIntoId" IS NULL
          ORDER BY ${Prisma.raw(`"${safeSort}"`)} ${Prisma.raw(safeOrder)}
          LIMIT ${limit} OFFSET ${offset}
        `;
        const countResult = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "Story" WHERE "mergedIntoId" IS NULL`;
        total = countResult[0]?.count || 0;
        stories = stories.map((s: any) => ({ ...s, storySources: [], coverageMatches: [], scoreSnapshots: [], _count: { storySources: s.sourceCount || 0 } }));
      }
      categoryFacets = [];
      statusFacets = [];
      sourceData = [];
    }
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

  // ─── Public Teaser ──────────────────────────────────────────────────────────
  // GET /stories/teaser — 10 most recent stories for the visitor's market (no auth required)
  // MUST be registered BEFORE /stories/:id parametric route.
  app.get('/stories/teaser', async (request, reply) => {
    try {
      const { resolveMarketFromIP } = await import('../lib/ip-to-market.js');
      const clientIP = request.headers['x-forwarded-for']
        ? String(request.headers['x-forwarded-for']).split(',')[0].trim()
        : request.ip;

      const marketInfo = await resolveMarketFromIP(clientIP);

      const where: any = {
        mergedIntoId: null,
        status: { notIn: ['STALE', 'ARCHIVED'] },
      };

      if (marketInfo) {
        const market = await prisma.market.findUnique({
          where: { id: marketInfo.marketId },
          select: { name: true, state: true, keywords: true, neighborhoods: true },
        });

        if (market) {
          const locationConditions: any[] = [];
          const marketName = market.name.toLowerCase();
          locationConditions.push({ locationName: { contains: marketName, mode: 'insensitive' } });
          if (market.state) {
            locationConditions.push({ locationName: { contains: market.state, mode: 'insensitive' } });
          }
          const keywords = (market.keywords as string[]) || [];
          for (const kw of keywords) {
            if (kw.length >= 6) {
              locationConditions.push({ locationName: { contains: kw, mode: 'insensitive' } });
            }
          }
          where.OR = locationConditions;
        }
      }

      const storySelect = {
        id: true,
        title: true,
        category: true,
        status: true,
        locationName: true,
        sourceCount: true,
        firstSeenAt: true,
        lastUpdatedAt: true,
        // Removed from teaser: compositeScore, breakingScore, trendingScore, aiSummary
        // Public endpoint should not expose internal scoring or AI-generated content
      };

      let stories = await prisma.story.findMany({
        where,
        orderBy: { lastUpdatedAt: 'desc' },
        take: 10,
        select: storySelect,
      });

      // If local market filter returned too few results, backfill with national/any recent stories
      if (stories.length < 5) {
        const existingIds = stories.map(s => s.id);
        const backfill = await prisma.story.findMany({
          where: {
            mergedIntoId: null,
            status: { notIn: ['STALE', 'ARCHIVED'] },
            id: { notIn: existingIds },
          },
          orderBy: { lastUpdatedAt: 'desc' },
          take: 10 - stories.length,
          select: storySelect,
        });
        stories = [...stories, ...backfill];
      }

      return reply.send({
        stories,
        market: marketInfo ? { name: marketInfo.marketName, city: marketInfo.city, state: marketInfo.state } : null,
        total: stories.length,
        isTeaser: true,
      });
    } catch (err: any) {
      request.log.error(err, 'Teaser endpoint error');
      return reply.status(500).send({ error: 'Failed to load stories' });
    }
  });

  // POST /api/v1/stories/:id/verify — LLM-powered story verification
  // Sends the story to 2 different LLMs and asks them to independently confirm/deny
  app.post('/stories/:id/verify', async (request, reply) => {
    const parseResult = StoryIdParamsSchema.safeParse(request.params);
    if (!parseResult.success) return reply.status(400).send({ error: 'Invalid story ID' });

    const { id } = parseResult.data;
    const story = await prisma.story.findUnique({
      where: { id },
      include: {
        storySources: {
          include: { sourcePost: { select: { title: true, content: true, url: true, source: { select: { name: true } } } } },
          take: 5,
        },
      },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    try {
      const { generateWithFallback } = await import('../lib/llm-factory.js');

      const storyContext = `Title: ${story.title}\nSummary: ${story.aiSummary || story.summary || ''}\nCategory: ${story.category || 'Unknown'}\nLocation: ${story.locationName || 'Unknown'}\nSources: ${story.storySources.map(ss => `${ss.sourcePost?.source?.name}: ${ss.sourcePost?.title}`).join('; ')}`;

      const verifyPrompt = `You are a fact-checking AI. Analyze this news story and determine if it appears to be a real, verifiable news event. Consider:
1. Is this a plausible news story based on known events?
2. Do the sources and details seem credible?
3. Are there any red flags (satire, misinformation patterns, implausible claims)?

Story:
${storyContext}

Respond in exactly this format:
VERDICT: CONFIRMED or UNCONFIRMED or SUSPICIOUS
CONFIDENCE: <number 0-100>
REASON: <one sentence explanation>`;

      // Query two different LLMs independently
      const [result1, result2] = await Promise.allSettled([
        generateWithFallback(verifyPrompt, {
          systemPrompt: 'You are a careful fact-checker. Only mark as CONFIRMED if the story describes a real, verifiable event.',
          maxTokens: 150,
          temperature: 0.1,
          preferredProvider: 'openai',
        }),
        generateWithFallback(verifyPrompt, {
          systemPrompt: 'You are a careful fact-checker. Only mark as CONFIRMED if the story describes a real, verifiable event.',
          maxTokens: 150,
          temperature: 0.1,
          preferredProvider: 'xai', // Grok — has real-time X/Twitter access
        }),
      ]);

      const verdicts: Array<{ provider: string; verdict: string; confidence: number; reason: string }> = [];

      for (const [idx, result] of [result1, result2].entries()) {
        if (result.status === 'fulfilled') {
          const text = result.value.content || result.value.text || '';
          const verdictMatch = text.match(/VERDICT:\s*(CONFIRMED|UNCONFIRMED|SUSPICIOUS)/i);
          const confMatch = text.match(/CONFIDENCE:\s*(\d+)/);
          const reasonMatch = text.match(/REASON:\s*(.+)/i);
          verdicts.push({
            provider: idx === 0 ? 'openai' : 'xai',
            verdict: verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN',
            confidence: confMatch ? parseInt(confMatch[1]) / 100 : 0.5,
            reason: reasonMatch ? reasonMatch[1].trim() : 'No reason provided',
          });
        }
      }

      // Determine overall verification
      const confirmedCount = verdicts.filter(v => v.verdict === 'CONFIRMED').length;
      const suspiciousCount = verdicts.filter(v => v.verdict === 'SUSPICIOUS').length;
      const avgConfidence = verdicts.length > 0
        ? verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length
        : 0;

      let verificationStatus = 'UNVERIFIED';
      if (confirmedCount >= 2) verificationStatus = 'VERIFIED';
      else if (confirmedCount === 1 && verdicts.length >= 2) verificationStatus = 'UNVERIFIED';
      else if (suspiciousCount >= 1) verificationStatus = 'DISPUTED';

      // Factor in source count
      const sourceCount = story.storySources.length;
      const verificationScore = Math.min(1, (avgConfidence * 0.6) + (Math.min(sourceCount, 5) * 0.08));

      // For each CONFIRMED verdict, create a SourcePost from that LLM as a new source
      const llmPlatformMap: Record<string, string> = { openai: 'LLM_OPENAI', xai: 'LLM_GROK', google: 'LLM_GEMINI', anthropic: 'LLM_CLAUDE' };
      for (const v of verdicts) {
        if (v.verdict === 'CONFIRMED') {
          try {
            const platform = llmPlatformMap[v.provider] || 'LLM_OPENAI';
            // Find or create the LLM source
            let llmSource = await prisma.source.findFirst({
              where: { platform: platform as any, name: { contains: 'Verification' } },
            });
            if (!llmSource) {
              llmSource = await prisma.source.create({
                data: {
                  name: `AI Verification (${v.provider})`,
                  platform: platform as any,
                  sourceType: 'LLM_PROVIDER' as any,
                  trustScore: 0.6,
                  isActive: true,
                },
              });
            }

            // Create a SourcePost with the LLM's verification response
            const platformPostId = `llm-verify::${v.provider}::${id}::${Date.now()}`;
            const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
            if (!existing) {
              const verifyPost = await prisma.sourcePost.create({
                data: {
                  sourceId: llmSource.id,
                  platformPostId,
                  title: `[Verified] ${story.title}`,
                  content: `${v.reason} (${v.provider} AI verification, ${Math.round(v.confidence * 100)}% confidence)`,
                  url: '',
                  category: story.category || undefined,
                  locationName: story.locationName || undefined,
                  publishedAt: new Date(),
                  contentHash: platformPostId,
                },
              });

              // Link to the story
              await prisma.storySource.create({
                data: {
                  storyId: id,
                  sourcePostId: verifyPost.id,
                  similarityScore: 1.0,
                  isPrimary: false,
                },
              }).catch(() => {}); // Ignore if already linked

              // Increment source count
              await prisma.story.update({
                where: { id },
                data: { sourceCount: { increment: 1 } },
              });
            }
          } catch (err) {
            request.log.warn({ provider: v.provider, err }, 'Failed to create verification source post');
          }
        }
      }

      // Update story with verification results
      await prisma.story.update({
        where: { id },
        data: {
          verificationStatus,
          verificationScore,
          ...(verificationStatus === 'VERIFIED' ? { verifiedAt: new Date() } : {}),
          verificationDetails: {
            llmVerdicts: verdicts,
            sourceCount,
            avgConfidence,
            verifiedBy: 'llm-dual-check',
            verifiedAt: new Date().toISOString(),
          },
        },
      });

      return reply.send({
        storyId: id,
        verificationStatus,
        verificationScore,
        verdicts,
        sourceCount,
      });
    } catch (err: any) {
      request.log.error(err, 'Story verification failed');
      return reply.status(500).send({ error: 'Verification failed' });
    }
  });

  // GET /api/v1/stories/:id/related - find stories sharing 2+ entities
  app.get('/stories/:id/related', async (request, reply) => {
    const parseResult = StoryIdParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid story ID' });
    }

    const { id } = parseResult.data;

    // Verify story exists
    const story = await prisma.story.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    try {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          status: string;
          category: string | null;
          locationName: string | null;
          compositeScore: number;
          sharedCount: bigint;
          sharedEntities: string[];
        }>
      >`
        SELECT s.id, s.title, s.status, s.category, s."locationName", s."compositeScore",
               COUNT(*) as "sharedCount",
               array_agg(se2.name || '::' || se2.type) as "sharedEntities"
        FROM "StoryEntity" se1
        JOIN "StoryEntity" se2 ON se1.name = se2.name AND se1.type = se2.type AND se1."storyId" != se2."storyId"
        JOIN "Story" s ON s.id = se2."storyId"
        WHERE se1."storyId" = ${id}
          AND s."mergedIntoId" IS NULL
          AND s.status NOT IN ('ARCHIVED', 'STALE')
        GROUP BY s.id
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC, s."compositeScore" DESC
        LIMIT 10
      `;

      const related = rows.map((row) => {
        // Parse "name::type" pairs into objects and deduplicate
        const entityPairs = (row.sharedEntities || []).map((e) => {
          const [name, type] = e.split('::');
          return { name, type };
        });
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          category: row.category,
          locationName: row.locationName,
          compositeScore: row.compositeScore,
          sharedEntities: entityPairs,
          sharedCount: Number(row.sharedCount),
        };
      });

      return reply.send({ related });
    } catch (err: any) {
      request.log.error(err, 'Failed to fetch related stories');
      return reply.status(500).send({ error: 'Failed to fetch related stories' });
    }
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

    // Auto-generate AI summary if missing and story has 2+ sources
    const sourceCount = story._count.storySources || 0;
    if (!story.aiSummary && sourceCount >= 2) {
      // Fire-and-forget: don't block the response
      (async () => {
        try {
          const { generateWithFallback } = await import('../lib/llm-factory.js');

          // Build context from all source posts
          const sourceTitles = story.storySources
            .map((ss: any) => ss.sourcePost?.title)
            .filter(Boolean)
            .slice(0, 10);
          const sourceContents = story.storySources
            .map((ss: any) => ss.sourcePost?.content?.substring(0, 300))
            .filter(Boolean)
            .slice(0, 5);
          const sourceNames = story.storySources
            .map((ss: any) => ss.sourcePost?.source?.name)
            .filter(Boolean);
          const uniqueSourceNames = [...new Set(sourceNames)];

          const prompt = `You are a senior newsroom editor. Write a concise, professional news summary (2-3 sentences) that synthesizes information from multiple sources. Also suggest the best headline title.

Story title: ${story.title}
Category: ${story.category || 'General'}
Location: ${story.locationName || 'Unknown'}
Source count: ${sourceCount} sources (${uniqueSourceNames.join(', ')})

Source headlines:
${sourceTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

Source excerpts:
${sourceContents.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

Respond in exactly this format:
TITLE: <best headline, max 120 chars, factual, no clickbait>
SUMMARY: <2-3 sentence synthesis of the story from all sources>`;

          const result = await generateWithFallback(prompt, {
            maxTokens: 300,
            temperature: 0.3,
            systemPrompt: 'You are a broadcast news editor writing for a TV newsroom. Be factual, concise, and professional.',
          });

          const text = result.content || result.text || '';
          const titleMatch = text.match(/TITLE:\s*(.+)/i);
          const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+)/i);

          const newTitle = titleMatch ? titleMatch[1].trim() : null;
          const newSummary = summaryMatch ? summaryMatch[1].trim() : null;

          if (newSummary) {
            const updateData: any = {
              aiSummary: newSummary,
              aiSummaryModel: result.model || 'unknown',
              aiSummaryAt: new Date(),
            };
            // Update title if the AI-generated one is better (longer, more descriptive)
            if (newTitle && newTitle.length > story.title.length && newTitle.length <= 150) {
              updateData.title = newTitle;
            }
            await prisma.story.update({
              where: { id },
              data: updateData,
            });
            request.log.info({ storyId: id, model: result.model }, 'Auto-generated AI summary on story view');
          }
        } catch (err) {
          request.log.warn({ storyId: id, err }, 'Failed to auto-generate AI summary');
        }
      })();
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
