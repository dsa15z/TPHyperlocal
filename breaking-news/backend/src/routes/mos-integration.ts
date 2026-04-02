// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';
import {
  pushRundown,
  updateRundownItem,
  deleteRundownItem,
  testConnection,
  type MOSConfig,
  type RundownItem,
} from '../lib/mos-client.js';

// ─── Auth Helper ────────────────────────────────────────────────────────────


function requireAdmin(payload: any, reply: any): boolean {
  if (!payload?.accountId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }
  if (payload.role !== 'ADMIN' && payload.role !== 'admin') {
    reply.status(403).send({ error: 'Admin access required' });
    return false;
  }
  return true;
}

// ─── MOS Config Helpers ─────────────────────────────────────────────────────

async function getMosConfig(accountId: string): Promise<MOSConfig | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { metadata: true },
  });
  const meta = account?.metadata as any;
  if (!meta?.mos) return null;
  return {
    host: meta.mos.host,
    port: meta.mos.port,
    ncsID: meta.mos.ncsID,
    mosID: meta.mos.mosID,
  };
}

async function saveMosConfig(
  accountId: string,
  mosConfig: { host: string; port: number; ncsID: string; mosID: string; systemType: string },
): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { metadata: true },
  });
  const existingMeta = (account?.metadata as any) || {};
  await prisma.account.update({
    where: { id: accountId },
    data: {
      metadata: {
        ...existingMeta,
        mos: mosConfig,
      },
    },
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function mosIntegrationRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // POST /mos/configure — Configure MOS connection for account
  app.post('/mos/configure', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(10540),
      ncsID: z.string().min(1),
      mosID: z.string().min(1).default('TPHYPERLOCAL'),
      systemType: z.enum(['ENPS', 'INEWS', 'OTHER']).default('ENPS'),
    }).parse(request.body);

    await saveMosConfig(payload.accountId, body);

    return reply.send({
      message: 'MOS configuration saved',
      config: {
        host: body.host,
        port: body.port,
        ncsID: body.ncsID,
        mosID: body.mosID,
        systemType: body.systemType,
      },
    });
  });

  // GET /mos/config — Get current MOS config
  app.get('/mos/config', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const account = await prisma.account.findUnique({
      where: { id: payload.accountId },
      select: { metadata: true },
    });
    const meta = (account?.metadata as any) || {};

    if (!meta.mos) {
      return reply.send({ configured: false, config: null });
    }

    return reply.send({
      configured: true,
      config: {
        host: meta.mos.host,
        port: meta.mos.port,
        ncsID: meta.mos.ncsID,
        mosID: meta.mos.mosID,
        systemType: meta.mos.systemType || 'ENPS',
      },
    });
  });

  // POST /mos/test — Test MOS connection
  app.post('/mos/test', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const mosConfig = await getMosConfig(payload.accountId);
    if (!mosConfig) {
      return reply.status(400).send({ error: 'MOS not configured. Call POST /mos/configure first.' });
    }

    const result = await testConnection(mosConfig.host, mosConfig.port);

    return reply.send({
      connected: result.success,
      latencyMs: result.latencyMs,
      host: mosConfig.host,
      port: mosConfig.port,
      error: result.error || undefined,
    });
  });

  // POST /mos/push-rundown — Push a show prep rundown to ENPS/iNews
  app.post('/mos/push-rundown', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      rundownId: z.string().min(1),
    }).parse(request.body);

    const mosConfig = await getMosConfig(payload.accountId);
    if (!mosConfig) {
      return reply.status(400).send({ error: 'MOS not configured. Call POST /mos/configure first.' });
    }

    // Fetch the ShowPrepRundown
    const rundown = await prisma.showPrepRundown.findUnique({
      where: { id: body.rundownId },
    });
    if (!rundown) {
      return reply.status(404).send({ error: 'Rundown not found' });
    }
    if (rundown.accountId !== payload.accountId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Parse items from the rundown
    const rawItems = (rundown.items as any[]) || [];
    const mosItems: RundownItem[] = [];

    for (const item of rawItems) {
      const storyId = item.storyId;
      if (!storyId) continue;

      // Fetch story details
      const story = await prisma.story.findUnique({
        where: { id: storyId },
        select: {
          id: true,
          title: true,
          editedTitle: true,
          aiSummary: true,
          editedSummary: true,
          summary: true,
        },
      });
      if (!story) continue;

      // Try to get breaking package broadcast script
      let script: string | undefined;
      const breakingPkg = await prisma.breakingPackage.findFirst({
        where: { storyId },
        orderBy: { createdAt: 'desc' },
      });
      if (breakingPkg) {
        const content = breakingPkg.content as any;
        script = content?.broadcastScript || content?.broadcast_script || undefined;
      }

      const title = story.editedTitle || story.title;
      const abstract = story.editedSummary || story.aiSummary || story.summary || title;

      mosItems.push({
        itemID: story.id,
        slug: title.slice(0, 60),
        abstract: abstract.slice(0, 500),
        duration: item.duration || 90,
        script,
      });
    }

    if (mosItems.length === 0) {
      return reply.status(400).send({ error: 'Rundown has no valid story items' });
    }

    const result = await pushRundown(mosConfig, body.rundownId, mosItems);

    return reply.send({
      success: result.success,
      rundownId: body.rundownId,
      itemCount: mosItems.length,
      error: result.error || undefined,
    });
  });

  // POST /mos/push-lineup — Push an A-block lineup recommendation to ENPS/iNews
  app.post('/mos/push-lineup', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      showName: z.string().min(1),
      showTime: z.string().min(1),
      slotCount: z.number().int().min(1).max(20).optional().default(6),
    }).parse(request.body);

    const mosConfig = await getMosConfig(payload.accountId);
    if (!mosConfig) {
      return reply.status(400).send({ error: 'MOS not configured. Call POST /mos/configure first.' });
    }

    // Generate lineup recommendation (same logic as lineup route)
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const stories = await prisma.story.findMany({
      where: {
        mergedIntoId: null,
        status: { notIn: ['STALE', 'ARCHIVED'] },
      },
      include: {
        storySources: { select: { addedAt: true } },
        coverageMatches: { select: { isCovered: true } },
      },
      orderBy: { compositeScore: 'desc' },
      take: 30,
    });

    // Score and rank
    const scored = stories.map((story) => {
      const compositeComponent = Math.min(story.compositeScore, 1.0);
      const totalSources = story.storySources.length;
      const recentSources = story.storySources.filter(
        (ss) => new Date(ss.addedAt) >= twoHoursAgo,
      ).length;
      const sourceVelocity = totalSources > 0 ? recentSources / totalSources : 0;
      const hasCoverage = story.coverageMatches.some((cm) => cm.isCovered);
      const coverageGap = hasCoverage ? 0.0 : 1.0;
      let trendBoost: number;
      if (story.trendingScore > 0.6) trendBoost = 0.8;
      else if (story.trendingScore > 0.3) trendBoost = 0.4;
      else trendBoost = 0.1;
      const hoursAge = (now.getTime() - new Date(story.firstSeenAt).getTime()) / 3600000;
      const recencyBoost = Math.pow(0.5, hoursAge / 6);

      const lineupScore =
        compositeComponent * 0.30 +
        sourceVelocity * 0.20 +
        coverageGap * 0.20 +
        trendBoost * 0.15 +
        recencyBoost * 0.15;

      return { story, lineupScore };
    });

    scored.sort((a, b) => b.lineupScore - a.lineupScore);
    const recommended = scored.slice(0, body.slotCount);

    // Build MOS items from recommended stories
    const mosItems: RundownItem[] = [];
    for (const rec of recommended) {
      const story = rec.story;
      let script: string | undefined;
      const breakingPkg = await prisma.breakingPackage.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
      });
      if (breakingPkg) {
        const content = breakingPkg.content as any;
        script = content?.broadcastScript || content?.broadcast_script || undefined;
      }

      const title = story.editedTitle || story.title;
      const abstract = story.editedSummary || story.aiSummary || story.summary || title;

      mosItems.push({
        itemID: story.id,
        slug: title.slice(0, 60),
        abstract: abstract.slice(0, 500),
        duration: 90,
        script,
      });
    }

    if (mosItems.length === 0) {
      return reply.status(400).send({ error: 'No stories available for lineup' });
    }

    const rundownId = `lineup_${body.showName.replace(/\s+/g, '_')}_${Date.now()}`;
    const result = await pushRundown(mosConfig, rundownId, mosItems);

    return reply.send({
      success: result.success,
      rundownId,
      showName: body.showName,
      showTime: body.showTime,
      itemCount: mosItems.length,
      stories: mosItems.map((m) => ({ itemID: m.itemID, slug: m.slug })),
      error: result.error || undefined,
    });
  });
}
