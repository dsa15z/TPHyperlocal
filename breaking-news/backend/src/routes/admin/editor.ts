import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Schemas ────────────────────────────────────────────────────────────────

const EditStorySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(5000).optional(),
  category: z.string().optional(),
  reviewStatus: z.enum(['APPROVED', 'REJECTED', 'EDITED']).optional(),
});

const RevertSchema = z.object({
  field: z.enum(['title', 'summary', 'both']),
});

function getUser(request: FastifyRequest): { userId: string; role: string } {
  const accountUser = (request as any).accountUser;
  const user = (request as any).user;
  if (!accountUser || !user) throw { statusCode: 401, message: 'Not authenticated' };
  if (!['EDITOR', 'ADMIN', 'OWNER'].includes(accountUser.role)) {
    throw { statusCode: 403, message: 'EDITOR role or higher required' };
  }
  return { userId: user.id, role: accountUser.role };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function editorRoutes(app: FastifyInstance) {

  // Edit a story (title, summary, category, review status)
  app.patch('/admin/stories/:id/edit', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { userId } = getUser(request);
    const { id } = request.params;
    const body = EditStorySchema.parse(request.body);

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Build edit history entry
    const historyEntry = {
      previousTitle: story.editedTitle || story.title,
      previousSummary: story.editedSummary || story.summary,
      editedBy: userId,
      editedAt: new Date().toISOString(),
      changes: body,
    };

    const currentHistory = (story.editHistory as any[]) || [];

    const updateData: Record<string, any> = {
      editedBy: userId,
      editedAt: new Date(),
      editHistory: [...currentHistory, historyEntry],
    };

    if (body.title !== undefined) updateData.editedTitle = body.title;
    if (body.summary !== undefined) updateData.editedSummary = body.summary;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.reviewStatus !== undefined) updateData.reviewStatus = body.reviewStatus;

    const updated = await prisma.story.update({
      where: { id },
      data: updateData,
    });

    return { data: updated };
  });

  // Revert to AI/original version
  app.post('/admin/stories/:id/revert', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { userId } = getUser(request);
    const { id } = request.params;
    const body = RevertSchema.parse(request.body);

    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const updateData: Record<string, any> = {
      editedBy: userId,
      editedAt: new Date(),
    };

    if (body.field === 'title' || body.field === 'both') {
      updateData.editedTitle = null; // revert to original/AI title
    }
    if (body.field === 'summary' || body.field === 'both') {
      updateData.editedSummary = null; // revert to original/AI summary
    }

    // Add revert to history
    const currentHistory = (story.editHistory as any[]) || [];
    currentHistory.push({
      action: 'revert',
      field: body.field,
      revertedBy: userId,
      revertedAt: new Date().toISOString(),
    });
    updateData.editHistory = currentHistory;

    const updated = await prisma.story.update({
      where: { id },
      data: updateData,
    });

    return { data: updated };
  });

  // Approve a story
  app.post('/admin/stories/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { userId } = getUser(request);
    const { id } = request.params;

    const updated = await prisma.story.update({
      where: { id },
      data: {
        reviewStatus: 'APPROVED',
        editedBy: userId,
        editedAt: new Date(),
      },
    });

    return { data: updated };
  });

  // Reject a story
  app.post('/admin/stories/:id/reject', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { userId } = getUser(request);
    const { id } = request.params;

    const updated = await prisma.story.update({
      where: { id },
      data: {
        reviewStatus: 'REJECTED',
        status: 'ARCHIVED',
        editedBy: userId,
        editedAt: new Date(),
      },
    });

    return { data: updated };
  });

  // List stories pending review
  app.get('/admin/stories/review-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    getUser(request); // auth check

    const params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(params.limit || '20'), 100);
    const offset = parseInt(params.offset || '0');

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where: {
          reviewStatus: 'UNREVIEWED',
          status: { not: 'ARCHIVED' },
          mergedIntoId: null,
        },
        orderBy: { compositeScore: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { storySources: true } },
        },
      }),
      prisma.story.count({
        where: {
          reviewStatus: 'UNREVIEWED',
          status: { not: 'ARCHIVED' },
          mergedIntoId: null,
        },
      }),
    ]);

    return {
      data: stories,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    };
  });
}
