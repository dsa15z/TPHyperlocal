/**
 * Simple LLM factory for the backend API.
 * Tries OpenAI → Grok → Gemini in order.
 */

interface LLMResult {
  content: string;
  model: string;
}

interface LLMOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function generateWithFallback(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResult> {
  const { systemPrompt, maxTokens = 500, temperature = 0.3 } = options;

  // Try OpenAI first
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, temperature }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return { content, model: 'gpt-4o-mini' };
      }
    } catch { /* try next */ }
  }

  // Try Grok/xAI
  const xaiKey = process.env['XAI_API_KEY'];
  if (xaiKey) {
    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-3-mini', messages, max_tokens: maxTokens, temperature }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return { content, model: 'grok-3-mini' };
      }
    } catch { /* try next */ }
  }

  // Try Gemini
  const geminiKey = process.env['GOOGLE_AI_KEY'];
  if (geminiKey) {
    try {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } }),
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
