// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../../lib/prisma.js';

export async function communityRadarRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /community-radar — list all configs for account with post counts and latest post date
  app.get('/community-radar', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const configs = await prisma.communityRadarConfig.findMany({
      where: { accountId: au.accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { posts: true } },
        posts: {
          orderBy: { postedAt: 'desc' },
          take: 1,
          select: { postedAt: true },
        },
      },
    });

    const data = configs.map((c) => ({
      id: c.id,
      accountId: c.accountId,
      name: c.name,
      platform: c.platform,
      url: c.url,
      urlType: c.urlType,
      scrapeFrequencyMin: c.scrapeFrequencyMin,
      isActive: c.isActive,
      lastScrapedAt: c.lastScrapedAt,
      metadata: c.metadata,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      postCount: c._count.posts,
      latestPostDate: c.posts[0]?.postedAt || null,
    }));

    return reply.send({ data });
  });

  // POST /community-radar — create config
  app.post('/community-radar', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      name: z.string().min(1),
      platform: z.enum(['FACEBOOK', 'TWITTER']),
      url: z.string().min(1),
      urlType: z.enum(['FB_PAGE', 'FB_GROUP', 'TWITTER_LIST', 'TWITTER_SEARCH']),
      scrapeFrequencyMin: z.number().int().min(15).max(480).optional().default(60),
    }).parse(request.body);

    const config = await prisma.communityRadarConfig.create({
      data: {
        accountId: au.accountId,
        name: body.name,
        platform: body.platform,
        url: body.url,
        urlType: body.urlType,
        scrapeFrequencyMin: body.scrapeFrequencyMin,
      },
    });

    return reply.status(201).send({ data: config });
  });

  // PATCH /community-radar/:id — update config
  app.patch('/community-radar/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const body = z.object({
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
      scrapeFrequencyMin: z.number().int().min(15).max(480).optional(),
    }).parse(request.body);

    const existing = await prisma.communityRadarConfig.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const updated = await prisma.communityRadarConfig.update({
      where: { id },
      data: body,
    });

    return reply.send({ data: updated });
  });

  // DELETE /community-radar/:id — delete config and its posts
  app.delete('/community-radar/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const existing = await prisma.communityRadarConfig.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    // Delete posts first, then config
    await prisma.communityRadarPost.deleteMany({ where: { configId: id } });
    await prisma.communityRadarConfig.delete({ where: { id } });

    return reply.status(204).send();
  });

  // GET /community-radar/:id/posts — list posts for a config
  app.get('/community-radar/:id/posts', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const config = await prisma.communityRadarConfig.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!config) return reply.status(404).send({ error: 'Not found' });

    const posts = await prisma.communityRadarPost.findMany({
      where: { configId: id },
      orderBy: { postedAt: 'desc' },
      take: 50,
    });

    return reply.send({ data: posts });
  });

  // GET /community-radar/feed — unified feed across ALL configs for the account
  app.get('/community-radar/feed', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const configs = await prisma.communityRadarConfig.findMany({
      where: { accountId: au.accountId },
      select: { id: true, name: true, platform: true },
    });

    const configIds = configs.map((c) => c.id);
    const configMap = Object.fromEntries(configs.map((c) => [c.id, { name: c.name, platform: c.platform }]));

    if (configIds.length === 0) {
      return reply.send({ data: [] });
    }

    const posts = await prisma.communityRadarPost.findMany({
      where: { configId: { in: configIds } },
      orderBy: { postedAt: 'desc' },
      take: 100,
    });

    const data = posts.map((p) => ({
      ...p,
      configName: configMap[p.configId]?.name || 'Unknown',
      configPlatform: configMap[p.configId]?.platform || 'Unknown',
    }));

    return reply.send({ data });
  });

  // GET /community-radar/sentiment — sentiment breakdown per config (last 24h)
  app.get('/community-radar/sentiment', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const configs = await prisma.communityRadarConfig.findMany({
      where: { accountId: au.accountId },
      select: { id: true, name: true, platform: true },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      configs.map(async (config) => {
        const posts = await prisma.communityRadarPost.findMany({
          where: {
            configId: config.id,
            postedAt: { gte: since },
          },
          select: { sentimentLabel: true, sentimentScore: true },
        });

        const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
        let totalScore = 0;
        let scoredCount = 0;

        for (const p of posts) {
          const label = (p.sentimentLabel || 'neutral').toLowerCase();
          if (label in counts) {
            counts[label as keyof typeof counts]++;
          } else {
            counts.neutral++;
          }
          if (p.sentimentScore != null) {
            totalScore += p.sentimentScore;
            scoredCount++;
          }
        }

        return {
          configId: config.id,
          configName: config.name,
          platform: config.platform,
          totalPosts: posts.length,
          ...counts,
          averageSentiment: scoredCount > 0 ? totalScore / scoredCount : null,
        };
      })
    );

    return reply.send({ data: results });
  });

  // POST /community-radar/:id/scan — manually trigger a scan
  app.post('/community-radar/:id/scan', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const config = await prisma.communityRadarConfig.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!config) return reply.status(404).send({ error: 'Not found' });

    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue('community-radar', { connection });

    await queue.add('scan', {
      configId: config.id,
      accountId: au.accountId,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    await queue.close();
    await connection.quit();

    return reply.send({ data: { message: 'Scan queued', configId: config.id } });
  });
}
