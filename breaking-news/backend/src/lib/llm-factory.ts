/**
 * LLM Factory v2 — Multi-provider with native function calling + streaming.
 * Tries OpenAI → Grok → Gemini with structured output.
 *
 * Improvements over v1:
 * - Native OpenAI-compatible function calling (tools + tool_choice)
 * - SSE streaming support via generateStream()
 * - Conversation memory helper (summarizeConversation)
 */

export interface LLMResult {
  content: string;
  model: string;
  functionCall?: { name: string; arguments: Record<string, any> };
  toolCalls?: Array<{ name: string; arguments: Record<string, any> }>;
}

export interface LLMOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  functions?: FunctionDef[];
  functionCall?: string | { name: string };
}

export interface FunctionDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// ─── LLM Usage Tracking ─────────────────────────────────────────────────────
// Approximate costs per 1K tokens (as of 2026)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'grok-3-mini': { input: 0.0003, output: 0.0005 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
};

// Buffer LLM usage records and flush periodically
const llmUsageBuffer: Array<{ provider: string; model: string; tokens: number; latencyMs: number; cost: number }> = [];
let llmFlushTimer: ReturnType<typeof setTimeout> | null = null;

function trackLLMUsage(provider: string, model: string, usage: any, latencyMs: number) {
  const inputTokens = usage?.prompt_tokens || usage?.input_tokens || 0;
  const outputTokens = usage?.completion_tokens || usage?.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const costs = TOKEN_COSTS[model] || { input: 0.0002, output: 0.0005 };
  const cost = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;

  llmUsageBuffer.push({ provider, model, tokens: totalTokens, latencyMs, cost });

  if (!llmFlushTimer) {
    llmFlushTimer = setTimeout(flushLLMUsage, 15000);
  }
}

async function flushLLMUsage() {
  llmFlushTimer = null;
  if (llmUsageBuffer.length === 0) return;
  const batch = llmUsageBuffer.splice(0, llmUsageBuffer.length);
  try {
    // Dynamic import to avoid circular deps
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    const values = batch.map(u =>
      `('llm.call', 1, '${JSON.stringify({ provider: u.provider, model: u.model }).replace(/'/g, "''")}'::jsonb, NOW())`
    ).join(',');
    await p.$executeRawUnsafe(`INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${values}`).catch(() => {});

    // Also record cost and tokens
    const costValues = batch.map(u =>
      `('llm.cost_usd', ${u.cost}, '${JSON.stringify({ provider: u.provider, model: u.model }).replace(/'/g, "''")}'::jsonb, NOW())`
    ).join(',');
    await p.$executeRawUnsafe(`INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${costValues}`).catch(() => {});

    const tokenValues = batch.map(u =>
      `('llm.tokens', ${u.tokens}, '${JSON.stringify({ provider: u.provider, model: u.model }).replace(/'/g, "''")}'::jsonb, NOW())`
    ).join(',');
    await p.$executeRawUnsafe(`INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${tokenValues}`).catch(() => {});

    const latencyValues = batch.map(u =>
      `('llm.latency_ms', ${u.latencyMs}, '${JSON.stringify({ provider: u.provider, model: u.model }).replace(/'/g, "''")}'::jsonb, NOW())`
    ).join(',');
    await p.$executeRawUnsafe(`INSERT INTO "MetricsRaw" (metric, value, tags, "createdAt") VALUES ${latencyValues}`).catch(() => {});

    await p.$disconnect();
  } catch {}
}

// ─── Provider helpers ───────────────────────────────────────────────────────

function buildOpenAIBody(messages: any[], options: LLMOptions & { stream?: boolean }): any {
  const { maxTokens = 500, temperature = 0.3, functions, functionCall, stream } = options;
  const body: any = { model: 'gpt-4o-mini', messages, max_tokens: maxTokens, temperature };
  if (stream) body.stream = true;
  if (functions && functions.length > 0) {
    body.tools = functions.map(f => ({
      type: 'function',
      function: { name: f.name, description: f.description, parameters: f.parameters },
    }));
    if (functionCall) {
      body.tool_choice = typeof functionCall === 'string'
        ? functionCall
        : { type: 'function', function: { name: functionCall.name } };
    }
  }
  return body;
}

function parseToolCalls(choice: any): Array<{ name: string; arguments: Record<string, any> }> | undefined {
  const tcs = choice?.message?.tool_calls;
  if (!tcs || tcs.length === 0) return undefined;
  return tcs.map((tc: any) => {
    let args: Record<string, any> = {};
    try { args = JSON.parse(tc.function.arguments); } catch {}
    return { name: tc.function.name, arguments: args };
  });
}

function buildMessages(prompt: string, systemPrompt?: string): any[] {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

// ─── Non-streaming generation ───────────────────────────────────────────────

export async function generateWithFallback(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResult> {
  const { systemPrompt } = options;
  const messages = buildMessages(prompt, systemPrompt);

  // Try OpenAI first (best function calling support)
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    const llmStart = Date.now();
    try {
      const body = buildOpenAIBody(messages, options);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        trackLLMUsage('openai', 'gpt-4o-mini', data.usage, Date.now() - llmStart);
        const choice = data.choices?.[0];
        const toolCalls = parseToolCalls(choice);
        if (toolCalls) {
          return {
            content: choice.message.content || '',
            model: 'gpt-4o-mini',
            functionCall: toolCalls[0],
            toolCalls,
          };
        }
        const content = choice?.message?.content;
        if (content) return { content, model: 'gpt-4o-mini' };
      }
    } catch { /* try next */ }
  }

  // Try Grok/xAI (OpenAI-compatible function calling)
  const xaiKey = process.env['XAI_API_KEY'];
  if (xaiKey) {
    const grokStart = Date.now();
    try {
      const body = buildOpenAIBody(messages, { ...options, maxTokens: options.maxTokens });
      body.model = 'grok-3-mini';
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        trackLLMUsage('xai', 'grok-3-mini', data.usage, Date.now() - grokStart);
        const choice = data.choices?.[0];
        const toolCalls = parseToolCalls(choice);
        if (toolCalls) {
          return { content: '', model: 'grok-3-mini', functionCall: toolCalls[0], toolCalls };
        }
        const content = choice?.message?.content;
        if (content) return { content, model: 'grok-3-mini' };
      }
    } catch { /* try next */ }
  }

  // Try Gemini (no function calling, fallback to text)
  const geminiKey = process.env['GOOGLE_AI_KEY'];
  if (geminiKey) {
    try {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: options.maxTokens || 500, temperature: options.temperature || 0.3 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) return { content, model: 'gemini-2.0-flash' };
      }
    } catch { /* all failed */ }
  }

  throw new Error('All LLM providers unavailable');
}

// ─── Streaming generation (SSE) ─────────────────────────────────────────────

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCall?: (toolCall: { name: string; arguments: Record<string, any> }) => void;
  onDone: (result: LLMResult) => void;
  onError: (error: Error) => void;
}

/**
 * Stream tokens from OpenAI-compatible API. Falls back to non-streaming if streaming unavailable.
 */
export async function generateStream(
  prompt: string,
  options: LLMOptions = {},
  callbacks: StreamCallbacks
): Promise<void> {
  const { systemPrompt } = options;
  const messages = buildMessages(prompt, systemPrompt);
  const openaiKey = process.env['OPENAI_API_KEY'];
  const xaiKey = process.env['XAI_API_KEY'];

  // Pick provider (streaming only works with OpenAI-compatible APIs)
  const apiKey = openaiKey || xaiKey;
  const apiUrl = openaiKey
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.x.ai/v1/chat/completions';
  const model = openaiKey ? 'gpt-4o-mini' : 'grok-3-mini';

  if (!apiKey) {
    // No streaming provider — fall back to non-streaming
    try {
      const result = await generateWithFallback(prompt, options);
      callbacks.onToken(result.content);
      callbacks.onDone(result);
    } catch (err: any) {
      callbacks.onError(err);
    }
    return;
  }

  try {
    // Note: don't use function calling with streaming — handle tools in non-streaming pass
    const body = buildOpenAIBody(messages, { ...options, stream: true });
    // Remove tools from streaming — they don't stream well
    delete body.tools;
    delete body.tool_choice;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream API error: ${res.status}`);
    }

    let fullContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            callbacks.onToken(delta.content);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    callbacks.onDone({ content: fullContent, model });
  } catch (err: any) {
    callbacks.onError(err);
  }
}

// ─── Conversation Memory — rolling summarization ────────────────────────────

/**
 * Summarize a conversation history to compress context.
 * Keeps the summary under ~200 tokens while preserving key facts.
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  if (messages.length === 0) return '';
  if (messages.length <= 4) {
    return messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  }

  const transcript = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

  try {
    const result = await generateWithFallback(
      `Summarize this conversation in 2-3 sentences, preserving key facts, requests, and decisions:\n\n${transcript}`,
      { maxTokens: 150, temperature: 0.2 }
    );
    return result.content;
  } catch {
    // Fallback: just keep last 3 messages
    return messages.slice(-3).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  }
}

// ─── Embedding generation ───────────────────────────────────────────────────

/**
 * Generate an embedding vector using OpenAI text-embedding-3-small (1536 dims).
 * Returns null if no API key or on error.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (!openaiKey) return null;

  try {
    const truncated = text.slice(0, 8000);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: truncated }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}
