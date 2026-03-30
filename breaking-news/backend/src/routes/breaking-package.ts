// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getQueue } from '../lib/queue.js';
import { broadcastSSE } from '../lib/sse.js';

function getPayload(req: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

export async function breakingPackageRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // POST /api/v1/stories/:id/breaking-package - generate one-click package
  app.post('/stories/:id/breaking-package', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const queue = getQueue('breaking-package' as any);
    await queue.add(`pkg-${id}`, {
      storyId: id,
      accountId: payload.accountId,
      userId: payload.userId,
    });
    await queue.close();

    return reply.send({ message: 'Breaking news package generation queued' });
  });

  // GET /api/v1/stories/:id/breaking-packages - list packages for story
  app.get('/stories/:id/breaking-packages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const packages = await prisma.breakingPackage.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: packages });
  });

  // POST /api/v1/shift-briefing/generate - generate a shift briefing
  app.post('/shift-briefing/generate', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = z.object({
      shiftName: z.string().min(1),
    }).parse(request.body);

    const queue = getQueue('shift-briefing' as any);
    await queue.add(`briefing-${payload.accountId}`, {
      accountId: payload.accountId,
      shiftName: data.shiftName,
    });
    await queue.close();

    return reply.send({ message: `Shift briefing for "${data.shiftName}" queued` });
  });

  // GET /api/v1/shift-briefings - list recent briefings
  app.get('/shift-briefings', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const briefings = await prisma.shiftBriefing.findMany({
      where: { accountId: payload.accountId },
      orderBy: { generatedAt: 'desc' },
      take: 10,
    });
    return reply.send({ data: briefings });
  });

  // GET /api/v1/public-data/alerts - recent public data alerts
  app.get('/public-data/alerts', async (_request, reply) => {
    const alerts = await prisma.publicDataAlert.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 30,
      include: { feed: { select: { name: true, type: true } } },
    });
    return reply.send({ data: alerts });
  });
}
