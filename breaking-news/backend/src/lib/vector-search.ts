// @ts-nocheck
import { prisma } from './prisma.js';

interface SimilarResult {
  id: string;
  title: string;
  similarity: number;
}

interface SimilarPostResult {
  id: string;
  content: string;
  similarity: number;
  storyId?: string;
}

// ─── pgvector availability cache ───────────────────────────────────────────

let pgvectorAvailable: boolean | null = null;

/**
 * Check if pgvector extension is available.
 * Caches the result after the first successful check.
 */
export async function isPgvectorAvailable(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;

  try {
    const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists`
    );
    pgvectorAvailable = result.length > 0 && result[0].exists === true;
  } catch (err) {
    console.warn('[vector-search] Failed to check pgvector availability:', err);
    pgvectorAvailable = false;
  }

  return pgvectorAvailable;
}

/**
 * Reset the pgvector availability cache (useful for testing).
 */
export function resetPgvectorCache(): void {
  pgvectorAvailable = null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format a number array as a PostgreSQL vector literal: '[0.1,0.2,...]'
 */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Call OpenAI embeddings API directly (for use in backend context).
 * Returns the raw embedding array.
 */
async function getEmbeddingFromOpenAI(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[vector-search] OPENAI_API_KEY not set, cannot generate embedding');
    return null;
  }

  const truncated = text.slice(0, 8000);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: truncated,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[vector-search] OpenAI API error ${response.status}: ${errorBody}`);
    return null;
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ─── Core vector search functions ──────────────────────────────────────────

/**
 * Find stories similar to a given embedding vector.
 * Uses pgvector's cosine distance operator (<=>).
 */
export async function findSimilarStories(
  embedding: number[],
  options?: { threshold?: number; limit?: number; excludeIds?: string[] }
): Promise<SimilarResult[]> {
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-search] pgvector not available, returning empty results');
    return [];
  }

  const threshold = options?.threshold ?? 0.75;
  const limit = options?.limit ?? 10;
  const excludeIds = options?.excludeIds ?? [];
  const vectorLiteral = toVectorLiteral(embedding);

  let query: string;
  let params: any[];

  if (excludeIds.length > 0) {
    // Build placeholders for exclude IDs: $2, $3, ...
    const placeholders = excludeIds.map((_, i) => `$${i + 3}`).join(', ');
    query = `
      SELECT
        s.id,
        s.title,
        1 - (s."embedding" <=> $1::vector) as similarity
      FROM "Story" s
      WHERE s."embedding" IS NOT NULL
        AND s."mergedIntoId" IS NULL
        AND 1 - (s."embedding" <=> $1::vector) > $2
        AND s.id NOT IN (${placeholders})
      ORDER BY s."embedding" <=> $1::vector
      LIMIT ${limit}
    `;
    params = [vectorLiteral, threshold, ...excludeIds];
  } else {
    query = `
      SELECT
        s.id,
        s.title,
        1 - (s."embedding" <=> $1::vector) as similarity
      FROM "Story" s
      WHERE s."embedding" IS NOT NULL
        AND s."mergedIntoId" IS NULL
        AND 1 - (s."embedding" <=> $1::vector) > $2
      ORDER BY s."embedding" <=> $1::vector
      LIMIT ${limit}
    `;
    params = [vectorLiteral, threshold];
  }

  try {
    const results = await prisma.$queryRawUnsafe<SimilarResult[]>(query, ...params);
    return results.map((r) => ({
      id: r.id,
      title: r.title,
      similarity: Number(r.similarity),
    }));
  } catch (err) {
    console.error('[vector-search] findSimilarStories failed:', err);
    return [];
  }
}

/**
 * Find source posts similar to a given embedding.
 */
export async function findSimilarPosts(
  embedding: number[],
  options?: { threshold?: number; limit?: number; maxAgeHours?: number }
): Promise<SimilarPostResult[]> {
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-search] pgvector not available, returning empty results');
    return [];
  }

  const threshold = options?.threshold ?? 0.75;
  const limit = options?.limit ?? 10;
  const maxAgeHours = options?.maxAgeHours;
  const vectorLiteral = toVectorLiteral(embedding);

  let ageFilter = '';
  const params: any[] = [vectorLiteral, threshold];

  if (maxAgeHours) {
    ageFilter = `AND sp."publishedAt" > NOW() - INTERVAL '${maxAgeHours} hours'`;
  }

  const query = `
    SELECT
      sp.id,
      sp.content,
      1 - (sp."embedding" <=> $1::vector) as similarity,
      ss."storyId" as "storyId"
    FROM "SourcePost" sp
    LEFT JOIN "StorySource" ss ON ss."sourcePostId" = sp.id
    WHERE sp."embedding" IS NOT NULL
      AND 1 - (sp."embedding" <=> $1::vector) > $2
      ${ageFilter}
    ORDER BY sp."embedding" <=> $1::vector
    LIMIT ${limit}
  `;

  try {
    const results = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    return results.map((r) => ({
      id: r.id,
      content: r.content || '',
      similarity: Number(r.similarity),
      storyId: r.storyId || undefined,
    }));
  } catch (err) {
    console.error('[vector-search] findSimilarPosts failed:', err);
    return [];
  }
}

/**
 * Store an embedding for a source post.
 */
export async function storePostEmbedding(postId: string, embedding: number[]): Promise<void> {
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-search] pgvector not available, skipping storePostEmbedding');
    return;
  }

  const vectorLiteral = toVectorLiteral(embedding);

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "SourcePost" SET "embedding" = $1::vector WHERE id = $2`,
      vectorLiteral,
      postId
    );
  } catch (err) {
    console.error('[vector-search] storePostEmbedding failed:', err);
  }
}

/**
 * Store an embedding for a story (aggregated from its source posts).
 */
export async function storeStoryEmbedding(storyId: string, embedding: number[]): Promise<void> {
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-search] pgvector not available, skipping storeStoryEmbedding');
    return;
  }

  const vectorLiteral = toVectorLiteral(embedding);

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Story" SET "embedding" = $1::vector WHERE id = $2`,
      vectorLiteral,
      storyId
    );
  } catch (err) {
    console.error('[vector-search] storeStoryEmbedding failed:', err);
  }
}

/**
 * Semantic search: find stories matching a text query.
 * First embeds the query text, then does vector similarity search.
 */
export async function semanticSearch(
  queryText: string,
  options?: { threshold?: number; limit?: number }
): Promise<SimilarResult[]> {
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-search] pgvector not available, returning empty results');
    return [];
  }

  const embedding = await getEmbeddingFromOpenAI(queryText);
  if (!embedding) {
    return [];
  }

  return findSimilarStories(embedding, {
    threshold: options?.threshold ?? 0.7,
    limit: options?.limit ?? 10,
  });
}
