// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('embeddings');

interface EmbeddingsJob {
  sourcePostId?: string;
  storyId?: string;
}

/**
 * Build text input for embedding from a SourcePost or Story
 */
function buildSourcePostText(post: any): string {
  const title = post.title || '';
  const content = post.fullArticleText || post.content || '';
  return `${title} ${content}`.trim();
}

function buildStoryText(story: any): string {
  const title = story.title || '';
  const summary = story.summary || '';
  const aiSummary = story.aiSummary || '';
  return `${title} ${summary} ${aiSummary}`.trim();
}

async function processEmbeddings(job: Job<EmbeddingsJob>): Promise<void> {
  const { sourcePostId, storyId } = job.data;

  if (!sourcePostId && !storyId) {
    logger.warn('No sourcePostId or storyId provided, skipping');
    return;
  }

  const recordType = sourcePostId ? 'SourcePost' : 'Story';
  const recordId = sourcePostId || storyId;

  logger.info({ recordType, recordId }, 'Generating embeddings');

  // Fetch the record
  let text: string;

  if (sourcePostId) {
    const post = await prisma.sourcePost.findUnique({
      where: { id: sourcePostId },
    });

    if (!post) {
      logger.warn({ sourcePostId }, 'Source post not found, skipping embeddings');
      return;
    }

    text = buildSourcePostText(post);
  } else {
    const story = await prisma.story.findUnique({
      where: { id: storyId! },
    });

    if (!story) {
      logger.warn({ storyId }, 'Story not found, skipping embeddings');
      return;
    }

    text = buildStoryText(story);
  }

  if (text.length === 0) {
    logger.warn({ recordType, recordId }, 'No text content to embed, skipping');
    return;
  }

  // Truncate to 8000 chars (model limit)
  const truncatedText = text.slice(0, 8000);

  // Call OpenAI embeddings API
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('OPENAI_API_KEY not set, skipping embeddings');
    return;
  }

  let embedding: number[];
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: truncatedText,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'OpenAI API request failed');
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    embedding = data.data[0].embedding;
  } catch (err: any) {
    logger.error({ recordType, recordId, err: err.message }, 'Failed to generate embeddings');
    throw err;
  }

  if (!embedding || embedding.length !== 1536) {
    logger.error({ recordType, recordId, length: embedding?.length }, 'Unexpected embedding dimensions');
    return;
  }

  // Store embedding as JSON array (works without pgvector extension)
  if (sourcePostId) {
    await prisma.sourcePost.update({
      where: { id: sourcePostId },
      data: { embeddingJson: embedding },
    });
  } else {
    await prisma.story.update({
      where: { id: storyId! },
      data: { embeddingJson: embedding },
    });
  }

  logger.info({ recordType, recordId, dimensions: embedding.length }, 'Embeddings complete');
}

export function createEmbeddingsWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<EmbeddingsJob>(
    'embeddings',
    async (job) => {
      await processEmbeddings(job);
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Embeddings job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Embeddings job failed');
  });

  return worker;
}
