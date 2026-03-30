// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function predictionRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stories/:id/predictions
  app.get('/stories/:id/predictions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const predictions = await prisma.storyPrediction.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return reply.send({ data: predictions });
  });

  // GET /api/v1/stories/rising - stories with highest viral probability
  app.get('/stories/rising', async (_request, reply) => {
    const predictions = await prisma.storyPrediction.findMany({
      where: { viralProbability: { gte: 0.4 } },
      include: {
        story: {
          select: {
            id: true, title: true, status: true, category: true,
            compositeScore: true, firstSeenAt: true, sourceCount: true,
          },
        },
      },
      orderBy: { viralProbability: 'desc' },
      take: 20,
      distinct: ['storyId'],
    });

    return reply.send({
      data: predictions.map((p) => ({
        ...p.story,
        viralProbability: p.viralProbability,
        predictedStatus: p.predictedStatus,
        factors: p.factors,
      })),
    });
  });
}
