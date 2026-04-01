// @ts-nocheck
/**
 * Account Story routes — per-account derivative workspace for stories.
 *
 * Base stories are shared read-only. When a user takes any action
 * (edit, assign, note, AI draft, etc.), an AccountStory is created
 * lazily as a copy-on-write fork. The derivative stays linked to
 * the base and receives upstream updates.
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

function getAccountUser(req: any) {
  return req.accountUser || null;
}

/**
 * Get or create an AccountStory for the given account + base story.
 * This is the core copy-on-write operation.
 */
async function getOrCreateDerivative(accountId: string, baseStoryId: string): Promise<any> {
  // Check if derivative already exists
  let derivative = await prisma.accountStory.findUnique({
    where: { accountId_baseStoryId: { accountId, baseStoryId } },
  });

  if (!derivative) {
    // Verify base story exists
    const baseStory = await prisma.story.findUnique({
      where: { id: baseStoryId },
      select: { id: true, updatedAt: true },
    });
    if (!baseStory) return null;

    // Create derivative (copy-on-write)
    derivative = await prisma.accountStory.create({
      data: {
        accountId,
        baseStoryId,
        accountStatus: 'INBOX',
        lastSyncedAt: new Date(),
        baseSnapshotAt: baseStory.updatedAt,
      },
    });
  }

  return derivative;
}

export async function accountStoryRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /account-stories — list all derivatives for current account
  app.get('/account-stories', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const query = z.object({
      status: z.string().optional(),
      assignedTo: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }

    const { status, assignedTo, limit, offset } = query.data;
    const where: any = { accountId: au.accountId };
    if (status) where.accountStatus = status;
    if (assignedTo) where.assignedTo = assignedTo;

    const [derivatives, total] = await Promise.all([
      prisma.accountStory.findMany({
        where,
        include: {
          baseStory: {
            select: {
              id: true,
              title: true,
              summary: true,
              aiSummary: true,
              category: true,
              locationName: true,
              status: true,
              breakingScore: true,
              trendingScore: true,
              compositeScore: true,
              sourceCount: true,
              firstSeenAt: true,
              lastUpdatedAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.accountStory.count({ where }),
    ]);

    // Merge base + derivative for response
    const data = derivatives.map((d) => ({
      id: d.id,
      baseStoryId: d.baseStoryId,
      accountStatus: d.accountStatus,
      assignedTo: d.assignedTo,
      assignedAt: d.assignedAt,
      coveredAt: d.coveredAt,
      notes: d.notes,
      tags: d.tags,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // Merged view: account edits override base data
      title: d.editedTitle || d.baseStory.title,
      summary: d.editedSummary || d.baseStory.aiSummary || d.baseStory.summary,
      category: d.baseStory.category,
      location: d.baseStory.locationName,
      status: d.baseStory.status,
      breakingScore: d.baseStory.breakingScore,
      trendingScore: d.baseStory.trendingScore,
      compositeScore: d.baseStory.compositeScore,
      sourceCount: d.baseStory.sourceCount,
      firstSeenAt: d.baseStory.firstSeenAt,
      lastUpdatedAt: d.baseStory.lastUpdatedAt,
      // Whether base has updates since last sync
      hasBaseUpdates: d.baseStory.updatedAt > d.lastSyncedAt,
      // AI content counts
      aiDraftCount: Array.isArray(d.aiDrafts) ? d.aiDrafts.length : 0,
      aiScriptCount: Array.isArray(d.aiScripts) ? d.aiScripts.length : 0,
      aiVideoCount: Array.isArray(d.aiVideos) ? d.aiVideos.length : 0,
    }));

    return reply.send({ data, total, limit, offset });
  });

  // GET /account-stories/:baseStoryId — get derivative for a specific base story
  app.get('/account-stories/:baseStoryId', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const derivative = await prisma.accountStory.findUnique({
      where: { accountId_baseStoryId: { accountId: au.accountId, baseStoryId } },
      include: {
        baseStory: true,
      },
    });

    if (!derivative) {
      return reply.status(404).send({ error: 'No derivative exists for this story', baseStoryId });
    }

    return reply.send({
      ...derivative,
      title: derivative.editedTitle || derivative.baseStory.title,
      summary: derivative.editedSummary || derivative.baseStory.aiSummary || derivative.baseStory.summary,
      hasBaseUpdates: derivative.baseStory.updatedAt > derivative.lastSyncedAt,
    });
  });

  // POST /account-stories/:baseStoryId/activate — create or get derivative (explicit fork)
  app.post('/account-stories/:baseStoryId/activate', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const derivative = await getOrCreateDerivative(au.accountId, baseStoryId);
    if (!derivative) {
      return reply.status(404).send({ error: 'Base story not found' });
    }

    return reply.status(201).send(derivative);
  });

  // PATCH /account-stories/:baseStoryId — update derivative (lazy create)
  app.patch('/account-stories/:baseStoryId', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const schema = z.object({
      editedTitle: z.string().optional(),
      editedSummary: z.string().optional(),
      notes: z.string().optional(),
      accountStatus: z.enum(['INBOX', 'ASSIGNED', 'IN_PROGRESS', 'DRAFT_READY', 'PUBLISHED', 'KILLED']).optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    // Lazy create derivative if it doesn't exist
    let derivative = await getOrCreateDerivative(au.accountId, baseStoryId);
    if (!derivative) {
      return reply.status(404).send({ error: 'Base story not found' });
    }

    // Build update data
    const updateData: any = { ...parsed.data };
    if (parsed.data.editedTitle !== undefined || parsed.data.editedSummary !== undefined) {
      updateData.editedBy = au.userId;
      updateData.editedAt = new Date();
    }
    if (parsed.data.assignedTo !== undefined) {
      updateData.assignedAt = new Date();
    }
    if (parsed.data.accountStatus === 'PUBLISHED') {
      updateData.coveredAt = new Date();
    }

    derivative = await prisma.accountStory.update({
      where: { id: derivative.id },
      data: updateData,
    });

    return reply.send(derivative);
  });

  // POST /account-stories/:baseStoryId/ai-draft — add AI-generated content
  app.post('/account-stories/:baseStoryId/ai-draft', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const schema = z.object({
      format: z.enum(['tv_script', 'radio_script', 'web_story', 'social_post', 'push_notification', 'newsletter']),
      content: z.string().min(1),
      model: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const derivative = await getOrCreateDerivative(au.accountId, baseStoryId);
    if (!derivative) {
      return reply.status(404).send({ error: 'Base story not found' });
    }

    const existingDrafts = Array.isArray(derivative.aiDrafts) ? derivative.aiDrafts : [];
    const newDraft = {
      id: `draft_${Date.now()}`,
      ...parsed.data,
      createdAt: new Date().toISOString(),
      createdBy: au.userId,
    };

    await prisma.accountStory.update({
      where: { id: derivative.id },
      data: {
        aiDrafts: [...existingDrafts, newDraft],
        accountStatus: derivative.accountStatus === 'INBOX' ? 'IN_PROGRESS' : derivative.accountStatus,
      },
    });

    return reply.status(201).send(newDraft);
  });

  // POST /account-stories/:baseStoryId/research — add research/context
  app.post('/account-stories/:baseStoryId/research', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const schema = z.object({
      backgroundContext: z.string().optional(),
      relatedLinks: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
      factChecks: z.array(z.object({ claim: z.string(), verdict: z.string(), source: z.string().optional() })).optional(),
      timeline: z.array(z.object({ time: z.string(), event: z.string() })).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const derivative = await getOrCreateDerivative(au.accountId, baseStoryId);
    if (!derivative) {
      return reply.status(404).send({ error: 'Base story not found' });
    }

    // Merge with existing research
    const existingResearch = (derivative.research || {}) as Record<string, any>;
    const mergedResearch = { ...existingResearch };
    if (parsed.data.backgroundContext) mergedResearch.backgroundContext = parsed.data.backgroundContext;
    if (parsed.data.relatedLinks) mergedResearch.relatedLinks = [...(existingResearch.relatedLinks || []), ...parsed.data.relatedLinks];
    if (parsed.data.factChecks) mergedResearch.factChecks = [...(existingResearch.factChecks || []), ...parsed.data.factChecks];
    if (parsed.data.timeline) mergedResearch.timeline = [...(existingResearch.timeline || []), ...parsed.data.timeline];

    await prisma.accountStory.update({
      where: { id: derivative.id },
      data: { research: mergedResearch },
    });

    return reply.send({ research: mergedResearch });
  });

  // POST /account-stories/:baseStoryId/sync — pull latest base story updates
  app.post('/account-stories/:baseStoryId/sync', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const derivative = await prisma.accountStory.findUnique({
      where: { accountId_baseStoryId: { accountId: au.accountId, baseStoryId } },
      include: { baseStory: true },
    });

    if (!derivative) {
      return reply.status(404).send({ error: 'No derivative exists' });
    }

    // Update sync timestamp
    await prisma.accountStory.update({
      where: { id: derivative.id },
      data: {
        lastSyncedAt: new Date(),
        baseSnapshotAt: derivative.baseStory.updatedAt,
      },
    });

    return reply.send({
      synced: true,
      baseStory: {
        title: derivative.baseStory.title,
        summary: derivative.baseStory.aiSummary || derivative.baseStory.summary,
        sourceCount: derivative.baseStory.sourceCount,
        status: derivative.baseStory.status,
        compositeScore: derivative.baseStory.compositeScore,
        lastUpdatedAt: derivative.baseStory.lastUpdatedAt,
      },
    });
  });

  // DELETE /account-stories/:baseStoryId — remove derivative (return to shared view)
  app.delete('/account-stories/:baseStoryId', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { baseStoryId } = request.params as { baseStoryId: string };

    const derivative = await prisma.accountStory.findUnique({
      where: { accountId_baseStoryId: { accountId: au.accountId, baseStoryId } },
    });

    if (!derivative) {
      return reply.status(404).send({ error: 'No derivative exists' });
    }

    await prisma.accountStory.delete({ where: { id: derivative.id } });

    return reply.send({ message: 'Derivative removed, story returned to shared view' });
  });
}
