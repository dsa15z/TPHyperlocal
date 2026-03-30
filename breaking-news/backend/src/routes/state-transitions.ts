// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function stateTransitionRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/transitions - state transition history
  app.get('/stories/:id/transitions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const transitions = await prisma.storyStateTransition.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return reply.send({ data: transitions });
  });

  // GET /api/v1/credibility/:sourceId - source credibility history
  app.get('/credibility/:sourceId', async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const logs = await prisma.sourceCredibilityLog.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const total = logs.length;
    const corroborated = logs.filter((l) => l.wasCorroborated).length;
    const rate = total > 0 ? corroborated / total : 0;

    return reply.send({
      sourceId,
      credibilityRate: rate,
      total,
      corroborated,
      logs,
    });
  });
}
