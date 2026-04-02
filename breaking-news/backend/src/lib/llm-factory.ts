/**
 * LLM Factory with OpenAI Function Calling support.
 * Tries OpenAI → Grok → Gemini with structured output.
 */

export interface LLMResult {
  content: string;
  model: string;
  functionCall?: { name: string; arguments: Record<string, any> };
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

export async function generateWithFallback(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResult> {
  const { systemPrompt, maxTokens = 500, temperature = 0.3, functions, functionCall } = options;

  // Try OpenAI first (best function calling support)
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const body: any = {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature,
      };

      // Add function calling if provided
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

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const choice = data.choices?.[0];

        // Check for function call response
        if (choice?.message?.tool_calls?.[0]) {
          const tc = choice.message.tool_calls[0];
          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          return {
            content: choice.message.content || '',
            model: 'gpt-4o-mini',
            functionCall: { name: tc.function.name, arguments: args },
          };
        }

        const content = choice?.message?.content;
        if (content) return { content, model: 'gpt-4o-mini' };
      }
    } catch { /* try next */ }
  }

  // Try Grok/xAI (supports OpenAI-compatible function calling)
  const xaiKey = process.env['XAI_API_KEY'];
  if (xaiKey) {
    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const body: any = { model: 'grok-3-mini', messages, max_tokens: maxTokens, temperature };

      if (functions && functions.length > 0) {
        body.tools = functions.map(f => ({
          type: 'function',
          function: { name: f.name, description: f.description, parameters: f.parameters },
        }));
      }

      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const choice = data.choices?.[0];
        if (choice?.message?.tool_calls?.[0]) {
          const tc = choice.message.tool_calls[0];
          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          return { content: '', model: 'grok-3-mini', functionCall: { name: tc.function.name, arguments: args } };
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
            generationConfig: { maxOutputTokens: maxTokens, temperature },
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
