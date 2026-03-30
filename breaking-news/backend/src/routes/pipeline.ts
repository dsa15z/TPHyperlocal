import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getQueue, QUEUE_NAMES } from '../lib/queue.js';

interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function pipelineRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/pipeline/status - pipeline queue status
  app.get('/pipeline/status', async (_request, reply) => {
    const queueNames = Object.values(QUEUE_NAMES);
    const statuses: QueueStatus[] = [];

    for (const name of queueNames) {
      try {
        const queue = getQueue(name as any);
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        statuses.push({
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      } catch {
        statuses.push({
          name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        });
      }
    }

    const totalActive = statuses.reduce((s, q) => s + q.active, 0);
    const totalWaiting = statuses.reduce((s, q) => s + q.waiting, 0);
    const totalCompleted = statuses.reduce((s, q) => s + q.completed, 0);
    const totalFailed = statuses.reduce((s, q) => s + q.failed, 0);

    return reply.send({
      timestamp: new Date().toISOString(),
      summary: {
        active: totalActive,
        waiting: totalWaiting,
        completed: totalCompleted,
        failed: totalFailed,
        is_processing: totalActive > 0 || totalWaiting > 0,
      },
      queues: statuses,
    });
  });
}
