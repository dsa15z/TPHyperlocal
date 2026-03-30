// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';

const logger = createChildLogger('llm-ingestion');

// ─── Types ──────────────────────────────────────────────────────────────────

interface LLMPollJob {
  type: 'llm_poll';
  sourceId: string;
  platform: 'LLM_OPENAI' | 'LLM_CLAUDE' | 'LLM_GROK' | 'LLM_GEMINI';
  marketName: string;
  marketKeywords: string[];
  apiKey: string; // from AccountCredential, decrypted
  model?: string;
}

interface LLMNewsItem {
  headline: string;
  summary: string;
  category: string;
  location?: string;
  neighborhood?: string;
  severity: number; // 1-10
  confidence: number; // 0-1
  sources?: string[]; // URLs or source names the LLM references
}

interface LLMResponse {
  stories: LLMNewsItem[];
  model: string;
  timestamp: string;
}

// ─── LLM Provider Implementations ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a local breaking news analyst. Given a market area, return the top breaking and trending news stories happening RIGHT NOW in that area. Focus on events from the last 2 hours.

Return ONLY a JSON object with this exact structure:
{
  "stories": [
    {
      "headline": "Short factual headline",
      "summary": "2-3 sentence factual summary of the event",
      "category": "CRIME|WEATHER|TRAFFIC|POLITICS|BUSINESS|SPORTS|COMMUNITY|EMERGENCY|OTHER",
      "location": "Specific location if known",
      "neighborhood": "Neighborhood or area name if applicable",
      "severity": 7,
      "confidence": 0.85,
      "sources": ["Source name or URL"]
    }
  ]
}

Rules:
- Only include events you are confident are real and current
- Set confidence to how sure you are this is happening (0.0-1.0)
- Set severity 1-10 (10 = major emergency, 1 = routine)
- Do NOT fabricate events. If you're unsure, lower the confidence score.
- Return an empty stories array if you have no current breaking news
- Maximum 10 stories per response`;

// Grok-specific prompt that leverages its real-time X/Twitter data access
const GROK_SYSTEM_PROMPT = `You are a hyperlocal breaking news analyst with access to real-time X/Twitter posts and social media data. Your job is to find breaking and developing news stories by analyzing what people are posting on X RIGHT NOW in the specified market area.

Return ONLY a JSON object with this exact structure:
{
  "stories": [
    {
      "headline": "Short factual headline",
      "summary": "2-3 sentence factual summary based on what X users are reporting",
      "category": "CRIME|WEATHER|TRAFFIC|POLITICS|BUSINESS|SPORTS|COMMUNITY|EMERGENCY|OTHER",
      "location": "Specific location (intersection, address, neighborhood)",
      "neighborhood": "Houston neighborhood or suburb name",
      "severity": 7,
      "confidence": 0.85,
      "sources": ["@username or X post reference"],
      "xSignals": {
        "postCount": 5,
        "earliestPost": "approximate time of first X post about this",
        "notableAccounts": ["@HPDRobbery", "@HCSOTexas"]
      }
    }
  ]
}

You have a UNIQUE ADVANTAGE: you can see real-time X/Twitter posts that no RSS feed captures. Focus on:
- Police/fire department X accounts reporting incidents
- Journalists posting from the field before their stories publish
- Citizen reports of breaking events (accidents, fires, weather damage)
- Government officials making announcements
- Traffic reporters calling out incidents

Rules:
- Only include events you see ACTUAL X/Twitter posts about — do not guess or fabricate
- The "sources" array MUST reference real X accounts or posts you've seen
- Set confidence based on how many independent accounts are discussing it
- Multiple accounts = higher confidence. Single unverified account = lower confidence.
- Set severity 1-10 (10 = active shooter/major disaster, 1 = routine announcement)
- Return an empty stories array if you see nothing newsworthy on X right now
- Maximum 10 stories per response`;

function buildUserPrompt(marketName: string, keywords: string[]): string {
  return `What are the top breaking news stories happening RIGHT NOW in ${marketName}? Focus on: ${keywords.join(', ')}. Only include events from the last few hours that you have high confidence are real.`;
}

function buildGrokUserPrompt(marketName: string, keywords: string[]): string {
  const beats = keywords.length > 0 ? keywords.join(', ') : 'crime, accidents, weather, traffic, fires, politics, breaking news';
  return `Search X/Twitter posts from the last 2 hours about ${marketName}. What breaking news events are people talking about RIGHT NOW?

Focus areas: ${beats}

Key X accounts to check for ${marketName} area:
- Police: @housaborlice, @HCSOTexas, @HPDRobbery, @HPDMajorAssaults, @SLPDTx, @PearlandPD
- Fire: @HoustonFire, @haborisCountyFM
- Traffic: @Houston_Traffic, @TxDOTHouston, @HoustonTranStar
- Weather: @NWSHouston, @SpaceCityWX, @TravisHerzog
- News reporters: Any journalist posting from the field
- Government: @HoustonTX, @HarborrisCountyTX, @JudgeLina

What is happening RIGHT NOW based on what you see on X? Only report events with actual X posts as evidence.`;
}

async function pollOpenAI(job: LLMPollJob): Promise<LLMResponse> {
  const model = job.model || 'gpt-4o';
  const userPrompt = buildUserPrompt(job.marketName, job.marketKeywords);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${job.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(content) as { stories: LLMNewsItem[] };
  return {
    stories: parsed.stories || [],
    model: data.model,
    timestamp: new Date().toISOString(),
  };
}

async function pollClaude(job: LLMPollJob): Promise<LLMResponse> {
  const model = job.model || 'claude-sonnet-4-6-20250514';
  const userPrompt = buildUserPrompt(job.marketName, job.marketKeywords);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': job.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${body}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    model: string;
  };

  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Empty response from Claude');

  // Extract JSON from response (Claude may wrap in markdown code blocks)
  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1]!;

  const parsed = JSON.parse(jsonStr.trim()) as { stories: LLMNewsItem[] };
  return {
    stories: parsed.stories || [],
    model: data.model,
    timestamp: new Date().toISOString(),
  };
}

async function pollGrok(job: LLMPollJob): Promise<LLMResponse> {
  const model = job.model || 'grok-3';
  // Use Grok-specific prompts that leverage its real-time X/Twitter data access
  const userPrompt = buildGrokUserPrompt(job.marketName, job.marketKeywords);

  // Grok uses OpenAI-compatible API at api.x.ai — with real-time X data access
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${job.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: GROK_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from Grok');

  let jsonStr = content;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1]!;

  const parsed = JSON.parse(jsonStr.trim()) as { stories: LLMNewsItem[] };

  // Grok stories may include xSignals — merge into sources and rawData
  const stories = (parsed.stories || []).map((story) => {
    const xSignals = (story as any).xSignals;
    if (xSignals?.notableAccounts) {
      story.sources = [...(story.sources || []), ...xSignals.notableAccounts];
    }
    return story;
  });

  return {
    stories,
    model: data.model || model,
    timestamp: new Date().toISOString(),
  };
}

async function pollGemini(job: LLMPollJob): Promise<LLMResponse> {
  const model = job.model || 'gemini-2.0-flash';
  const userPrompt = buildUserPrompt(job.marketName, job.marketKeywords);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${job.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${body}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    modelVersion: string;
  };

  const text = data.candidates[0]?.content?.parts[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  let jsonStr = text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1]!;

  const parsed = JSON.parse(jsonStr.trim()) as { stories: LLMNewsItem[] };
  return {
    stories: parsed.stories || [],
    model: data.modelVersion || model,
    timestamp: new Date().toISOString(),
  };
}

// ─── Process LLM Poll ──────────────────────────────────────────────────────

const POLL_FN: Record<string, (job: LLMPollJob) => Promise<LLMResponse>> = {
  LLM_OPENAI: pollOpenAI,
  LLM_CLAUDE: pollClaude,
  LLM_GROK: pollGrok,
  LLM_GEMINI: pollGemini,
};

async function handleLLMPoll(job: Job<LLMPollJob>): Promise<void> {
  const { sourceId, platform, marketName } = job.data;

  logger.info({ sourceId, platform, marketName }, 'Polling LLM for breaking news');

  const pollFn = POLL_FN[platform];
  if (!pollFn) {
    throw new Error(`Unknown LLM platform: ${platform}`);
  }

  let llmResponse: LLMResponse;
  try {
    llmResponse = await pollFn(job.data);
  } catch (err) {
    logger.error({ sourceId, platform, err }, 'LLM poll failed');
    throw err;
  }

  logger.info({
    sourceId,
    platform,
    storiesReturned: llmResponse.stories.length,
    model: llmResponse.model,
  }, 'LLM response received');

  if (llmResponse.stories.length === 0) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastPolledAt: new Date() },
    });
    return;
  }

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const item of llmResponse.stories) {
    try {
      // Skip low-confidence items
      if (item.confidence < 0.5) {
        logger.debug({ headline: item.headline, confidence: item.confidence }, 'Skipping low-confidence LLM story');
        continue;
      }

      const content = `${item.headline}\n\n${item.summary}`;
      const contentHash = generateContentHash(content);
      const platformPostId = `${platform.toLowerCase()}::${llmResponse.model}::${contentHash.substring(0, 16)}`;

      // Check for duplicate
      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content,
          contentHash,
          title: item.headline.substring(0, 500),
          category: item.category,
          locationName: item.location || item.neighborhood || undefined,
          llmModel: llmResponse.model,
          llmConfidence: item.confidence,
          rawData: {
            llmItem: item,
            model: llmResponse.model,
            timestamp: llmResponse.timestamp,
            sources: item.sources,
            xSignals: (item as any).xSignals || undefined,
          },
          publishedAt: new Date(),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      logger.warn({ err, headline: item.headline }, 'Failed to process LLM news item');
    }
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({
    sourceId,
    platform,
    model: llmResponse.model,
    ingested,
    total: llmResponse.stories.length,
  }, 'LLM poll complete');
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createLLMIngestionWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<LLMPollJob>(
    'llm-ingestion',
    async (job: Job<LLMPollJob>) => {
      await handleLLMPoll(job);
    },
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 4,
        duration: 60000, // Max 4 LLM calls per minute (cost control)
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, platform: job.data.platform }, 'LLM ingestion job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'LLM ingestion job failed');
  });

  return worker;
}
