// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('breaking-package');

interface BreakingPackageJob {
  storyId: string;
  accountId: string;
  userId?: string;
}

async function processBreakingPackage(job: Job<BreakingPackageJob>): Promise<void> {
  const { storyId, accountId, userId } = job.data;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: { sourcePost: true },
        take: 5,
        orderBy: { similarityScore: 'desc' },
      },
    },
  });

  if (!story) return;

  const sourceContent = story.storySources.map((ss) => ss.sourcePost.content).join('\n\n');
  const content = story.aiSummary || story.summary || sourceContent || story.title;

  logger.info({ storyId, title: story.title.substring(0, 50) }, 'Generating breaking package');

  const prompt = `You are a breaking news producer. Generate a complete breaking news package for this story.

STORY: ${story.title}
DETAILS: ${content.substring(0, 2000)}
LOCATION: ${story.locationName || 'Unknown'}
CATEGORY: ${story.category || 'Unknown'}
SOURCES: ${story.storySources.length} sources

Generate ALL of the following in one response, separated by the exact headers shown:

===BROADCAST SCRIPT===
Write a 30-second broadcast reader script (about 75 words). Use active voice, short sentences, present tense where possible. Start with the most important fact.

===SOCIAL POST===
Write a tweet-length social media post (max 280 chars) with 2-3 relevant hashtags.

===PUSH TITLE===
Write a push notification title (max 65 chars, urgent tone).

===PUSH BODY===
Write a push notification body (max 150 chars, key details).

===WEB SUMMARY===
Write a 3-sentence web article summary.

===BULLET POINTS===
Write 4-5 bullet points of the key facts.

===GRAPHIC PROMPT===
Describe a simple news graphic that could illustrate this story (for an AI image generator).`;

  const result = await generate(prompt, {
    maxTokens: 1200,
    temperature: 0.6,
    systemPrompt: 'You are an award-winning breaking news producer. Be accurate, concise, and urgent.',
  });

  // Parse the sections
  const text = result.text;
  const extract = (header: string): string => {
    const regex = new RegExp(`===${header}===\\s*([\\s\\S]*?)(?====|$)`);
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  await prisma.breakingPackage.create({
    data: {
      storyId,
      accountId,
      broadcastScript: extract('BROADCAST SCRIPT'),
      socialPost: extract('SOCIAL POST'),
      pushTitle: extract('PUSH TITLE'),
      pushBody: extract('PUSH BODY'),
      webSummary: extract('WEB SUMMARY'),
      bulletPoints: extract('BULLET POINTS'),
      graphicPrompt: extract('GRAPHIC PROMPT'),
      generatedBy: userId,
    },
  });

  logger.info({ storyId, model: result.model, tokens: result.tokens }, 'Breaking package generated');
}

export function createBreakingPackageWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<BreakingPackageJob>('breaking-package', async (job) => {
    await processBreakingPackage(job);
  }, { connection, concurrency: 3 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Breaking package job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Breaking package job failed'));
  return worker;
}
