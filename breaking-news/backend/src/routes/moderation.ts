// @ts-nocheck
/**
 * Story Moderation Queue + Blacklist/Flag Words + Algorithm Tuning
 *
 * Moderation: dedicated approve/reject/merge workflow for editors
 * Blacklist: block stories containing specific words
 * Flag Words: auto-flag stories for review by keywords
 * Algorithm: admin-adjustable scoring thresholds
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAccountUser } from '../lib/route-helpers.js';


export async function moderationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // ═══════════════════════════════════════════════════════════════════════
  // MODERATION QUEUE
  // ═══════════════════════════════════════════════════════════════════════

  // GET /moderation/queue — stories pending review
  app.get('/moderation/queue', async (request, reply) => {
    const au = requireAccountUser(request);
    const query = z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'flagged']).default('pending'),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: 'Validation error' });

    const { status, limit, offset } = query.data;

    // Flagged stories = stories matching flag words or manually flagged
    const where: any = { mergedIntoId: null };

    if (status === 'flagged') {
      where.reviewStatus = 'FLAGGED';
    } else if (status === 'pending') {
      where.reviewStatus = { in: ['UNREVIEWED', null] };
    } else {
      where.reviewStatus = status.toUpperCase();
    }

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        orderBy: { compositeScore: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true, title: true, summary: true, aiSummary: true,
          category: true, locationName: true, status: true,
          breakingScore: true, trendingScore: true, compositeScore: true,
          sourceCount: true, firstSeenAt: true, reviewStatus: true,
        },
      }),
      prisma.story.count({ where }),
    ]);

    return reply.send({ data: stories, total, limit, offset });
  });

  // POST /moderation/:storyId/approve — approve a story
  app.post('/moderation/:storyId/approve', async (request, reply) => {
    const au = requireAccountUser(request);
    const { storyId } = request.params as { storyId: string };

    await prisma.story.update({
      where: { id: storyId },
      data: {
        reviewStatus: 'APPROVED',
        editedBy: au.userId,
        editedAt: new Date(),
      },
    });

    return reply.send({ message: 'Story approved', storyId });
  });

  // POST /moderation/:storyId/reject — reject/kill a story
  app.post('/moderation/:storyId/reject', async (request, reply) => {
    const au = requireAccountUser(request);
    const { storyId } = request.params as { storyId: string };

    const body = z.object({ reason: z.string().optional() }).safeParse(request.body || {});

    await prisma.story.update({
      where: { id: storyId },
      data: {
        reviewStatus: 'REJECTED',
        status: 'ARCHIVED',
        editedBy: au.userId,
        editedAt: new Date(),
        editHistory: { push: { action: 'rejected', reason: body.data?.reason, by: au.userId, at: new Date().toISOString() } },
      },
    });

    return reply.send({ message: 'Story rejected', storyId });
  });

  // POST /moderation/:storyId/flag — flag story for review
  app.post('/moderation/:storyId/flag', async (request, reply) => {
    const au = requireAccountUser(request);
    const { storyId } = request.params as { storyId: string };

    const body = z.object({ reason: z.string().optional() }).safeParse(request.body || {});

    await prisma.story.update({
      where: { id: storyId },
      data: {
        reviewStatus: 'FLAGGED',
        editHistory: { push: { action: 'flagged', reason: body.data?.reason, by: au.userId, at: new Date().toISOString() } },
      },
    });

    return reply.send({ message: 'Story flagged for review', storyId });
  });

  // POST /moderation/bulk — bulk approve/reject
  app.post('/moderation/bulk', async (request, reply) => {
    const au = requireAccountUser(request);
    const body = z.object({
      storyIds: z.array(z.string()).min(1).max(100),
      action: z.enum(['approve', 'reject']),
      reason: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const status = body.data.action === 'approve' ? 'APPROVED' : 'REJECTED';
    const result = await prisma.story.updateMany({
      where: { id: { in: body.data.storyIds } },
      data: {
        reviewStatus: status,
        ...(body.data.action === 'reject' ? { status: 'ARCHIVED' } : {}),
      },
    });

    return reply.send({ message: `${result.count} stories ${body.data.action}d`, count: result.count });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // BLACKLIST & FLAG WORDS
  // ═══════════════════════════════════════════════════════════════════════

  // GET /moderation/words — list blacklist and flag words
  app.get('/moderation/words', async (request, reply) => {
    requireAccountUser(request);

    // Store words in a simple key-value table or account metadata
    // For now, use a dedicated table via raw SQL
    try {
      const words = await prisma.$queryRaw<Array<{ id: string; word: string; type: string; createdAt: Date }>>`
        SELECT * FROM "ModerationWord" ORDER BY type, word
      `;
      return reply.send({ data: words });
    } catch {
      // Table doesn't exist yet — return empty
      return reply.send({ data: [] });
    }
  });

  // POST /moderation/words — add a blacklist or flag word
  app.post('/moderation/words', async (request, reply) => {
    requireAccountUser(request);

    const body = z.object({
      word: z.string().min(1).max(100),
      type: z.enum(['blacklist', 'flag']),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      await prisma.$executeRaw`
        INSERT INTO "ModerationWord" (id, word, type, "createdAt")
        VALUES (${`mw_${Date.now()}`}, ${body.data.word.toLowerCase()}, ${body.data.type}, NOW())
        ON CONFLICT (word, type) DO NOTHING
      `;
      return reply.status(201).send({ message: `${body.data.type} word added: ${body.data.word}` });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /moderation/words/:id — remove a word
  app.delete('/moderation/words/:id', async (request, reply) => {
    requireAccountUser(request);
    const { id } = request.params as { id: string };

    try {
      await prisma.$executeRaw`DELETE FROM "ModerationWord" WHERE id = ${id}`;
      return reply.send({ message: 'Word removed' });
    } catch {
      return reply.status(404).send({ error: 'Word not found' });
    }
  });

  // GET /moderation/check/:storyId — check if story matches any words
  app.get('/moderation/check/:storyId', async (request, reply) => {
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { title: true, summary: true, aiSummary: true },
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const text = `${story.title} ${story.summary || ''} ${story.aiSummary || ''}`.toLowerCase();

    try {
      const words = await prisma.$queryRaw<Array<{ word: string; type: string }>>`
        SELECT word, type FROM "ModerationWord"
      `;

      const matches = words.filter(w => text.includes(w.word.toLowerCase()));
      const blacklisted = matches.filter(m => m.type === 'blacklist');
      const flagged = matches.filter(m => m.type === 'flag');

      return reply.send({
        storyId,
        isBlacklisted: blacklisted.length > 0,
        isFlagged: flagged.length > 0,
        blacklistMatches: blacklisted.map(m => m.word),
        flagMatches: flagged.map(m => m.word),
      });
    } catch {
      return reply.send({ storyId, isBlacklisted: false, isFlagged: false, blacklistMatches: [], flagMatches: [] });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SYSTEM KNOWLEDGE (RAG for AI)
  // ═══════════════════════════════════════════════════════════════════════

  // GET /admin/knowledge — list knowledge documents
  app.get('/admin/knowledge', async (request, reply) => {
    requireAccountUser(request);
    try {
      const docs = await prisma.$queryRaw<any[]>`SELECT * FROM "SystemKnowledge" ORDER BY category, key`;
      return reply.send({ data: docs });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // POST /admin/knowledge — add or update a knowledge document
  app.post('/admin/knowledge', async (request, reply) => {
    const au = requireAccountUser(request);
    if (au.role !== 'OWNER' && au.role !== 'ADMIN') return reply.status(403).send({ error: 'Admin required' });

    const body = z.object({
      key: z.string().min(1).max(100),
      content: z.string().min(1),
      category: z.string().default('general'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      await prisma.$executeRaw`
        INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedBy", "updatedAt")
        VALUES (${`sk_${Date.now()}`}, ${body.data.key}, ${body.data.content}, ${body.data.category}, ${au.userId}, NOW())
        ON CONFLICT (key) DO UPDATE SET content = ${body.data.content}, category = ${body.data.category}, "updatedBy" = ${au.userId}, "updatedAt" = NOW()
      `;
      return reply.send({ message: 'Knowledge saved' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /admin/knowledge/:id
  app.delete('/admin/knowledge/:id', async (request, reply) => {
    const au = requireAccountUser(request);
    if (au.role !== 'OWNER') return reply.status(403).send({ error: 'Owner required' });
    const { id } = request.params as { id: string };
    try {
      await prisma.$executeRaw`DELETE FROM "SystemKnowledge" WHERE id = ${id}`;
      return reply.send({ message: 'Deleted' });
    } catch { return reply.status(404).send({ error: 'Not found' }); }
  });

  // POST /admin/knowledge/generate — auto-generate all RAG knowledge documents
  app.post('/admin/knowledge/generate', async (request, reply) => {
    const au = requireAccountUser(request);
    if (au.role !== 'OWNER' && au.role !== 'ADMIN') return reply.status(403).send({ error: 'Admin required' });

    try {
      const { generateAllKnowledgeDocs } = await import('../lib/knowledge-base.js');
      const docs = generateAllKnowledgeDocs();
      let saved = 0;

      for (const doc of docs) {
        await prisma.$executeRaw`
          INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedBy", "updatedAt")
          VALUES (${`sk_${doc.key}_${Date.now()}`}, ${doc.key}, ${doc.content}, ${doc.category}, ${au.userId}, NOW())
          ON CONFLICT (key) DO UPDATE SET content = ${doc.content}, category = ${doc.category}, "updatedBy" = ${au.userId}, "updatedAt" = NOW()
        `;
        saved++;
      }

      return reply.send({ message: `Generated ${saved} knowledge documents (schema, operations, architecture, help)`, saved });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ALGORITHM TUNING
  // ═══════════════════════════════════════════════════════════════════════

  // GET /moderation/algorithm — get current scoring thresholds
  app.get('/moderation/algorithm', async (request, reply) => {
    requireAccountUser(request);

    // Read from Redis or fallback to defaults
    try {
      const redis = await import('../lib/redis.js').then(m => m.getRedis());
      const saved = await redis.get('tp:algorithm_config');
      if (saved) {
        return reply.send({ config: JSON.parse(saved), source: 'custom' });
      }
    } catch { /* Redis unavailable */ }

    // Default thresholds (matching scoring.worker.ts)
    return reply.send({
      config: {
        // National thresholds
        national_breaking_high: 0.6,
        national_breaking_med: 0.5,
        national_trending: 0.4,
        national_hot: 0.6,
        // Local market thresholds (lower)
        local_breaking_high: 0.35,
        local_breaking_med: 0.30,
        local_trending: 0.25,
        local_hot: 0.35,
        // Composite weights
        weight_breaking: 0.25,
        weight_trending: 0.20,
        weight_confidence: 0.15,
        weight_locality: 0.15,
        weight_social: 0.25,
        // Growth thresholds
        growth_15min_trending: 50,
        growth_60min_decay: 10,
        // Retention
        breaking_min_retention_min: 15,
        breaking_stay_growth_threshold: 20,
        // Decay
        flat_to_stop_hours: 3,
        stop_to_dead_hours: 8,
        stale_age_hours: 48,
        // Social score normalization
        social_max_raw: 200,
        // Velocity
        velocity_breaking_sources: 3,
        velocity_breaking_window_min: 15,
      },
      source: 'default',
    });
  });

  // POST /moderation/algorithm — save custom thresholds
  app.post('/moderation/algorithm', async (request, reply) => {
    const au = requireAccountUser(request);
    if (au.role !== 'OWNER' && au.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Only OWNER/ADMIN can modify algorithm' });
    }

    const config = request.body;
    if (!config || typeof config !== 'object') {
      return reply.status(400).send({ error: 'Config object required' });
    }

    try {
      const redis = await import('../lib/redis.js').then(m => m.getRedis());
      await redis.set('tp:algorithm_config', JSON.stringify(config));
      return reply.send({ message: 'Algorithm config saved', config });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /moderation/algorithm/reset — reset to defaults
  app.post('/moderation/algorithm/reset', async (request, reply) => {
    const au = requireAccountUser(request);
    if (au.role !== 'OWNER') {
      return reply.status(403).send({ error: 'Only OWNER can reset algorithm' });
    }

    try {
      const redis = await import('../lib/redis.js').then(m => m.getRedis());
      await redis.del('tp:algorithm_config');
      return reply.send({ message: 'Algorithm config reset to defaults' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
