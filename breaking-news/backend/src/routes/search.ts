import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  category: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function searchRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/search - full-text search across stories
  app.get('/search', async (request, reply) => {
    const parseResult = SearchQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid search parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { q, category, from, to, limit, offset } = parseResult.data;

    // Sanitize search term for ILIKE
    const sanitized = q.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const searchPattern = `%${sanitized}%`;

    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null,
      OR: [
        { title: { contains: sanitized, mode: 'insensitive' } },
        { summary: { contains: sanitized, mode: 'insensitive' } },
      ],
    };

    if (category) {
      where.category = category;
    }

    if (from || to) {
      where.firstSeenAt = {};
      if (from) {
        (where.firstSeenAt as Prisma.DateTimeFilter).gte = from;
      }
      if (to) {
        (where.firstSeenAt as Prisma.DateTimeFilter).lte = to;
      }
    }

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        orderBy: [{ compositeScore: 'desc' }, { firstSeenAt: 'desc' }],
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { storySources: true },
          },
        },
      }),
      prisma.story.count({ where }),
    ]);

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
        stories,
        relatedPosts: sourcePosts,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      query: q,
    });
  });
}
