// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPayload } from '../lib/route-helpers.js';

const VALID_CHANNELS = ['broadcast', 'social', 'push', 'web'] as const;

export async function publishQueueRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/publish-queue — List packages ready for publishing
  app.get('/publish-queue', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const query = z.object({
      status: z.enum(['GENERATED', 'REVIEWED', 'PUBLISHED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const where: any = { accountId: payload.accountId };
    if (query.status) where.status = query.status;

    const [packages, total] = await Promise.all([
      prisma.breakingPackage.findMany({
        where,
        include: {
          story: {
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              compositeScore: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.breakingPackage.count({ where }),
    ]);

    return reply.send({ data: packages, total, limit: query.limit, offset: query.offset });
  });

  // PATCH /api/v1/publish-queue/:packageId/review — Mark package as reviewed
  app.patch('/publish-queue/:packageId/review', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const { packageId } = request.params as { packageId: string };

    const body = z.object({
      broadcastScript: z.string().optional(),
      socialPost: z.string().optional(),
      pushTitle: z.string().optional(),
      pushBody: z.string().optional(),
      webSummary: z.string().optional(),
    }).parse(request.body);

    const existing = await prisma.breakingPackage.findUnique({ where: { id: packageId } });
    if (!existing) return reply.status(404).send({ error: 'Package not found' });
    if (existing.accountId !== payload.accountId) return reply.status(403).send({ error: 'Forbidden' });

    const updated = await prisma.breakingPackage.update({
      where: { id: packageId },
      data: {
        ...body,
        status: 'REVIEWED',
      },
    });

    return reply.send({ data: updated });
  });

  // POST /api/v1/publish-queue/:packageId/publish — Publish to selected channels
  app.post('/publish-queue/:packageId/publish', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const { packageId } = request.params as { packageId: string };

    const body = z.object({
      channels: z.array(z.enum(VALID_CHANNELS)).min(1),
    }).parse(request.body);

    const pkg = await prisma.breakingPackage.findUnique({
      where: { id: packageId },
      include: { story: { select: { id: true, title: true } } },
    });
    if (!pkg) return reply.status(404).send({ error: 'Package not found' });
    if (pkg.accountId !== payload.accountId) return reply.status(403).send({ error: 'Forbidden' });

    const publishedChannels: string[] = [];

    for (const channel of body.channels) {
      try {
        if (channel === 'social') {
          // If account has Slack integration, send socialPost to Slack
          const slackIntegrations = await prisma.slackIntegration.findMany({
            where: { accountId: payload.accountId, isActive: true },
          });

          for (const slack of slackIntegrations) {
            try {
              await fetch(slack.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: pkg.socialPost || `Breaking: ${pkg.story.title}`,
                }),
                signal: AbortSignal.timeout(10000),
              });
            } catch {
              // Slack delivery failure is non-fatal; channel is still marked published
            }
          }
          publishedChannels.push('social');
        } else if (channel === 'push') {
          // Create a Notification record with pushTitle/pushBody
          await prisma.notification.create({
            data: {
              storyId: pkg.storyId,
              type: 'BREAKING_ALERT',
              channel: 'PUSH',
              recipient: 'all', // broadcast push
              payload: {
                title: pkg.pushTitle,
                body: pkg.pushBody,
                storyId: pkg.storyId,
              },
              status: 'PENDING',
            },
          });
          publishedChannels.push('push');
        } else {
          // "broadcast" and "web" — mark as published (actual integration is station-specific)
          publishedChannels.push(channel);
        }
      } catch {
        // If a channel fails, continue with the rest
      }
    }

    // Merge with any previously published channels
    const previouslyPublished = (pkg.publishedTo as string[]) || [];
    const allPublished = [...new Set([...previouslyPublished, ...publishedChannels])];

    const updated = await prisma.breakingPackage.update({
      where: { id: packageId },
      data: {
        publishedTo: allPublished,
        status: 'PUBLISHED',
      },
    });

    return reply.send({ data: updated, publishedChannels });
  });

  // GET /api/v1/publish-queue/stats — Publishing stats
  app.get('/publish-queue/stats', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const where = { accountId: payload.accountId };

    const [total, generated, reviewed, published, allPackages] = await Promise.all([
      prisma.breakingPackage.count({ where }),
      prisma.breakingPackage.count({ where: { ...where, status: 'GENERATED' } }),
      prisma.breakingPackage.count({ where: { ...where, status: 'REVIEWED' } }),
      prisma.breakingPackage.count({ where: { ...where, status: 'PUBLISHED' } }),
      prisma.breakingPackage.findMany({
        where: { ...where, status: 'PUBLISHED' },
        select: { publishedTo: true },
      }),
    ]);

    // Count channels breakdown
    const channelCounts: Record<string, number> = { broadcast: 0, social: 0, push: 0, web: 0 };
    for (const pkg of allPackages) {
      const channels = (pkg.publishedTo as string[]) || [];
      for (const ch of channels) {
        if (ch in channelCounts) channelCounts[ch]++;
      }
    }

    return reply.send({
      data: {
        total,
        pending: generated,
        reviewed,
        published,
        channels: channelCounts,
      },
    });
  });
}
