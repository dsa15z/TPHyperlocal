# TopicPulse — Broadcast Newsroom Intelligence Platform

## Engineering Principles

1. **Signal over noise** — Every feature must increase the signal-to-noise ratio of breaking local news. If it doesn't help a newsroom editor catch a story faster, it doesn't ship.
2. **Honest architecture** — Never fake unavailable platform access. Never assume APIs that don't exist. If a data source isn't viable, say so and design the fallback.
3. **Simple first, smart later** — Jaccard similarity before embeddings. Keyword extraction before NER models. Heuristic scoring before ML. Ship v1, then upgrade.
4. **Data pipeline integrity** — Ingestion → Enrichment → Clustering → Scoring is a strict pipeline. Each stage must be idempotent and independently retryable.
5. **Composability** — Every component (API, MCP, RSS, workers) must function independently. Failure in one must not cascade.
6. **API-first, always** — Every capability must be exposed as both an internal service API and an external RESTful API. No feature exists only in the UI.

## Quality Standards (MANDATORY)

You are not allowed to optimize for speed or minimal effort.

Before declaring any task complete:
1. Re-read all modified files
2. Run type checks, linting, and tests (if available)
3. Fix every error

For any non-trivial change:
- Work in phases (max 3–5 files at a time)
- Verify each phase before continuing

When editing code:
- Always re-read the file before modifying it
- Never rely on memory from earlier in the conversation

Do not apply superficial fixes.
If something is structurally wrong, fix it properly.

When refactoring or renaming:
- Search for all usages including types, strings, dynamic imports, and tests
- Assume search is incomplete and double-check

If results or context seem incomplete, say so explicitly instead of guessing.

### RAG Knowledge Base Maintenance (MANDATORY — EVERY COMMIT)
The RAG knowledge base is injected into ALL AI prompts (NLP search, chatbot, content generation).
Stale RAG docs cause the AI to give wrong answers — treat this as a **build-breaking issue**.

The knowledge base consists of four documents:
- `backend/src/lib/knowledge-base.ts` — Schema & platform reference, API endpoints, Prisma field names
- `backend/src/lib/knowledge-chatbot-ops.ts` — Chatbot operations guide (how to use tools, interpret scores, handle questions)
- `backend/src/lib/knowledge-backend-services.ts` — Backend services architecture (workers, queues, pipeline, polling)
- `backend/src/lib/knowledge-user-help.ts` — End-user help guide (how-to, troubleshooting, UI documentation)

**When to update (check on EVERY commit):**
1. Prisma schema changes → update `knowledge-base.ts` (schema fields section)
2. API endpoint added/modified → update `knowledge-base.ts` (API endpoints section)
3. Scoring logic changes → update `knowledge-base.ts` + `knowledge-chatbot-ops.ts`
4. New worker or queue added → update `knowledge-backend-services.ts`
5. Poll interval changes → update `knowledge-backend-services.ts`
6. UI feature added/changed → update `knowledge-user-help.ts`
7. New chatbot tool added → update `knowledge-chatbot-ops.ts`
8. New admin page or setting → update `knowledge-user-help.ts`

**After updating any knowledge file**, remind the user to go to AI & Content → Knowledge Base → click "Auto-Generate Schema Docs" to re-populate the database.

### Chatbot Tools & MCP Server Maintenance (MANDATORY — EVERY COMMIT)
The AI chatbot (assistant.ts) and MCP server (mcp-server/src/index.ts) must stay in sync with ALL backend capabilities.

**When to update (check on EVERY commit):**
1. New API endpoint added → add corresponding chatbot tool in `backend/src/routes/assistant.ts` (TOOLS array + executeTool switch)
2. New API endpoint added → add corresponding MCP tool in `mcp-server/src/index.ts`
3. New pipeline operation added → add chatbot tool + update `knowledge-chatbot-ops.ts` tool list
4. New workflow/publishing feature → add chatbot tool + MCP tool
5. Endpoint signature changed → update tool params in TOOLS array + MCP schema

**Current tool count targets:**
- Chatbot (assistant.ts): 35+ tools covering stories, sources, markets, pipeline, workflow, publishing, audio, verification, analysis
- MCP server (index.ts): 20+ tools covering read + write operations

**Never let the chatbot or MCP fall behind the API.** If you add a route, add the tool.

### Data Operations (MANDATORY — RUN AUTOMATICALLY)
Never expect the user to run data operations, migrations, or consolidation scripts manually.
When you create an endpoint that fixes/migrates/consolidates data, **trigger it yourself** immediately after deploying.

Standard operations to run after relevant changes:
1. `POST /pipeline/fix-source-markets` — after Prisma schema changes (creates missing tables + links sources to markets)
2. `POST /pipeline/heal-sources` — after self-healing code changes (tests + reactivates failing sources)
3. `POST /pipeline/consolidate-news-sources` — after adding multi-market source support
4. `POST /pipeline/backfill-famous` — after famous person detection changes (scans existing stories)
5. `POST /pipeline/run-queue` with `{"queue":"scoring"}` — after scoring logic changes (re-scores stories)

Wait for Railway deploy to complete before triggering. Check deploy status via Railway API.
If an endpoint returns 404, the deploy hasn't finished — retry after 60 seconds.

## Architecture Rules

### Monorepo Structure
```
breaking-news/
├── frontend/    → Next.js 14, deployed to Vercel
├── backend/     → Fastify REST API, deployed to Railway
├── worker/      → BullMQ job processors, deployed to Railway
├── mcp-server/  → MCP tools for AI assistants, deployed to Railway
└── shared/      → Types, constants, DTOs (consumed by all)
```

### Source of Truth
- **PostgreSQL** is the single source of truth for all story, source, and score data
- **Redis** is ephemeral: queues, cache, rate limiting only. Never authoritative.
- **Prisma** is the only database access layer. No raw SQL unless Prisma cannot express the query.
- **Source model has NO `accountId` field** — use the `AccountSource` join table to link sources to accounts.

### Data Flow (strict order)
```
Sources → Ingestion Worker → SourcePost table
  → Enrichment Worker (category, entities, location)
  → Clustering Worker (dedup, merge into Story)
  → Scoring Worker (5 scores + status transition)
  → REST API / MCP Server / RSS feeds serve the results
```

### Story Ownership Model (Copy-on-Write)

Stories follow a **shared base + private derivative** model:

1. **Base Story** — shared, read-only. Ingested from sources, enriched, clustered, scored. All accounts see the same base data. No account owns it.

2. **Account Story (Derivative)** — created automatically when any user takes an action on a base story (edit, assign reporter, add notes, generate AI draft, create video, mark as covered, etc.). This is a **fork** that belongs to that account.

3. **Live upstream sync** — The derivative stays linked to the base story and receives ongoing updates: new source posts added, score changes, status transitions, summary refreshes. But the account's custom work (edits, AI content, videos, assignments, notes) is private to them.

4. **Access control** — Users only see base stories that match their account's paid markets. National stories are visible to all. An account's derivatives are only visible to that account's users.

**Implementation**: `AccountStory` join table with:
- `accountId` + `baseStoryId` (unique) — links to the shared Story
- Account-specific fields: `editedTitle`, `editedSummary`, `assignedTo`, `notes`, `aiDrafts`, `videos`, `status` (account's editorial status, independent of base story status)
- `lastSyncedAt` — tracks when base story updates were last pulled in
- Created lazily on first user action, not on story ingestion

### Fastify Route Registration
Static routes (e.g. `/markets/seed`, `/markets/autofill`) MUST be registered BEFORE parametric routes (e.g. `/markets/:id`). Fastify matches routes in registration order — a parametric route registered first will capture literal path segments as parameters, causing 404s on the static route.

### Deployment Targets
| Service | Platform | Branch | Notes |
|---------|----------|--------|-------|
| Frontend | Vercel (prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i) | `main` | Auto-deploy on push to main |
| Backend API | Railway (d361f9bc-3960-42f0-8936-981891df4193) | `main` | Persistent process |
| Worker | Railway (same project) | `main` | Long-running BullMQ |
| MCP Server | Railway (same project) | `main` | Stdio transport |
| PostgreSQL | Railway (managed) | — | Backed up |
| Redis | Railway (managed) | — | Ephemeral |

### Git Workflow
- **Always work directly on `main`.** Do not create feature branches.
- Commit and push to `main` so Vercel and Railway deploy immediately.
- Both Vercel and Railway are configured to deploy from `main` only.
- Never force push. Never amend commits. Create new commits.

## Code Standards

### Shared Components & Consistency
- **When changing a shared component, update ALL pages that use it.** Do not branch code or make a one-off change for a single page. If a shared component (e.g. `TablePagination`, `MultiSelectDropdown`, `ColumnCustomizer`, `StatusBadge`, `FilterBar`) is modified, assume the change applies everywhere that component is used unless explicitly told otherwise.
- All tables/lists must use the shared `TablePagination` footer, `ColumnCustomizer` for column visibility/reorder, and `useTableColumns` hook for localStorage persistence.
- All filter dropdowns must use `MultiSelectDropdown` (with `searchable` for long lists) or `SingleSelectDropdown`. No raw `<select>` elements or button-group toggles for filters.
- **All edit/create forms must use the `Modal` component** — no inline editing. Forms open in a centered overlay dialog with backdrop blur, escape-to-close, and click-outside-to-close. Use `<Modal isOpen={} onClose={} title="">` wrapper.
- UI patterns established in one page must be replicated across all similar pages. Consistency is mandatory.

### State Management
- Frontend: React Query with 30s auto-refresh. No client-side state for server data.
- Backend: Stateless request handlers. All state in PostgreSQL or Redis.
- Workers: Job data is the only input. No shared mutable state between jobs.

### Error Handling
- Workers: Let BullMQ retry (3 attempts, exponential backoff). Log structured errors via Pino.
- API: Return proper HTTP status codes. Validate with Zod schemas. Never expose internal errors.
- Ingestion: Skip bad items, continue processing. Never let one bad RSS item kill the whole poll.

### API Design
- All endpoints under `/api/v1/`
- Auth via `x-api-key` header (public endpoints: health, RSS feeds)
- Pagination: `limit` (max 100) + `offset`
- Sorting: `sort` + `order` params
- Rate limiting: 100 req/min per API key

### Prisma / Database
- Always check `schema.prisma` for field names before writing queries — never assume field names.
- The `Source` model has NO `accountId` — use the `AccountSource` join table.
- The `Platform` enum values are: FACEBOOK, TWITTER, RSS, NEWSAPI, NEWSCATCHER, PERIGON, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL. Never use values outside this list.
- Queue instances must always be closed after use: `await queue.close()`.

### Queue Patterns
- Queue names: `ingestion`, `enrichment`, `clustering`, `scoring`, `llm-ingestion`, `hyperlocal-intel`
- Each job must be idempotent — safe to retry
- Dedup guard: `platformPostId` unique index prevents double-ingestion
- `StorySource` unique constraint prevents double-linking

## Anti-Patterns (NEVER DO THESE)

1. **Never scrape** Facebook, Instagram, Nextdoor, or any platform. Use approved APIs only.
2. **Never assume Nextdoor API access** — it doesn't exist for third parties.
3. **Never store full article text** from copyrighted sources — store summaries and link to originals.
4. **Never bypass dedup** — always check `platformPostId` before creating SourcePost.
5. **Never run clustering concurrently** — story merges must be serial to prevent race conditions.
6. **Never hardcode API keys** — all secrets via environment variables.
7. **Never create Queue instances without closing them** — always `await queue.close()` after adding jobs.
8. **Never amend commits** — create new commits. Never force push.
9. **Never add complex ML before simple heuristics work** — Jaccard + keywords gets 70% accuracy. Ship that first.
10. **Never trust engagement metrics as primary signals** — they can be gamed. Use source diversity and velocity instead.
11. **Never pass `accountId` to `Source` model queries** — Source has no accountId field. Use AccountSource join table.
12. **Never register Fastify parametric routes before static routes** — `/markets/:id` before `/markets/seed` causes 404.

## Execution Process

When implementing any feature:
1. **Read first** — Re-read the actual file before modifying. Check Prisma schema, shared types, and existing patterns. Never rely on memory.
2. **Plan** — For multi-step work, break into phases (max 3-5 files). Validate approach against architecture rules above.
3. **Implement** — Match existing patterns. Use shared types from `shared/src/types.ts` and constants from `shared/src/constants.ts`.
4. **Verify each phase** — Run `npm run build` in the affected service. Check for TypeScript errors. Fix every error before moving on.
5. **Re-read modified files** — Before declaring done, re-read all files you changed. Confirm the edits are correct.
6. **Test the pipeline** — If touching ingestion/enrichment/clustering/scoring, trace the full data flow mentally or with test data.

## Commands

```bash
# Local development (from breaking-news/)
docker-compose up -d postgres redis
cd backend && npm install && npx prisma migrate dev && npx tsx src/seed.ts
cd backend && npm run dev          # API on :3001
cd worker && npm run dev           # Workers
cd frontend && npm run dev         # UI on :3000

# Build checks (run from breaking-news/frontend or breaking-news/backend)
cd backend && npm run build        # TypeScript compile
cd frontend && npm run build       # Next.js build
cd worker && npm run build         # Worker compile

# Database
cd backend && npx prisma studio    # Visual DB browser
cd backend && npx prisma migrate dev --name <name>  # New migration
```

## Platform Access (for Claude agents)

### Vercel API
- **Project ID**: `prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i`
- **Project Name**: `tp-hyperlocal`
- **API Base**: `https://api.vercel.com`
- Token via `VERCEL_TOKEN` env var (never commit)

### Railway API
- **Project ID**: `d361f9bc-3960-42f0-8936-981891df4193`
- **API Base**: `https://backboard.railway.com/graphql/v2` (GraphQL)
- Token via `RAILWAY_TOKEN` env var (never commit)

### HyperLocal Intel API
- **Base URL**: `https://futurilabs.com/hyperlocalhyperrecent`
- **No auth required** — keys managed server-side
- Endpoints: `POST /api/lookup`, `GET /api/stream/{id}`, `POST /api/batch`, `GET /api/batch/{id}`
- Webhook: `POST` with `X-HyperLocal-Event: batch.completed` header

## Definition of Done

A feature is done when:
1. All modified files have been re-read and verified
2. TypeScript compiles with zero errors in all affected services
3. Prisma field names are correct (verified against schema.prisma)
4. New API endpoints have Zod validation on all inputs
5. New workers follow the idempotent job pattern with proper error handling
6. Queue instances are properly closed after use
7. No secrets are hardcoded or committed
8. The data pipeline integrity is preserved (ingestion → enrichment → clustering → scoring)
9. Shared components are updated consistently across all pages that use them

## Self-Review Checklist

Before marking any task complete, verify:
- [ ] Did I re-read every file I modified?
- [ ] Does this match existing code patterns in the monorepo?
- [ ] Are Prisma field names correct (checked schema.prisma, not assumptions)?
- [ ] Are Queue instances properly closed after use?
- [ ] Is the dedup guard in place for any new ingestion paths?
- [ ] Are Fastify static routes registered before parametric routes?
- [ ] If I changed a shared component, did I update ALL pages using it?
- [ ] Would a newsroom editor find this useful for catching breaking stories?
