// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPayload } from '../lib/route-helpers.js';
import { getRedis } from '../lib/redis.js';

// Fallback in-memory alert configuration if Redis is unavailable
const alertConfigsFallback = new Map<string, {
  minScore: number;
  maxGapMinutes: number;
  slackEnabled: boolean;
  sseEnabled: boolean;
}>();

const DEFAULT_ALERT_CONFIG = {
  minScore: 0.5,
  maxGapMinutes: 360, // 6 hours
  slackEnabled: true,
  sseEnabled: true,
};

function alertConfigKey(accountId: string): string {
  return `bn:alert:config:${accountId}`;
}

async function getAlertConfig(accountId: string) {
  try {
    const redis = getRedis();
    const raw = await redis.get(alertConfigKey(accountId));
    if (raw) return JSON.parse(raw);
    return { ...DEFAULT_ALERT_CONFIG };
  } catch {
    return alertConfigsFallback.get(accountId) || { ...DEFAULT_ALERT_CONFIG };
  }
}

async function setAlertConfig(accountId: string, config: any): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(alertConfigKey(accountId), JSON.stringify(config));
  } catch {
    alertConfigsFallback.set(accountId, config);
  }
}

export async function beatAlertRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/beat-alerts — List recent beat alerts (coverage gaps detected in last 24h)
  app.get('/beat-alerts', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const query = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find CoverageMatch records where isCovered = false, detected in last 24h
    const gaps = await prisma.coverageMatch.findMany({
      where: {
        accountId: payload.accountId,
        isCovered: false,
        matchedAt: { gte: twentyFourHoursAgo },
      },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            category: true,
            compositeScore: true,
            sourceCount: true,
            status: true,
            firstSeenAt: true,
          },
        },
        coverageFeed: {
          select: { name: true },
        },
      },
      orderBy: { story: { compositeScore: 'desc' } },
      take: query.limit,
      skip: query.offset,
    });

    const data = gaps.map((gap) => ({
      id: gap.id,
      storyId: gap.storyId,
      storyTitle: gap.story.title,
      category: gap.story.category,
      compositeScore: gap.story.compositeScore,
      sourceCount: gap.story.sourceCount,
      storyStatus: gap.story.status,
      competitorTitle: gap.matchedTitle,
      competitorFeed: gap.coverageFeed.name,
      gapDetectedAt: gap.matchedAt,
      minutesAgo: Math.round((Date.now() - gap.matchedAt.getTime()) / 60000),
    }));

    const total = await prisma.coverageMatch.count({
      where: {
        accountId: payload.accountId,
        isCovered: false,
        matchedAt: { gte: twentyFourHoursAgo },
      },
    });

    return reply.send({ data, total, limit: query.limit, offset: query.offset });
  });

  // POST /api/v1/beat-alerts/configure — Configure alert thresholds
  app.post('/beat-alerts/configure', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      minScore: z.number().min(0).max(1).optional(),
      maxGapMinutes: z.number().min(1).max(1440).optional(),
      slackEnabled: z.boolean().optional(),
      sseEnabled: z.boolean().optional(),
    }).parse(request.body);

    const current = await getAlertConfig(payload.accountId);
    const updated = {
      minScore: body.minScore ?? current.minScore,
      maxGapMinutes: body.maxGapMinutes ?? current.maxGapMinutes,
      slackEnabled: body.slackEnabled ?? current.slackEnabled,
      sseEnabled: body.sseEnabled ?? current.sseEnabled,
    };

    await setAlertConfig(payload.accountId, updated);

    return reply.send({ data: updated });
  });

  // GET /api/v1/beat-alerts/active — Active gaps that need attention RIGHT NOW
  app.get('/beat-alerts/active', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const config = await getAlertConfig(payload.accountId);
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago

    // Find stories that are uncovered, high-scoring, recent, and not stale/archived
    const activeGaps = await prisma.coverageMatch.findMany({
      where: {
        accountId: payload.accountId,
        isCovered: false,
        matchedAt: { gte: cutoff },
        story: {
          compositeScore: { gt: config.minScore },
          status: { notIn: ['STALE', 'ARCHIVED'] },
          firstSeenAt: { gte: cutoff },
        },
      },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            category: true,
            compositeScore: true,
            sourceCount: true,
            status: true,
            firstSeenAt: true,
          },
        },
        coverageFeed: {
          select: { name: true },
        },
      },
      orderBy: { story: { compositeScore: 'desc' } },
    });

    // Deduplicate by storyId (a story may have multiple uncovered matches)
    const seenStories = new Set<string>();
    const data = activeGaps
      .filter((gap) => {
        if (seenStories.has(gap.storyId)) return false;
        seenStories.add(gap.storyId);
        return true;
      })
      .map((gap) => ({
        id: gap.id,
        storyId: gap.storyId,
        storyTitle: gap.story.title,
        category: gap.story.category,
        compositeScore: gap.story.compositeScore,
        sourceCount: gap.story.sourceCount,
        storyStatus: gap.story.status,
        competitorTitle: gap.matchedTitle,
        competitorFeed: gap.coverageFeed.name,
        gapDetectedAt: gap.matchedAt,
        minutesAgo: Math.round((Date.now() - gap.matchedAt.getTime()) / 60000),
        firstSeenAt: gap.story.firstSeenAt,
      }));

    return reply.send({ data, count: data.length });
  });
}
