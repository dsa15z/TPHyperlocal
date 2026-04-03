// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('first-draft');

interface FirstDraftJob {
  storyId: string;
  type: string; // summary, short_summary, rewrite, tweet, bullets, idea_starter
  voiceId?: string;
  userId?: string;
  displaySourceName?: string; // For auto-rewrite: override the story's source attribution
}

const PROMPTS: Record<string, { system: string; user: string }> = {
  summary: {
    system: 'You are a concise news editor. Write clear, factual summaries.',
    user: 'Write a 2-3 sentence summary of this news story for a newsroom audience:\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
  short_summary: {
    system: 'You are a headline writer. Be extremely concise.',
    user: 'Write a 1-sentence summary (max 25 words) of this news story:\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
  rewrite: {
    system: 'You are a broadcast news writer. Write for spoken delivery — short sentences, active voice, conversational tone.',
    user: 'Rewrite this news story for on-air broadcast delivery (60 seconds of reading time):\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
  tweet: {
    system: 'You are a social media editor for a news station.',
    user: 'Write a compelling tweet (max 280 characters) about this breaking news story. Include relevant hashtags:\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
  bullets: {
    system: 'You are a news briefing editor. Extract key facts.',
    user: 'Extract 3-5 bullet points of the key facts from this news story:\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
  idea_starter: {
    system: 'You are a creative content strategist for a local news station.',
    user: 'Based on this news story, suggest 3 conversation starters or angles a radio/TV host could use to engage their audience:\n\nTitle: {{title}}\n\nContent: {{content}}',
  },
};

async function processFirstDraft(job: Job<FirstDraftJob>): Promise<void> {
  const { storyId, type, voiceId, userId } = job.data;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: { sourcePost: true },
        take: 3,
        orderBy: { similarityScore: 'desc' },
      },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found');
    return;
  }

  const promptDef = PROMPTS[type];
  if (!promptDef) {
    logger.warn({ type }, 'Unknown first draft type');
    return;
  }

  // Build content from story + source posts
  const sourceContent = story.storySources
    .map((ss) => ss.sourcePost.content)
    .join('\n\n');
  const content = story.aiSummary || story.summary || sourceContent || story.title;

  // Get voice system prompt if specified
  let systemPrompt = promptDef.system;
  if (voiceId) {
    const voice = await prisma.voice.findUnique({ where: { id: voiceId } });
    if (voice) {
      systemPrompt = `${voice.systemPrompt}\n\n${promptDef.system}`;
    }
  }

  const userPrompt = promptDef.user
    .replace('{{title}}', story.title)
    .replace('{{content}}', content.substring(0, 3000));

  logger.info({ storyId, type }, 'Generating first draft');

  const result = await generate(userPrompt, {
    systemPrompt,
    maxTokens: type === 'tweet' ? 100 : type === 'short_summary' ? 100 : 500,
    temperature: 0.7,
  });

  await prisma.firstDraft.create({
    data: {
      storyId,
      type,
      voiceId: voiceId || null,
      userId: userId || null,
      content: result.text,
      model: result.model,
      tokens: result.tokens,
    },
  });

  // For auto-rewrite sources: apply rewritten content as the story summary
  // and override source attribution with the display source name
  const displaySourceName = job.data.displaySourceName;
  if (type === 'rewrite' && displaySourceName && result.text) {
    try {
      await prisma.$executeRaw`
        UPDATE "Story"
        SET summary = ${result.text},
            "aiSummary" = ${result.text},
            "aiSummaryModel" = ${result.model || 'unknown'},
            "aiSummaryAt" = NOW()
        WHERE id = ${storyId}
      `;
      // Store display source name in story metadata for frontend to use
      const existing = await prisma.story.findUnique({ where: { id: storyId }, select: { metadata: true } });
      const meta = ((existing?.metadata || {}) as Record<string, unknown>);
      await prisma.story.update({
        where: { id: storyId },
        data: { metadata: { ...meta, displaySourceName, autoRewritten: true, rewrittenAt: new Date().toISOString() } },
      });
      logger.info({ storyId, displaySourceName }, 'Auto-rewrite applied to story summary with source override');
    } catch (err) {
      logger.warn({ storyId, err: (err as Error).message }, 'Failed to apply auto-rewrite to story (non-fatal)');
    }
  }

  logger.info({
    storyId,
    type,
    model: result.model,
    tokens: result.tokens,
  }, 'First draft generated');
}

export function createFirstDraftWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<FirstDraftJob>(
    'first-draft',
    async (job) => {
      await processFirstDraft(job);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'First draft job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'First draft job failed');
  });

  return worker;
}
