# Houston Breaking News Intelligence Platform

## Engineering Principles

1. **Signal over noise** — Every feature must increase the signal-to-noise ratio of breaking local news. If it doesn't help a newsroom editor catch a story faster, it doesn't ship.
2. **Honest architecture** — Never fake unavailable platform access. Never assume APIs that don't exist. If a data source isn't viable, say so and design the fallback.
3. **Simple first, smart later** — Jaccard similarity before embeddings. Keyword extraction before NER models. Heuristic scoring before ML. Ship v1, then upgrade.
4. **Data pipeline integrity** — Ingestion → Enrichment → Clustering → Scoring is a strict pipeline. Each stage must be idempotent and independently retryable.
5. **Composability** — Every component (API, MCP, RSS, workers) must function independently. Failure in one must not cascade.
6. **Documentation as code** — Always maintain architecture docs in `breaking-news/docs/`. When you change a system, update the relevant doc section. Stale docs are worse than no docs.
7. **API-first, always** — Every capability must be exposed as both an internal service API (for inter-service calls) and an external RESTful API (for third parties). No feature exists only in the UI. If it's in the frontend, it must have an API endpoint backing it.

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

### Architectural Model
This system follows a **layered service architecture**:
1. **Data Layer** — PostgreSQL (Prisma ORM) + Redis (cache/queues). Single source of truth.
2. **Service Layer** — Internal business logic (scoring, clustering, enrichment). Accessed via BullMQ jobs and direct function calls.
3. **Internal API Layer** — Fastify routes used by the frontend and workers. Handles auth, validation, pagination.
4. **External API Layer** — RESTful `/api/v1/*` endpoints for third parties. Versioned, rate-limited, documented via OpenAPI/Swagger.
5. **Integration Layer** — MCP server (AI assistants), RSS feeds (newsroom tools), webhooks (future).
6. **Presentation Layer** — Next.js frontend. Consumes only the API layer — never accesses DB directly.

**Rule**: Every new feature must define its API contract (endpoint, request/response schema, auth) before implementation. Schema-first, not code-first.

### Documentation Requirements
- Architecture docs live in `breaking-news/docs/` (sections 01-16)
- When adding a new API endpoint, update `docs/08-api-design.md`
- When adding a new MCP tool, update `docs/09-mcp-server.md`
- When changing the data model, update `docs/07-data-model.md`
- When modifying scoring logic, update `docs/06-scoring-ranking.md`
- Run `breaking-news/docs/README.md` as the index linking all sections

### Source of Truth
- **PostgreSQL** is the single source of truth for all story, source, and score data
- **Redis** is ephemeral: queues, cache, rate limiting only. Never authoritative.
- **Prisma** is the only database access layer. No raw SQL unless Prisma cannot express the query.

### Data Flow (strict order)
```
Sources → Ingestion Worker → SourcePost table
  → Enrichment Worker (category, entities, location)
  → Clustering Worker (dedup, merge into Story)
  → Scoring Worker (5 scores + status transition)
  → REST API / MCP Server / RSS feeds serve the results
```

### Deployment Targets
| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | Vercel (prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i) | Auto-deploy on push |
| Backend API | Railway (d361f9bc-3960-42f0-8936-981891df4193) | Persistent process |
| Worker | Railway (same project) | Long-running BullMQ |
| MCP Server | Railway (same project) | Stdio transport |
| PostgreSQL | Railway (managed) | Backed up |
| Redis | Railway (managed) | Ephemeral |

## AI + Data First Principles

1. Every story record must be machine-queryable via REST API and MCP tools
2. All scoring must produce structured numeric outputs (0.0–1.0 range)
3. The MCP server exposes 7 tools: `query_stories`, `get_story`, `get_breaking_stories`, `get_trending_stories`, `search_stories`, `get_story_cluster`, `get_source_stats`
4. RSS feeds are dynamically generated from saved filter definitions — structured data in, XML out
5. Raw source data (`rawData` JSONB) must always be preserved for reprocessing
6. Enrichment metadata (entities, categories) stored as structured JSONB, not free text

## Execution Process

When implementing any feature:
1. **Read first** — Understand existing code before modifying. Check Prisma schema, shared types, and existing patterns.
2. **Plan** — For multi-step work, break into phases. Validate approach against architecture rules above.
3. **Implement** — Match existing patterns. Use the shared types from `shared/src/types.ts`. Use the constants from `shared/src/constants.ts`.
4. **Validate** — Run `npm run build` in the affected service. Check for TypeScript errors. Verify Prisma schema consistency.
5. **Test the pipeline** — If touching ingestion/enrichment/clustering/scoring, trace the full data flow mentally or with test data.

## Code Standards

### Shared Components & Consistency
- **When changing a shared component, update ALL pages that use it.** Do not branch code or make a one-off change for a single page. If a shared component (e.g. `TablePagination`, `MultiSelectDropdown`, `ColumnCustomizer`, `StatusBadge`, `FilterBar`) is modified, assume the change applies everywhere that component is used unless explicitly told otherwise.
- All tables/lists must use the shared `TablePagination` footer, `ColumnCustomizer` for column visibility/reorder, and `useTableColumns` hook for localStorage persistence.
- All filter dropdowns must use `MultiSelectDropdown` (with `searchable` for long lists) or `SingleSelectDropdown`. No raw `<select>` elements or button-group toggles for filters.
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

### Queue Patterns
- Queue names: `ingestion`, `enrichment`, `clustering`, `scoring`
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

## Commands

```bash
# Local development (from breaking-news/)
docker-compose up -d postgres redis
cd backend && npm install && npx prisma migrate dev && npx tsx src/seed.ts
cd backend && npm run dev          # API on :3001
cd worker && npm run dev           # Workers
cd frontend && npm run dev         # UI on :3000

# Build checks
cd backend && npm run build        # TypeScript compile
cd frontend && npm run build       # Next.js build
cd worker && npm run build         # Worker compile

# Database
cd backend && npx prisma studio    # Visual DB browser
cd backend && npx prisma migrate dev --name <name>  # New migration
```

## Platform Access (for Claude agents)

### Vercel API
- **Token**: Set via `VERCEL_TOKEN` env var (never commit the token)
- **Project ID**: `prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i`
- **Project Name**: `tp-hyperlocal`
- **API Base**: `https://api.vercel.com`
- Use `curl -H "Authorization: Bearer $TOKEN"` for all Vercel API calls
- Key endpoints: `/v9/projects/{id}`, `/v6/deployments`, `/v9/projects/{id}/env`

### Railway API
- **Project ID**: `d361f9bc-3960-42f0-8936-981891df4193`
- **Token**: Set via `RAILWAY_TOKEN` env var (never commit the token)
- **API Base**: `https://backboard.railway.com/graphql/v2` (GraphQL)
- Use `curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST` for Railway API calls

## Environment Variables

Required in `.env` (never commit):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/breaking_news
REDIS_URL=redis://localhost:6379
NEWSAPI_KEY=<from newsapi.org>
FACEBOOK_APP_ID=<from Meta developer console>
FACEBOOK_APP_SECRET=<from Meta developer console>
FACEBOOK_ACCESS_TOKEN=<page access token>
OPENAI_API_KEY=<for v2 embeddings>
API_SECRET_KEY=<random 64-char hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
```

## Debugging with Playwright

Playwright is available and must be used for:
- **Visual debugging** — When frontend behavior is unclear, launch Playwright to inspect the actual rendered state
- **Integration testing** — Verify end-to-end flows (dashboard loads, filters work, story detail renders, RSS feeds serve valid XML)
- **API testing** — Use Playwright's `request` context to validate API endpoints when curl isn't sufficient
- **Screenshot verification** — Capture screenshots to confirm UI state matches expectations

```bash
npx playwright test                    # Run all tests
npx playwright test --headed           # Run with visible browser
npx playwright test --debug            # Step-through debugger
npx playwright screenshot <url>        # Quick screenshot
```

When something "looks wrong" or "doesn't render," use Playwright to see what the browser actually shows before guessing at fixes.

## Definition of Done

A feature is done when:
1. TypeScript compiles with zero errors in all affected services
2. Prisma schema is consistent (no drift between schema and migrations)
3. New API endpoints have Zod validation on all inputs
4. New workers follow the idempotent job pattern with proper error handling
5. New MCP tools return structured JSON with `serializeDates()` applied
6. No secrets are hardcoded or committed
7. The data pipeline integrity is preserved (ingestion → enrichment → clustering → scoring)

## Self-Review Checklist

Before marking any task complete, verify:
- [ ] Does this match existing code patterns in the monorepo?
- [ ] Are Prisma field names correct (check schema.prisma, not assumptions)?
- [ ] Are Queue instances properly closed after use?
- [ ] Is the dedup guard in place for any new ingestion paths?
- [ ] Would a newsroom editor find this useful for catching breaking stories?

## Viable Data Sources (reality check)

| Source | Status | Notes |
|--------|--------|-------|
| Local News RSS (15+ feeds) | **Ship now** | Free, high signal, immediate |
| NewsAPI | **Ship now** | $449/mo prod, 15-60 min lag |
| Facebook Pages (Graph API) | **After App Review** | 2-4 week review, curated pages only |
| Twitter/X API v2 | **$100/mo** | Good signal, limited reads on basic tier |
| GDELT Project | **Ship now** | Free validation layer |
| Instagram | **Not viable** | No public search API exists |
| Nextdoor | **Not viable** | No API exists for third parties |
| Any scraping | **Forbidden** | Legal risk, unreliable |
