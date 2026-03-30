// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('story-research');

interface StoryResearchJob {
  storyId: string;
  accountId: string;
}

const RESEARCH_SYSTEM_PROMPT = `You are an investigative news researcher specializing in local Houston news. You provide balanced, factual deep background research with multiple perspectives. Always present both sides of controversial topics equally. Return valid JSON only.`;

function buildResearchPrompt(title: string, summary: string, sourceSummaries: string): string {
  return `You are an investigative news researcher. Given this story, provide deep background research with multiple perspectives.

Story: ${title}
Summary: ${summary}
Sources: ${sourceSummaries}

Return a JSON object with:
{
  "deepBackground": "3-4 paragraph in-depth background on this topic, including historical context and key players involved",
  "keyFacts": ["array of 5-8 verified key facts about this story"],
  "perspectives": [
    {
      "viewpoint": "Name of perspective (e.g., 'Law Enforcement', 'Community Leaders', 'Legal Experts')",
      "position": "1-2 sentence summary of this perspective's position",
      "arguments": ["key arguments from this perspective"],
      "talkTrack": "A 30-second talk track a news anchor could use to present this perspective"
    }
  ],
  "forArguments": ["arguments supporting the main action/decision in the story"],
  "againstArguments": ["arguments opposing the main action/decision in the story"],
  "questionsToAsk": ["5 investigative questions a reporter should pursue"],
  "relatedTopics": ["related stories or topics to watch"],
  "expertSources": ["types of experts who could comment on this story"]
}

IMPORTANT: Return ONLY valid JSON, no markdown or extra text. Ensure perspectives include at least 2-3 distinct viewpoints. If there are obvious for/against positions, ensure both sides are represented equally.`;
}

async function processStoryResearch(job: Job<StoryResearchJob>): Promise<void> {
  const { storyId, accountId } = job.data;

  logger.info({ storyId }, 'Starting story research');

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

  if (!story) {
    logger.warn({ storyId }, 'Story not found for research');
    return;
  }

  // Build source content
  const sourceSummaries = story.storySources
    .map((ss) => {
      const post = ss.sourcePost;
      return `[${post.title || 'Untitled'}] ${post.content?.substring(0, 500) || ''}`;
    })
    .join('\n\n');

  const summary = story.aiSummary || story.summary || '';
  const prompt = buildResearchPrompt(story.title, summary, sourceSummaries);

  logger.info({ storyId }, 'Calling LLM for deep research');

  const result = await generate(prompt, {
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    maxTokens: 2000,
    temperature: 0.6,
  });

  // Parse the LLM response as JSON
  let researchData;
  try {
    // Strip markdown code fences if present
    let text = result.text.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    researchData = JSON.parse(text.trim());
  } catch (parseErr) {
    logger.warn({ storyId, err: (parseErr as Error).message }, 'Failed to parse LLM JSON, storing raw text');
    researchData = {
      deepBackground: result.text,
      keyFacts: [],
      perspectives: [],
      forArguments: [],
      againstArguments: [],
      questionsToAsk: [],
      relatedTopics: [],
      expertSources: [],
      _parseError: true,
    };
  }

  // Ensure for/against balance if the story has obvious sides
  if (researchData.forArguments && researchData.againstArguments) {
    const forCount = researchData.forArguments.length;
    const againstCount = researchData.againstArguments.length;
    if (forCount > 0 && againstCount === 0) {
      researchData.againstArguments = ['Further reporting needed to capture opposing perspectives'];
    }
    if (againstCount > 0 && forCount === 0) {
      researchData.forArguments = ['Further reporting needed to capture supporting perspectives'];
    }
  }

  // Store result in FirstDraft table with type='story_research'
  await prisma.firstDraft.create({
    data: {
      storyId,
      type: 'story_research',
      content: JSON.stringify(researchData),
      model: result.model,
      tokens: result.tokens,
      userId: null,
      voiceId: null,
    },
  });

  logger.info({
    storyId,
    model: result.model,
    tokens: result.tokens,
    perspectives: researchData.perspectives?.length || 0,
    keyFacts: researchData.keyFacts?.length || 0,
  }, 'Story research complete');
}

export function createStoryResearchWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<StoryResearchJob>(
    'story-research',
    async (job) => {
      await processStoryResearch(job);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Story research job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Story research job failed');
  });

  return worker;
}
