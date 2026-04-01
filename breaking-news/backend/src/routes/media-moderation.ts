// @ts-nocheck
/**
 * Image/Video Moderation + Online Users + Feed Quality Review
 *
 * Media moderation: approve/reject images and videos before publishing
 * Online users: track and display currently active users
 * Feed review: manual quality review workflow for sources
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

function requireAuth(req: any) {
  const au = req.accountUser;
  if (!au) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return au;
}

export async function mediaModerationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // ═══════════════════════════════════════════════════════════════════════
  // ONLINE USERS
  // ═══════════════════════════════════════════════════════════════════════

  // POST /activity/presence — update user presence (called by frontend heartbeat)
  app.post('/activity/presence', async (request, reply) => {
    const au = requireAuth(request);

    try {
      const redis = await import('../lib/redis.js').then(m => m.getRedis());
      const key = `tp:online:${au.userId}`;
      const data = JSON.stringify({
        userId: au.userId,
        accountId: au.accountId,
        role: au.role,
        lastSeen: new Date().toISOString(),
      });
      await redis.set(key, data, 'EX', 360); // 6 min TTL
      return reply.send({ ok: true });
    } catch {
      return reply.send({ ok: true });
    }
  });

  // GET /activity/online — list currently online users
  app.get('/activity/online', async (request, reply) => {
    requireAuth(request);

    try {
      const redis = await import('../lib/redis.js').then(m => m.getRedis());
      const keys = await redis.keys('tp:online:*');
      const users: any[] = [];

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          try { users.push(JSON.parse(data)); } catch {}
        }
      }

      // Enrich with user display names
      const userIds = users.map(u => u.userId).filter(Boolean);
      const userRecords = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
          })
        : [];

      const userMap = new Map(userRecords.map(u => [u.id, u]));

      return reply.send({
        online: users.map(u => ({
          ...u,
          displayName: userMap.get(u.userId)?.displayName || userMap.get(u.userId)?.email || 'Unknown',
          avatarUrl: userMap.get(u.userId)?.avatarUrl,
        })),
        count: users.length,
      });
    } catch {
      return reply.send({ online: [], count: 0 });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // IMAGE/VIDEO MODERATION
  // ═══════════════════════════════════════════════════════════════════════

  // GET /media/pending — images/videos pending moderation
  app.get('/media/pending', async (request, reply) => {
    requireAuth(request);

    const query = z.object({
      type: z.enum(['image', 'video', 'all']).default('all'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'Validation error' });

    // Find source posts with media that haven't been reviewed
    const where: any = {
      mediaUrls: { not: null },
    };

    const posts = await prisma.sourcePost.findMany({
      where,
      select: {
        id: true,
        title: true,
        url: true,
        mediaUrls: true,
        createdAt: true,
        source: { select: { name: true, platform: true } },
        storySources: { select: { storyId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.data.limit,
      skip: query.data.offset,
    });

    // Filter to posts with actual media
    const withMedia = posts.filter(p => {
      const urls = (p.mediaUrls || []) as string[];
      return urls.length > 0;
    });

    return reply.send({ data: withMedia, total: withMedia.length });
  });

  // POST /media/:postId/approve — approve media for a post
  app.post('/media/:postId/approve', async (request, reply) => {
    const au = requireAuth(request);
    const { postId } = request.params as { postId: string };

    await prisma.sourcePost.update({
      where: { id: postId },
      data: {
        rawData: {
          ...(await prisma.sourcePost.findUnique({ where: { id: postId }, select: { rawData: true } }).then(p => (p?.rawData || {}) as Record<string, any>)),
          mediaApproved: true,
          mediaReviewedBy: au.userId,
          mediaReviewedAt: new Date().toISOString(),
        },
      },
    });

    return reply.send({ message: 'Media approved', postId });
  });

  // POST /media/:postId/reject — reject/remove media from a post
  app.post('/media/:postId/reject', async (request, reply) => {
    const au = requireAuth(request);
    const { postId } = request.params as { postId: string };

    await prisma.sourcePost.update({
      where: { id: postId },
      data: {
        mediaUrls: [], // Clear media
        rawData: {
          ...(await prisma.sourcePost.findUnique({ where: { id: postId }, select: { rawData: true } }).then(p => (p?.rawData || {}) as Record<string, any>)),
          mediaRejected: true,
          mediaReviewedBy: au.userId,
          mediaReviewedAt: new Date().toISOString(),
        },
      },
    });

    return reply.send({ message: 'Media rejected and removed', postId });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEED QUALITY REVIEW
  // ═══════════════════════════════════════════════════════════════════════

  // GET /feed-review/queue — sources due for quality review
  app.get('/feed-review/queue', async (request, reply) => {
    requireAuth(request);

    const query = z.object({
      status: z.enum(['unreviewed', 'approved', 'poor', 'all']).default('unreviewed'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'Validation error' });

    // Find active sources that haven't been reviewed recently
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, platform: true, url: true,
        trustScore: true, lastPolledAt: true, metadata: true,
        _count: { select: { posts: true } },
      },
      orderBy: { lastPolledAt: 'desc' },
      take: query.data.limit,
    });

    // Filter by review status in metadata
    const filtered = sources.filter(s => {
      const meta = (s.metadata || {}) as Record<string, any>;
      if (query.data.status === 'all') return true;
      if (query.data.status === 'unreviewed') return !meta.lastReviewedAt;
      if (query.data.status === 'approved') return meta.reviewStatus === 'approved';
      if (query.data.status === 'poor') return meta.reviewStatus === 'poor';
      return true;
    });

    return reply.send({
      data: filtered.map(s => ({
        ...s,
        postCount: s._count.posts,
        reviewStatus: ((s.metadata || {}) as any).reviewStatus || 'unreviewed',
        lastReviewedAt: ((s.metadata || {}) as any).lastReviewedAt,
      })),
    });
  });

  // POST /feed-review/:sourceId — submit a feed quality review
  app.post('/feed-review/:sourceId', async (request, reply) => {
    const au = requireAuth(request);
    const { sourceId } = request.params as { sourceId: string };

    const body = z.object({
      status: z.enum(['approved', 'poor', 'needs_attention']),
      notes: z.string().optional(),
      accuracyRating: z.number().int().min(1).max(5).optional(),
      relevanceRating: z.number().int().min(1).max(5).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return reply.status(404).send({ error: 'Source not found' });

    const meta = (source.metadata || {}) as Record<string, any>;
    const reviews = Array.isArray(meta.reviews) ? meta.reviews : [];

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        // Adjust trust score based on review
        trustScore: body.data.status === 'approved'
          ? Math.min(1.0, source.trustScore + 0.05)
          : body.data.status === 'poor'
          ? Math.max(0.1, source.trustScore - 0.1)
          : source.trustScore,
        metadata: {
          ...meta,
          reviewStatus: body.data.status,
          lastReviewedAt: new Date().toISOString(),
          lastReviewedBy: au.userId,
          reviews: [...reviews, {
            status: body.data.status,
            notes: body.data.notes,
            accuracy: body.data.accuracyRating,
            relevance: body.data.relevanceRating,
            by: au.userId,
            at: new Date().toISOString(),
          }].slice(-10), // Keep last 10 reviews
        },
      },
    });

    return reply.send({ message: `Feed reviewed: ${body.data.status}`, sourceId });
  });
}
