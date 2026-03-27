import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('article-extraction');

interface ArticleExtractionJob {
  sourcePostId: string;
}

/**
 * Extract article text from HTML content
 */
function extractArticleText(html: string): string {
  // Try <article> tag first
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    const text = articleMatch[1].replace(/<[^>]*>/g, '').trim();
    if (text.length > 100) return text;
  }

  // Try <div class="article-body"> next
  const articleBodyMatch = html.match(/<div\s+class="article-body"[^>]*>([\s\S]*?)<\/div>/i);
  if (articleBodyMatch) {
    const text = articleBodyMatch[1].replace(/<[^>]*>/g, '').trim();
    if (text.length > 100) return text;
  }

  // Fall back to extracting all <p> tag content
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }

  return paragraphs.join('\n\n').trim();
}

async function processArticleExtraction(job: Job<ArticleExtractionJob>): Promise<void> {
  const { sourcePostId } = job.data;

  logger.info({ sourcePostId }, 'Extracting article text');

  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found, skipping extraction');
    return;
  }

  if (!post.url) {
    logger.warn({ sourcePostId }, 'Source post has no URL, skipping extraction');
    return;
  }

  if (post.fullArticleText) {
    logger.info({ sourcePostId }, 'Source post already has full article text, skipping');
    return;
  }

  // Fetch the URL with timeout and User-Agent
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const response = await fetch(post.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BreakingNewsBot/1.0)',
      },
    });

    if (!response.ok) {
      logger.warn({ sourcePostId, status: response.status }, 'Failed to fetch article URL');
      return;
    }

    html = await response.text();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn({ sourcePostId, url: post.url }, 'Article fetch timed out');
    } else {
      logger.warn({ sourcePostId, err: err.message }, 'Failed to fetch article');
    }
    return;
  } finally {
    clearTimeout(timeout);
  }

  // Extract article text
  const extractedText = extractArticleText(html);

  if (extractedText.length <= 100) {
    logger.info({ sourcePostId, length: extractedText.length }, 'Extracted text too short, skipping');
    return;
  }

  // Update SourcePost with extracted text
  await prisma.sourcePost.update({
    where: { id: sourcePostId },
    data: {
      fullArticleText: extractedText,
      fullArticleExtractedAt: new Date(),
    },
  });

  // If the SourcePost is already enriched, re-enqueue to clustering queue with improved text
  if (post.enrichedAt) {
    const clusteringQueue = new Queue('clustering', {
      connection: getSharedConnection(),
    });

    await clusteringQueue.add('cluster', {
      sourcePostId: post.id,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    await clusteringQueue.close();

    logger.info({ sourcePostId }, 'Re-enqueued enriched post to clustering with full article text');
  }

  logger.info({ sourcePostId, textLength: extractedText.length }, 'Article extraction complete');
}

export function createArticleExtractionWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<ArticleExtractionJob>(
    'article-extraction',
    async (job) => {
      await processArticleExtraction(job);
    },
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Article extraction job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Article extraction job failed');
  });

  return worker;
}
