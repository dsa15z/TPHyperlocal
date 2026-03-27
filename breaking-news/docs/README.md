# Houston Breaking News Intelligence Platform — Technical Blueprint

> Complete architecture documentation for a production-grade local breaking news intelligence platform.

## Sections

| # | Document | Description |
|---|---|---|
| 1 | [Feasibility](./01-feasibility.md) | Reality check: what data can/cannot be collected from each platform |
| 2 | [Product Definition](./02-product-definition.md) | Users, use cases, data models, status lifecycle, multi-tenant model |
| 3 | [Architecture](./03-architecture.md) | System diagram, 6-layer model, data flow pipeline, deployment targets |
| 4 | [Ingestion Design](./04-ingestion-design.md) | RSS, NewsAPI, Facebook, Twitter, GDELT, LLM providers — per-platform detail |
| 5 | [Dedup & Clustering](./05-dedup-clustering.md) | Similarity formulas, cross-platform clustering, entity extraction, v2 embeddings |
| 6 | [Scoring & Ranking](./06-scoring-ranking.md) | 5 score formulas, decay functions, status transitions, anti-gaming |
| 7 | [Data Model](./07-data-model.md) | ER diagram, all 14 models, indexes, multi-tenant design decisions |
| 8 | [API Design](./08-api-design.md) | REST API: auth, stories, search, feeds, admin — full endpoint reference |
| 9 | [MCP Server](./09-mcp-server.md) | 7 MCP tools for AI assistants |
| 10 | [Frontend](./10-frontend.md) | Pages, admin screens, component structure |
| 11 | [Operations](./11-operations.md) | Polling schedules, queues, idempotency, observability |
| 12 | [Security](./12-security.md) | ToS risk, privacy, auth, secrets, retention, legal |
| 13 | [Deployment](./13-deployment.md) | Vercel + Railway plan, environments, CI/CD, cost estimates |
| 14 | [Build Plan](./14-build-plan.md) | Phases 0-4, deliverables, risks, kill criteria |
| 15 | [Recommendation](./15-recommendation.md) | What to build first, what to avoid, what is fantasy |
| 16 | [Code Output](./16-code-output.md) | Full file tree, technology choices |

## Quick Start

```bash
cd breaking-news
cp .env.example .env   # Edit with your API keys
docker-compose up -d postgres redis
cd backend && npm install && npx prisma migrate dev && npx tsx src/seed.ts
cd backend && npm run dev    # API on :3001
cd worker && npm run dev     # Workers
cd frontend && npm run dev   # UI on :3000
```

## Key Design Decisions

1. **Multi-tenant** — Accounts with per-account markets, sources, and API credentials
2. **LLM as news sources** — Poll Grok, OpenAI, Claude, Gemini for breaking news
3. **Per-account credentials** — Each tenant brings their own API keys
4. **Dual auth** — JWT for frontend users + API key for third-party consumers
5. **Pipeline integrity** — Ingestion → Enrichment → Clustering → Scoring (idempotent, retryable)
6. **Honest architecture** — No scraping, no fantasy APIs, no hand-waving
