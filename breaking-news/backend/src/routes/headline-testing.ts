// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface HeadlineTest {
  storyId: string;
  variants: string[];
  impressions: number[];
  clicks: number[];
  createdAt: string;
  winnerId: number | null;
}

interface VariantStats {
  index: number;
  headline: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isLeading: boolean;
  significance: { vsControl: number; isSignificant95: boolean; isSignificant99: boolean } | null;
}

// ─── In-memory store (headline tests are short-lived, 1-24h) ───────────────

const headlineTests = new Map<string, HeadlineTest>();

// ─── Helpers ───────────────────────────────────────────────────────────────

function getUserId(req: any): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)).userId; } catch { return null; }
}

function calculateZScore(
  impressionsA: number,
  clicksA: number,
  impressionsB: number,
  clicksB: number,
): number {
  if (impressionsA === 0 || impressionsB === 0) return 0;

  const rateA = clicksA / impressionsA;
  const rateB = clicksB / impressionsB;
  const pooledRate = (clicksA + clicksB) / (impressionsA + impressionsB);
  const se = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / impressionsA + 1 / impressionsB),
  );

  return se > 0 ? (rateA - rateB) / se : 0;
}

function getVariantStats(test: HeadlineTest): VariantStats[] {
  const ctrs = test.variants.map((_, i) =>
    test.impressions[i] > 0 ? test.clicks[i] / test.impressions[i] : 0,
  );

  const maxCtr = Math.max(...ctrs);

  return test.variants.map((headline, i) => {
    const ctr = ctrs[i];

    // Calculate significance vs control (variant 0)
    let significance = null;
    if (i > 0 && test.impressions[0] > 0 && test.impressions[i] > 0) {
      const z = calculateZScore(
        test.impressions[i], test.clicks[i],
        test.impressions[0], test.clicks[0],
      );
      significance = {
        vsControl: parseFloat(z.toFixed(4)),
        isSignificant95: Math.abs(z) > 1.96,
        isSignificant99: Math.abs(z) > 2.58,
      };
    }

    return {
      index: i,
      headline,
      impressions: test.impressions[i],
      clicks: test.clicks[i],
      ctr: parseFloat((ctr * 100).toFixed(2)),
      isLeading: ctr === maxCtr && ctr > 0,
      significance,
    };
  });
}

function generateTestId(storyId: string): string {
  return `ht_${storyId}_${Date.now().toString(36)}`;
}

// ─── Validation schemas ────────────────────────────────────────────────────

const CreateTestSchema = z.object({
  variants: z.array(z.string().min(1).max(500)).min(2).max(4),
});

const VariantIndexSchema = z.object({
  variant: z.number().int().min(0),
});

const PickWinnerSchema = z.object({
  variant: z.number().int().min(0).optional(),
});

// ─── Routes ────────────────────────────────────────────────────────────────

export async function headlineTestingRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /api/v1/stories/:id/headlines/test — Create headline test
  app.post('/stories/:id/headlines/test', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    // Validate body
    const parsed = CreateTestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    // Verify story exists
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Check for existing active test
    const existing = headlineTests.get(id);
    if (existing && existing.winnerId === null) {
      return reply.status(409).send({
        error: 'Active test already exists for this story. Pick a winner or wait for it to complete.',
      });
    }

    const { variants } = parsed.data;
    const testId = generateTestId(id);

    const test: HeadlineTest = {
      storyId: id,
      variants,
      impressions: new Array(variants.length).fill(0),
      clicks: new Array(variants.length).fill(0),
      createdAt: new Date().toISOString(),
      winnerId: null,
    };

    headlineTests.set(id, test);

    return reply.status(201).send({
      data: {
        testId,
        storyId: id,
        variants: variants.map((v, i) => ({ index: i, headline: v })),
        createdAt: test.createdAt,
      },
    });
  });

  // GET /api/v1/stories/:id/headlines/test — Get active test status
  app.get('/stories/:id/headlines/test', async (request, reply) => {
    const { id } = request.params as { id: string };

    const test = headlineTests.get(id);
    if (!test) {
      return reply.status(404).send({ error: 'No headline test found for this story' });
    }

    const stats = getVariantStats(test);
    const totalImpressions = test.impressions.reduce((a, b) => a + b, 0);
    const totalClicks = test.clicks.reduce((a, b) => a + b, 0);
    const testDurationMs = Date.now() - new Date(test.createdAt).getTime();
    const testDurationHours = parseFloat((testDurationMs / (1000 * 60 * 60)).toFixed(1));

    return reply.send({
      data: {
        storyId: id,
        isActive: test.winnerId === null,
        winnerId: test.winnerId,
        createdAt: test.createdAt,
        durationHours: testDurationHours,
        totals: {
          impressions: totalImpressions,
          clicks: totalClicks,
          overallCtr: totalImpressions > 0
            ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2))
            : 0,
        },
        variants: stats,
      },
    });
  });

  // POST /api/v1/stories/:id/headlines/impression — Track impression (public)
  app.post('/stories/:id/headlines/impression', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = VariantIndexSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const test = headlineTests.get(id);
    if (!test || test.winnerId !== null) {
      return reply.status(404).send({ error: 'No active headline test for this story' });
    }

    const { variant } = parsed.data;
    if (variant >= test.variants.length) {
      return reply.status(400).send({ error: `Invalid variant index. Max: ${test.variants.length - 1}` });
    }

    test.impressions[variant]++;

    return reply.send({ ok: true, variant, impressions: test.impressions[variant] });
  });

  // POST /api/v1/stories/:id/headlines/click — Track click (public)
  app.post('/stories/:id/headlines/click', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = VariantIndexSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const test = headlineTests.get(id);
    if (!test || test.winnerId !== null) {
      return reply.status(404).send({ error: 'No active headline test for this story' });
    }

    const { variant } = parsed.data;
    if (variant >= test.variants.length) {
      return reply.status(400).send({ error: `Invalid variant index. Max: ${test.variants.length - 1}` });
    }

    test.clicks[variant]++;

    return reply.send({ ok: true, variant, clicks: test.clicks[variant] });
  });

  // POST /api/v1/stories/:id/headlines/pick-winner — Pick winner
  app.post('/stories/:id/headlines/pick-winner', async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };

    const parsed = PickWinnerSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const test = headlineTests.get(id);
    if (!test) {
      return reply.status(404).send({ error: 'No headline test found for this story' });
    }
    if (test.winnerId !== null) {
      return reply.status(409).send({ error: 'Winner already selected', winnerId: test.winnerId });
    }

    let winnerIndex: number;

    if (parsed.data.variant !== undefined) {
      // Manual selection
      if (parsed.data.variant >= test.variants.length) {
        return reply.status(400).send({ error: `Invalid variant index. Max: ${test.variants.length - 1}` });
      }
      winnerIndex = parsed.data.variant;
    } else {
      // Auto-select: find highest CTR with >95% confidence
      const stats = getVariantStats(test);

      // Need at least some impressions
      const minImpressions = 30;
      const validStats = stats.filter((s) => s.impressions >= minImpressions);
      if (validStats.length === 0) {
        return reply.status(400).send({
          error: 'Not enough data. Need at least 30 impressions per variant.',
        });
      }

      // Find the variant with highest CTR
      const sorted = [...validStats].sort((a, b) => b.ctr - a.ctr);
      const best = sorted[0];

      // Check if the best variant is significantly better than at least one other
      let hasSignificantWin = false;
      if (best.index === 0) {
        // Control is winning; check if it's significantly better than any challenger
        for (let i = 1; i < stats.length; i++) {
          if (stats[i].impressions >= minImpressions) {
            const z = calculateZScore(
              test.impressions[0], test.clicks[0],
              test.impressions[i], test.clicks[i],
            );
            if (z > 1.96) { hasSignificantWin = true; break; }
          }
        }
      } else {
        // Challenger is winning; check significance vs control
        hasSignificantWin = best.significance?.isSignificant95 || false;
      }

      if (!hasSignificantWin) {
        return reply.status(400).send({
          error: 'No statistically significant winner yet (95% confidence required). Use manual selection or wait for more data.',
          currentLeader: { index: best.index, headline: best.headline, ctr: best.ctr },
        });
      }

      winnerIndex = best.index;
    }

    // Update test state
    test.winnerId = winnerIndex;

    // Update story title to winning headline
    await prisma.story.update({
      where: { id },
      data: { editedTitle: test.variants[winnerIndex] },
    });

    return reply.send({
      data: {
        storyId: id,
        winnerId: winnerIndex,
        winningHeadline: test.variants[winnerIndex],
        finalStats: getVariantStats(test),
      },
    });
  });

  // GET /api/v1/headlines/active-tests — List all active headline tests
  app.get('/headlines/active-tests', async (request, reply) => {
    const activeTests: Array<{
      storyId: string;
      storyTitle: string;
      variantCount: number;
      totalImpressions: number;
      totalClicks: number;
      durationHours: number;
      createdAt: string;
      leadingVariant: { index: number; headline: string; ctr: number } | null;
    }> = [];

    const activeEntries = Array.from(headlineTests.entries())
      .filter(([_, test]) => test.winnerId === null);

    // Fetch story titles in bulk
    const storyIds = activeEntries.map(([id]) => id);
    const stories = storyIds.length > 0
      ? await prisma.story.findMany({
          where: { id: { in: storyIds } },
          select: { id: true, title: true, editedTitle: true },
        })
      : [];
    const storyMap = new Map(stories.map((s) => [s.id, s.editedTitle || s.title]));

    for (const [storyId, test] of activeEntries) {
      const stats = getVariantStats(test);
      const leading = stats.find((s) => s.isLeading);
      const totalImpressions = test.impressions.reduce((a, b) => a + b, 0);
      const totalClicks = test.clicks.reduce((a, b) => a + b, 0);
      const durationMs = Date.now() - new Date(test.createdAt).getTime();

      activeTests.push({
        storyId,
        storyTitle: storyMap.get(storyId) || 'Unknown',
        variantCount: test.variants.length,
        totalImpressions,
        totalClicks,
        durationHours: parseFloat((durationMs / (1000 * 60 * 60)).toFixed(1)),
        createdAt: test.createdAt,
        leadingVariant: leading
          ? { index: leading.index, headline: leading.headline, ctr: leading.ctr }
          : null,
      });
    }

    return reply.send({
      data: activeTests,
      total: activeTests.length,
    });
  });
}
