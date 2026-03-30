// @ts-nocheck
/**
 * LLM Factory - Multi-provider abstraction layer
 * Supports: OpenAI, Anthropic Claude, xAI Grok, Google Gemini
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('llm-factory');

export interface LLMResponse {
  text: string;
  model: string;
  tokens: number;
  provider: string;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

type Provider = 'openai' | 'anthropic' | 'xai' | 'gemini';

async function callOpenAI(prompt: string, opts: LLMOptions): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: opts.maxTokens || 1000,
      temperature: opts.temperature || 0.7,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return {
    text: data.choices[0]?.message?.content || '',
    model: data.model,
    tokens: data.usage?.total_tokens || 0,
    provider: 'openai',
  };
}

async function callAnthropic(prompt: string, opts: LLMOptions): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1000,
      system: opts.systemPrompt || undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return {
    text: data.content?.[0]?.text || '',
    model: data.model,
    tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    provider: 'anthropic',
  };
}

async function callXAI(prompt: string, opts: LLMOptions): Promise<LLMResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY not set');

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: opts.maxTokens || 1000,
      temperature: opts.temperature || 0.7,
    }),
  });

  if (!res.ok) throw new Error(`xAI API error: ${res.status}`);
  const data = await res.json();
  return {
    text: data.choices[0]?.message?.content || '',
    model: data.model || 'grok-3-mini',
    tokens: data.usage?.total_tokens || 0,
    provider: 'xai',
  };
}

async function callGemini(prompt: string, opts: LLMOptions): Promise<LLMResponse> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_KEY not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens || 1000,
          temperature: opts.temperature || 0.7,
        },
        ...(opts.systemPrompt ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } } : {}),
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    model: 'gemini-2.0-flash',
    tokens: data.usageMetadata?.totalTokenCount || 0,
    provider: 'gemini',
  };
}

const PROVIDERS: Record<Provider, (prompt: string, opts: LLMOptions) => Promise<LLMResponse>> = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  xai: callXAI,
  gemini: callGemini,
};

// Fallback chain: try providers in order
const DEFAULT_CHAIN: Provider[] = ['openai', 'anthropic', 'xai', 'gemini'];

/**
 * Generate text using the LLM factory with automatic fallback.
 */
export async function generate(
  prompt: string,
  opts: LLMOptions = {},
  preferredProvider?: Provider,
): Promise<LLMResponse> {
  const chain = preferredProvider
    ? [preferredProvider, ...DEFAULT_CHAIN.filter((p) => p !== preferredProvider)]
    : DEFAULT_CHAIN;

  for (const provider of chain) {
    try {
      const result = await PROVIDERS[provider](prompt, opts);
      logger.info({ provider, tokens: result.tokens }, 'LLM generation complete');
      return result;
    } catch (err) {
      logger.warn({ provider, err: (err as Error).message }, 'LLM provider failed, trying next');
      continue;
    }
  }

  throw new Error('All LLM providers failed');
}

/**
 * Generate with a specific provider (no fallback).
 */
export async function generateWith(
  provider: Provider,
  prompt: string,
  opts: LLMOptions = {},
): Promise<LLMResponse> {
  return PROVIDERS[provider](prompt, opts);
}
