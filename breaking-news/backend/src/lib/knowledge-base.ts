/**
 * Auto-generated RAG knowledge base for the TopicPulse AI system.
 * Composed of four documents:
 *   1. Schema & Platform Reference (this file)
 *   2. Chatbot Operations Guide (knowledge-chatbot-ops.ts)
 *   3. Backend Services Architecture (knowledge-backend-services.ts)
 *   4. End-User Help Guide (knowledge-user-help.ts)
 *
 * All four are stored in the SystemKnowledge table via /admin/knowledge/generate.
 * The chatbot loads relevant sections from the DB at runtime.
 */

import { generateChatbotOpsKnowledge } from './knowledge-chatbot-ops.js';
import { generateBackendServicesKnowledge } from './knowledge-backend-services.js';
import { generateUserHelpKnowledge } from './knowledge-user-help.js';

/**
 * Generate the schema & platform reference document.
 * This is the original knowledge base document covering data model, API endpoints,
 * Prisma schema fields, and basic how-to guide.
 */
export function generateSystemKnowledge(): string {
  return `
# TopicPulse Platform Knowledge Base

## System Overview
TopicPulse is a broadcast newsroom intelligence platform that ingests news from 700+ sources,
clusters them into stories, scores them for breaking/trending potential, and helps newsroom
editors decide what to cover. It serves TV stations, radio stations, and digital newsrooms.

## Data Model

### Story (the core entity)
- id: unique identifier (cuid)
- title: headline text
- summary: human-written or extracted summary
- aiSummary: LLM-generated canonical summary
- category: one of CRIME, POLITICS, WEATHER, TRAFFIC, BUSINESS, HEALTH, SPORTS, ENTERTAINMENT, TECHNOLOGY, EDUCATION, COMMUNITY, ENVIRONMENT, EMERGENCY, or null
- status: one of ALERT, BREAKING, DEVELOPING, TOP_STORY, ONGOING, FOLLOW_UP, STALE, ARCHIVED
- locationName: city, county, neighborhood, or "National"
- neighborhood: specific neighborhood within a market
- breakingScore: 0-1, measures source velocity and recency
- trendingScore: 0-1, measures growth rate over time
- confidenceScore: 0-1, measures source diversity and trust
- localityScore: 0-1, measures relevance to local markets
- compositeScore: 0-1, weighted blend of all scores (25% breaking, 20% trending, 15% confidence, 15% locality, 25% social)
- sourceCount: number of unique sources reporting this story
- firstSeenAt: when the story was first detected
- lastUpdatedAt: when new information was last added

### Status Lifecycle
Stories progress through statuses based on scoring:
- ALERT → BREAKING → DEVELOPING → TOP_STORY → ONGOING → FOLLOW_UP → STALE → ARCHIVED
- BREAKING: high velocity (3+ sources in 15 min) or high breaking score (>0.6 national, >0.35 local)
- TOP_STORY: high trending score with sustained growth
- DEVELOPING: new story, still accumulating sources
- ONGOING: established story, no longer growing rapidly
- STALE: no new sources for 48+ hours
- Local market stories have LOWER thresholds (easier to surface)

### Scoring Formula
compositeScore = 0.25×breakingScore + 0.20×trendingScore + 0.15×confidenceScore + 0.15×localityScore + 0.25×socialScore

Breaking score factors: source velocity (posts per 15 min), source diversity (unique sources), recency (exponential decay), category decay curve
Trending score factors: growth percentage (current vs past), engagement (likes+shares+comments), source count
Social score: 2×(shares+likes) + comments + sourceCount, normalized to 0-1

### Source
- id, name, platform, url, trustScore (0-1), isActive, lastPolledAt
- platform: one of RSS, REDDIT, NEWSAPI, NEWSCATCHER, TWITTER, FACEBOOK, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, PERIGON, MANUAL
- Sources are linked to markets via SourceMarket join table (M:N)
- A source can serve multiple markets (e.g., AP News serves all)
- metadata JSON can contain content filter and polling settings:
  - contentFilter.includeKeywords: string[] — post must contain at least one keyword (case-insensitive)
  - contentFilter.excludeKeywords: string[] — post must NOT contain any keyword
  - contentFilter.minScore: number — minimum engagement score threshold
  - pollIntervalMinutes: number — per-source poll interval (default 5 min). The scheduler checks this to skip sources polled recently.
  - autoRewrite: boolean — when true, new stories from this source are auto-rewritten via LLM after clustering
  - displaySourceName: string — overrides source attribution in auto-rewritten summaries (e.g., "Staff Report")

### Market
- id, name, state, slug, latitude, longitude, radiusKm, keywords[], neighborhoods[]
- country: ISO 3166-1 alpha-2 code (default "US"). Supports international markets: US, CA, GB, AU, DE, FR, JP, etc.
- language: ISO 639-1 code (default "en"). Controls feed language selection and AI content generation language.
- region: broader geographic grouping (e.g., "North America", "Europe", "Asia-Pacific", "Latin America")
- "National" is a market (not a flag)
- Market hierarchy: USA National + 50 US MSAs, Canada National, UK National, Australia National, Global/World News
- Markets have TV stations, radio stations, Google/Bing local feeds, Twitter searches, HyperLocal Intel
- Only sources linked to ACTIVE markets get polled
- Users only see stories matching their account's paid markets

### AccountStory (Copy-on-Write Derivative)
- When a user takes any action on a story (edit, assign, note, AI draft), a private derivative is created
- The derivative stays linked to the base story and receives upstream updates
- Account-private: editedTitle, editedSummary, notes, accountStatus, assignedTo, aiDrafts, aiScripts, aiVideos, research
- accountStatus: customizable per-tenant workflow stages (default: LEAD → ASSIGNED → IN_PROGRESS → DRAFT_READY → EDITOR_REVIEW → APPROVED → PUBLISHED → KILLED)

### WorkflowStage (Per-Tenant Customizable)
- Each account defines their own editorial pipeline stages
- Default 8 stages auto-seeded on first access
- Each stage has: name, slug, order, color, icon, requiredRole, isInitial, isFinal
- Stage transitions enforce role-based permissions (VIEWER → EDITOR → ADMIN → OWNER)

### Story Verification
- verificationStatus: UNVERIFIED, VERIFIED, SINGLE_SOURCE, DISPUTED
- VERIFIED: 3+ independent sources with confidence >= 0.5
- SINGLE_SOURCE: only 1 source reporting
- verificationScore: 0-1 confidence in story accuracy
- Blue checkmark icon (✓) for VERIFIED, orange warning (⚠) for SINGLE_SOURCE

### Famous Person Detection
- hasFamousPerson: boolean flag on stories mentioning notable public figures
- famousPersonNames: JSON array of detected names (e.g., ["Donald Trump", "Tiger Woods"])
- Yellow star icon (⭐) on dashboard when detected
- Detected via LLM during enrichment

### Story Entities (NER)
- StoryEntity table links stories to named entities (PERSON, ORGANIZATION, LOCATION, EVENT)
- Used for "Related Stories" feature: find stories sharing 2+ entities
- Extracted by LLM during enrichment, stored with confidence score

### Published Content
- Tracks multi-platform publishing: WordPress, Twitter, Facebook, LinkedIn, TikTok, YouTube, custom webhook
- Scheduling support: publish now or schedule for later
- RSS feed output: GET /workflow/feed/:accountSlug/published.xml

### Audio Spots
- OpenAI TTS-generated audio spots for stories
- 6 voices: alloy, echo, fable, onyx, nova, shimmer
- Formats: 15s, 30s, 60s, full

### Innovative Scoring Features
- Story Propagation: +5-15% composite boost when story spreads across 2+ markets
- Audience-Aware: up to +10% boost for stories matching newsroom's most-covered categories
- Pre-Break Detection: up to +15% boost for stories < 60 min old with accelerating source velocity
- AI News Director: proactive alerts every 5 min for uncovered high-score stories, famous person stories, spreading stories

## API Endpoints

### Stories
- GET /api/v1/stories — list stories with filters (status, category, sourceIds, marketIds, nlp, trend, minScore, maxAge, sort, order, limit, offset)
- GET /api/v1/stories/:id — story detail with sources
- GET /api/v1/stories/sources — list sources with story counts

### Account Stories
- POST /api/v1/account-stories/:baseStoryId/activate — create derivative
- PATCH /api/v1/account-stories/:baseStoryId — update derivative (lazy create)
- POST /api/v1/account-stories/:baseStoryId/ai-draft — add AI content
- POST /api/v1/account-stories/:baseStoryId/research — add research

### Sources
- GET /api/v1/admin/sources — list with filters (platform, search, isActive)
- POST /api/v1/admin/sources — create source
- PATCH /api/v1/admin/sources/:id — update source
- DELETE /api/v1/admin/sources/:id — delete with cascade
- POST /api/v1/admin/sources/bulk — bulk activate/deactivate/delete/assign_markets

### Markets
- GET /api/v1/admin/markets — list markets (OWNER sees all)
- POST /api/v1/admin/markets — create market
- POST /api/v1/admin/markets/seed — seed all 50 US MSA markets + stations
- PATCH /api/v1/admin/markets/:id — update market

### Pipeline
- GET /api/v1/pipeline/status — queue status (ingestion, enrichment, clustering, scoring)
- POST /api/v1/pipeline/trigger — force ingestion (max 24h lookback)
- POST /api/v1/pipeline/run-queue — force run a specific queue
- POST /api/v1/pipeline/clear-failed — clear failed jobs
- POST /api/v1/pipeline/clear-all — obliterate all jobs from a queue
- POST /api/v1/pipeline/poll-source/:id — poll single source now
- POST /api/v1/pipeline/cleanup-sources — deduplicate sources
- GET /api/v1/pipeline/monitor — self-healing monitor activity log (latest run + last 50 log entries from Redis)
- GET /api/v1/pipeline/source-health — source health report (total/active/inactive/neverPolled/failing counts + problem sources list)
- POST /api/v1/pipeline/seed-national — create a national market for any country (body: { country: "CA"|"GB"|"AU"|"GLOBAL", name?: string }). Pre-configured feeds for Canada, UK, Australia, and Global/World News.
- POST /api/v1/pipeline/seed-toronto — create Toronto market with Reddit + RSS sources for Canadian local news

### Content Generation
- POST /api/v1/conversation-starters/generate — AI discussion prompts (radio_talk, tv_anchor, podcast, social_engagement)
- POST /api/v1/first-drafts — generate AI story draft
- GET/PUT /api/v1/voice-tone — per-account AI voice/tone settings

### Moderation
- GET /api/v1/moderation/queue — stories pending review
- POST /api/v1/moderation/:storyId/approve|reject|flag
- GET/POST/DELETE /api/v1/moderation/words — blacklist/flag words
- GET/POST /api/v1/moderation/algorithm — scoring threshold tuning

### Knowledge Base
- GET /api/v1/admin/knowledge — list all knowledge documents
- POST /api/v1/admin/knowledge — add or update a document (key, content, category)
- DELETE /api/v1/admin/knowledge/:id — delete a document
- POST /api/v1/admin/knowledge/generate — auto-generate all schema docs

### Workflow
- GET /api/v1/workflow/stages — list workflow stages for account (auto-seeds defaults)
- PUT /api/v1/workflow/stages — replace all stages (workflow builder)
- POST /api/v1/workflow/transition — move story between stages (role-checked)
- GET/POST /api/v1/workflow/comments/:accountStoryId — editorial comment thread
- POST /api/v1/workflow/audio — generate TTS audio spot via OpenAI
- GET /api/v1/workflow/audio/:accountStoryId — list audio spots
- POST /api/v1/workflow/publish — publish to external platform (Twitter, Facebook, etc.)
- GET /api/v1/workflow/published/:accountStoryId — list published content
- GET /api/v1/workflow/publish-queue — pending/scheduled publish jobs
- GET /api/v1/workflow/feed/:accountSlug/published.xml — public RSS feed

### Broadcast Package
- POST /api/v1/broadcast-package/generate — one-click multi-format content generation
  Formats: tv_30s, tv_60s, radio_30s, radio_60s, web_article, social_post, social_thread, push_notification

### Story Verification & Entities
- POST /api/v1/stories/:id/verify — LLM dual-check verification (OpenAI + Grok)
- GET /api/v1/stories/:id/related — find stories sharing 2+ entities

### User Settings
- PATCH /api/v1/user/settings/profile — update name, phone, timezone
- POST /api/v1/user/settings/password — change password
- GET /api/v1/user/settings/access — see accounts, roles, markets
- GET/POST/PUT/DELETE /api/v1/user/views — saved dashboard views
- GET/POST/PATCH/DELETE /api/v1/user/subscriptions — email alert subscriptions
- GET /api/v1/user/ticker — get ticker scroll settings (speed 1-10, viewId)
- PUT /api/v1/user/ticker — save ticker scroll settings (body: { speed?: number, viewId?: string|null })

## Market Filter Logic
When a market is selected (e.g., Houston), stories are filtered by:
- Exact match on locationName against market name, state
- Exact match against multi-word keywords (e.g., "harris county", "fort bend county")
- Exact match against long neighborhoods (e.g., "montrose", "the woodlands")
- Contains match only for the primary market name (e.g., "houston")
- Single-word keywords under 6 characters are excluded to prevent false positives
- "National" stories only show when National market is explicitly selected

## 50 US MSA Markets
New York, Los Angeles, Chicago, Dallas-Fort Worth, Houston, Washington DC, Philadelphia,
Miami, Atlanta, Boston, Phoenix, San Francisco, Riverside, Detroit, Seattle, Minneapolis,
San Diego, Tampa, Denver, St. Louis, Baltimore, Orlando, Charlotte, San Antonio, Portland,
Sacramento, Pittsburgh, Las Vegas, Austin, Cincinnati, Kansas City, Columbus, Indianapolis,
Cleveland, San Jose, Nashville, Virginia Beach, Providence, Milwaukee, Jacksonville,
Oklahoma City, Raleigh, Memphis, Richmond, Louisville, New Orleans, Salt Lake City,
Hartford, Birmingham, Buffalo

## International Market Support
TopicPulse supports international markets beyond the 50 US MSAs:
- **USA National**: Covers all US national news (AP, Reuters, NPR, CNN, Fox News, etc.)
- **Canada National**: CBC, CTV, Global News, National Post, Globe and Mail, Canadian Press
- **UK National**: BBC, The Guardian, Sky News
- **Australia National**: ABC Australia, Sydney Morning Herald
- **Global / World News**: Reuters, BBC World, Al Jazeera, AP, NPR World, France 24, DW News
- **Toronto**: Local Canadian market with Reddit (r/toronto, r/ontario) + local RSS feeds
- Each market has country (ISO alpha-2), language (ISO 639-1), and optional region fields
- Seed endpoints: POST /pipeline/seed-national (country code) and POST /pipeline/seed-toronto

## Batch Scoring Optimization
The scoring worker uses a batch collection strategy for efficiency:
- Individual scoring jobs are accumulated for 150ms before processing
- All collected jobs are scored in a single batch operation (processBatchScoring)
- Batch scoring reads all story data at once, computes scores in parallel, then writes all updates in a single transaction
- This reduces database round-trips from N queries to 2 (one read, one write) per batch
- Falls back to individual scoring if batch processing fails

## Content Filter Enforcement
Sources can have per-source content filters in their metadata (metadata.contentFilter):
- includeKeywords: post must contain at least one keyword to be ingested
- excludeKeywords: post must NOT contain any keyword to be ingested
- Applied during ingestion before SourcePost creation
- **Duplicate URL rule**: When a source URL is already used by another source, adding it to a local market REQUIRES a content filter with includeKeywords. National/Global markets are exempt. This prevents the same feed from polluting local markets with irrelevant stories.

## Prisma Schema — Exact Field Names

### Story Fields
id (String cuid), marketId (String?), title (String), summary (String? Text), aiSummary (String? Text),
aiSummaryModel (String?), aiSummaryAt (DateTime?), category (String?), locationName (String?),
latitude (Float?), longitude (Float?), neighborhood (String?), geocodedAt (DateTime?),
breakingScore (Float default 0), trendingScore (Float default 0), confidenceScore (Float default 0),
localityScore (Float default 0), compositeScore (Float default 0), sentimentScore (Float?),
sentimentLabel (String?), credibilityScore (Float?), editedTitle (String?), editedSummary (String? Text),
editedBy (String?), editedAt (DateTime?), reviewStatus (String? default UNREVIEWED),
topicId (Int?), topicLabel (String?), status (StoryStatus default DEVELOPING),
editorialOverride (Boolean default false), statusChangedAt (DateTime), horizon (String default BREAKING),
parentStoryId (String?), sourceCount (Int default 0), firstSeenAt (DateTime), lastUpdatedAt (DateTime),
mergedIntoId (String?), pastScores (Json?), peakBreakingScore (Float default 0), peakStatus (String?).

### Source Fields
id (String cuid), platform (Platform enum), sourceType (SourceType enum), name (String), url (String?),
platformId (String?), trustScore (Float default 0.5), isActive (Boolean default true),
isGlobal (Boolean default false — DEPRECATED), marketId (String?), metadata (Json?),
lastPolledAt (DateTime?).

### Market Fields
id (String cuid), accountId (String), name (String), slug (String), state (String?),
country (String default "US" — ISO 3166-1 alpha-2), language (String default "en" — ISO 639-1),
region (String? — "North America", "Europe", "Asia-Pacific", "Latin America"),
latitude (Float), longitude (Float), radiusKm (Float default 80), timezone (String),
isActive (Boolean default true), keywords (Json — string array), neighborhoods (Json — string array).

### AccountStory Fields
id (String cuid), accountId (String), baseStoryId (String), editedTitle (String?),
editedSummary (String? Text), notes (String? Text), editedBy (String?), editedAt (DateTime?),
accountStatus (String default INBOX), assignedTo (String?), assignedAt (DateTime?),
coveredAt (DateTime?), coverageFeedId (String?), aiDrafts (Json?), aiScripts (Json?),
aiVideos (Json?), research (Json?), tags (Json?), lastSyncedAt (DateTime), baseSnapshotAt (DateTime?).

### ToolAnalytics Fields
id (String cuid), tool (String — tool name e.g. search_stories, heal_source), args (Json?),
userId (String), role (String — user role at time of call), durationMs (Int — execution time),
success (Boolean default true), error (String?), cached (Boolean default false), createdAt (DateTime).

### UserTickerSettings (raw SQL table, not in Prisma schema)
userId (TEXT PRIMARY KEY), speed (INTEGER default 7 — scroll speed 1-10),
viewId (TEXT? — saved view to filter ticker), updatedAt (TIMESTAMP).

### Enums
Platform: FACEBOOK, TWITTER, RSS, REDDIT, NEWSAPI, NEWSCATCHER, PERIGON, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL
SourceType: NEWS_ORG, GOV_AGENCY, PUBLIC_PAGE, RSS_FEED, API_PROVIDER, LLM_PROVIDER
StoryStatus: ALERT, BREAKING, DEVELOPING, TOP_STORY, ONGOING, FOLLOW_UP, STALE, ARCHIVED

## API Parameter Schemas (Zod Validation)

### GET /api/v1/stories
- status: string (comma-separated StoryStatus values)
- category: string (comma-separated category names)
- sourceIds: string (comma-separated source IDs)
- marketIds: string (comma-separated market IDs, use __national__ for National)
- nlp: string (natural language query, parsed by AI into structured filters)
- uncoveredOnly: boolean
- trend: "rising" | "declining" | "all"
- minScore: number 0-1
- maxAge: number (hours, supports decimals: 0.25 = 15min)
- limit: number 1-200 (default 50)
- offset: number (default 0)
- sort: "compositeScore" | "breakingScore" | "trendingScore" | "firstSeenAt" | "lastUpdatedAt" | "sourceCount"
- order: "asc" | "desc" (default desc)
`.trim();
}

/**
 * Get all four knowledge documents as an array of { key, content, category } objects.
 * Used by the /admin/knowledge/generate endpoint to populate the SystemKnowledge table.
 */
export function generateAllKnowledgeDocs(): Array<{ key: string; content: string; category: string }> {
  return [
    {
      key: 'schema_platform_reference',
      content: generateSystemKnowledge(),
      category: 'schema',
    },
    {
      key: 'chatbot_operations_guide',
      content: generateChatbotOpsKnowledge(),
      category: 'operations',
    },
    {
      key: 'backend_services_architecture',
      content: generateBackendServicesKnowledge(),
      category: 'architecture',
    },
    {
      key: 'end_user_help_guide',
      content: generateUserHelpKnowledge(),
      category: 'help',
    },
  ];
}

/**
 * Get a compact version for injection into shorter prompts (NLP search).
 */
export function getCompactKnowledge(): string {
  return `
TopicPulse: newsroom intelligence platform. 700+ sources, 50 US markets.

Stories have: title, category (CRIME/POLITICS/WEATHER/TRAFFIC/BUSINESS/HEALTH/SPORTS/ENTERTAINMENT/TECHNOLOGY/EDUCATION/COMMUNITY/ENVIRONMENT/EMERGENCY), status (BREAKING/DEVELOPING/TOP_STORY/ONGOING/STALE/ARCHIVED), locationName, compositeScore (0-1), sourceCount, firstSeenAt.

Filter params: status (comma-sep), category (comma-sep), marketIds (comma-sep), maxAge (hours, supports decimals like 0.25 for 15min), minScore (0-1), trend (rising/declining), sort (compositeScore/breakingScore/trendingScore/firstSeenAt), order (asc/desc).

Markets: National + 50 US cities. Local stories have lower scoring thresholds.
`.trim();
}
