# Section 16 — Code Output

## Repository Structure

```
breaking-news/
├── .env.example                        # All environment variables
├── .gitignore
├── .github/workflows/ci.yml           # CI: lint + typecheck + build
├── docker-compose.yml                  # Local dev: PostgreSQL + Redis
├── README.md
├── ARCHITECTURE.md                     # Legacy (see docs/)
├── ARCHITECTURE-PART2.md               # Legacy (see docs/)
│
├── docs/                               # Blueprint documentation (16 sections)
│   ├── 01-feasibility.md
│   ├── 02-product-definition.md
│   ├── 03-architecture.md
│   ├── 04-ingestion-design.md
│   ├── 05-dedup-clustering.md
│   ├── 06-scoring-ranking.md
│   ├── 07-data-model.md
│   ├── 08-api-design.md
│   ├── 09-mcp-server.md
│   ├── 10-frontend.md
│   ├── 11-operations.md
│   ├── 12-security.md
│   ├── 13-deployment.md
│   ├── 14-build-plan.md
│   ├── 15-recommendation.md
│   ├── 16-code-output.md
│   └── README.md                       # Index
│
├── frontend/                           # Next.js 14 on Vercel
│   ├── package.json                    # next, react, tanstack, tailwind, lucide
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.mjs
│   ├── vercel.json                     # API proxy rewrites
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # Root layout, dark theme
│       │   ├── globals.css
│       │   ├── providers.tsx           # React Query provider
│       │   ├── page.tsx                # Main dashboard
│       │   ├── stories/[id]/page.tsx   # Story detail + timeline
│       │   └── feeds/page.tsx          # RSS feed management
│       ├── components/
│       │   ├── StoryTable.tsx          # TanStack Table
│       │   ├── FilterBar.tsx           # Filters with URL sync
│       │   ├── ScoreBadge.tsx          # Score visualization
│       │   └── StatusBadge.tsx         # Status badges
│       └── lib/
│           ├── api.ts                  # Typed API client
│           └── utils.ts               # Formatting utilities
│
├── backend/                            # Fastify API on Railway
│   ├── package.json                    # fastify, prisma, bullmq, bcryptjs, jsonwebtoken
│   ├── tsconfig.json
│   ├── Dockerfile                      # Multi-stage production build
│   ├── prisma/
│   │   └── schema.prisma              # Full schema: 14 models, multi-tenant
│   └── src/
│       ├── index.ts                    # Server: CORS, rate limit, Swagger, routes
│       ├── lib/
│       │   ├── prisma.ts              # DB client singleton
│       │   ├── redis.ts               # Redis connection
│       │   ├── queue.ts               # BullMQ queue factory
│       │   └── auth.ts                # bcrypt + JWT utilities
│       ├── middleware/
│       │   ├── auth.ts                # API key authentication
│       │   └── jwt-auth.ts            # JWT Bearer authentication + role checking
│       ├── routes/
│       │   ├── auth.ts                # register, login, refresh, me, switch-account
│       │   ├── stories.ts             # CRUD + breaking/trending
│       │   ├── search.ts              # Full-text search
│       │   ├── feeds.ts               # RSS feed management
│       │   ├── health.ts              # Health check
│       │   └── admin/
│       │       ├── index.ts           # Admin route aggregator
│       │       ├── accounts.ts        # Account + user management (OWNER)
│       │       ├── markets.ts         # Market CRUD (ADMIN+)
│       │       ├── sources.ts         # Source management (ADMIN+)
│       │       └── credentials.ts     # Credential vault (ADMIN+)
│       ├── services/
│       │   └── rss-generator.ts       # RSS XML generation
│       └── seed.ts                    # Database seed data
│
├── worker/                             # BullMQ workers on Railway
│   ├── package.json                    # bullmq, fast-xml-parser, natural, openai
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts                    # Worker entry + graceful shutdown
│       ├── lib/
│       │   ├── prisma.ts
│       │   ├── redis.ts
│       │   └── logger.ts             # Pino structured logging
│       ├── workers/
│       │   ├── ingestion.worker.ts    # RSS/NewsAPI/Facebook polling
│       │   ├── llm-ingestion.worker.ts # OpenAI/Claude/Grok/Gemini polling
│       │   ├── enrichment.worker.ts   # Entity/category extraction
│       │   ├── clustering.worker.ts   # Story dedup + clustering
│       │   └── scoring.worker.ts      # Score calculation + status
│       ├── schedulers/
│       │   └── poll-scheduler.ts      # Recurring job setup
│       └── utils/
│           └── text.ts                # Normalization, similarity, neighborhoods
│
├── mcp-server/                         # MCP server on Railway
│   ├── package.json                    # @modelcontextprotocol/sdk, prisma
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       └── index.ts                    # 7 MCP tools
│
└── shared/                             # Shared types and constants
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── types.ts                    # Enums, DTOs, interfaces
        └── constants.ts               # Scores, thresholds, intervals
```

## Key Technology Choices

| Component | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ / TypeScript | Unified stack, type safety |
| Frontend | Next.js 14 (App Router) | Vercel-native, SSR, fast |
| Backend | Fastify 4 | Fast, typed, plugin system |
| ORM | Prisma 5 | Type-safe, migrations, Railway |
| Queue | BullMQ 5 | Redis-backed, reliable retry |
| Auth | bcryptjs + jsonwebtoken | No native deps, proven |
| Validation | Zod | Runtime + compile-time safety |
| Logging | Pino | Structured JSON, fast |
| MCP | @modelcontextprotocol/sdk | Official SDK, stdio transport |
| CSS | Tailwind CSS | Utility-first, dark theme |
| Tables | TanStack Table | Headless, sortable, filterable |
| Data fetching | React Query | Auto-refresh, caching |
