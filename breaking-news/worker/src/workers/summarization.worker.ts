// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('summarization');

interface SummarizationJob {
  storyId: string;
}

interface SummaryResult {
  headline: string;
  summary: string;
  key_points: string[];
  category: string;
}

const SYNTHESIS_SYSTEM_PROMPT =
  'You are a news editor. Synthesize these source reports into a single factual news summary.';

const POLISH_SYSTEM_PROMPT =
  'You are an executive news editor. Polish this summary to publication quality. Maintain factual accuracy. Return the same JSON structure.';

const SUMMARY_JSON_INSTRUCTION =
  'Respond with valid JSON only in this format: { "headline": string, "summary": string, "key_points": string[], "category": string }';

/**
 * Call OpenAI-compatible API (works for both OpenAI and Grok/xAI)
 */
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API call failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content;
}

/**
 * Call Claude API for polish pass
 */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API call failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((c) => c.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in Claude response');
  }

  return textBlock.text;
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseSummaryJSON(raw: string): SummaryResult {
  // Strip markdown code blocks if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  return {
    headline: String(parsed.headline || ''),
    summary: String(parsed.summary || ''),
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.map(String)
      : [],
    category: String(parsed.category || 'OTHER'),
  };
}

async function processSummarization(job: Job<SummarizationJob>): Promise<void> {
  const { storyId } = job.data;

  logger.info({ storyId }, 'Starting summarization');

  // Fetch story with all source posts
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: { sourcePost: true },
      },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping summarization');
    return;
  }

  // Only proceed if we have enough sources
  if (story.sourceCount < 3) {
    logger.info({ storyId, sourceCount: story.sourceCount }, 'Not enough sources for summarization, skipping');
    return;
  }

  // Skip if summary is fresh (less than 1 hour old)
  if (story.aiSummary && story.aiSummaryAt) {
    const ageMs = Date.now() - story.aiSummaryAt.getTime();
    const oneHourMs = 60 * 60 * 1000;
    if (ageMs < oneHourMs) {
      logger.info({ storyId, summaryAge: Math.round(ageMs / 60000) }, 'Summary is still fresh, skipping');
      return;
    }
  }

  // Build context from source posts (truncated to 6000 chars)
  let context = '';
  for (const ss of story.storySources) {
    const post = ss.sourcePost;
    const entry = `[Source: ${post.authorName || 'Unknown'}]\nTitle: ${post.title || 'Untitled'}\n${post.content}\n\n---\n\n`;

    if (context.length + entry.length > 6000) {
      // Add as much as we can fit
      context += entry.substring(0, 6000 - context.length);
      break;
    }
    context += entry;
  }

  // Determine which API to use for Pass 1
  const openaiKey = process.env['OPENAI_API_KEY'];
  const xaiKey = process.env['XAI_API_KEY'];
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];

  if (!openaiKey && !xaiKey) {
    logger.error({ storyId }, 'Neither OPENAI_API_KEY nor XAI_API_KEY is set');
    throw new Error('No synthesis API key configured');
  }

  // Pass 1: Synthesis
  let pass1Raw: string;
  let pass1Model: string;

  try {
    if (openaiKey) {
      pass1Model = 'gpt-4o';
      pass1Raw = await callOpenAICompatible(
        'https://api.openai.com/v1',
        openaiKey,
        pass1Model,
        SYNTHESIS_SYSTEM_PROMPT,
        `${SUMMARY_JSON_INSTRUCTION}\n\nSource reports:\n\n${context}`,
      );
    } else {
      pass1Model = 'grok-2-latest';
      pass1Raw = await callOpenAICompatible(
        'https://api.x.ai/v1',
        xaiKey!,
        pass1Model,
        SYNTHESIS_SYSTEM_PROMPT,
        `${SUMMARY_JSON_INSTRUCTION}\n\nSource reports:\n\n${context}`,
      );
    }
  } catch (err) {
    logger.error({ storyId, err }, 'Pass 1 (synthesis) failed');
    throw err;
  }

  let pass1Result: SummaryResult;
  try {
    pass1Result = parseSummaryJSON(pass1Raw);
  } catch (err) {
    logger.error({ storyId, raw: pass1Raw.substring(0, 200), err }, 'Failed to parse Pass 1 JSON');
    throw new Error('Pass 1 returned invalid JSON');
  }

  logger.info({ storyId, pass1Model }, 'Pass 1 (synthesis) complete');

  // Pass 2: Polish with Claude
  let finalResult = pass1Result;
  let finalModel = pass1Model;

  if (anthropicKey) {
    try {
      const pass2Raw = await callClaude(
        anthropicKey,
        POLISH_SYSTEM_PROMPT,
        `${SUMMARY_JSON_INSTRUCTION}\n\nDraft summary to polish:\n\n${JSON.stringify(pass1Result, null, 2)}`,
      );

      finalResult = parseSummaryJSON(pass2Raw);
      finalModel = `${pass1Model}+claude-sonnet-4-20250514`;

      logger.info({ storyId }, 'Pass 2 (polish) complete');
    } catch (err) {
      logger.warn({ storyId, err }, 'Pass 2 (polish) failed, falling back to Pass 1 output');
      // Fall back to Pass 1 output — finalResult already set
    }
  } else {
    logger.info({ storyId }, 'ANTHROPIC_API_KEY not set, skipping Pass 2 polish');
  }

  // Update story with summarization results
  await prisma.story.update({
    where: { id: storyId },
    data: {
      aiSummary: finalResult.summary,
      // Only update title if no human edit has been made
      ...(story.editedTitle === null ? { title: finalResult.headline } : {}),
      aiSummaryModel: finalModel,
      aiSummaryAt: new Date(),
    },
  });

  logger.info({
    storyId,
    model: finalModel,
    headlineLength: finalResult.headline.length,
    summaryLength: finalResult.summary.length,
    keyPointCount: finalResult.key_points.length,
  }, 'Summarization complete');
}

export function createSummarizationWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<SummarizationJob>(
    'summarization',
    async (job) => {
      await processSummarization(job);
    },
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000, // Max 5 jobs per minute
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Summarization job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Summarization job failed');
  });

  return worker;
}
