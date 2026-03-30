import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Prisma, StoryStatus } from '@prisma/client';

const CreateFeedSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  filters: z.object({
    categories: z.array(z.string()).optional(),
    minScore: z.number().min(0).max(1).optional(),
    statuses: z
      .array(
        z.enum([
          'ALERT',
          'BREAKING',
          'DEVELOPING',
          'TOP_STORY',
          'ONGOING',
          'FOLLOW_UP',
          'STALE',
          'ARCHIVED',
        ]),
      )
      .optional(),
    maxAgeHours: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  isPublic: z.boolean().default(false),
});

const FeedSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

interface FeedFilters {
  categories?: string[];
  minScore?: number;
  statuses?: string[];
  maxAgeHours?: number;
  limit?: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function feedsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/feeds - list all RSS feed definitions
  app.get('/feeds', async (_request, reply) => {
    const feeds = await prisma.rSSFeed.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: feeds });
  });

  // POST /api/v1/feeds - create a new RSS feed definition
  app.post('/feeds', async (request, reply) => {
    const parseResult = CreateFeedSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid feed data',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, slug, filters, isPublic } = parseResult.data;

    // Check slug uniqueness
    const existing = await prisma.rSSFeed.findUnique({ where: { slug } });
    if (existing) {
      return reply.status(409).send({ error: 'A feed with this slug already exists' });
    }

    const feed = await prisma.rSSFeed.create({
      data: {
        name,
        slug,
        filters: filters as unknown as Prisma.JsonObject,
        isPublic,
      },
    });

    return reply.status(201).send({ data: feed });
  });

  // GET /api/v1/feeds/:slug/rss - generate RSS XML for a feed
  app.get('/feeds/:slug/rss', async (request, reply) => {
    const parseResult = FeedSlugParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid slug' });
    }

    const { slug } = parseResult.data;

    const feed = await prisma.rSSFeed.findUnique({ where: { slug } });
    if (!feed) {
      return reply.status(404).send({ error: 'Feed not found' });
    }

    const filters = feed.filters as unknown as FeedFilters;
    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null,
    };

    if (filters.categories && filters.categories.length > 0) {
      where.category = { in: filters.categories };
    }

    if (filters.minScore !== undefined) {
      where.compositeScore = { gte: filters.minScore };
    }

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses as StoryStatus[] };
    }

    if (filters.maxAgeHours) {
      const cutoff = new Date(
        Date.now() - filters.maxAgeHours * 60 * 60 * 1000,
      );
      where.firstSeenAt = { gte: cutoff };
    }

    const limit = filters.limit ?? 25;

    const stories = await prisma.story.findMany({
      where,
      orderBy: { compositeScore: 'desc' },
      take: limit,
      include: {
        storySources: {
          include: {
            sourcePost: {
              select: { url: true },
            },
          },
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    const baseUrl = process.env['BASE_URL'] ?? 'http://localhost:3001';
    const now = new Date().toUTCString();

    const items = stories
      .map((story) => {
        const primaryUrl =
          story.storySources[0]?.sourcePost?.url ??
          `${baseUrl}/api/v1/stories/${story.id}`;
        const pubDate = new Date(story.firstSeenAt).toUTCString();
        const description = story.summary ?? story.title;

        return `    <item>
      <title>${escapeXml(story.title)}</title>
      <link>${escapeXml(primaryUrl)}</link>
      <description>${escapeXml(description)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${story.id}</guid>
      ${story.category ? `<category>${escapeXml(story.category)}</category>` : ''}
    </item>`;
      })
      .join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feed.name)}</title>
    <link>${baseUrl}/api/v1/feeds/${slug}/rss</link>
    <description>Breaking News Intelligence Feed: ${escapeXml(feed.name)}</description>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/api/v1/feeds/${slug}/rss" rel="self" type="application/rss+xml"/>
    <ttl>5</ttl>
${items}
  </channel>
</rss>`;

    return reply
      .header('Content-Type', 'application/rss+xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=60')
      .send(rssXml);
  });
}
