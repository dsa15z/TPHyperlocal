// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { semanticSearch, findSimilarStories } from '../lib/vector-search.js';
import { getRedis } from '../lib/redis.js';

// ─── Redis-backed trending search tracker with in-memory fallback ──────────

const TRENDING_KEY = 'bn:search:trending';
const TRENDING_TTL = 86400; // 24 hours

// Fallback in-memory tracker
interface SearchEntry {
  term: string;
  count: number;
  lastSearched: number;
}
const searchCounterFallback = new Map<string, SearchEntry>();

async function trackSearch(term: string): Promise<void> {
  const normalized = term.toLowerCase().trim();
  if (normalized.length < 2) return;
  try {
    const redis = getRedis();
    await redis.zincrby(TRENDING_KEY, 1, normalized);
    // Set TTL on the sorted set (resets on each search, so it expires 24h after last activity)
    await redis.expire(TRENDING_KEY, TRENDING_TTL);
  } catch {
    const existing = searchCounterFallback.get(normalized);
    if (existing) {
      existing.count += 1;
      existing.lastSearched = Date.now();
    } else {
      searchCounterFallback.set(normalized, { term: normalized, count: 1, lastSearched: Date.now() });
    }
  }
}

async function getTrendingSearches(count: number): Promise<Array<{ term: string; count: number }>> {
  try {
    const redis = getRedis();
    const results = await redis.zrevrange(TRENDING_KEY, 0, count - 1, 'WITHSCORES');
    const trending: Array<{ term: string; count: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      trending.push({ term: results[i], count: parseInt(results[i + 1], 10) });
    }
    return trending;
  } catch {
    // Fallback: prune old entries and return from memory
    const cutoff = Date.now() - TRENDING_TTL * 1000;
    for (const [key, entry] of searchCounterFallback) {
      if (entry.lastSearched < cutoff) searchCounterFallback.delete(key);
    }
    return Array.from(searchCounterFallback.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, count)
      .map((e) => ({ term: e.term, count: e.count }));
  }
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  category: z.string().optional(),
  status: z.string().optional(),
  fields: z.string().optional(), // comma-separated: title,content,category,location,entities
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  maxScore: z.coerce.number().min(0).max(1).optional(),
  sort: z.enum(['relevance', 'date', 'score']).default('relevance'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  semantic: z.enum(['true', 'false']).optional(), // enable vector similarity search
});

const SuggestSchema = z.object({
  q: z.string().min(1).max(200),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function highlightMatch(text: string | null | undefined, query: string): string | null {
  if (!text) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function extractSnippet(text: string | null | undefined, query: string, contextChars = 120): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return null;

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return highlightMatch(snippet, query);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'some', 'such', 'than',
    'too', 'very', 'just', 'about', 'up', 'out', 'if', 'then', 'that',
    'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them',
    'their', 'his', 'her', 'we', 'our', 'your', 'who', 'which', 'what',
    'when', 'where', 'how', 'said', 'also', 'one', 'two', 'new', 'houston',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function searchRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/search — Enhanced full-text search across stories
  app.get('/search', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parseResult = SearchQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid search parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { q, category, status, fields, from, to, minScore, maxScore, sort, order, limit, offset, semantic } = parseResult.data;
    const useSemanticSearch = semantic === 'true';

    // Strip HTML tags from search query to prevent XSS (SEC-001)
    const htmlStripped = q.replace(/<[^>]*>/g, '').trim();
    if (!htmlStripped) {
      return reply.send({ data: { stories: [] }, pagination: { total: 0, limit, offset } });
    }

    // Track this search for trending
    await trackSearch(htmlStripped);

    // Sanitize search term for ILIKE
    const sanitized = htmlStripped.replace(/[%_\\]/g, (ch) => `\\${ch}`);

    // Build search fields
    const searchFields = fields
      ? fields.split(',').map((f) => f.trim().toLowerCase())
      : ['title', 'content', 'category', 'location', 'entities'];

    // Build OR conditions based on fields
    const orConditions: Prisma.StoryWhereInput[] = [];

    if (searchFields.includes('title')) {
      orConditions.push({ title: { contains: sanitized, mode: 'insensitive' } });
    }
    if (searchFields.includes('content')) {
      orConditions.push({ summary: { contains: sanitized, mode: 'insensitive' } });
      orConditions.push({ aiSummary: { contains: sanitized, mode: 'insensitive' } });
    }
    if (searchFields.includes('category')) {
      orConditions.push({ category: { contains: sanitized, mode: 'insensitive' } });
    }
    if (searchFields.includes('location')) {
      orConditions.push({ locationName: { contains: sanitized, mode: 'insensitive' } });
      orConditions.push({ neighborhood: { contains: sanitized, mode: 'insensitive' } });
    }
    if (searchFields.includes('entities')) {
      // entities are stored in JSONB — search serialized text
      orConditions.push({ title: { contains: sanitized, mode: 'insensitive' } });
    }

    // Ensure at least one OR condition
    if (orConditions.length === 0) {
      orConditions.push({ title: { contains: sanitized, mode: 'insensitive' } });
    }

    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null,
      OR: orConditions,
    };

    // Category filter
    if (category) {
      where.category = category;
    }

    // Status filter
    if (status) {
      where.status = status as any;
    }

    // Date range filter
    if (from || to) {
      where.firstSeenAt = {};
      if (from) (where.firstSeenAt as Prisma.DateTimeFilter).gte = from;
      if (to) (where.firstSeenAt as Prisma.DateTimeFilter).lte = to;
    }

    // Score range filter
    if (minScore !== undefined || maxScore !== undefined) {
      where.compositeScore = {};
      if (minScore !== undefined) (where.compositeScore as Prisma.FloatFilter).gte = minScore;
      if (maxScore !== undefined) (where.compositeScore as Prisma.FloatFilter).lte = maxScore;
    }

    // Sort order
    let orderBy: any;
    switch (sort) {
      case 'date':
        orderBy = [{ firstSeenAt: order }];
        break;
      case 'score':
        orderBy = [{ compositeScore: order }];
        break;
      case 'relevance':
      default:
        // Relevance: composite score desc as proxy (true relevance would need full-text search ranking)
        orderBy = [{ compositeScore: 'desc' }, { firstSeenAt: 'desc' }];
        break;
    }

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { storySources: true },
          },
          storySources: {
            include: {
              sourcePost: {
                include: { source: { select: { name: true, platform: true } } },
              },
            },
            take: 3,
            orderBy: { similarityScore: 'desc' },
          },
        },
      }),
      prisma.story.count({ where }),
    ]);

    // Build highlights for each story
    const storiesWithHighlights = stories.map((story: any) => {
      const highlights: string[] = [];

      const titleSnippet = extractSnippet(story.title, q);
      if (titleSnippet) highlights.push(titleSnippet);

      const summarySnippet = extractSnippet(story.aiSummary || story.summary, q);
      if (summarySnippet) highlights.push(summarySnippet);

      const locationSnippet = extractSnippet(story.locationName || story.neighborhood, q);
      if (locationSnippet) highlights.push(locationSnippet);

      return {
        ...story,
        highlights: highlights.length > 0 ? highlights : undefined,
      };
    });

    // Build facets from the full result set (without pagination)
    // For performance, use aggregation on the filtered set
    const [categoryFacets, statusFacets, sourcePlatformFacets] = await Promise.all([
      prisma.story.groupBy({
        by: ['category'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),
      prisma.story.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Source platform counts — get from Source table via story sources
      // (SourcePost doesn't have platform directly; Source does)
      prisma.source.groupBy({
        by: ['platform'],
        _count: { id: true },
        where: { isActive: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    const facets = {
      categories: categoryFacets.map((f: any) => ({
        name: f.category || 'Unknown',
        count: f._count.id,
      })),
      statuses: statusFacets.map((f: any) => ({
        name: f.status,
        count: f._count.id,
      })),
      platforms: sourcePlatformFacets.map((f: any) => ({
        name: f.platform,
        count: f._count.id,
      })),
    };

    // Build suggestions if few results
    let suggestions: string[] | undefined;
    if (total < 5 && stories.length > 0) {
      const allText = stories.map((s: any) => `${s.title} ${s.summary || ''} ${s.aiSummary || ''}`).join(' ');
      const keywords = extractKeywords(allText);
      const queryWords = q.toLowerCase().split(/\s+/);
      suggestions = keywords
        .filter((kw) => !queryWords.includes(kw))
        .slice(0, 8);
    }

    // Also search source posts for deeper matches
    const sourcePosts = await prisma.sourcePost.findMany({
      where: {
        OR: [
          { content: { contains: sanitized, mode: 'insensitive' } },
          { title: { contains: sanitized, mode: 'insensitive' } },
        ],
        ...(from || to
          ? {
              publishedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      include: {
        source: { select: { name: true, platform: true } },
      },
    });

    return reply.send({
      data: {
        stories: storiesWithHighlights,
        relatedPosts: sourcePosts,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      query: q,
      sort,
      facets,
      suggestions,
    });
  });

  // GET /api/v1/search/suggest — Autocomplete/typeahead
  app.get('/search/suggest', async (request, reply) => {
    const parseResult = SuggestSchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid params',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { q } = parseResult.data;
    const sanitized = q.replace(/[%_\\]/g, (ch) => `\\${ch}`);

    // Search story titles matching the prefix
    const [titleMatches, categoryMatches] = await Promise.all([
      prisma.story.findMany({
        where: {
          mergedIntoId: null,
          title: { contains: sanitized, mode: 'insensitive' },
        },
        orderBy: [{ compositeScore: 'desc' }],
        take: 10,
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          compositeScore: true,
        },
      }),
      prisma.story.groupBy({
        by: ['category'],
        where: {
          mergedIntoId: null,
          category: { contains: sanitized, mode: 'insensitive' },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    return reply.send({
      data: {
        stories: titleMatches.map((s: any) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          status: s.status,
          score: s.compositeScore,
        })),
        categories: categoryMatches.map((c: any) => ({
          name: c.category,
          count: c._count.id,
        })),
      },
      query: q,
    });
  });

  // GET /api/v1/search/trending — Trending search terms (last 24h)
  app.get('/search/trending', async (_request, reply) => {
    const trending = await getTrendingSearches(20);

    return reply.send({
      data: trending.map((entry) => ({
        term: entry.term,
        count: entry.count,
      })),
      period: '24h',
      total: trending.length,
    });
  });
}
