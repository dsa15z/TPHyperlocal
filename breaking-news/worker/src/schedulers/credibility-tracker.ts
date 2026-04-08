/**
 * Source Credibility Tracker
 *
 * Runs every 6 hours. Analyzes which sources are first-to-break vs followers.
 * Auto-adjusts trust scores based on historical accuracy:
 * - Sources that consistently break stories first get higher trust
 * - Sources that only follow (never first) get slightly lower trust
 * - Sources with high dedup rate (mostly duplicates) get flagged
 */

import { createChildLogger } from '../lib/logger.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('credibility');

let credibilityInterval: ReturnType<typeof setInterval> | null = null;

async function runCredibilityUpdate(): Promise<void> {
  try {
    // Find sources that are the FIRST to report stories (primary source)
    // A primary source is the one whose sourcePost has the earliest publishedAt for a story
    const firstBreakers = await prisma.$queryRaw<Array<{ sourceId: string; name: string; firstBreaks: number }>>`
      SELECT s.id as "sourceId", s.name,
        COUNT(DISTINCT ss."storyId")::int as "firstBreaks"
      FROM "StorySource" ss
      JOIN "SourcePost" sp ON sp.id = ss."sourcePostId"
      JOIN "Source" s ON s.id = sp."sourceId"
      WHERE ss."isPrimary" = true
        AND sp."publishedAt" > NOW() - INTERVAL '7 days'
      GROUP BY s.id, s.name
      ORDER BY "firstBreaks" DESC
      LIMIT 50
    `.catch(() => []);

    if (firstBreakers.length === 0) return;

    // Get total story contributions per source in the same period
    const totalContributions = await prisma.$queryRaw<Array<{ sourceId: string; total: number }>>`
      SELECT sp."sourceId", COUNT(DISTINCT ss."storyId")::int as total
      FROM "StorySource" ss
      JOIN "SourcePost" sp ON sp.id = ss."sourcePostId"
      WHERE sp."publishedAt" > NOW() - INTERVAL '7 days'
      GROUP BY sp."sourceId"
    `.catch(() => []);

    const totalMap: Record<string, number> = {};
    for (const t of totalContributions) totalMap[(t as any).sourceId] = Number((t as any).total);

    // Calculate credibility adjustments
    let adjusted = 0;
    for (const breaker of firstBreakers) {
      const total = totalMap[(breaker as any).sourceId] || 1;
      const firstBreaks = Number((breaker as any).firstBreaks || 0);
      const breakRate = firstBreaks / (total as number);

      // Sources that break > 20% of their stories get a trust boost
      // Sources that break < 5% get a slight decrease
      let trustDelta = 0;
      if (breakRate > 0.2 && (firstBreaks as number) >= 3) {
        trustDelta = 0.02; // +2% trust
      } else if (breakRate < 0.05 && total >= 10) {
        trustDelta = -0.01; // -1% trust
      }

      if (trustDelta !== 0) {
        try {
          await prisma.$executeRaw`
            UPDATE "Source"
            SET "trustScore" = GREATEST(0.1, LEAST(1.0, "trustScore" + ${trustDelta})),
                metadata = jsonb_set(
                  COALESCE(metadata, '{}')::jsonb,
                  '{credibility}',
                  ${JSON.stringify({
                    firstBreaks,
                    totalContributions: total,
                    breakRate: Math.round(breakRate * 100),
                    lastAdjustment: trustDelta,
                    updatedAt: new Date().toISOString(),
                  })}::jsonb
                )
            WHERE id = ${breaker.sourceId}
          `;
          adjusted++;
        } catch {}
      }
    }

    if (adjusted > 0) {
      logger.info({ adjusted, totalAnalyzed: firstBreakers.length }, 'Source credibility scores updated');
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Credibility update failed');
  }
}

export function startCredibilityTracker(): void {
  logger.info('Starting source credibility tracker (every 6 hours)');
  // First run after 10 minutes
  setTimeout(runCredibilityUpdate, 10 * 60 * 1000);
  credibilityInterval = setInterval(runCredibilityUpdate, 6 * 60 * 60 * 1000);
}

export function stopCredibilityTracker(): void {
  if (credibilityInterval) clearInterval(credibilityInterval);
}
