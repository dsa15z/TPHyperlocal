# TopicPulse — Detailed Reference

This file contains operational details, checklists, and standards referenced from [CLAUDE.md](../CLAUDE.md). Read on demand — not needed for every task.

---

## Story Ownership Model (Copy-on-Write)

Stories follow a **shared base + private derivative** model:

1. **Base Story** — shared, read-only. Ingested, enriched, clustered, scored. All accounts see the same base data.
2. **Account Story (Derivative)** — created lazily on first user action (edit, assign, notes, AI draft, video, etc.). A fork that belongs to that account.
3. **Live upstream sync** — Derivative stays linked to base, receives ongoing updates. Account's custom work is private.
4. **Access control** — Users only see stories matching their account's paid markets. National stories visible to all.

**Implementation**: `AccountStory` join table with `accountId` + `baseStoryId` (unique), account-specific fields (`editedTitle`, `editedSummary`, `assignedTo`, `notes`, `aiDrafts`, `videos`, `status`), and `lastSyncedAt`.

---

## Deployment Targets

| Service | Platform | Branch | Notes |
|---------|----------|--------|-------|
| Frontend | Vercel (prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i) | `main` | Auto-deploy on push |
| Backend API | Railway (d361f9bc-3960-42f0-8936-981891df4193) | `main` | Persistent process |
| Worker | Railway (same project) | `main` | Long-running BullMQ |
| MCP Server | Railway (same project) | `main` | Stdio transport |
| PostgreSQL | Railway (managed) | — | Backed up |
| Redis | Railway (managed) | — | Ephemeral |

---

## Code Standards

### Shared Components & Consistency
- All tables use `TablePagination` footer, `ColumnCustomizer` for column visibility/reorder, `useTableColumns` hook for localStorage persistence.
- All filter dropdowns use `MultiSelectDropdown` (with `searchable` for long lists) or `SingleSelectDropdown`. No raw `<select>` elements.
- All edit/create forms use the `Modal` component — no inline editing. Centered overlay, backdrop blur, escape-to-close.
- UI patterns established in one page must be replicated across all similar pages.

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
- Always check `schema.prisma` for field names before writing queries — never assume.
- Source model has NO `accountId` — use `AccountSource` join table.
- Platform enum: FACEBOOK, TWITTER, RSS, REDDIT, NEWSAPI, NEWSCATCHER, PERIGON, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL.
- Queue instances must always be closed: `await queue.close()`.

### Queue Patterns
- Queue names: `ingestion`, `enrichment`, `clustering`, `scoring`, `llm-ingestion`, `hyperlocal-intel`
- Each job must be idempotent — safe to retry
- Dedup guard: `platformPostId` unique index prevents double-ingestion
- `StorySource` unique constraint prevents double-linking

---

## RAG Knowledge Base Maintenance

**These files are injected into ALL AI prompts. Stale docs = wrong AI answers.**

Files:
- `backend/src/lib/knowledge-base.ts` — Schema, API endpoints, Prisma field names
- `backend/src/lib/knowledge-chatbot-ops.ts` — Chatbot operations guide
- `backend/src/lib/knowledge-backend-services.ts` — Backend services architecture
- `backend/src/lib/knowledge-user-help.ts` — End-user help guide

**When to update (check on EVERY commit):**
1. Prisma schema changes → `knowledge-base.ts`
2. API endpoint added/modified → `knowledge-base.ts`
3. Scoring logic changes → `knowledge-base.ts` + `knowledge-chatbot-ops.ts`
4. New worker or queue → `knowledge-backend-services.ts`
5. Poll interval changes → `knowledge-backend-services.ts`
6. UI feature added/changed → `knowledge-user-help.ts`
7. New chatbot tool → `knowledge-chatbot-ops.ts`
8. New admin page or setting → `knowledge-user-help.ts`

After updating any knowledge file, remind user: AI & Content → Knowledge Base → "Auto-Generate Schema Docs".

---

## Chatbot Tools & MCP Server Maintenance

The AI chatbot (`backend/src/routes/assistant.ts`) and MCP server (`mcp-server/src/index.ts`) must stay in sync with ALL backend capabilities.

**When to update:**
1. New API endpoint → add chatbot tool (TOOLS array + executeTool switch) + MCP tool
2. New pipeline operation → add chatbot tool + update `knowledge-chatbot-ops.ts`
3. Endpoint signature changed → update tool params in both

**Targets:** Chatbot: 35+ tools. MCP server: 20+ tools.

---

## Data Operations (Run Automatically)

Never expect the user to run these manually. Trigger after deploying:

1. `POST /pipeline/fix-source-markets` — after Prisma schema changes
2. `POST /pipeline/heal-sources` — after self-healing code changes
3. `POST /pipeline/consolidate-news-sources` — after multi-market source support
4. `POST /pipeline/backfill-famous` — after famous person detection changes
5. `POST /pipeline/run-queue` with `{"queue":"scoring"}` — after scoring logic changes

Wait for Railway deploy to complete. If 404, retry after 60 seconds.

---

## Commands

```bash
# Local development (from breaking-news/)
docker-compose up -d postgres redis
cd backend && npm install && npx prisma migrate dev && npx tsx src/seed.ts
cd backend && npm run dev          # API on :3001
cd worker && npm run dev           # Workers
cd frontend && npm run dev         # UI on :3000

# Build checks
cd backend && npm run build
cd frontend && npm run build
cd worker && npm run build

# Database
cd backend && npx prisma studio
cd backend && npx prisma migrate dev --name <name>
```

---

## Platform Access

### Vercel API
- **Project ID**: `prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i`
- **Project Name**: `tp-hyperlocal`
- **API Base**: `https://api.vercel.com`
- Token via `VERCEL_TOKEN` env var

### Railway API
- **Project ID**: `d361f9bc-3960-42f0-8936-981891df4193`
- **API Base**: `https://backboard.railway.com/graphql/v2` (GraphQL)
- Token via `RAILWAY_TOKEN` env var

### HyperLocal Intel API
- **Base URL**: `https://futurilabs.com/hyperlocalhyperrecent`
- No auth required
- Endpoints: `POST /api/lookup`, `GET /api/stream/{id}`, `POST /api/batch`, `GET /api/batch/{id}`
- Webhook: `POST` with `X-HyperLocal-Event: batch.completed` header

---

## Definition of Done

A feature is done when:
1. All modified files have been re-read and verified
2. TypeScript compiles with zero errors in all affected services
3. Prisma field names verified against schema.prisma
4. New API endpoints have Zod validation
5. New workers follow idempotent job pattern
6. Queue instances properly closed
7. No secrets hardcoded or committed
8. Pipeline integrity preserved
9. Shared components updated consistently

---

## Self-Review Checklist

- [ ] Re-read every modified file?
- [ ] Matches existing code patterns?
- [ ] Prisma field names correct (checked schema, not assumed)?
- [ ] Queue instances closed?
- [ ] Dedup guard in place for new ingestion paths?
- [ ] Fastify static routes before parametric?
- [ ] Shared component changes applied everywhere?
- [ ] Would a newsroom editor find this useful?
