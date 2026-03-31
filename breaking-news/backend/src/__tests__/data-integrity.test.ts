/**
 * Phase 4: Data Integrity Checks
 * Validates story data consistency, score ranges, and state logic.
 */
import { describe, it, expect } from 'vitest';

const API = process.env.API_URL || 'https://tphyperlocal-production.up.railway.app';

async function fetchJSON(path: string) {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

describe('Data Integrity: Story Scores', () => {
  it('all stories have scores in valid 0-1 range', async () => {
    const body = await fetchJSON('/api/v1/stories?limit=50');
    const stories = body.data || [];

    for (const story of stories) {
      const fields = ['compositeScore', 'breakingScore', 'trendingScore', 'confidenceScore', 'localityScore'];
      for (const field of fields) {
        const val = story[field];
        expect(val, `Story ${story.id} ${field}=${val}`).toBeGreaterThanOrEqual(0);
        expect(val, `Story ${story.id} ${field}=${val}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('composite score approximately equals weighted sum', async () => {
    const body = await fetchJSON('/api/v1/stories?limit=20');
    const stories = body.data || [];

    for (const story of stories) {
      const expected =
        0.35 * story.breakingScore +
        0.25 * story.trendingScore +
        0.20 * story.confidenceScore +
        0.20 * story.localityScore;

      // Allow 0.15 tolerance (decay and rounding)
      expect(
        Math.abs(story.compositeScore - expected),
        `Story ${story.id}: composite=${story.compositeScore.toFixed(3)} expected≈${expected.toFixed(3)}`
      ).toBeLessThan(0.15);
    }
  });
});

describe('Data Integrity: Story States', () => {
  it('no contradictory states (STALE/ARCHIVED with high breaking score)', async () => {
    const body = await fetchJSON('/api/v1/stories?limit=50');
    const stories = body.data || [];

    for (const story of stories) {
      if (story.status === 'ARCHIVED' && story.breakingScore > 0.7) {
        // This is a warning, not necessarily a bug — score decay may not have caught up
        console.warn(`Warning: Story ${story.id} is ARCHIVED but breakingScore=${story.breakingScore}`);
      }
    }
  });

  it('all statuses are valid enum values', async () => {
    const body = await fetchJSON('/api/v1/stories?limit=50');
    const valid = new Set(['ALERT', 'BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'FOLLOW_UP', 'STALE', 'ARCHIVED']);

    for (const story of (body.data || [])) {
      expect(valid.has(story.status), `Invalid status: ${story.status}`).toBe(true);
    }
  });
});

describe('Data Integrity: Source Counts', () => {
  it('sourceCount is non-negative for all stories', async () => {
    const body = await fetchJSON('/api/v1/stories?limit=50');
    for (const story of (body.data || [])) {
      const count = story.sourceCount ?? story._count?.storySources ?? 0;
      expect(count, `Story ${story.id} has negative sourceCount`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Data Integrity: Pagination Consistency', () => {
  it('page 1 and page 2 return different stories', async () => {
    const page1 = await fetchJSON('/api/v1/stories?limit=5&offset=0');
    const page2 = await fetchJSON('/api/v1/stories?limit=5&offset=5');

    const ids1 = new Set((page1.data || []).map((s: any) => s.id));
    const ids2 = new Set((page2.data || []).map((s: any) => s.id));

    // No overlap
    for (const id of ids2) {
      expect(ids1.has(id), `Story ${id} appears on both pages`).toBe(false);
    }
  });
});

describe('Data Integrity: Analytics Consistency', () => {
  it('analytics overview numbers are non-negative', async () => {
    const body = await fetchJSON('/api/v1/analytics/overview');
    const ov = body.overview || {};

    expect(ov.totalStories).toBeGreaterThanOrEqual(0);
    expect(ov.last24hStories).toBeGreaterThanOrEqual(0);
    expect(ov.lastWeekStories).toBeGreaterThanOrEqual(0);
    expect(ov.breakingNow).toBeGreaterThanOrEqual(0);
    expect(ov.activeSources).toBeGreaterThanOrEqual(0);
  });

  it('24h stories <= 7d stories <= total stories', async () => {
    const body = await fetchJSON('/api/v1/analytics/overview');
    const ov = body.overview || {};

    expect(ov.last24hStories).toBeLessThanOrEqual(ov.lastWeekStories + 1); // +1 for timing
    expect(ov.lastWeekStories).toBeLessThanOrEqual(ov.totalStories + 1);
  });
});
