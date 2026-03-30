// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function topicClusterRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/topic-clusters - list active topic clusters
  app.get('/topic-clusters', async (_request, reply) => {
    const clusters = await prisma.topicCluster.findMany({
      where: { isActive: true },
      orderBy: { storyCount: 'desc' },
      take: 50,
    });
    return reply.send({ data: clusters });
  });

  // GET /api/v1/topic-clusters/:id/stories - stories in a cluster
  app.get('/topic-clusters/:id/stories', async (request, reply) => {
    const { id } = request.params as { id: string };
    const clusterId = parseInt(id, 10);

    const stories = await prisma.story.findMany({
      where: { topicId: clusterId, mergedIntoId: null },
      orderBy: { compositeScore: 'desc' },
      take: 25,
      select: {
        id: true, title: true, status: true, category: true,
        compositeScore: true, firstSeenAt: true, sourceCount: true,
      },
    });
    return reply.send({ data: stories });
  });
}
