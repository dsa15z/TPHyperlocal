# Houston Breaking News Intelligence Platform — Architecture (Sections 9–16)

> Sections 1–8 in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## SECTION 9 — MCP Server Design

### Overview
The MCP (Model Context Protocol) server exposes the story dataset as tools for AI assistants. Deployed on Railway as a standalone service using stdio transport.

### Tools

#### `query_stories`
Search and filter stories with flexible parameters.
```typescript
{
  name: "query_stories",
  description: "Search and filter breaking news stories",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text search query" },
      status: { type: "string", enum: ["EMERGING","BREAKING","TRENDING","ACTIVE","STALE"] },
      category: { type: "string", enum: ["CRIME","WEATHER","TRAFFIC","POLITICS","BUSINESS","SPORTS","COMMUNITY","EMERGENCY"] },
      minScore: { type: "number", minimum: 0, maximum: 1 },
      sortBy: { type: "string", enum: ["compositeScore","breakingScore","trendingScore","firstSeenAt"], default: "compositeScore" },
      order: { type: "string", enum: ["asc","desc"], default: "desc" },
      limit: { type: "number", default: 20, maximum: 100 }
    }
  }
}
```

#### `get_story`
Get a single story with full details and all source posts.
```typescript
{
  name: "get_story",
  inputSchema: {
    type: "object",
    properties: { storyId: { type: "string" } },
    required: ["storyId"]
  }
}
```

#### `get_breaking_stories`
Get current breaking stories, sorted by breaking score.
```typescript
{
  name: "get_breaking_stories",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", default: 10 } }
  }
}
```

#### `get_trending_stories`
Get trending stories sorted by trending score.

#### `search_stories`
Full-text search with date range and category filters.
```typescript
{
  name: "search_stories",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      category: { type: "string" },
      limit: { type: "number", default: 20 }
    },
    required: ["query"]
  }
}
```

#### `get_story_cluster`
Get full cluster — story plus all supporting source posts with similarity scores and platform breakdown.

#### `get_source_stats`
Source health dashboard — post counts, last poll times, health status per source.

### Implementation
- Built with `@modelcontextprotocol/sdk` using `McpServer` class
- Stdio transport (`StdioServerTransport`)
- Each tool queries PostgreSQL via Prisma
- Results returned as formatted JSON text content

### Deployment
- Runs as a long-lived process on Railway
- Connects to same PostgreSQL and Redis as the API service
- Can be exposed via SSE transport for remote access in v2

---

## SECTION 10 — Frontend Product Design

### Stack
- **Next.js 14** (App Router) on Vercel
- **TanStack Table** for sortable/filterable data table
- **TanStack React Query** for data fetching with 30-second auto-refresh
- **Tailwind CSS** with dark theme
- **Lucide React** for icons

### Pages

#### Main Dashboard (`/`)
- Header: "Houston Breaking News Intelligence" + live pulse indicator
- Filter bar: keyword search (debounced), category dropdown, status dropdown, time range buttons (1h/6h/24h/7d), min score slider, clear button
- Ranked table with columns:
  - `#` (rank)
  - Status (colored badge: red=BREAKING, orange=TRENDING, blue=ACTIVE, gray=STALE)
  - Title (linked to detail page)
  - Category
  - Location
  - Breaking Score (colored bar)
  - Trending Score (colored bar)
  - Sources (count)
  - First Seen (relative time)
  - Updated (relative time)
- Sortable by clicking any column header
- Pagination at bottom
- Auto-refresh every 30 seconds via React Query

#### Story Detail (`/stories/[id]`)
- Story title, summary, status badge, category, location
- Score cards: breaking, trending, confidence, locality (each with colored bar)
- Composite score highlight
- Source Posts section: platform icon, author, content snippet, engagement metrics, published time, link to original
- Timeline showing when each source post was collected

#### RSS Feed Manager (`/feeds`)
- List of saved feeds with name, filters, RSS URL (copyable)
- Create feed form: name, category filter, status filter, min score, keywords
- Delete feed button

### Component Structure
```
src/
├── app/
│   ├── layout.tsx         # Root layout, dark theme, Inter font
│   ├── globals.css        # Tailwind + custom dark styles
│   ├── providers.tsx      # React Query provider
│   ├── page.tsx           # Main dashboard
│   ├── stories/[id]/page.tsx  # Story detail
│   └── feeds/page.tsx     # RSS feed management
├── components/
│   ├── StoryTable.tsx     # TanStack Table with all columns
│   ├── FilterBar.tsx      # Filter controls with URL param sync
│   ├── ScoreBadge.tsx     # Score visualization (gray→green→yellow→red)
│   └── StatusBadge.tsx    # Status badge with colors
└── lib/
    ├── api.ts             # Typed API client
    └── utils.ts           # Formatting utilities
```

---

## SECTION 11 — Background Jobs and Operations

### Polling Schedules

| Source Type | Interval | Queue |
|---|---|---|
| RSS Feeds | Every 2 minutes | `ingestion` |
| NewsAPI | Every 3 minutes | `ingestion` |
| Facebook Pages | Every 5 minutes | `ingestion` |
| Twitter/X | Every 3 minutes | `ingestion` |
| GDELT | Every 5 minutes | `ingestion` |
| Score Decay | Every 10 minutes | `scoring` |
| Cleanup/Archive | Every 60 minutes | `scoring` |

### Queue Architecture (BullMQ)

```
ingestion → enrichment → clustering → scoring → alerts
```

Each queue has:
- **Concurrency**: ingestion=5, enrichment=3, clustering=1 (serial for consistency), scoring=3
- **Retry**: 3 attempts with exponential backoff (2s, 8s, 32s)
- **Dead letter**: Failed jobs moved to `{queue}:dead` after max retries
- **Job TTL**: 1 hour (stale jobs discarded)

### Idempotency
- **Ingestion**: Dedup by `platformPostId` (unique index). Upsert pattern.
- **Clustering**: Check `StorySource` unique constraint before linking.
- **Scoring**: Score snapshots are append-only. Re-scoring is safe to repeat.

### Backfill Support
- Admin can trigger manual ingestion for a specific source + time range
- Backfill jobs use separate BullMQ queue priority to avoid blocking live polling

### Observability
- **Structured logging**: Pino with JSON output, child loggers per worker
- **Metrics**: BullMQ built-in metrics (job completion rate, wait time, active count)
- **Health checks**: `/api/v1/health` endpoint checks DB + Redis + queue depth
- **Alerts**: Log warnings when queue depth > 100, error when source hasn't polled in 3× interval

### Admin Tools
- Manual re-score: POST job to scoring queue for specific story
- Force re-cluster: Recalculate all story-source links for a time range
- Source pause/resume: Toggle `isActive` on Source record
- Manual story merge/split: Admin API endpoints (v2)

---

## SECTION 12 — Security, Compliance, and Risk

### Platform Terms of Service

| Platform | Risk Level | Mitigation |
|---|---|---|
| Facebook Pages API | Low | Stay within approved permissions. App Review required. |
| Instagram | Medium | Only access authorized business accounts. Don't scrape. |
| Nextdoor | N/A | Not used. No access path exists. |
| Twitter/X | Low | Paid API tier. Follow rate limits. |
| RSS/NewsAPI | None | Public/licensed access. |

### Privacy
- **No personal data collection**: Only public posts from official pages/feeds
- **No user tracking**: No cookies, no user accounts in v1
- **Content attribution**: Always link back to original source
- **Data minimization**: Store only fields needed for clustering/scoring

### Retention
- Source posts: 90-day rolling window, then archive to cold storage or delete
- Stories: Retained indefinitely (small records), scores pruned after 30 days
- Score snapshots: Hourly resolution after 24h, daily after 7d, weekly after 30d
- Audit logs: 1 year retention

### Secrets Management
- All API keys/tokens stored in Railway/Vercel environment variables
- Never committed to git (`.env` in `.gitignore`)
- Rotate Facebook/Twitter tokens quarterly
- API keys for third parties are hashed in DB, not stored in plaintext

### Rate Limiting
- Public API: 100 req/min per API key (configurable)
- RSS endpoints: 60 req/min per IP (no auth required)
- Admin endpoints: Separate auth, no public access

### Legal Review Checkpoints
1. **Before Facebook integration**: Confirm App Review approval and ToS compliance
2. **Before Twitter integration**: Review current API terms (change frequently)
3. **Before exposing API to third parties**: Terms of service for downstream users
4. **Before adding any scraping**: Legal review required (recommendation: don't)

### Architecture Risks

| Risk | Severity | Recommendation |
|---|---|---|
| Scraping any platform | High | **Do not do this.** Use APIs only. |
| Storing full article text from RSS | Medium | Store summaries only. Link to originals. |
| Republishing social content | Medium | Attribute and link. Don't embed without permission. |
| Single-source breaking alerts | Low | Require 2+ sources for BREAKING status. |

---

## SECTION 13 — Deployment Plan

### Service Map

| Service | Platform | Plan |
|---|---|---|
| Next.js Frontend | Vercel | Free → Pro ($20/mo) |
| Fastify API | Railway | Starter ($5/mo) → Pro |
| Worker Service | Railway | Starter → Pro |
| MCP Server | Railway | Starter |
| PostgreSQL | Railway | Managed ($5/mo base) |
| Redis | Railway | Managed ($5/mo base) |

### Environments
- **Development**: Local via Docker Compose (PostgreSQL + Redis containers)
- **Staging**: Railway dev environment + Vercel preview deployments
- **Production**: Railway production + Vercel production

### CI/CD
- GitHub Actions: lint + typecheck + build on PR
- Vercel: auto-deploy frontend on push to main
- Railway: auto-deploy backend/worker/mcp on push to main
- Database migrations: `prisma migrate deploy` in Railway deploy command

### Cost Estimates

| Stage | Monthly Cost | Notes |
|---|---|---|
| Prototype | $30–50 | Railway Starter (API + worker + DB + Redis) + Vercel free |
| Early Production | $100–200 | Railway Pro + NewsAPI paid + Twitter Basic ($100) |
| Scaled (Houston) | $300–600 | Larger DB, more workers, higher API tiers, monitoring |
| Multi-metro | $800–1500 | Per-metro worker instances, larger DB, CDN |

---

## SECTION 14 — Build Plan

### Phase 0: Feasibility Validation (1 week)
**Scope**: Prove data sources work
- Test RSS parsing for 5 Houston news feeds
- Test NewsAPI with Houston queries
- Submit Facebook App Review
- Prototype text similarity comparison
- **Kill criteria**: If RSS feeds don't provide enough signal for 10+ stories/day, reconsider approach
- **Deliverables**: Working ingestion scripts, sample data, feasibility report

### Phase 1: Prototype (2–3 weeks)
**Scope**: End-to-end pipeline with RSS + NewsAPI
- Prisma schema + PostgreSQL on Railway
- Ingestion workers for RSS and NewsAPI
- Basic enrichment (category, location keywords)
- Simple Jaccard clustering
- Scored ranked table in Next.js
- **Major risks**: Clustering accuracy may be poor with simple Jaccard
- **Kill criteria**: If clustering produces >50% false merges, invest in embeddings before continuing
- **Deliverables**: Working dashboard showing ranked Houston stories

### Phase 2: Internal Alpha (2–3 weeks)
**Scope**: Add Facebook Pages, improve scoring, add features
- Facebook Pages ingestion (assuming App Review approved)
- Full scoring engine with all 5 scores
- Story detail pages with source post timeline
- RSS feed generation
- API authentication
- **Major risks**: Facebook App Review may take longer than expected
- **Deliverables**: Feature-complete alpha for internal testing

### Phase 3: Production Beta (3–4 weeks)
**Scope**: Third-party API, MCP server, admin tools
- REST API with docs, rate limiting, API keys
- MCP server with all tools
- Admin source management
- Alerting for high-breaking-score stories
- Monitoring and observability
- **Major risks**: API abuse, false breaking alerts
- **Deliverables**: Public beta with API access

### Phase 4: Scale-Out (Ongoing)
**Scope**: More sources, better ML, more metros
- Semantic embeddings (pgvector + OpenAI)
- LLM-generated story summaries
- Twitter/X integration
- Additional metros (Dallas, San Antonio, Austin)
- Webhook notifications
- **Deliverables**: Multi-metro production platform

---

## SECTION 15 — Recommended Implementation

### What to Build First
1. **RSS + NewsAPI ingestion** → this works today, zero friction, high signal
2. **Jaccard clustering + keyword enrichment** → simple, good enough for v1
3. **Scored/ranked table** → the core product experience
4. **REST API** → enables third-party integration
5. **RSS feed generation** → immediate value for newsroom workflows
6. **MCP server** → differentiator for AI-native workflows

### What to Avoid
- **Instagram integration** — no useful public API exists. Waste of time.
- **Nextdoor integration** — impossible without a partnership that doesn't exist.
- **Any form of scraping** — legal risk, unreliable, not worth it.
- **Full-text article storage** — store summaries and link to originals.
- **Complex ML before simple heuristics** — Jaccard + keywords will get you 70% of the way.

### What Is Fantasy
- "Real-time Nextdoor feed" — cannot be done without Nextdoor partnership
- "All public Instagram posts about Houston" — Instagram has no public search API
- "CrowdTangle-style Facebook monitoring" — CrowdTangle is dead
- "Free unlimited Twitter access" — costs $100-5000/mo depending on volume
- "Perfect deduplication" — will always need human review edge cases

### The Honest Architecture

```
v1 Reality:
┌─────────────────────────────────────────────┐
│  RSS Feeds (10-15 Houston sources)          │ ← FREE, immediate, high signal
│  NewsAPI (Houston filtered)                 │ ← $449/mo for production
│  Facebook Pages (5-10 curated)              │ ← Free, needs App Review
├─────────────────────────────────────────────┤
│  Ingestion → Enrichment → Clustering → Scoring │
├─────────────────────────────────────────────┤
│  PostgreSQL (stories + posts + scores)      │
│  Redis (queues + cache)                     │
├─────────────────────────────────────────────┤
│  REST API + RSS Feeds + MCP Server          │
│  Next.js Dashboard                          │
└─────────────────────────────────────────────┘
```

This will produce a genuinely useful breaking news feed for Houston with 50-200 stories/day from legitimate sources. It won't have every neighborhood Facebook group post, but it will have every story that matters.

---

## SECTION 16 — Code Output

### Files Created

```
breaking-news/
├── .env.example                        # Environment variables template
├── .gitignore                          # Git ignore rules
├── .github/workflows/ci.yml           # CI pipeline
├── docker-compose.yml                  # Local dev environment
├── README.md                           # Project documentation
│
├── frontend/                           # Next.js on Vercel
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.mjs
│   ├── vercel.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # Root layout, dark theme
│       │   ├── globals.css             # Tailwind + custom styles
│       │   ├── providers.tsx           # React Query provider
│       │   ├── page.tsx                # Main dashboard
│       │   ├── stories/[id]/page.tsx   # Story detail
│       │   └── feeds/page.tsx          # RSS feed management
│       ├── components/
│       │   ├── StoryTable.tsx          # Ranked data table
│       │   ├── FilterBar.tsx           # Filter controls
│       │   ├── ScoreBadge.tsx          # Score visualization
│       │   └── StatusBadge.tsx         # Status badges
│       └── lib/
│           ├── api.ts                  # API client
│           └── utils.ts               # Formatting utilities
│
├── backend/                            # Fastify API on Railway
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── prisma/schema.prisma           # Complete database schema
│   └── src/
│       ├── index.ts                    # Server entry point
│       ├── lib/
│       │   ├── prisma.ts              # DB client singleton
│       │   ├── redis.ts               # Redis connection
│       │   └── queue.ts               # BullMQ queues
│       ├── routes/
│       │   ├── stories.ts             # CRUD + breaking/trending
│       │   ├── search.ts              # Full-text search
│       │   ├── feeds.ts               # RSS feed management
│       │   └── health.ts              # Health check
│       ├── middleware/
│       │   └── auth.ts                # API key authentication
│       ├── services/
│       │   └── rss-generator.ts       # RSS XML generation
│       └── seed.ts                    # Database seed data
│
├── worker/                             # BullMQ workers on Railway
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts                    # Worker entry + shutdown
│       ├── lib/
│       │   ├── prisma.ts
│       │   ├── redis.ts
│       │   └── logger.ts             # Pino structured logging
│       ├── workers/
│       │   ├── ingestion.worker.ts    # RSS/NewsAPI/Facebook polling
│       │   ├── enrichment.worker.ts   # Entity/category extraction
│       │   ├── clustering.worker.ts   # Story dedup + clustering
│       │   └── scoring.worker.ts      # Score calculation
│       ├── schedulers/
│       │   └── poll-scheduler.ts      # Recurring job setup
│       └── utils/
│           └── text.ts                # Text normalization + similarity
│
├── mcp-server/                         # MCP server on Railway
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       └── index.ts                    # All 7 MCP tools
│
└── shared/                             # Shared types
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── types.ts                    # DTOs, enums, interfaces
        └── constants.ts               # Config, thresholds, intervals
```

### Getting Started

```bash
# 1. Clone and enter the breaking-news directory
cd breaking-news

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# 3. Start infrastructure
docker-compose up -d postgres redis

# 4. Set up database
cd backend
npm install
npx prisma migrate dev
npx tsx src/seed.ts
cd ..

# 5. Start services (in separate terminals)
cd backend && npm run dev
cd worker && npm run dev
cd frontend && npm run dev

# 6. Open http://localhost:3000
```

---

## Blunt Assessment

**Build this first**: RSS feeds + NewsAPI → ingestion pipeline → clustering → scored table → REST API. This ships in 3-4 weeks and provides real value to a Houston newsroom.

**Add next**: Facebook Pages (after App Review), MCP server, RSS feed generation. Another 2-3 weeks.

**Consider carefully**: Twitter/X API at $100/mo — good signal but limited reads on basic tier. Worth it if budget allows.

**Avoid entirely**: Instagram (no API), Nextdoor (no API), any scraping (legal risk), complex ML before simple heuristics work.

**What is fantasy**: A system that ingests "all local social media" from Facebook, Instagram, and Nextdoor. This does not exist and cannot be built compliantly. Anyone who says otherwise is either scraping (illegal), hallucinating APIs that don't exist, or has a partnership you don't have.

**What is real**: A system that monitors 15-20 curated local news RSS feeds, NewsAPI, and a handful of official Facebook pages, then clusters, scores, and ranks the stories into a useful breaking news feed. This is buildable, shippable, and valuable. Start here.
