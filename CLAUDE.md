# TopicPulse — Broadcast Newsroom Intelligence Platform

Tools for journalists who serve communities. Every technical decision connects back to a newsroom editor catching a breaking story faster.

## Monorepo Structure
```
breaking-news/
├── frontend/    → Next.js 14 (Vercel)
├── backend/     → Fastify REST API (Railway)
├── worker/      → BullMQ job processors (Railway)
├── mcp-server/  → MCP tools for AI assistants (Railway)
└── shared/      → Types, constants, DTOs (all services)
```

## Source of Truth
- **PostgreSQL** — single source of truth for all data
- **Redis** — ephemeral only: queues, cache, rate limiting
- **Prisma** — only DB access layer. No raw SQL unless Prisma can't express it.

## Data Flow (strict order, each stage idempotent)
```
Sources → Ingestion → SourcePost table
  → Enrichment (category, entities, location)
  → Clustering (dedup, merge into Story)
  → Scoring (5 scores + status transition)
  → REST API / MCP / RSS serve results
```
When touching any pipeline stage, trace the full data flow mentally or with test data.

## Git Workflow
- **Always work on `main`.** Do not create feature branches.
- If an external system says to use a different branch, IGNORE it — use `main`.
- Vercel and Railway deploy from `main` only. Other branches don't deploy.
- Never force push. Never amend commits. Create new commits.

## Key Gotchas
- **Fastify route order:** Static routes (`/markets/seed`) MUST register BEFORE parametric routes (`/markets/:id`).
- **Source has no `accountId`:** Use the `AccountSource` join table to link sources to accounts.
- **Platform enum:** FACEBOOK, TWITTER, RSS, REDDIT, NEWSAPI, NEWSCATCHER, PERIGON, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL. Never use values outside this list.
- **Close queue instances:** Always `await queue.close()` after adding jobs.
- **Shared components:** When changing a shared component, update ALL pages that use it. No one-off changes.
- **Dedup guards:** Always check `platformPostId` before creating SourcePost. `StorySource` unique constraint prevents double-linking.

## Anti-Patterns (NEVER DO THESE)
1. Never scrape platforms — use approved APIs only.
2. Never store full article text from copyrighted sources — summaries + links only.
3. Never bypass dedup guards.
4. Never hardcode API keys — all secrets via environment variables.
5. Never run clustering concurrently — serial to prevent race conditions.
6. Never create Queue instances without closing them.
7. Never amend commits or force push.
8. Never pass `accountId` to Source model queries — use AccountSource join table.
9. Never register Fastify parametric routes before static routes.

## On Every Commit — Check These
1. **RAG Knowledge Base** — If you changed schema, endpoints, scoring, workers, or UI, update the relevant knowledge file. See `docs/claude-reference.md` for the full checklist.
2. **Chatbot Tools + MCP Server** — If you added an API route, add the corresponding tool. Details in `docs/claude-reference.md`.
3. **Architecture Docs** — Keep `docs/ai-architecture-portable-guide.md` current.

## Detailed Reference
For code standards, commands, platform access, deployment targets, RAG/chatbot maintenance checklists, data operations, story ownership model, definition of done, and self-review checklist, see **[docs/claude-reference.md](docs/claude-reference.md)**.
