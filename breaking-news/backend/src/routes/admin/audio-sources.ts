// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getQueue } from '../../lib/queue.js';

export async function audioSourceRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/audio-sources', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const sources = await prisma.audioSource.findMany({
      where: { accountId: au.accountId },
      include: { _count: { select: { transcripts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: sources });
  });

  app.post('/audio-sources', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      type: z.enum(['STREAM', 'FILE', 'URL']),
      url: z.string().url().optional(),
    }).parse(request.body);

    const source = await prisma.audioSource.create({
      data: { ...data, accountId: au.accountId },
    });
    return reply.status(201).send({ data: source });
  });

  // POST /admin/audio-sources/:id/transcribe - trigger transcription
  app.post('/audio-sources/:id/transcribe', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const source = await prisma.audioSource.findFirst({
      where: { id, accountId: au.accountId, isActive: true },
    });
    if (!source) return reply.status(404).send({ error: 'Audio source not found' });

    const queue = getQueue('audio-transcription' as any);
    await queue.add(`transcribe-${id}`, { audioSourceId: id });
    await queue.close();

    return reply.send({ message: 'Transcription queued' });
  });

  // GET /admin/audio-sources/:id/transcripts
  app.get('/audio-sources/:id/transcripts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const transcripts = await prisma.audioTranscript.findMany({
      where: { audioSourceId: id },
      orderBy: { processedAt: 'desc' },
      take: 20,
    });
    return reply.send({ data: transcripts });
  });

  app.delete('/audio-sources/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.audioSource.deleteMany({ where: { id, accountId: au.accountId } });
    return reply.status(204).send();
  });
}
