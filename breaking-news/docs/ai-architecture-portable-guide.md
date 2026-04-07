# TopicPulse AI Architecture v2 — Portable Implementation Guide

*Last updated: 2026-04-07*

## Overview

The AI system has 8 components that work together:

1. **LLM Factory** — Multi-provider abstraction with function calling + streaming
2. **NLP Search** — Natural language → structured database filters
3. **AI Chatbot** — Native function calling, multi-turn tool planning, SSE streaming
4. **MCP Server** — External AI tool interface (Model Context Protocol)
5. **External Tool API** — REST endpoint for any LLM to invoke tools directly
6. **RAG Knowledge Base** — Hybrid vector retrieval (query-relevant chunks, not all docs)
7. **Tool Permission System** — Role-based access control for every tool
8. **Tool Analytics** — Usage logging, caching, performance tracking

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

## v2 Improvements (All Implemented)

All 10 improvements from the original recommendation are now live:

### 1. SSE Streaming (`POST /assistant/chat` with `stream: true`)
- Token-by-token output via Server-Sent Events
- Response format: `data: {"type":"token","content":"..."}\n\n`
- Falls back to non-streaming if no OpenAI/Grok key available

### 2. Native Function Calling
- `TOOL_FUNCTIONS` array with full JSON Schema `parameters`
- LLM uses OpenAI `tools` + `tool_choice` protocol (not text-based `\`\`\`tool` blocks)
- Backward compatible: still parses text blocks for Gemini fallback

### 3. Conversation Memory with Summarization
- Messages > 6: older messages get summarized by LLM into ~150 tokens
- Recent 4 messages kept verbatim
- Fallback: just keep last 6 if summarization fails

### 4. Tool Result Caching
- In-memory cache with 60-second TTL
- Only caches read-only tools (search, list, get, status)
- Write tools always execute fresh

### 5. Parallel Tool Execution
- `Promise.all()` for all tool calls in a round
- Independent tools run concurrently instead of sequentially

### 6. Structured Tool Definitions (Zod-compatible schemas)
- `TOOL_FUNCTIONS` array has full JSON Schema parameters with types, enums, required fields
- `requiredRole` field on each tool for permission checking

### 7. Embeddings at Ingestion Time
- Enrichment worker generates `text-embedding-3-small` vectors for every source post
- Stored in `SourcePost.embeddingJson` immediately after enrichment
- Semantic search at query time is instant (no embedding API call needed)

### 8. Hybrid RAG with Query-Relevant Retrieval
- Scores knowledge chunks by keyword overlap with user query
- Takes top 2 most relevant chunks instead of all 4
- Falls back to compact knowledge (~200 tokens) if no relevant chunks

### 9. Tool Usage Analytics
- Every tool invocation logged: tool name, args, userId, duration, success/error, cached
- `GET /assistant/tools/analytics` — aggregated stats for admins
- Buffer + periodic flush to `ToolAnalytics` table

### 10. Multi-Turn Tool Planning (up to 3 rounds)
- LLM can call tools, see results, then call MORE tools before summarizing
- Max 3 rounds prevents infinite loops
- Each round's results inform the next round's prompt

### 11. External Tool API (`POST /assistant/tools/invoke`)
- Any external LLM can call TopicPulse tools via REST
- Auth via Bearer token or x-api-key
- Same caching, analytics, and permission checks as chatbot
- `GET /assistant/tools` — list available tools for current user

### 12. Role-Based Tool Permissions
- Each tool has `requiredRole`: VIEWER, EDITOR, ADMIN, or OWNER
- Role hierarchy: VIEWER < EDITOR < ADMIN < OWNER
- `GET /assistant/tools/permissions` — see what's available
- `POST /assistant/tools/permissions` — owner can change permissions at runtime
- Persisted to `SystemKnowledge` table across restarts

---

## New API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/assistant/chat` | JWT | Chat with native function calling (add `stream: true` for SSE) |
| POST | `/assistant/tools/invoke` | JWT/API Key | External tool invocation (for any LLM) |
| GET | `/assistant/tools` | JWT/API Key | List tools available for current role |
| GET | `/assistant/tools/analytics` | ADMIN+ | Tool usage stats (7-day aggregation) |
| GET | `/assistant/tools/permissions` | JWT | See all tool permissions |
| POST | `/assistant/tools/permissions` | OWNER | Change a tool's required role |

---

## Porting Checklist (Updated for v2)

1. Copy `llm-factory.ts` — set your API keys
2. Create your domain's knowledge base files (start with 1, expand to 4)
3. Define your NLP filter function schema with your domain's enums
4. Build the stories route with the 3-tier NLP parsing pattern
5. Define `TOOL_FUNCTIONS` with JSON Schema parameters + `requiredRole`
6. Implement `executeTool` switch for your domain
7. Build the chat route with multi-turn loop + parallel execution
8. Add `POST /tools/invoke` for external LLM access
9. Create the MCP server with Zod-validated tools (mirrors the REST tools)
10. Build the frontend: search bar with NLP detection + chat drawer + SSE support
11. Add role-based permissions admin panel
12. Set up tool analytics table and flush logic
