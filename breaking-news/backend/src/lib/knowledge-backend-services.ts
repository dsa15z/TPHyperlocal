/**
 * RAG Knowledge: Backend Services & Architecture
 * Documents how the pipeline, workers, queues, and services operate.
 */

export function generateBackendServicesKnowledge(): string {
  return `
# TopicPulse Backend Services & Architecture

## System Architecture
TopicPulse is a monorepo with four services:
- **Backend** (Fastify): REST API, auth, routes — deployed on Railway
- **Worker** (BullMQ): Background job processors — deployed on Railway
- **Frontend** (Next.js 14): UI — deployed on Vercel
- **MCP Server**: AI tool interface (read-only story queries) — deployed on Railway

All services share PostgreSQL (source of truth) and Redis (queues, cache, ephemeral state).

## Data Pipeline (strict order)
\`\`\`
Sources → Ingestion Worker → SourcePost table
  → Enrichment Worker (category, entities, location)
  → Clustering Worker (dedup, merge into Story)
  → Scoring Worker (5 scores + status transition)
  → REST API / MCP Server / RSS feeds serve the results
\`\`\`

Each stage is idempotent and independently retryable. Failure in one stage does not block others.

## Worker Services

### Core Pipeline Workers
1. **ingestion.worker** — Fetches content from RSS/API sources, creates SourcePost records. Dedup guard: platformPostId unique index prevents double-ingestion.
2. **enrichment.worker** — Classifies category, extracts entities (people, orgs, places), determines location. Uses keyword matching + LLM fallback.
3. **clustering.worker** — Groups related SourcePosts into Stories. Uses Jaccard similarity on titles + person entity matching. MUST run serially (no concurrent clustering).
4. **scoring.worker** — Calculates 5 scores (breaking, trending, confidence, locality, social) and transitions story status. Runs after each clustering pass.

### Enrichment Workers
5. **article-extraction.worker** — Extracts full article text from source URLs
6. **geocoding.worker** — Resolves location names to lat/long coordinates
7. **embeddings.worker** — Generates vector embeddings for semantic search
8. **summarization.worker** — Generates AI summaries for stories
9. **sentiment.worker** — Analyzes sentiment (positive/negative/neutral)
10. **credibility.worker** — Scores source credibility and trust

### Content Generation Workers
11. **first-draft.worker** — Generates TV scripts, web articles, social posts using LLM
12. **video-generation.worker** — Creates video content packages

### Source-Specific Workers
13. **event-registry.worker** — Polls Event Registry API for news articles
14. **newscatcher.worker** — Polls Newscatcher API for news
15. **hyperlocal-intel.worker** — Polls HyperLocal Intel API for geo-scored local news
16. **llm-ingestion.worker** — Uses OpenAI/Grok/Gemini to scan for breaking news
17. **web-scraper.worker** — Scrapes configured web pages for content
18. **social-monitor.worker** — Monitors social media platforms

### Analytics & Alert Workers
19. **prediction.worker** — Viral prediction using regression model
20. **velocity-scorer.worker** — Real-time velocity scoring for breaking detection
21. **beat-alert.worker** — Sends alerts when stories match reporter beats
22. **notification.worker** — Push notifications for breaking stories
23. **digest.worker** — Compiles email digest summaries
24. **shift-briefing.worker** — Generates shift handoff briefings

### Operational Workers
25. **account-story-sync.worker** — Syncs base story updates to AccountStory derivatives
26. **domain-scoring.worker** — Scores source domains for trust
27. **rss-discovery.worker** — Auto-discovers RSS feeds from URLs
28. **story-splitter.worker** — Splits multi-topic stories into separate stories
29. **story-research.worker** — Deep research on story background

## Poll Scheduler
The poll scheduler runs in the worker service and manages all source polling intervals:

| Source Type | Interval | Notes |
|-------------|----------|-------|
| RSS feeds | 5 min | Standard RSS polling |
| NewsAPI / Twitter | 3 min | Real-time sources |
| Facebook pages | 5 min | Graph API polling |
| Grok fast poll | 5 min | X/Twitter intelligence |
| Sentiment analysis | 5 min | On new stories |
| Digests | 5 min | Email delivery check |
| Account story sync | 5 min | Upstream sync |
| Newscatcher | 10 min | API rate limits |
| LLM ingestion | 10 min | Cost control |
| Embeddings | 10 min | Vector generation |
| Score decay | 10 min | Lower stale scores |
| HyperLocal Intel | 15 min | Geo-scored news |
| Event Registry | 15 min | Global news |
| Geocoding | 15 min | Location resolution |
| Summarization | 15 min | AI summaries |
| Web scraper | 30 min | Website polling |
| Stock monitor | 30 min | Financial data |
| Cleanup (archival) | 60 min | Archive old stories |
| Credibility | 24 hours | Trust recalculation |

### Idle Detection (Cost Control)
- Frontend sends heartbeat to Redis key \`tp:last_ui_activity\` every few seconds
- If no heartbeat for 6 minutes, ALL polling stops
- This saves API costs when no one is watching
- Polling resumes immediately when a user opens the UI
- isUIActive() check is at the top of every poll function

## Queue System (BullMQ + Redis)
Queue names: ingestion, enrichment, clustering, scoring, llm-ingestion, hyperlocal-intel, article-extraction, geocoding, embeddings, summarization, sentiment, credibility, first-draft, digest, newscatcher, alerts, coverage

Key patterns:
- Each job must be idempotent — safe to retry (3 attempts, exponential backoff)
- Queue instances MUST be closed after use: await queue.close()
- Dedup guard: platformPostId unique index prevents double-ingestion
- StorySource unique constraint prevents double-linking
- Clustering runs serially — no concurrent story merges

## Backend API Routes

### Public (no auth)
- GET /api/v1/health — service health check
- GET /api/v1/feeds/* — RSS feed output
- GET /api/v1/stories (read-only with limited features)

### Authenticated (x-api-key or JWT Bearer)
- Stories: GET/POST /api/v1/stories, GET /api/v1/stories/:id
- Account Stories: POST/PATCH /api/v1/account-stories/:baseStoryId/*
- Pipeline: GET/POST /api/v1/pipeline/* (status, trigger, clear, drain)
- Sources: GET/POST/PATCH/DELETE /api/v1/admin/sources
- Markets: GET/POST/PATCH /api/v1/admin/markets
- Knowledge: GET/POST/DELETE /api/v1/admin/knowledge
- Moderation: GET/POST /api/v1/moderation/*
- User Settings: GET/PATCH /api/v1/user/settings/*
- Assistant: POST /api/v1/assistant/chat, GET /api/v1/assistant/alerts
- Content: POST /api/v1/first-drafts, /api/v1/conversation-starters/*

### Rate Limiting
- 100 requests/minute per API key
- Pagination: limit (max 100) + offset
- Sorting: sort + order params

## LLM Integration (llm-factory.ts)
Supports multiple providers with automatic fallback:
1. **OpenAI** (gpt-4o-mini) — primary
2. **xAI Grok** (grok-3-mini) — secondary, has live X/Twitter access
3. **Google Gemini** (gemini-2.0-flash) — tertiary

Features:
- Function calling support for structured output
- System prompt injection with RAG knowledge base
- Temperature control per use case
- Automatic retry with provider fallback

## Scoring System Detail

### Breaking Score Calculation
- Source velocity: posts per 15-minute window
- Source diversity: number of unique source platforms
- Recency: exponential decay from firstSeenAt
- Category-specific decay curves (EMERGENCY decays slower)
- 3+ sources in 15 min → automatic BREAKING threshold

### Status Transitions
Valid transitions follow a directed graph:
- ALERT → BREAKING, DEVELOPING
- BREAKING → DEVELOPING, TOP_STORY, ONGOING
- DEVELOPING → BREAKING, TOP_STORY, ONGOING
- TOP_STORY → ONGOING, FOLLOW_UP, STALE
- ONGOING → TOP_STORY, FOLLOW_UP, STALE
- FOLLOW_UP → ONGOING, STALE
- STALE → ONGOING, ARCHIVED
- ARCHIVED → (terminal, no transitions out)

Local markets use LOWER thresholds:
- Breaking: > 0.35 (vs 0.6 national)
- This means local stories surface faster

### Score Decay
Every 10 minutes, scores for non-archived stories are recalculated:
- Breaking score decays exponentially based on time since last source
- Stories transition STALE after 48 hours of no activity
- Stories ARCHIVE after 72 hours of no activity

## Database Key Models

### Story (core entity)
- Linked to SourcePosts via StorySource join table
- Has pastScores (JSON) for growth calculation
- peakBreakingScore and peakStatus track historical highs
- mergedIntoId links to parent when stories are merged

### Source → Market (M:N)
- SourceMarket join table links sources to markets
- Source has NO accountId field — use AccountSource for account links
- Sources only polled when their markets are active

### AccountStory (copy-on-write)
- Created lazily on first user action
- Links accountId + baseStoryId (unique)
- Private fields: editedTitle, editedSummary, notes, assignedTo, aiDrafts, etc.
- lastSyncedAt tracks when base story updates were pulled in
`.trim();
}
