// @ts-nocheck
import { createChildLogger } from './logger.js';
import { getSharedConnection } from './redis.js';
import crypto from 'crypto';

const logger = createChildLogger('embeddings');

interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDING_DIMS = 1536;
const LOCAL_EMBEDDING_DIMS = 256;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const BATCH_LIMIT = 100;

/**
 * Hash text content for cache key generation
 */
function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 32);
}

/**
 * Get a cached embedding from Redis
 */
async function getCachedEmbedding(hash: string): Promise<EmbeddingResult | null> {
  try {
    const redis = getSharedConnection();
    const cached = await redis.get(`bn:embed:${hash}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read embedding cache');
  }
  return null;
}

/**
 * Store an embedding in Redis cache
 */
async function cacheEmbedding(hash: string, result: EmbeddingResult): Promise<void> {
  try {
    const redis = getSharedConnection();
    await redis.set(`bn:embed:${hash}`, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err }, 'Failed to cache embedding');
  }
}

/**
 * Call OpenAI embeddings API
 */
async function openaiEmbed(text: string): Promise<EmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: OPENAI_EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;
  const tokens = data.usage?.total_tokens || 0;

  return {
    embedding,
    model: OPENAI_EMBEDDING_MODEL,
    tokens,
  };
}

/**
 * Call OpenAI batch embeddings API for multiple texts
 */
async function openaiBatchEmbed(texts: string[]): Promise<EmbeddingResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: OPENAI_EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const totalTokens = data.usage?.total_tokens || 0;
  const tokensPerText = Math.ceil(totalTokens / texts.length);

  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => ({
      embedding: item.embedding,
      model: OPENAI_EMBEDDING_MODEL,
      tokens: tokensPerText,
    }));
}

/**
 * Simple hash function to map a token to a vector index
 */
function hashToken(token: string, vocabSize: number): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % vocabSize;
}

/**
 * Simple local embedding fallback using TF-IDF style hashing.
 * No API needed -- tokenizes text, computes term frequencies,
 * hashes tokens to a fixed-size vector, and normalizes to unit length.
 */
export function localEmbed(text: string, vocabSize: number = LOCAL_EMBEDDING_DIMS): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  if (tokens.length === 0) {
    return new Array(vocabSize).fill(0);
  }

  // Compute term frequencies
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Build vector by hashing tokens into fixed-size buckets
  const vector = new Array(vocabSize).fill(0);
  for (const [token, count] of tf) {
    const idx = hashToken(token, vocabSize);
    // Use log-scaled term frequency (TF-IDF without IDF, but log dampens frequent terms)
    vector[idx] += 1 + Math.log(count);
  }

  // Also add bigrams for better discrimination
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    const idx = hashToken(bigram, vocabSize);
    vector[idx] += 0.5;
  }

  // Normalize to unit vector
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    logger.warn({ aLen: a.length, bLen: b.length }, 'Embedding dimension mismatch');
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

/**
 * Get embedding for a text, using OpenAI with fallback to local computation.
 * Results are cached in Redis for 7 days.
 */
export async function getEmbedding(text: string): Promise<EmbeddingResult> {
  const hash = contentHash(text);

  // Check cache first
  const cached = await getCachedEmbedding(hash);
  if (cached) {
    logger.debug({ hash }, 'Embedding cache hit');
    return cached;
  }

  // Try OpenAI first
  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await openaiEmbed(text);
      await cacheEmbedding(hash, result);
      logger.debug({ hash, model: result.model, tokens: result.tokens }, 'OpenAI embedding generated');
      return result;
    } catch (err) {
      logger.warn({ err }, 'OpenAI embedding failed, falling back to local');
    }
  }

  // Fallback to local embedding
  const embedding = localEmbed(text);
  const result: EmbeddingResult = {
    embedding,
    model: 'local-tfidf-hash',
    tokens: 0,
  };

  await cacheEmbedding(hash, result);
  logger.debug({ hash, model: result.model }, 'Local embedding generated');
  return result;
}

/**
 * Batch embed multiple texts. Uses OpenAI batch API when available,
 * processes in chunks of 100 (OpenAI batch limit).
 * Falls back to local embedding if OpenAI is unavailable.
 */
export async function batchEmbed(texts: string[]): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];

  const results: EmbeddingResult[] = new Array(texts.length);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Check cache for each text
  for (let i = 0; i < texts.length; i++) {
    const hash = contentHash(texts[i]);
    const cached = await getCachedEmbedding(hash);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  }

  if (uncachedTexts.length === 0) {
    logger.debug({ count: texts.length }, 'All embeddings from cache');
    return results;
  }

  logger.info({ total: texts.length, uncached: uncachedTexts.length }, 'Batch embedding texts');

  // Try OpenAI batch API
  if (process.env.OPENAI_API_KEY) {
    try {
      // Process in chunks of BATCH_LIMIT
      for (let chunkStart = 0; chunkStart < uncachedTexts.length; chunkStart += BATCH_LIMIT) {
        const chunkEnd = Math.min(chunkStart + BATCH_LIMIT, uncachedTexts.length);
        const chunk = uncachedTexts.slice(chunkStart, chunkEnd);
        const chunkResults = await openaiBatchEmbed(chunk);

        for (let j = 0; j < chunkResults.length; j++) {
          const globalIdx = uncachedIndices[chunkStart + j];
          results[globalIdx] = chunkResults[j];
          const hash = contentHash(texts[globalIdx]);
          await cacheEmbedding(hash, chunkResults[j]);
        }
      }

      return results;
    } catch (err) {
      logger.warn({ err }, 'OpenAI batch embedding failed, falling back to local');
    }
  }

  // Fallback: local embedding for all uncached texts
  for (let i = 0; i < uncachedTexts.length; i++) {
    const embedding = localEmbed(uncachedTexts[i]);
    const result: EmbeddingResult = {
      embedding,
      model: 'local-tfidf-hash',
      tokens: 0,
    };
    const globalIdx = uncachedIndices[i];
    results[globalIdx] = result;
    const hash = contentHash(texts[globalIdx]);
    await cacheEmbedding(hash, result);
  }

  return results;
}
