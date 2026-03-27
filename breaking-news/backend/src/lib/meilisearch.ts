/**
 * Meilisearch integration for instant, typo-tolerant story search.
 *
 * Meilisearch runs as a separate Railway service. Stories are indexed
 * on creation/update and searched via the /search endpoint.
 *
 * Setup: Add MEILISEARCH_URL and MEILISEARCH_API_KEY to environment.
 * If not configured, falls back to PostgreSQL ILIKE search.
 */

const MEILISEARCH_URL = process.env['MEILISEARCH_URL'];
const MEILISEARCH_API_KEY = process.env['MEILISEARCH_API_KEY'];
const INDEX_NAME = 'stories';

export function isMeilisearchConfigured(): boolean {
  return !!(MEILISEARCH_URL && MEILISEARCH_API_KEY);
}

async function meiliRequest(path: string, options: RequestInit = {}): Promise<any> {
  if (!MEILISEARCH_URL || !MEILISEARCH_API_KEY) {
    throw new Error('Meilisearch not configured');
  }

  const response = await fetch(`${MEILISEARCH_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MEILISEARCH_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meilisearch error: ${response.status} - ${body}`);
  }

  return response.json();
}

/**
 * Initialize the stories index with proper settings.
 * Call once on startup or after index recreation.
 */
export async function initMeilisearchIndex(): Promise<void> {
  if (!isMeilisearchConfigured()) return;

  try {
    // Create index if it doesn't exist
    await meiliRequest('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: INDEX_NAME, primaryKey: 'id' }),
    }).catch(() => {}); // ignore "already exists" errors

    // Configure searchable and filterable attributes
    await meiliRequest(`/indexes/${INDEX_NAME}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        searchableAttributes: ['title', 'summary', 'aiSummary', 'locationName', 'neighborhood', 'category'],
        filterableAttributes: ['status', 'category', 'neighborhood', 'marketId', 'compositeScore'],
        sortableAttributes: ['compositeScore', 'breakingScore', 'trendingScore', 'firstSeenAt', 'lastUpdatedAt'],
        rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
        typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
      }),
    });
  } catch (err) {
    console.error('Failed to initialize Meilisearch index:', err);
  }
}

/**
 * Index a story document. Call after story creation or update.
 */
export async function indexStory(story: {
  id: string;
  title: string;
  summary?: string | null;
  aiSummary?: string | null;
  category?: string | null;
  status: string;
  locationName?: string | null;
  neighborhood?: string | null;
  marketId?: string | null;
  compositeScore: number;
  breakingScore: number;
  trendingScore: number;
  sourceCount: number;
  firstSeenAt: Date;
  lastUpdatedAt: Date;
}): Promise<void> {
  if (!isMeilisearchConfigured()) return;

  try {
    await meiliRequest(`/indexes/${INDEX_NAME}/documents`, {
      method: 'POST',
      body: JSON.stringify([{
        ...story,
        firstSeenAt: story.firstSeenAt.getTime() / 1000,
        lastUpdatedAt: story.lastUpdatedAt.getTime() / 1000,
      }]),
    });
  } catch (err) {
    console.error('Failed to index story in Meilisearch:', err);
  }
}

/**
 * Search stories using Meilisearch.
 * Returns { hits, estimatedTotalHits, processingTimeMs }.
 */
export async function searchStories(
  query: string,
  options: {
    filter?: string;
    sort?: string[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  hits: Array<{ id: string; [key: string]: unknown }>;
  estimatedTotalHits: number;
  processingTimeMs: number;
}> {
  if (!isMeilisearchConfigured()) {
    throw new Error('Meilisearch not configured');
  }

  return meiliRequest(`/indexes/${INDEX_NAME}/search`, {
    method: 'POST',
    body: JSON.stringify({
      q: query,
      filter: options.filter,
      sort: options.sort,
      limit: options.limit || 20,
      offset: options.offset || 0,
      attributesToRetrieve: ['id'],
    }),
  });
}

/**
 * Remove a story from the index.
 */
export async function removeStory(storyId: string): Promise<void> {
  if (!isMeilisearchConfigured()) return;

  try {
    await meiliRequest(`/indexes/${INDEX_NAME}/documents/${storyId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.error('Failed to remove story from Meilisearch:', err);
  }
}
