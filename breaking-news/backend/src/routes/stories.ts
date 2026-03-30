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
  app.get('/stories', async (request, reply) => {
    const parseResult = ListStoriesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { status, category, sourceIds, uncoveredOnly, trend, minScore, maxAge, limit, offset, sort, order } =
      parseResult.data;

    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null, // exclude merged stories
    };

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

    // Build facet where clauses — each facet excludes its own filter
    // so counts show what's available if you change that filter
    const baseFacetWhere: Prisma.StoryWhereInput = { mergedIntoId: null };
    if (maxAge !== undefined) {
      baseFacetWhere.firstSeenAt = { gte: new Date(Date.now() - maxAge * 60 * 60 * 1000) };
    }
    if (minScore !== undefined) {
      baseFacetWhere.compositeScore = { gte: minScore };
    }
    if (sourceIds) {
      const ids = sourceIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        baseFacetWhere.storySources = { some: { sourcePost: { sourceId: { in: ids } } } };
      }
    }

    // Category facet where: includes status + source filters, excludes category
    const catFacetWhere: Prisma.StoryWhereInput = { ...baseFacetWhere };
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      catFacetWhere.status = statuses.length === 1
        ? (statuses[0] as StoryStatus)
        : { in: statuses as StoryStatus[] };
    }

    // Helper: apply category filter to a where clause (handles Unknown → null)
    function applyCategoryFilter(w: Prisma.StoryWhereInput) {
      if (!category) return;
      const cats = category.split(',').map((s) => s.trim()).filter(Boolean);
      const hasUnknown = cats.includes('Unknown');
      const named = cats.filter((c) => c !== 'Unknown');
      if (hasUnknown && named.length > 0) {
        w.OR = [...(w.OR || []), { category: { in: named } }, { category: null }];
      } else if (hasUnknown) {
        w.category = null;
      } else if (named.length === 1) {
        w.category = named[0];
      } else if (named.length > 1) {
        w.category = { in: named };
      }
    }

    // Status facet where: includes category + source filters, excludes status
    const statusFacetWhere: Prisma.StoryWhereInput = { ...baseFacetWhere };
    applyCategoryFilter(statusFacetWhere);

    // Source facet where: includes status + category filters, excludes source
    const sourceFacetWhere: Prisma.StoryWhereInput = { ...baseFacetWhere };
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      sourceFacetWhere.status = statuses.length === 1
        ? (statuses[0] as StoryStatus)
        : { in: statuses as StoryStatus[] };
    }
    applyCategoryFilter(sourceFacetWhere);

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
          _count: {
            select: { storySources: true },
          },
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
      // For source facets, we need to go through SourcePost → Source
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

    return reply.send({
      data: filteredStories,
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
