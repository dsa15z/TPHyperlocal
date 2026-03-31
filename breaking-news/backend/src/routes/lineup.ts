// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getRedis } from '../lib/redis.js';
import { getPayload } from '../lib/route-helpers.js';

// Fallback in-memory history if Redis is unavailable
const lineupHistoryFallback: Array<{
  id: string;
  showName: string;
  showTime: string;
  slotCount: number;
  recommendedAt: string;
  stories: any[];
  leadRecommendation: any;
}> = [];

const LINEUP_HISTORY_KEY = 'bn:lineup:history';

async function pushLineupHistory(entry: any): Promise<void> {
  try {
    const redis = getRedis();
    await redis.lpush(LINEUP_HISTORY_KEY, JSON.stringify(entry));
    await redis.ltrim(LINEUP_HISTORY_KEY, 0, 49);
  } catch {
    lineupHistoryFallback.unshift(entry);
    if (lineupHistoryFallback.length > 50) lineupHistoryFallback.length = 50;
  }
}

async function getLineupHistory(count: number): Promise<any[]> {
  try {
    const redis = getRedis();
    const raw = await redis.lrange(LINEUP_HISTORY_KEY, 0, count - 1);
    return raw.map((item) => JSON.parse(item));
  } catch {
    return lineupHistoryFallback.slice(0, count);
  }
}

export async function lineupRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /api/v1/lineup/recommend — AI-powered show lineup recommendation
  app.post('/lineup/recommend', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      showName: z.string().min(1),
      showTime: z.string().min(1),
      slotCount: z.number().int().min(1).max(20).optional().default(6),
    }).parse(request.body);

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Step 1: Fetch top 30 active stories (not STALE/ARCHIVED) by compositeScore
    const stories = await prisma.story.findMany({
      where: {
        mergedIntoId: null,
        status: { notIn: ['STALE', 'ARCHIVED'] },
      },
      include: {
        storySources: {
          select: { addedAt: true },
        },
        coverageMatches: {
          select: { isCovered: true },
        },
      },
      orderBy: { compositeScore: 'desc' },
      take: 30,
    });

    // Step 2: Compute lineupScore for each story
    const scored = stories.map((story) => {
      const compositeWeight = 0.30;
      const velocityWeight = 0.20;
      const coverageGapWeight = 0.20;
      const trendWeight = 0.15;
      const recencyWeight = 0.15;

      // compositeScore component (already 0-1)
      const compositeComponent = Math.min(story.compositeScore, 1.0);

      // sourceVelocity: sources added in last 2h / total sources
      const totalSources = story.storySources.length;
      const recentSources = story.storySources.filter(
        (ss) => new Date(ss.addedAt) >= twoHoursAgo
      ).length;
      const sourceVelocity = totalSources > 0 ? recentSources / totalSources : 0;

      // coverageGap: 1.0 if uncovered, 0.0 if covered
      const hasCoverage = story.coverageMatches.some((cm) => cm.isCovered);
      const coverageGap = hasCoverage ? 0.0 : 1.0;

      // trendBoost: derive from trendingScore thresholds
      // trendingScore > 0.6 = rising, 0.3-0.6 = flat, < 0.3 = declining
      let trendLabel: string;
      let trendBoost: number;
      if (story.trendingScore > 0.6) {
        trendLabel = 'rising';
        trendBoost = 0.8;
      } else if (story.trendingScore > 0.3) {
        trendLabel = 'flat';
        trendBoost = 0.4;
      } else {
        trendLabel = 'declining';
        trendBoost = 0.1;
      }

      // recencyBoost: exponential decay from firstSeenAt, halfLife = 6h
      const hoursAge = (now.getTime() - new Date(story.firstSeenAt).getTime()) / 3600000;
      const halfLife = 6;
      const recencyBoost = Math.pow(0.5, hoursAge / halfLife);

      // Final lineup score
      const lineupScore =
        compositeComponent * compositeWeight +
        sourceVelocity * velocityWeight +
        coverageGap * coverageGapWeight +
        trendBoost * trendWeight +
        recencyBoost * recencyWeight;

      return {
        storyId: story.id,
        title: story.editedTitle || story.title,
        summary: story.editedSummary || story.aiSummary || story.summary,
        category: story.category,
        status: story.status,
        locationName: story.locationName,
        compositeScore: story.compositeScore,
        lineupScore: Math.round(lineupScore * 10000) / 10000,
        breakdown: {
          composite: Math.round(compositeComponent * compositeWeight * 10000) / 10000,
          sourceVelocity: Math.round(sourceVelocity * velocityWeight * 10000) / 10000,
          coverageGap: Math.round(coverageGap * coverageGapWeight * 10000) / 10000,
          trendBoost: Math.round(trendBoost * trendWeight * 10000) / 10000,
          recencyBoost: Math.round(recencyBoost * recencyWeight * 10000) / 10000,
        },
        signals: {
          sourceVelocityRaw: totalSources > 0 ? Math.round(sourceVelocity * 1000) / 1000 : 0,
          recentSources,
          totalSources,
          isCovered: hasCoverage,
          trend: trendLabel,
          hoursAge: Math.round(hoursAge * 10) / 10,
        },
      };
    });

    // Step 3: Sort by lineupScore DESC and take top slotCount
    scored.sort((a, b) => b.lineupScore - a.lineupScore);
    const recommended = scored.slice(0, body.slotCount);

    // Step 5: Lead recommendation with rationale
    const lead = recommended[0] || null;
    let leadRecommendation = null;
    if (lead) {
      // Heuristic rationale
      const parts: string[] = [];
      parts.push(`Highest lineup score (${lead.lineupScore})`);
      if (lead.signals.trend === 'rising') parts.push('rising trend');
      if (!lead.signals.isCovered) parts.push('no competitor coverage detected');
      if (lead.signals.recentSources > 0) parts.push(`${lead.signals.recentSources} new sources in last 2h`);
      if (lead.compositeScore > 0.7) parts.push('strong composite score');

      leadRecommendation = {
        storyId: lead.storyId,
        title: lead.title,
        rationale: parts.join(' with ') + '.',
      };
    }

    // Store in Redis-backed history
    const entry = {
      id: `lineup_${Date.now()}`,
      showName: body.showName,
      showTime: body.showTime,
      slotCount: body.slotCount,
      recommendedAt: now.toISOString(),
      stories: recommended,
      leadRecommendation,
    };
    await pushLineupHistory(entry);

    return reply.send({
      showName: body.showName,
      showTime: body.showTime,
      slotCount: body.slotCount,
      recommendedAt: now.toISOString(),
      stories: recommended,
      leadRecommendation,
    });
  });

  // GET /api/v1/lineup/history — Past lineup recommendations
  app.get('/lineup/history', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const history = await getLineupHistory(20);
    return reply.send({
      data: history,
    });
  });
}
