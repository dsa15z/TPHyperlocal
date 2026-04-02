// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getQueue } from '../lib/queue.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';

const QUEUE_NAME = 'video-generation';

// ─── In-memory video project cache (supplement to FirstDraft DB storage) ─────
interface VideoProject {
  id: string;
  storyId: string;
  accountId: string;
  storyTitle: string;
  format: string;
  duration: number;
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
  jobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const videoProjectCache = new Map<string, VideoProject>();


// ─── Schemas ────────────────────────────────────────────────────────────────

const GenerateVideoSchema = z.object({
  storyId: z.string().min(1),
  format: z.enum(['SOCIAL_CLIP', 'WEB_PACKAGE', 'BROADCAST_BROLL']),
  duration: z.number().int().min(10).max(120).optional(),
});

const ListProjectsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Format → FirstDraft type mapping ───────────────────────────────────────

const FORMAT_TO_DRAFT_TYPE: Record<string, string> = {
  SOCIAL_CLIP: 'video_social',
  WEB_PACKAGE: 'video_web',
  BROADCAST_BROLL: 'video_broadcast',
};

// ─── Default durations per format ───────────────────────────────────────────

const DEFAULT_DURATION: Record<string, number> = {
  SOCIAL_CLIP: 20,
  WEB_PACKAGE: 60,
  BROADCAST_BROLL: 30,
};

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function videoRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // POST /api/v1/video/generate — Generate video project from story
  app.post('/video/generate', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Unauthorized' });

    const parseResult = GenerateVideoSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten(),
      });
    }

    const { storyId, format, duration } = parseResult.data;
    const effectiveDuration = duration || DEFAULT_DURATION[format] || 30;

    // Verify story exists
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, title: true },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Create in-memory project
    const projectId = `vp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const project: VideoProject = {
      id: projectId,
      storyId,
      accountId: payload.accountId || payload.userId,
      storyTitle: story.title,
      format,
      duration: effectiveDuration,
      status: 'QUEUED',
      jobId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    videoProjectCache.set(projectId, project);

    // Queue job
    const queue = getQueue(QUEUE_NAME as any);
    const job = await queue.add(`video-${projectId}`, {
      projectId,
      storyId,
      accountId: payload.accountId || payload.userId,
      format,
      duration: effectiveDuration,
    });
    await queue.close();

    project.jobId = job.id || null;

    return reply.send({
      data: {
        projectId,
        jobId: job.id,
        status: 'QUEUED',
        format,
        duration: effectiveDuration,
        storyTitle: story.title,
      },
    });
  });

  // GET /api/v1/video/projects — List video projects for account
  app.get('/video/projects', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Unauthorized' });

    const parseResult = ListProjectsSchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid params', details: parseResult.error.flatten() });
    }
    const { limit, offset } = parseResult.data;
    const accountId = payload.accountId || payload.userId;

    // Fetch from FirstDraft table (persisted)
    const videoTypes = ['video_social', 'video_web', 'video_broadcast'];
    const [drafts, total] = await Promise.all([
      prisma.firstDraft.findMany({
        where: {
          type: { in: videoTypes },
          userId: payload.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          story: { select: { id: true, title: true } },
        },
      }),
      prisma.firstDraft.count({
        where: {
          type: { in: videoTypes },
          userId: payload.userId,
        },
      }),
    ]);

    // Merge in-memory projects not yet persisted
    const cachedProjects = Array.from(videoProjectCache.values())
      .filter((p) => p.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const TYPE_TO_FORMAT: Record<string, string> = {
      video_social: 'SOCIAL_CLIP',
      video_web: 'WEB_PACKAGE',
      video_broadcast: 'BROADCAST_BROLL',
    };

    const persistedProjects = drafts.map((d: any) => {
      let parsed: any = {};
      try { parsed = JSON.parse(d.content); } catch { /* plain text */ }
      return {
        id: d.id,
        storyId: d.storyId,
        storyTitle: d.story?.title || 'Unknown',
        format: TYPE_TO_FORMAT[d.type] || d.type,
        duration: parsed.totalDuration || 0,
        status: 'READY' as const,
        createdAt: d.createdAt,
      };
    });

    // Queued/generating projects from cache that aren't persisted yet
    const persistedStoryIds = new Set(drafts.map((d: any) => d.storyId));
    const pendingProjects = cachedProjects
      .filter((p) => p.status !== 'READY')
      .map((p) => ({
        id: p.id,
        storyId: p.storyId,
        storyTitle: p.storyTitle,
        format: p.format,
        duration: p.duration,
        status: p.status,
        createdAt: p.createdAt,
      }));

    return reply.send({
      data: [...pendingProjects, ...persistedProjects],
      pagination: { total: total + pendingProjects.length, limit, offset, hasMore: offset + limit < total },
    });
  });

  // GET /api/v1/video/projects/:id — Get video project detail
  app.get('/video/projects/:id', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    // Check in-memory cache first (for pending/generating projects)
    const cached = videoProjectCache.get(id);
    if (cached) {
      return reply.send({
        data: {
          id: cached.id,
          storyId: cached.storyId,
          storyTitle: cached.storyTitle,
          format: cached.format,
          duration: cached.duration,
          status: cached.status,
          createdAt: cached.createdAt,
          scenes: null,
          script: null,
          musicSuggestion: null,
          titleCard: null,
          hashtags: null,
        },
      });
    }

    // Check FirstDraft table
    const draft = await prisma.firstDraft.findUnique({
      where: { id },
      include: { story: { select: { id: true, title: true } } },
    });

    if (!draft) return reply.status(404).send({ error: 'Video project not found' });

    const TYPE_TO_FORMAT: Record<string, string> = {
      video_social: 'SOCIAL_CLIP',
      video_web: 'WEB_PACKAGE',
      video_broadcast: 'BROADCAST_BROLL',
    };

    let parsed: any = {};
    try { parsed = JSON.parse(draft.content); } catch { parsed = { script: draft.content }; }

    return reply.send({
      data: {
        id: draft.id,
        storyId: draft.storyId,
        storyTitle: (draft as any).story?.title || 'Unknown',
        format: TYPE_TO_FORMAT[draft.type] || draft.type,
        duration: parsed.totalDuration || 0,
        status: 'READY',
        createdAt: draft.createdAt,
        title: parsed.title || null,
        script: parsed.script || null,
        scenes: parsed.scenes || null,
        musicSuggestion: parsed.musicSuggestion || null,
        titleCard: parsed.titleCard || null,
        hashtags: parsed.hashtags || null,
        lowerThirds: parsed.lowerThirds || null,
      },
    });
  });

  // GET /api/v1/stories/:id/videos — Get videos for a story
  app.get('/stories/:id/videos', async (request, reply) => {
    const { id } = request.params as { id: string };

    const videoTypes = ['video_social', 'video_web', 'video_broadcast'];
    const drafts = await prisma.firstDraft.findMany({
      where: {
        storyId: id,
        type: { in: videoTypes },
      },
      orderBy: { createdAt: 'desc' },
    });

    const TYPE_TO_FORMAT: Record<string, string> = {
      video_social: 'SOCIAL_CLIP',
      video_web: 'WEB_PACKAGE',
      video_broadcast: 'BROADCAST_BROLL',
    };

    const videos = drafts.map((d: any) => {
      let parsed: any = {};
      try { parsed = JSON.parse(d.content); } catch { /* fallback */ }
      return {
        id: d.id,
        storyId: d.storyId,
        format: TYPE_TO_FORMAT[d.type] || d.type,
        title: parsed.title || null,
        duration: parsed.totalDuration || 0,
        sceneCount: parsed.scenes?.length || 0,
        status: 'READY',
        createdAt: d.createdAt,
      };
    });

    // Also include pending from cache
    const cached = Array.from(videoProjectCache.values())
      .filter((p) => p.storyId === id && p.status !== 'READY')
      .map((p) => ({
        id: p.id,
        storyId: p.storyId,
        format: p.format,
        title: null,
        duration: p.duration,
        sceneCount: 0,
        status: p.status,
        createdAt: p.createdAt,
      }));

    return reply.send({ data: [...cached, ...videos] });
  });
}

// Export the cache so the worker can update status
export { videoProjectCache };
