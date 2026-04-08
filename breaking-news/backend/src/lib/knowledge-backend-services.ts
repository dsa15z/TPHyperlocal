/**
 * RAG Knowledge: Backend Services & Architecture
 * Documents how the pipeline, workers, queues, and services operate.
 */

export function generateBackendServicesKnowledge(): string {
  return `
# TopicPulse — Backend Services Architecture

## Deployment: 3 Split Worker Services

The worker monolith is split into 3 independently deployable Railway services,
each with its own connection pool (connection_limit=20, pool_timeout=30) via Prisma.

### worker-critical (Port 3002)
Hot-path pipeline only. Runs the 4 core pipeline workers + all poll schedulers +
the pipeline self-healing monitor. If this service is down, no new content is ingested.
- **Workers (4):** ingestion, enrichment, clustering, scoring
- **Also runs:** poll-scheduler.ts (all setInterval schedulers), pipeline-monitor.ts

### worker-standard (Port 3003)
Important secondary workers that support content enrichment, LLM ingestion,
and editorial features. Pausing this service degrades quality but does not
stop the core pipeline.
- **Workers (14):** first-draft, notification, coverage, summarization, sentiment,
  embeddings, article-extraction, llm-ingestion, newscatcher, hyperlocal-intel,
  web-scraper, event-registry, news-director, account-story-sync

### worker-background (Port 3004)
Low-priority workers. Can be stopped entirely to save cost without visible impact.
- **Workers (23):** geocoding, credibility, rss-discovery, digest, push-notification,
  domain-scoring, audio-transcription, prediction, stock-monitor, public-data,
  shift-briefing, breaking-package, deadline-alert, beat-alert, court-record,
  community-radar, video-generation, engagement-tracking, social-monitor,
  story-research, story-splitter, similarweb-scoring, velocity-scorer

**Total: 41 workers** across 3 services. Each service has its own health endpoint
returning JSON with worker names, uptime, and memory usage.

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

## Connection Pooling

All 3 worker services use Prisma with connection_limit=20 per service (60 total DB connections).
Configured in worker/src/lib/prisma.ts — appends \`connection_limit=20&pool_timeout=30\`
to DATABASE_URL (or PGBOUNCER_URL if available). PgBouncer allows many more concurrent
workers on fewer actual DB connections.

## Core Pipeline Workers (worker-critical)

### 1. ingestion.worker.ts — Source Polling & Content Fetching
- Queue: ingestion, Concurrency: 10
- Fetches content from RSS feeds, Reddit, news APIs, Twitter, Facebook
- Dedup: platformPostId unique index prevents double-ingestion
- Content hash: SHA-256 hash dedup catches duplicate content from different URLs
- Self-healing: 10 strategies for failing sources (see below)
- Rotating pool of 12 real browser UAs (Chrome/Firefox/Safari/Edge across Win/Mac/Linux)
- HTTP caching: ETag/If-Modified-Since conditional fetch, content-hash skip
- Per-domain 3-second throttle via Redis (MIN_DOMAIN_INTERVAL_MS = 3000)
- Tracks consecutive failures; auto-deactivates at 10 (MAX_CONSECUTIVE_FAILURES)
- Self-healing triggers at failure 3 (HEAL_AT_FAILURE)
- Time-bounded polling: only fetches posts since source.lastPolledAt (or pollMaxAgeHours fallback)
- Per-source content filters: includeKeywords, excludeKeywords, includeHashtags,
  excludeHashtags, minScore (Reddit), minEngagement, requireImage
- Poll audit trail: logs every poll result to source.metadata.pollLog (last 48h / 100 entries)

### 2. enrichment.worker.ts — NLP Classification & Entity Extraction
- Queue: enrichment, Concurrency: 10
- Step 1: Keyword-based categorization (14 categories)
- Step 2: Regex entity extraction (people, organizations, locations)
- Step 3: Location extraction (neighborhoods, streets, cities)
- Step 4: LLM enrichment when heuristic returns OTHER or no location
  - Single call extracts: CATEGORY, LOCATION, ENTITIES, FAMOUS persons
  - Uses LLM factory fallback chain

### 3. clustering.worker.ts — Story Dedup & Aggregation
- Queue: clustering, Concurrency: 20 (safe due to shared in-memory cache)
- **Clustering cache:** shared in-memory cache of recent stories (non-ARCHIVED, last 24h),
  refreshed every 5 seconds. All concurrent clustering jobs share one cached snapshot,
  eliminating per-job queries that were the main bottleneck.
- Stage 0: Exact normalized title match → immediate merge (strips source attribution suffixes)
- Stage 1: Jaccard pre-filter (threshold 0.25) → top 5 candidates by combined score
  (0.6 × textSim + 0.2 × entitySim + 0.2 × timeProximity)
- Stage 2: Embedding similarity on top candidates (cosine on JSON embeddings)
  - >= 0.75 → merge into existing story
  - 0.60–0.75 → mark as related (linked as follow-up if parent is STALE/ONGOING/etc.)
  - Final score: 0.35 × combinedSimilarity + 0.65 × embeddingSim (when embeddings available)
- Fallback: legacy combined threshold 0.4 when no embedding match
- Content-hash dedup within story: skips same article from same source (prevents inflated counts)
- Writes entities to StoryEntity table (upsert, boost confidence on re-detection)
- Sets hasFamousPerson + famousPersonNames on new stories
- Auto-rewrite: if source has metadata.autoRewrite, queues a first-draft rewrite job

### 4. scoring.worker.ts — Score Calculation & Verification
- Queue: scoring, Concurrency: 5
- **Batch scoring optimization:** single DB fetch per story — story + all sources with
  engagement data in 1 query. All 5 scores calculated in-memory (no additional DB queries).
  This means ~100 stories scored with ~2 SQL queries total (one findUnique with includes,
  one raw UPDATE).
- Formula: compositeScore = 0.25×breaking + 0.20×trending + 0.15×confidence + 0.15×locality + 0.25×social
- Bonus scores (applied as separate UPDATE queries):
  - Propagation: +5-15% for stories spreading across 2-5+ distinct market locations
  - Audience affinity: up to +10% for stories matching the newsroom's most-covered categories
  - Pre-break velocity: up to +15% for accelerating source arrival in stories < 60 min old
- Breaking score: 0.40×velocity + 0.30×diversity + 0.30×recency (30-min half-life decay)
  - Velocity: posts per 15 min in last 30 min (3 posts = max)
  - Diversity: unique sources in 30-min window
  - Category decay curves: 14 category-specific multipliers at 15-min intervals
- Trending score: growth-percentage tracking (15-min and 60-min windows)
  - 0.40×growthScore + 0.30×engagementScore + 0.30×sourceCountScore
- Confidence: 0.4×sourceDiversity + 0.35×avgTrust + 0.25×platformDiversity
- Locality: location + neighborhood + landmark detection (0–1 scale)
- Social: 2×(shares+likes) + comments + sourceCount, normalized to /200
- Verification: 3+ unique sources + confidence >= 0.5 → VERIFIED; 2 sources → UNVERIFIED; 1 → SINGLE_SOURCE
- Status determination: 3-tier logic ported from TopicPulse
  - Tier 1 (< 15 min): absolute score thresholds (lower for local markets)
  - Tier 2 (15–60 min): growth + score hybrid, breaking retention logic
  - Tier 3 (> 60 min): growth-dominant with explicit decay (STALE after 48h)
  - Local vs national thresholds: HOT local=0.35 vs national=0.6
- Past scores snapshots stored in story.pastScores (last 2h, keyed by timestamp)

## Reddit Polling
- OAuth "script" app type: REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET
  - Requests oauth.reddit.com/r/{subreddit}/new?limit=25
  - Token cached in memory, refreshed 60s before expiry
  - Auto-retry on 401 (re-authenticates and retries once)
- Fallback: unauthenticated www.reddit.com/r/{sub}/new.json (works from residential IPs only)
- Each Reddit source has metadata.subreddits (array, typically ~13 subreddits per source)
- Time-bounded: only ingests posts since lastPolledAt (or pollMaxAgeHours, default 24h)
- Content filter applied per-post (minScore, includeKeywords, etc.)
- Polls every 5 minutes (same interval as RSS)

## Content Filters (Per-Source)
Stored in source.metadata.contentFilter. Applied during ingestion before creating SourcePost.
- includeKeywords: post must contain at least one keyword
- excludeKeywords: post must NOT contain any keyword
- includeHashtags / excludeHashtags: for Reddit flair and social hashtags
- minScore: Reddit minimum upvote score
- minEngagement: minimum likes+shares+comments
- requireImage: only posts with images

## Pipeline Self-Healing Monitor (pipeline-monitor.ts)
Runs inside worker-critical every 2 minutes (first cycle after 30s startup delay).
- Checks failure counts on all 4 core queues (ingestion, enrichment, clustering, scoring)
- Fetches up to 20 failed jobs per queue and deduplicates error messages
- **Auto-clears known stale code errors** (patterns already fixed in deployed code):
  - 'bestSourceText is not defined', timeout errors, schema mismatches, etc.
  - Clears entire failed set for the queue when a stale error is detected
- **Heals source-related errors** (HTTP 404/403, bot challenges, HTML-instead-of-RSS):
  - Triggers source self-healing for up to 5 unique sources per cycle
- **Skips rate limit errors** (auto-retry handles these)
- Logs all activity to Redis: tp:monitor:log (last 100 entries), tp:monitor:latest (current)
- Dashboard can display monitor status via these Redis keys

## Inactive Source Re-Scan
Runs every 2 hours inside the poll scheduler.
- Fetches up to 10 inactive RSS sources that were deactivated > 6 hours ago
- Sends a test HTTP request with browser UA
- If response is valid RSS/Atom XML, reactivates the source:
  - Sets isActive=true, consecutiveFailures=0, useBrowserUA=true
  - Records reactivatedAt and reactivationReason='auto-rescan' in metadata
- 1-second delay between checks (polite to target servers)

## Source Self-Healing (10 Strategies)
Triggers at failure 3 and failure 7 (HEAL_AT_FAILURE). Auto-deactivates at failure 10.
1. Proxy-to-direct URL mapping (rsshub.app → apnews.com direct RSS)
2. Browser UA + full headers (rotating pool of 12 UAs across Chrome/Firefox/Safari/Edge)
3. HTML-not-RSS detection → switch to web scraping (sets metadata.scrapeSource=true)
4. 9 RSS URL variants (/feed, /rss, /rss.xml, /atom.xml, etc.)
5. Protocol variants (www/non-www, https/http)
6. RSS auto-discovery from HTML <link rel="alternate"> tags
7. Switch to web scraping (last resort, queues to web-scraper worker)
8. Per-domain throttle (3s via Redis, key: throttle:{domain})
9. Redirect tracking (updates source URL on permanent redirects)
10. Bot challenge detection (Cloudflare, Akamai, PerimeterX, DataDome, Anubis, generic)
Audit log stored in source.metadata.failureLog[].

## Polling Schedule

| Source Type | Interval | Notes |
|------------|----------|-------|
| RSS feeds | 5 min | National always polls, local pauses when idle. Per-source override via metadata.pollIntervalMinutes |
| Reddit | 5 min | OAuth + fallback, ~13 subreddits per source |
| NewsAPI | 3 min | Pauses when idle |
| Twitter/X | 3 min | Pauses when idle |
| Facebook Pages | 5 min | Pauses when idle |
| Grok LLM (fast) | 5 min | Consolidated multi-market call (all markets in 1 API call) |
| Other LLMs | 10 min | OpenAI/Claude/Gemini, pauses when idle |
| Bing/Google News | 5 min | Dynamic per-market URLs, 1 source → N market polls |
| Event Registry | 15 min | Consolidated per-market, pauses when idle |
| Newscatcher | 10 min | Pauses when idle |
| HyperLocal Intel | 15 min | Batch lookup per account, 12 sources per market |
| Web scrapers | 30 min | For sites without RSS, pauses when idle |
| Article extraction | 5 min | Posts with URLs but no fullArticleText (last 1h) |
| Embeddings | 10 min | Skips already-embedded posts/stories |
| Summarization | 15 min | Stories with 3+ sources and no/stale aiSummary |
| Sentiment | 5 min | Recent posts without sentimentScore |
| Geocoding | 15 min | Stories with location but no coordinates |
| Score decay | 10 min | Re-scores all non-archived/non-stale stories |
| Credibility | 24 hours | Updates trust scores for all active sources |
| Digests | 5 min | Checks due digest subscriptions |
| Cleanup | 1 hour | Archives stories > 72h with no activity |
| Account story sync | 5 min | Syncs base story updates to account derivatives |
| News Director | 5 min | Proactive editorial intelligence alerts |
| Stock monitor | 30 min | During market hours |
| Inactive re-scan | 2 hours | Tests and reactivates dead sources |

## Idle Detection
- Frontend heartbeat → Redis key tp:last_ui_activity (timestamp)
- 6-minute timeout (IDLE_THRESHOLD_MS) → most polling stops (cost control)
- Exempt (always poll): National RSS, score decay, cleanup, embeddings, account sync, stock monitor
- Fail-open: if Redis is unavailable, assumes UI is active

## LLM Factory (Multi-Provider Fallback)
File: worker/src/lib/llm-factory.ts
- Default fallback chain: OpenAI (gpt-4o-mini) → Anthropic (claude-sonnet-4-6) → xAI (grok-3-mini) → Google (gemini-2.0-flash)
- generate(prompt, opts, preferredProvider?) — tries chain in order, returns first success
- generateWith(provider, prompt, opts) — single provider, no fallback
- Each provider uses direct fetch() calls to their respective APIs
- Used by: enrichment, summarization, NLP search, chatbot, verification, broadcast packages,
  first-draft, story-splitter, video-generation, shift-briefing, story-research, breaking-package

## Source Management
- SourceMarket M:N join table (not legacy Source.marketId FK)
- Consolidated sources: 1 Bing/Google/ER/Grok source → dynamic per-market polls
- fix-source-markets: auto-links sources to markets by name matching
- consolidate-news-sources: merges per-market duplicates

## Key Pipeline Endpoints
- POST /pipeline/trigger — force ingestion for a source
- POST /pipeline/run-queue — force run a specific queue (e.g., {"queue":"scoring"})
- POST /pipeline/clear-failed — clear failed jobs from a queue
- POST /pipeline/heal-source/:id — trigger self-healing for a single source
- POST /pipeline/heal-sources — bulk self-heal all failing sources
- POST /pipeline/fix-source-markets — create missing tables + link sources to markets
- POST /pipeline/consolidate-news-sources — merge per-market duplicate sources
- POST /pipeline/backfill-famous — detect famous persons in existing stories
- POST /broadcast-package/generate — one-click multi-format content
- POST /stories/:id/verify — LLM dual-check verification
`.trim();
}
