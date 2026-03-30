// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getQueue, QUEUE_NAMES } from '../../lib/queue.js';

const CreateCoverageFeedSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['RSS', 'API', 'SCRAPE']),
  url: z.string().url(),
  authConfig: z.record(z.unknown()).optional(),
  pollIntervalMin: z.number().int().min(5).max(1440).default(15),
  cssSelector: z.string().optional(),
});

const UpdateCoverageFeedSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  authConfig: z.record(z.unknown()).optional().nullable(),
  pollIntervalMin: z.number().int().min(5).max(1440).optional(),
  cssSelector: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function requireAdmin(role: string) {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    const err = new Error('Forbidden: ADMIN role or higher required');
    (err as any).statusCode = 403;
    throw err;
  }
}

export async function coverageRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/coverage - list coverage feeds for account
  app.get('/coverage', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const feeds = await prisma.coverageFeed.findMany({
      where: { accountId: au.accountId },
      include: {
        _count: {
          select: { matches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get coverage stats per feed
    const feedsWithStats = await Promise.all(
      feeds.map(async (feed) => {
        const [covered, gaps] = await Promise.all([
          prisma.coverageMatch.count({
            where: { coverageFeedId: feed.id, isCovered: true },
          }),
          prisma.coverageMatch.count({
            where: { coverageFeedId: feed.id, isCovered: false },
          }),
        ]);
        return {
          ...feed,
          stats: { covered, gaps, total: covered + gaps },
        };
      })
    );

    return reply.send({ data: feedsWithStats });
  });

  // POST /admin/coverage - create a coverage feed
  app.post('/coverage', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const parseResult = CreateCoverageFeedSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const feed = await prisma.coverageFeed.create({
      data: {
        accountId: au.accountId,
        ...parseResult.data,
      },
    });

    return reply.status(201).send({ data: feed });
  });

  // PATCH /admin/coverage/:id - update a coverage feed
  app.patch('/coverage/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };
    const parseResult = UpdateCoverageFeedSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const feed = await prisma.coverageFeed.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!feed) return reply.status(404).send({ error: 'Coverage feed not found' });

    const updated = await prisma.coverageFeed.update({
      where: { id },
      data: parseResult.data,
    });

    return reply.send({ data: updated });
  });

  // DELETE /admin/coverage/:id
  app.delete('/coverage/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const feed = await prisma.coverageFeed.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!feed) return reply.status(404).send({ error: 'Coverage feed not found' });

    await prisma.coverageFeed.delete({ where: { id } });
    return reply.status(204).send();
  });

  // POST /admin/coverage/:id/check - trigger a coverage check now
  app.post('/coverage/:id/check', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    const feed = await prisma.coverageFeed.findFirst({
      where: { id, accountId: au.accountId, isActive: true },
    });
    if (!feed) return reply.status(404).send({ error: 'Coverage feed not found or inactive' });

    const queue = getQueue(QUEUE_NAMES.COVERAGE);
    await queue.add(`coverage-check-${id}`, { coverageFeedId: id }, {
      removeOnComplete: 50,
      removeOnFail: 20,
    });
    await queue.close();

    return reply.send({ message: 'Coverage check queued' });
  });

  // GET /admin/coverage/:id/gaps - get uncovered stories for a feed
  app.get('/coverage/:id/gaps', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    const feed = await prisma.coverageFeed.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!feed) return reply.status(404).send({ error: 'Coverage feed not found' });

    const gaps = await prisma.coverageMatch.findMany({
      where: { coverageFeedId: id, isCovered: false },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            status: true,
            category: true,
            compositeScore: true,
            breakingScore: true,
            firstSeenAt: true,
            sourceCount: true,
          },
        },
      },
      orderBy: { story: { compositeScore: 'desc' } },
      take: 50,
    });

    return reply.send({ data: gaps });
  });
}
