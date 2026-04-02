/**
 * RAG Knowledge: Backend Services & Architecture
 * Documents how the pipeline, workers, queues, and services operate.
 */

export function generateBackendServicesKnowledge(): string {
  return `
# TopicPulse — Backend Services Architecture

## Pipeline Architecture (Strict Order)
\`\`\`
Sources → Ingestion Worker → SourcePost table
  → Enrichment Worker (category, entities, location, famous person detection)
  → Clustering Worker (dedup, merge into Story, write StoryEntity)
  → Scoring Worker (5 scores + verification + status transition + propagation + audience + pre-break)
  → REST API / MCP Server / RSS feeds serve the results
\`\`\`

Each stage is idempotent and independently retryable. Failure in one stage does not block others.
BullMQ queues with Redis broker. Jobs have 3 retry attempts with exponential backoff.

## Core Pipeline Workers

### 1. ingestion.worker.ts — Source Polling & Content Fetching
- Queue: ingestion, Concurrency: 10
- Fetches content from RSS feeds, news APIs, Twitter, Facebook
- Dedup: platformPostId unique index prevents double-ingestion
- Content hash: SHA-256 hash dedup catches duplicate content from different URLs
- Self-healing: 10 strategies for failing sources
- Rotating pool of 12 real browser UAs to prevent bot detection
- HTTP caching: ETag/If-Modified-Since conditional fetch, content-hash skip
- Per-domain 3-second throttle via Redis
- Tracks consecutive failures, auto-deactivates at 10

### 2. enrichment.worker.ts — NLP Classification & Entity Extraction
- Queue: enrichment, Concurrency: 10
- Step 1: Keyword-based categorization (14 categories)
- Step 2: Regex entity extraction (people, organizations, locations)
- Step 3: Location extraction (neighborhoods, streets, cities)
- Step 4: LLM enrichment when heuristic returns OTHER or no location
  - Single call extracts: CATEGORY, LOCATION, ENTITIES, FAMOUS persons
  - Uses OpenAI → Grok → Gemini fallback chain

### 3. clustering.worker.ts — Story Dedup & Aggregation
- Queue: clustering, Concurrency: 1 (SERIAL — prevents merge race conditions)
- Title dedup: Jaccard similarity threshold 0.65
- Person entity matching: shared person names boost similarity
- Embedding similarity: cosine on JSON embeddings (0.75 merge, 0.60 related)
- Writes entities to StoryEntity table
- Sets hasFamousPerson + famousPersonNames on new stories

### 4. scoring.worker.ts — Score Calculation & Verification
- Queue: scoring, Concurrency: 5
- Formula: compositeScore = 0.25×breaking + 0.20×trending + 0.15×confidence + 0.15×locality + 0.25×social
- Bonus: propagation (+5-15%), audience affinity (+10%), pre-break velocity (+15%)
- Verification: 3+ sources + confidence >= 0.5 → VERIFIED
- Status determination with tiered thresholds (local markets lower)

### 5. news-director.worker.ts — AI News Director
- Queue: news-director, Concurrency: 1, Runs every 5 min
- Evaluates top 20 hot stories, generates editorial alerts
- Alert types: cover_now, famous_person, spreading
- Stores in Redis key news-director:alerts (10-min TTL)

## Polling Schedule

| Source Type | Interval | Notes |
|------------|----------|-------|
| RSS feeds | 5 min | National always polls, local pauses when idle |
| NewsAPI/Twitter | 3 min | Pauses when idle |
| Grok LLM | 5 min | Consolidated multi-market call |
| Bing/Google News | 5 min | Dynamic per-market URLs |
| Event Registry | 15 min | Consolidated per-market |
| Newscatcher | 10 min | |
| HyperLocal Intel | 15 min | |
| Web scrapers | 30 min | |
| Embeddings | 10 min | Skips already-embedded |
| Score decay | 10 min | Re-scores non-archived |
| Cleanup | 1 hour | Archives stories > 72h |
| News Director | 5 min | Proactive alerts |

## Idle Detection
- Frontend heartbeat → Redis tp:last_ui_activity
- 6-minute timeout → most polling stops (cost control)
- Exempt: National RSS, embeddings, score decay, cleanup, account sync
- Fail-open: if Redis down, assumes active

## Self-Healing (10 Strategies, triggers at failure 3 and 7)
1. Proxy-to-direct URL mapping (rsshub → apnews)
2. Browser UA + full headers (rotating 12 UAs)
3. HTML-not-RSS detection → switch to web scraping
4. 9 RSS URL variants (/feed, /rss, /rss.xml, etc.)
5. Protocol variants (www/non-www, https/http)
6. RSS auto-discovery from HTML link tags
7. Switch to web scraping (last resort)
8. Per-domain throttle (3s via Redis)
9. Redirect tracking (update URL on redirect)
10. Bot challenge detection (Cloudflare, Akamai, PerimeterX, DataDome, Anubis)
Auto-deactivate at failure 10. Audit log in source.metadata.failureLog[].

## Source Management
- SourceMarket M:N join table (not legacy Source.marketId FK)
- Consolidated sources: 1 Bing/Google/ER/Grok source → dynamic per-market polls
- fix-source-markets: auto-links sources to markets by name matching
- consolidate-news-sources: merges per-market duplicates

## LLM Factory (Multi-Provider Fallback)
- OpenAI (gpt-4o-mini) → Grok (grok-3-mini) → Gemini (gemini-2.0-flash)
- Used by: enrichment, summarization, NLP search, chatbot, verification, broadcast packages

## Key Pipeline Endpoints
- POST /pipeline/trigger — force ingestion
- POST /pipeline/run-queue — force run queue
- POST /pipeline/clear-failed — clear failed jobs
- POST /pipeline/heal-source/:id — self-heal single source
- POST /pipeline/fix-source-markets — create tables + link sources
- POST /pipeline/consolidate-news-sources — merge duplicates
- POST /pipeline/backfill-famous — detect famous persons in existing stories
- POST /broadcast-package/generate — one-click multi-format content
- POST /stories/:id/verify — LLM dual-check verification
`.trim();
}
