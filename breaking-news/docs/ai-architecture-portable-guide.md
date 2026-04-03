# TopicPulse AI Architecture — Portable Implementation Guide

## Overview

The AI system has 5 components that work together:

1. **LLM Factory** — Multi-provider abstraction with function calling
2. **NLP Search** — Natural language → structured database filters
3. **AI Chatbot** — Tool-calling assistant with RAG knowledge injection
4. **MCP Server** — External AI tool interface (Model Context Protocol)
5. **RAG Knowledge Base** — 4 static docs injected into every AI prompt

---

## 1. LLM Factory (`backend/src/lib/llm-factory.ts`)

**Pattern: Cascading fallback with a unified interface.**

The factory exposes one function: `generateWithFallback(prompt, options)`. It tries providers in priority order (OpenAI → Grok → Gemini) and returns a unified `LLMResult`:

```typescript
interface LLMResult {
  content: string;          // Text response
  model: string;            // Which model responded
  functionCall?: {          // Structured output (if function calling was used)
    name: string;
    arguments: Record<string, any>;
  };
}

interface LLMOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  functions?: FunctionDef[];      // OpenAI-style function definitions
  functionCall?: string | { name: string };  // Force a specific function
}
```

**How it works:**
- All 3 providers use raw `fetch()` — no SDK dependencies
- OpenAI and Grok both support OpenAI-compatible function calling (`tools` + `tool_choice`)
- Gemini falls back to plain text (no function calling support)
- Each call has a 15-second timeout via `AbortSignal.timeout(15000)`
- If a provider errors or returns empty, it silently falls to the next
- If all fail, throws `'All LLM providers unavailable'`

**To port:** Copy this file as-is. Replace API keys with your env vars. Add/remove providers as needed. The key insight is: every AI feature in the system calls `generateWithFallback()` — nothing calls OpenAI/Grok/Gemini directly.

---

## 2. NLP Search (`backend/src/routes/stories.ts`, lines 57-210)

**Pattern: LLM function calling to parse natural language into structured filters, with a keyword fallback.**

The `GET /api/v1/stories?nlp=...` parameter triggers NLP parsing. The flow has 3 tiers:

### Tier 1: LLM Function Calling (preferred)

```typescript
// Define a function schema that constrains the LLM's output
const filterFunction = {
  name: 'apply_story_filters',
  description: 'Parse a natural language query into structured story filters',
  parameters: {
    type: 'object',
    properties: {
      textSearch: { type: 'string', description: 'Keywords to search...' },
      category: { type: 'string', enum: ['CRIME','POLITICS','WEATHER',...] },
      status: { type: 'string', enum: ['BREAKING','DEVELOPING',...] },
      market: { type: 'string', description: 'City/market name' },
      minScore: { type: 'number', description: 'Min score 0-1. 0.3=notable, 0.5=important, 0.7=top' },
      maxAge: { type: 'number', description: 'Max age in hours. 1=1hr, 24=today, 168=week' },
      sort: { type: 'string', enum: ['compositeScore','breakingScore','trendingScore','firstSeenAt'] },
      trend: { type: 'string', enum: ['rising', 'declining'] },
    },
  },
};

const nlpResult = await generateWithFallback(
  `Parse this newsroom search query: "${nlpQuery}"`,
  {
    systemPrompt: getCompactKnowledge(), // RAG context injected here
    maxTokens: 200,
    temperature: 0.1,
    functions: [filterFunction],
    functionCall: { name: 'apply_story_filters' }, // Force this function
  }
);

// Result comes back as structured JSON — guaranteed valid
const parsed = nlpResult.functionCall?.arguments;
if (parsed.category) category = parsed.category;
if (parsed.maxAge) maxAge = parsed.maxAge;
// ... apply all filters to the Prisma query
```

**Why function calling?** It guarantees structured output with constrained enum values. The LLM can't hallucinate invalid categories or sort fields — they're defined in the JSON Schema.

### Tier 2: JSON Extraction Fallback

If function calling fails (e.g., Gemini which doesn't support it), extract JSON from the text response:

```typescript
const jsonMatch = nlpResult.content.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  const p = JSON.parse(jsonMatch[0]);
  // Apply same filter logic...
}
```

### Tier 3: Keyword Heuristic Fallback

If no LLM is available at all, use regex/keyword matching:

```typescript
const categoryMap = { 'crime': 'CRIME', 'sports': 'SPORTS', ... };
for (const [word, cat] of Object.entries(categoryMap)) {
  if (lower.includes(word)) { category = cat; break; }
}
if (lower.includes('breaking')) status = 'BREAKING';
if (lower.match(/(\d+)\s*hour/)) maxAge = parseInt(match[1]);
```

### Frontend Integration

The `FilterBar` component detects NLP queries vs text search:

```typescript
function isNlpQuery(input: string): boolean {
  if (input.length < 8 || words.length < 3) return false;
  return /\b(show|find|breaking|trending|about|from|in|last|hour|today)\b/i.test(input);
}
```

If NLP is detected, it sends `nlp=...` instead of `q=...`. The UI shows an "AI" badge.

**To port:** Define your domain's filter function schema (your categories, statuses, sort fields). The 3-tier fallback pattern works for any domain.

---

## 3. AI Chatbot (`backend/src/routes/assistant.ts`)

**Pattern: Text-based tool calling with a two-pass LLM flow.**

### Tool Definitions

Tools are defined as a simple array of `{name, description, params}`:

```typescript
const TOOLS = [
  { name: 'search_stories', description: 'Search for stories...', params: 'query?, category?, status?' },
  { name: 'get_breaking_stories', description: 'Get current breaking...', params: 'limit?' },
  { name: 'heal_source', description: 'Force self-heal on a source', params: 'sourceId' },
  // ... 38 total tools
];
```

### Tool Execution

A big `switch` statement maps tool names to Prisma queries / API calls:

```typescript
async function executeTool(toolName: string, args: Record<string, any>, accountUser: any) {
  switch (toolName) {
    case 'search_stories': {
      const stories = await prisma.story.findMany({ where: {...}, take: args.limit });
      return { stories, count: stories.length };
    }
    case 'heal_source': {
      // Calls the pipeline API
      const res = await fetch(`${BACKEND_URL}/api/v1/pipeline/heal-source/${args.sourceId}`, ...);
      return await res.json();
    }
    // ... 38 cases
  }
}
```

### System Prompt Construction

The system prompt is assembled from 4 layers:

```
1. Base persona: "You are TopicPulse AI Assistant..."
2. Custom instructions: topicpulse.md content (admin-editable)
3. RAG knowledge base: 4 knowledge documents concatenated
4. Tool list: formatted as "- tool_name(params): description"
5. User context: current page, active story, active filters
6. Role-based permissions: VIEWER vs ADMIN capabilities
```

### Two-Pass Flow

```
User message
    ↓
Pass 1: LLM generates response (may include ```tool blocks)
    ↓
Parse tool calls from: ```tool\n{"tool":"search_stories","args":{...}}\n```
    ↓
Execute each tool → collect results
    ↓
Pass 2: LLM summarizes tool results into natural language
    ↓
Return { message, toolResults, navigation, model }
```

**Key design choice:** Tools are invoked via **text-based tool blocks** (` ```tool {...} ``` `), not via OpenAI's native function calling. This works across all LLM providers including those without function calling support.

### Heuristic Fallback

If no LLM is available, keyword matching handles common requests:

```typescript
if (lower.includes('breaking')) {
  return executeTool('get_breaking_stories', { limit: 5 }, au);
}
if (lower.includes('pipeline') || lower.includes('queue')) {
  return executeTool('get_pipeline_status', {}, au);
}
```

**To port:**
1. Define your tools array
2. Implement `executeTool` switch with your domain logic
3. Build the system prompt with your knowledge base
4. Use the two-pass pattern (generate → parse tools → execute → summarize)

---

## 4. MCP Server (`mcp-server/src/index.ts`)

**Pattern: Model Context Protocol server exposing the same capabilities as the chatbot, but for external AI clients.**

Uses `@modelcontextprotocol/sdk` with `StdioServerTransport`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "breaking-news", version: "2.0.0" });

// Each tool uses Zod for parameter validation
server.tool(
  "query_stories",
  "Search and filter stories",
  {
    query: z.string().optional().describe("Text search"),
    status: z.enum(["BREAKING", "DEVELOPING", ...]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async ({ query, status, limit }) => {
    const stories = await prisma.story.findMany({ where: {...} });
    return {
      content: [{ type: "text", text: JSON.stringify(stories, null, 2) }],
      isError: false,
    };
  }
);
```

**Two access patterns:**
- **Direct DB** — Read-only tools query Prisma directly (faster)
- **Backend proxy** — Write tools call the backend REST API via `backendFetch()` helper

```typescript
async function backendFetch(path: string, options = {}) {
  const url = `${BACKEND_URL}/api/v1${path}`;
  const response = await fetch(url, { method: options.method || "GET", ... });
  return { ok: response.ok, status: response.status, data: await response.json() };
}
```

**To port:** Install `@modelcontextprotocol/sdk`. Define tools with Zod schemas. Each tool either queries your DB directly or proxies to your API.

---

## 5. RAG Knowledge Base

**Pattern: 4 static TypeScript files that generate knowledge strings, injected into every AI prompt.**

| File | Purpose | When to Update |
|------|---------|----------------|
| `knowledge-base.ts` | Schema reference, API endpoints, Prisma fields | Schema/API changes |
| `knowledge-chatbot-ops.ts` | How to use chatbot tools, interpret scores | New tools or scoring changes |
| `knowledge-backend-services.ts` | Workers, queues, pipeline architecture | New workers or poll changes |
| `knowledge-user-help.ts` | End-user documentation, how-tos | UI feature changes |

Each file exports a function that returns a string:

```typescript
export function generateSystemKnowledge(): string {
  return `
# TopicPulse Platform Reference

## Story Statuses
- ALERT: Imminent danger or emergency...
- BREAKING: Just happened, high news value...

## Score Components
- breakingScore (25%): Source velocity within 2 hours...
- trendingScore (20%): Growth rate of source count...

## API Endpoints
- GET /api/v1/stories — List stories with filters
- POST /api/v1/pipeline/heal-source/:id — Self-heal a source
...
  `;
}
```

These are injected into prompts in two ways:
- **NLP Search:** `getCompactKnowledge()` — a shorter version for fast parsing
- **Chatbot:** All 4 docs concatenated into the system prompt

The knowledge is also stored in the database (`SystemKnowledge` table) for the admin UI to display/edit. The "Auto-Generate Schema Docs" button regenerates from these source files.

**To port:** Create knowledge files for your domain. Export them as functions returning strings. Inject into your system prompts. Update them whenever your schema, API, or features change.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────────┐│
│  │FilterBar │  │AIAssistant│  │  ViewSelector/Grid    ││
│  │(NLP det) │  │(Chat UI)  │  │  (results display)    ││
│  └────┬─────┘  └─────┬─────┘  └───────────────────────┘│
│       │               │                                  │
│  nlp=query       POST /chat                              │
│       │          {message,                               │
│       │           history,                               │
│       │           context}                               │
└───────┼───────────────┼─────────────────────────────────┘
        │               │
┌───────┼───────────────┼─────────────────────────────────┐
│       │     BACKEND   │                                  │
│  ┌────▼─────┐  ┌──────▼──────┐  ┌──────────────────────┐│
│  │stories.ts│  │assistant.ts │  │ user-settings.ts     ││
│  │NLP parse │  │ 2-pass flow │  │ (views persistence)  ││
│  └────┬─────┘  └──────┬──────┘  └──────────────────────┘│
│       │               │                                  │
│  ┌────▼───────────────▼──────┐  ┌──────────────────────┐│
│  │    llm-factory.ts         │  │ RAG Knowledge Base   ││
│  │ OpenAI → Grok → Gemini   │  │ 4 files → prompts    ││
│  │ function calling support  │◄─┤ knowledge-base.ts    ││
│  └───────────────────────────┘  │ knowledge-chatbot.ts ││
│                                  │ knowledge-backend.ts ││
│                                  │ knowledge-user.ts    ││
│                                  └──────────────────────┘│
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    MCP SERVER                            │
│  ┌────────────────────┐  ┌─────────────────────────────┐│
│  │ @mcp/sdk           │  │ Tools: query_stories,       ││
│  │ StdioTransport     │  │ get_source, create_source,  ││
│  │ Zod validation     │  │ heal_source, etc. (22+)     ││
│  └────────┬───────────┘  └──────────┬──────────────────┘│
│           │                          │                    │
│           ▼                          ▼                    │
│     Direct Prisma DB          Backend REST proxy          │
└──────────────────────────────────────────────────────────┘
```

---

## Key Decisions & Why

| Decision | Why |
|----------|-----|
| Text-based tool blocks instead of native function calling | Works with any LLM provider, not just OpenAI |
| Function calling for NLP search only | Search needs guaranteed structured output; chat is more flexible |
| 3-tier fallback (LLM → JSON extraction → keyword) | Graceful degradation when LLMs are unavailable |
| RAG as static code files, not vector DB | Simple, version-controlled, always in sync with code |
| MCP uses both direct DB and API proxy | Reads are faster direct; writes go through API for validation |
| Per-tool Prisma queries, not a generic query builder | Each tool can optimize its query, select only needed fields |

---

## Improvements to Consider for Next Implementation

1. **Streaming responses** — Use SSE or WebSocket for the chatbot to stream LLM output token-by-token instead of waiting for the full response. Reduces perceived latency from 2-3s to <500ms first token.

2. **Native function calling everywhere** — The chatbot uses text-based tool blocks for cross-provider compatibility. If you standardize on OpenAI-compatible providers, switch to native `tools` + `tool_choice` for more reliable tool invocation.

3. **Conversation memory with summarization** — Currently keeps last 10 messages as raw text. Better: use a rolling summary of older messages + last 5 raw messages. Saves tokens while preserving context.

4. **Tool result caching** — Identical tool calls within the same session (e.g., `get_pipeline_status`) should cache for 30-60 seconds to avoid redundant DB queries.

5. **Parallel tool execution** — Currently tools execute sequentially in a for-loop. Independent tools (e.g., `get_stats` + `search_stories`) should run in parallel with `Promise.all()`.

6. **Structured tool output schemas** — Define Zod schemas for tool *outputs* too, not just inputs. This lets you validate and type-check what tools return before passing to the LLM summarizer.

7. **Embeddings at ingestion time** — Generate and store embeddings when stories are created (in the enrichment worker), not at search time. This makes semantic search instant instead of requiring a real-time OpenAI call per query.

8. **Hybrid RAG with vector retrieval** — Instead of injecting all 4 knowledge docs into every prompt, embed the knowledge chunks and retrieve only the relevant ones based on the user's query. Reduces prompt size from ~5K tokens to ~1K.

9. **Tool usage analytics** — Log which tools are called, how often, and what errors occur. This reveals which tools need improvement and which are never used.

10. **Multi-turn tool planning** — Allow the LLM to call tools, see results, then decide to call more tools before summarizing. Currently limited to a single round of tool calls.

---

## Porting Checklist

1. Copy `llm-factory.ts` — set your API keys
2. Create your domain's knowledge base files (start with 1, expand to 4)
3. Define your NLP filter function schema with your domain's enums
4. Build the stories route with the 3-tier NLP parsing pattern
5. Define your chatbot TOOLS array and implement `executeTool`
6. Build the chat route with the 2-pass flow
7. Create the MCP server with Zod-validated tools
8. Build the frontend: search bar with NLP detection + chat drawer
9. Wire the frontend to pass `nlp=...` for search and `POST /chat` for conversations
