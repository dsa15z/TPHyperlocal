-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector columns to SourcePost for embedding storage
ALTER TABLE "SourcePost" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Add vector column to Story for aggregated embedding
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Create indexes for fast similarity search (IVFFlat for large datasets)
-- Use cosine distance operator for normalized vectors
CREATE INDEX IF NOT EXISTS "idx_sourcepost_embedding" ON "SourcePost"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "idx_story_embedding" ON "Story"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Function for finding similar stories by vector similarity
CREATE OR REPLACE FUNCTION find_similar_stories(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  title text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    1 - (s."embedding" <=> query_embedding) as similarity
  FROM "Story" s
  WHERE s."embedding" IS NOT NULL
    AND s."mergedIntoId" IS NULL
    AND 1 - (s."embedding" <=> query_embedding) > match_threshold
  ORDER BY s."embedding" <=> query_embedding
  LIMIT match_count;
END;
$$;
