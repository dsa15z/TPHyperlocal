/**
 * Meilisearch Integration — Instant full-text search for stories.
 * Sub-10ms search vs 200ms+ Prisma LIKE queries.
 * Falls back to Prisma if Meilisearch is unavailable.
 */

const MEILI_URL = process.env['MEILI_URL'] || '';
const MEILI_KEY = process.env['MEILI_API_KEY'] || '';
const INDEX = 'stories';

async function mf(path: string, opts: RequestInit = {}): Promise<any> {
  if (!MEILI_URL) return null;
  const res = await fetch(`${MEILI_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MEILI_KEY}`, ...(opts.headers as any || {}) },
    signal: AbortSignal.timeout(10000),
  });
  return res.ok ? res.json() : null;
}

export async function initMeiliIndex(): Promise<boolean> {
  if (!MEILI_URL) return false;
  try {
    await mf(`/indexes/${INDEX}`, { method: 'POST', body: JSON.stringify({ uid: INDEX, primaryKey: 'id' }) });
    await mf(`/indexes/${INDEX}/settings`, { method: 'PATCH', body: JSON.stringify({
      searchableAttributes: ['title', 'summary', 'category', 'location'],
      filterableAttributes: ['status', 'category', 'compositeScore', 'firstSeenAt', 'sourceCount'],
      sortableAttributes: ['compositeScore', 'breakingScore', 'firstSeenAt', 'lastUpdatedAt', 'sourceCount'],
    }) });
    return true;
  } catch { return false; }
}

export async function indexStories(stories: any[]): Promise<number> {
  if (!MEILI_URL || !stories.length) return 0;
  try {
    await mf(`/indexes/${INDEX}/documents`, { method: 'POST', body: JSON.stringify(stories) });
    return stories.length;
  } catch { return 0; }
}

export async function searchStories(query: string, opts?: { filter?: string; sort?: string[]; limit?: number; offset?: number }): Promise<any | null> {
  if (!MEILI_URL || !query) return null;
  try {
    return await mf(`/indexes/${INDEX}/search`, { method: 'POST', body: JSON.stringify({
      q: query, filter: opts?.filter, sort: opts?.sort || ['compositeScore:desc'],
      limit: opts?.limit || 50, offset: opts?.offset || 0,
      attributesToHighlight: ['title'], highlightPreTag: '<mark>', highlightPostTag: '</mark>',
    }) });
  } catch { return null; }
}

export async function isMeiliHealthy(): Promise<boolean> {
  if (!MEILI_URL) return false;
  try { const h = await mf('/health'); return h?.status === 'available'; } catch { return false; }
}
