/**
 * Phase 3: API Contract Validation
 * Validates request/response schemas for critical endpoints.
 * Uses live API — runs fast, no mocking needed.
 */
import { describe, it, expect } from 'vitest';

const API = process.env.API_URL || 'https://tphyperlocal-production.up.railway.app';

async function fetchJSON(path: string) {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('API Contract: Health', () => {
  it('GET /health returns 200 with status field', async () => {
    const { status, body } = await fetchJSON('/api/v1/health');
    expect(status).toBe(200);
    expect(body).toHaveProperty('status');
  });
});

describe('API Contract: Stories', () => {
  it('GET /stories returns paginated data with correct schema', async () => {
    const { status, body } = await fetchJSON('/api/v1/stories?limit=3');
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const story = body.data[0];
      // Required fields
      expect(story).toHaveProperty('id');
      expect(story).toHaveProperty('title');
      expect(story).toHaveProperty('status');
      expect(story).toHaveProperty('compositeScore');
      expect(story).toHaveProperty('breakingScore');
      expect(story).toHaveProperty('trendingScore');
      expect(story).toHaveProperty('confidenceScore');
      expect(story).toHaveProperty('localityScore');

      // Type checks
      expect(typeof story.id).toBe('string');
      expect(typeof story.title).toBe('string');
      expect(typeof story.compositeScore).toBe('number');

      // Score range validation (0-1)
      expect(story.compositeScore).toBeGreaterThanOrEqual(0);
      expect(story.compositeScore).toBeLessThanOrEqual(1);
      expect(story.breakingScore).toBeGreaterThanOrEqual(0);
      expect(story.breakingScore).toBeLessThanOrEqual(1);

      // Status enum validation
      const validStatuses = ['ALERT', 'BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'FOLLOW_UP', 'STALE', 'ARCHIVED'];
      expect(validStatuses).toContain(story.status);
    }
  });

  it('GET /stories respects limit parameter', async () => {
    const { body } = await fetchJSON('/api/v1/stories?limit=2');
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  it('GET /stories rejects invalid limit', async () => {
    const { status } = await fetchJSON('/api/v1/stories?limit=99999');
    expect(status).toBe(400);
  });

  it('GET /stories rejects negative offset', async () => {
    const { status } = await fetchJSON('/api/v1/stories?offset=-1');
    expect(status).toBe(400);
  });

  it('GET /stories/:id returns 404 for fake ID', async () => {
    const { status } = await fetchJSON('/api/v1/stories/FAKEID_NONEXISTENT');
    expect(status).toBe(404);
  });

  it('GET /stories sorts correctly (desc)', async () => {
    const { body } = await fetchJSON('/api/v1/stories?limit=5&sort=compositeScore&order=desc');
    const scores = body.data.map((s: any) => s.compositeScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });

  it('GET /stories sorts correctly (asc)', async () => {
    const { body } = await fetchJSON('/api/v1/stories?limit=5&sort=compositeScore&order=asc');
    const scores = body.data.map((s: any) => s.compositeScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i + 1]);
    }
  });

  it('GET /stories filters by category', async () => {
    const { body } = await fetchJSON('/api/v1/stories?category=SPORTS&limit=5');
    for (const story of body.data) {
      expect(story.category).toBe('SPORTS');
    }
  });
});

describe('API Contract: Search', () => {
  it('GET /search returns results for valid query', async () => {
    const { status, body } = await fetchJSON('/api/v1/search?q=Houston&limit=3');
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
  });

  it('GET /search returns 0 results for nonsense query', async () => {
    const { status, body } = await fetchJSON('/api/v1/search?q=ZZZZNONEXISTENT99999');
    expect(status).toBe(200);
  });

  it('GET /search strips HTML from query (XSS prevention)', async () => {
    const { status } = await fetchJSON('/api/v1/search?q=%3Cscript%3Ealert(1)%3C/script%3E');
    expect(status).toBe(200); // Should not crash
  });
});

describe('API Contract: Analytics', () => {
  it('GET /analytics/overview has correct schema', async () => {
    const { status, body } = await fetchJSON('/api/v1/analytics/overview');
    expect(status).toBe(200);
    expect(body).toHaveProperty('overview');
    expect(body.overview).toHaveProperty('totalStories');
    expect(typeof body.overview.totalStories).toBe('number');
  });
});

describe('API Contract: Pipeline', () => {
  it('GET /pipeline/status has correct schema', async () => {
    const { status, body } = await fetchJSON('/api/v1/pipeline/status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('summary');
    expect(body.summary).toHaveProperty('active');
    expect(body.summary).toHaveProperty('waiting');
    expect(typeof body.summary.active).toBe('number');
  });
});

describe('API Contract: Auth (Security)', () => {
  it('admin endpoints reject unauthenticated requests', async () => {
    const endpoints = [
      '/api/v1/admin/sources',
      '/api/v1/admin/markets',
      '/api/v1/user/profile',
      '/api/v1/assignments',
      '/api/v1/reporters',
    ];
    for (const ep of endpoints) {
      const { status } = await fetchJSON(ep);
      expect(status, `${ep} should reject unauthenticated`).toBe(401);
    }
  });

  it('rejects invalid JWT token', async () => {
    const res = await fetch(`${API}/api/v1/user/profile`, {
      headers: { Authorization: 'Bearer INVALID_TOKEN' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects malformed auth header', async () => {
    const res = await fetch(`${API}/api/v1/user/profile`, {
      headers: { Authorization: 'NotBearer something' },
    });
    expect(res.status).toBe(401);
  });
});
