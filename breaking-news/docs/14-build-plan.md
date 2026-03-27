# Section 14 — Build Plan

## Phase 0: Feasibility Validation (1 week)

**Scope**: Prove data sources work and clustering is viable.

| Deliverable | Status |
|---|---|
| Test RSS parsing for 6+ Houston news feeds | Ready to test |
| Test NewsAPI with Houston queries | Ready to test |
| Test Grok API for breaking news prompt | Ready to test |
| Submit Facebook App Review | 2-4 week review |
| Prototype Jaccard similarity | Implemented |
| Validate schema with Prisma migrations | Implemented |

**Kill criteria**: If RSS feeds don't provide enough signal for 10+ unique stories/day, reconsider approach.

**Major risk**: Facebook App Review could take longer than expected.

## Phase 1: Prototype (2–3 weeks)

**Scope**: End-to-end pipeline with RSS + NewsAPI + 1 LLM.

| Deliverable | Status |
|---|---|
| Prisma schema + PostgreSQL on Railway | Schema complete |
| Ingestion workers (RSS, NewsAPI, LLM) | Code complete |
| Basic enrichment (category, location keywords) | Code complete |
| Jaccard clustering | Code complete |
| 5-score scoring engine | Code complete |
| Scored ranked table in Next.js | Code complete |
| Single-tenant deployment | Needs deployment |

**Kill criteria**: If clustering produces >50% false merges, invest in embeddings before continuing.

**Major risk**: Clustering accuracy with simple Jaccard.

## Phase 2: Multi-Tenant Alpha (2–3 weeks)

**Scope**: Add auth, multi-tenancy, admin UI, all LLM providers.

| Deliverable | Status |
|---|---|
| JWT authentication (register, login, roles) | Code complete |
| Multi-tenant schema (Account, Market, Credential) | Schema complete |
| Admin routes (accounts, markets, sources, credentials) | Code complete |
| All 4 LLM providers (OpenAI, Claude, Grok, Gemini) | Worker complete |
| Per-account credential management | Routes complete |
| Admin UI screens | Frontend pending |
| Facebook Pages ingestion (after App Review) | Code complete, needs keys |
| Story detail pages with source timeline | Frontend complete |
| RSS feed generation | Backend complete |

**Major risk**: LLM hallucination rate may be higher than expected.

## Phase 3: Production Beta (3–4 weeks)

**Scope**: Third-party API, MCP server, admin tools, monitoring.

| Deliverable | Notes |
|---|---|
| REST API with docs, rate limiting, API keys | Swagger + rate limiting implemented |
| MCP server with all 7 tools | Code complete |
| Alerting for high-breaking-score stories | Needs implementation |
| Monitoring and observability (Pino + health checks) | Partially implemented |
| Credential test endpoints | Complete |
| User invitation flow | Routes complete, email TBD |
| Twitter/X integration | Code structure ready, needs API key |

**Major risk**: API abuse, false breaking alerts, LLM cost overruns.

## Phase 4: Scale-Out (Ongoing)

| Deliverable | Effort |
|---|---|
| Semantic embeddings (pgvector + OpenAI) | 2-3 weeks |
| LLM-generated story summaries (dual-AI pipeline) | 1-2 weeks |
| Additional metros (Dallas, San Antonio, Austin) | 1 week per metro |
| Webhook notifications | 1 week |
| Full-text article extraction (trafilatura) | 1 week |
| Better NER (spaCy / Hugging Face) | 2 weeks |
| Meilisearch for story search | 1 week |
| Editor workflow (approve/edit AI stories) | 2 weeks |
