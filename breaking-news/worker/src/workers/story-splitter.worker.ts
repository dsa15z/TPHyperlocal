// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('story-splitter');

interface StorySplitterJob {
  sourcePostId: string;
}

// ─── Heuristic Detection ────────────────────────────────────────────────────

const DATE_PATTERNS = [
  /\((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\)/i,
  /\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*\d{4}\)/i,
  /\(\d{1,2}\/\d{1,2}\/\d{2,4}\)/,
];

const ROUNDUP_TITLE_PATTERNS = [
  /^(?:hello|good morning|good evening)\s+\w+/i,
  /today[:\s]/i,
  /this (?:week|morning|evening)[:\s]/i,
  /(?:morning|evening|afternoon)\s+(?:roundup|rundown|recap|briefing|update|headlines)/i,
  /(?:roundup|rundown|recap|briefing)[:\s]/i,
  /top\s+(?:stories|headlines|news)\s+(?:for|from|of|today|this)/i,
  /what(?:'s|\s+is)\s+(?:happening|trending|new)/i,
];

const MULTI_TOPIC_SEPARATORS = [
  /[;]\s*/g,        // semicolons
  /\.\.\.\s*/g,     // ellipsis
  /\s+\|\s+/g,      // pipe separators
  /\s+[-—]\s+/g,    // dashes between topics
];

/**
 * Detect if a post is a compound/roundup story using heuristics.
 */
function isCompoundStory(title: string, content: string): boolean {
  const fullText = `${title} ${content}`;

  // Check 1: Title contains date pattern like "(March 30, 2026)"
  const hasDateInTitle = DATE_PATTERNS.some((p) => p.test(title));

  // Check 2: Title matches roundup patterns
  const hasRoundupTitle = ROUNDUP_TITLE_PATTERNS.some((p) => p.test(title));

  // Check 3: Content mentions multiple unrelated topics
  // Count distinct subjects separated by separators
  let topicCount = 1;
  for (const sep of MULTI_TOPIC_SEPARATORS) {
    const parts = fullText.split(sep).filter((p) => p.trim().length > 20);
    topicCount = Math.max(topicCount, parts.length);
  }

  // Also count by commas with substantial content between them
  const commaTopics = fullText.split(/,\s+/).filter((p) => p.trim().length > 30);
  topicCount = Math.max(topicCount, commaTopics.length);

  // Check 4: Contains "and more" or similar aggregation phrases
  const hasAggregation = /\b(?:and more|plus|also|in other news|meanwhile|additionally|we also)\b/i.test(fullText);

  // Decision logic:
  // - Date in title + 3+ topics = likely roundup
  // - Roundup title pattern + 2+ topics = likely roundup
  // - 4+ distinct topics with aggregation language = likely roundup
  if (hasDateInTitle && topicCount >= 3) return true;
  if (hasRoundupTitle && topicCount >= 2) return true;
  if (topicCount >= 4 && hasAggregation) return true;

  return false;
}

// ─── LLM Splitting ──────────────────────────────────────────────────────────

const SPLIT_SYSTEM_PROMPT = 'You split news roundup articles into individual story items. Return valid JSON arrays only.';

function buildSplitPrompt(title: string, content: string): string {
  return `This RSS item appears to be a news roundup containing multiple stories. Split it into individual stories.

Title: ${title}
Content: ${content.substring(0, 3000)}

Return a JSON array of individual stories:
[
  {
    "headline": "Short headline for this story",
    "summary": "1-2 sentence summary",
    "category": "CRIME|WEATHER|TRAFFIC|POLITICS|BUSINESS|SPORTS|COMMUNITY|EMERGENCY|OTHER",
    "location": "specific location if mentioned"
  }
]

Only extract stories that have enough information to stand alone. Skip vague teasers. Return ONLY valid JSON, no markdown or extra text.`;
}

// ─── Worker Process ─────────────────────────────────────────────────────────

async function processStorySplitter(job: Job<StorySplitterJob>): Promise<void> {
  const { sourcePostId } = job.data;

  logger.info({ sourcePostId }, 'Checking if post is a compound story');

  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
    include: { source: true },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found');
    return;
  }

  // Skip if already split
  const rawData = (post.rawData as Record<string, unknown>) || {};
  if (rawData._split) {
    logger.info({ sourcePostId }, 'Post already split, skipping');
    return;
  }

  const title = post.title || '';
  const content = post.content || '';

  // Run heuristic check
  if (!isCompoundStory(title, content)) {
    logger.info({ sourcePostId }, 'Post is not a compound story');
    return;
  }

  logger.info({ sourcePostId, title }, 'Detected compound story, splitting via LLM');

  // Call LLM to split
  const prompt = buildSplitPrompt(title, content);
  const result = await generate(prompt, {
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    maxTokens: 1500,
    temperature: 0.3,
  });

  // Parse the response
  let stories: Array<{
    headline: string;
    summary: string;
    category: string;
    location: string;
  }>;

  try {
    let text = result.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    stories = JSON.parse(text.trim());
  } catch (parseErr) {
    logger.error({ sourcePostId, err: (parseErr as Error).message }, 'Failed to parse split results');
    return;
  }

  if (!Array.isArray(stories) || stories.length < 2) {
    logger.info({ sourcePostId, count: stories?.length }, 'LLM did not find multiple standalone stories');
    return;
  }

  logger.info({ sourcePostId, splitCount: stories.length }, 'Creating split source posts');

  const newPostIds: string[] = [];
  const connection = getSharedConnection();
  const enrichmentQueue = new Queue('enrichment', { connection });

  try {
    for (let i = 0; i < stories.length; i++) {
      const item = stories[i];
      if (!item.headline || !item.summary) continue;

      const splitPlatformPostId = `split::${post.platformPostId}::${i}`;

      // Check dedup guard
      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId: splitPlatformPostId },
      });
      if (existing) {
        logger.info({ splitPlatformPostId }, 'Split post already exists, skipping');
        newPostIds.push(existing.id);
        continue;
      }

      const newPost = await prisma.sourcePost.create({
        data: {
          sourceId: post.sourceId,
          platformPostId: splitPlatformPostId,
          url: post.url, // Link back to original
          title: item.headline,
          content: item.summary,
          authorName: post.authorName,
          publishedAt: post.publishedAt,
          category: item.category || null,
          locationName: item.location || null,
          engagementLikes: 0,
          engagementShares: 0,
          engagementComments: 0,
          rawData: {
            _splitFrom: post.id,
            _splitIndex: i,
            _originalTitle: title,
            category: item.category,
            location: item.location,
          },
        },
      });

      newPostIds.push(newPost.id);

      // Queue the split post for enrichment
      await enrichmentQueue.add(`enrich-split-${newPost.id}`, {
        sourcePostId: newPost.id,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      logger.info({
        sourcePostId: newPost.id,
        headline: item.headline,
        category: item.category,
      }, 'Created split source post');
    }
  } finally {
    await enrichmentQueue.close();
  }

  // Mark the original post as split
  await prisma.sourcePost.update({
    where: { id: sourcePostId },
    data: {
      rawData: {
        ...rawData,
        _split: true,
        splitInto: newPostIds,
        splitAt: new Date().toISOString(),
        splitModel: result.model,
      },
    },
  });

  logger.info({
    sourcePostId,
    originalTitle: title,
    splitCount: newPostIds.length,
    model: result.model,
  }, 'Story splitting complete');
}

export function createStorySplitterWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<StorySplitterJob>(
    'story-splitter',
    async (job) => {
      await processStorySplitter(job);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Story splitter job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Story splitter job failed');
  });

  return worker;
}
