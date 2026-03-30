// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

function getUserId(req: any): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)).userId; } catch { return null; }
}

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
  app.get('/stories/rising', async (request, reply) => {
    const { minProbability, limit: limitStr } = request.query as {
      minProbability?: string;
      limit?: string;
    };
    const threshold = minProbability ? parseFloat(minProbability) : 0.4;
    const limit = limitStr ? Math.min(parseInt(limitStr, 10), 100) : 20;

    const predictions = await prisma.storyPrediction.findMany({
      where: { viralProbability: { gte: threshold } },
      include: {
        story: {
          select: {
            id: true, title: true, status: true, category: true,
            compositeScore: true, firstSeenAt: true, sourceCount: true,
          },
        },
      },
      orderBy: { viralProbability: 'desc' },
      take: limit,
      distinct: ['storyId'],
    });

    return reply.send({
      data: predictions.map((p) => ({
        ...p.story,
        viralProbability: p.viralProbability,
        peakScorePrediction: p.peakScorePrediction,
        predictedStatus: p.predictedStatus,
        factors: p.factors,
        predictedAt: p.createdAt,
      })),
    });
  });

  // GET /api/v1/predictions/dashboard — Predictions overview
  app.get('/predictions/dashboard', async (_request, reply) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Rising stories: top 10 with viralProbability > 0.4, latest prediction per story
    const risingPredictions = await prisma.storyPrediction.findMany({
      where: { viralProbability: { gte: 0.4 } },
      include: {
        story: {
          select: {
            id: true, title: true, status: true, category: true,
            compositeScore: true, sourceCount: true,
          },
        },
      },
      orderBy: { viralProbability: 'desc' },
      take: 10,
      distinct: ['storyId'],
    });

    const risingStories = risingPredictions.map((p) => ({
      ...p.story,
      viralProbability: p.viralProbability,
      predictedStatus: p.predictedStatus,
      factors: p.factors,
    }));

    // Accuracy: for stories predicted BREAKING, how many actually reached BREAKING?
    const breakingPredictions = await prisma.storyPrediction.findMany({
      where: { predictedStatus: 'BREAKING' },
      select: { storyId: true },
      distinct: ['storyId'],
    });
    const predictedStoryIds = breakingPredictions.map((p) => p.storyId);

    let accuracy = { predicted: 0, actual: 0, hitRate: 0 };
    if (predictedStoryIds.length > 0) {
      const actualBreaking = await prisma.story.count({
        where: {
          id: { in: predictedStoryIds },
          status: 'BREAKING',
        },
      });
      accuracy = {
        predicted: predictedStoryIds.length,
        actual: actualBreaking,
        hitRate: predictedStoryIds.length > 0
          ? Math.round((actualBreaking / predictedStoryIds.length) * 1000) / 1000
          : 0,
      };
    }

    // Escalation alerts: viralProbability > 0.6 AND current status is DEVELOPING or ONGOING
    const escalationPredictions = await prisma.storyPrediction.findMany({
      where: { viralProbability: { gte: 0.6 } },
      include: {
        story: {
          select: {
            id: true, title: true, status: true, category: true,
            compositeScore: true,
          },
        },
      },
      orderBy: { viralProbability: 'desc' },
      distinct: ['storyId'],
    });
    const escalationAlerts = escalationPredictions
      .filter((p) => ['DEVELOPING', 'ONGOING'].includes(p.story.status))
      .map((p) => ({
        ...p.story,
        viralProbability: p.viralProbability,
        predictedStatus: p.predictedStatus,
      }));

    // Timeline: predictions from last 24h grouped by hour with avg probability
    const recentPredictions = await prisma.storyPrediction.findMany({
      where: { createdAt: { gte: twentyFourHoursAgo } },
      select: { viralProbability: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const hourBuckets: Record<string, { sum: number; count: number }> = {};
    for (const pred of recentPredictions) {
      const hour = new Date(pred.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      if (!hourBuckets[key]) hourBuckets[key] = { sum: 0, count: 0 };
      hourBuckets[key].sum += pred.viralProbability;
      hourBuckets[key].count += 1;
    }

    const timeline = Object.entries(hourBuckets).map(([hour, bucket]) => ({
      hour,
      avgProbability: Math.round((bucket.sum / bucket.count) * 1000) / 1000,
      count: bucket.count,
    }));

    return reply.send({
      data: {
        risingStories,
        accuracy,
        escalationAlerts,
        timeline,
      },
    });
  });

  // POST /api/v1/stories/:id/predictions/trigger — Manually trigger prediction
  app.post('/stories/:id/predictions/trigger', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    // Verify the story exists
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Queue a prediction job
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };
    const queue = new Queue('prediction', { connection });
    try {
      const job = await queue.add('predict', { storyId: id }, {
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      return reply.status(202).send({
        data: { jobId: job.id, storyId: id, status: 'queued' },
      });
    } finally {
      await queue.close();
    }
  });
}
