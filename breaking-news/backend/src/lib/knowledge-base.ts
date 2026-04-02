/**
 * Auto-generated RAG knowledge base for the TopicPulse AI system.
 * This document is injected into LLM system prompts to make the
 * NLP search and chatbot understand the entire platform.
 *
 * Regenerate by calling: generateSystemKnowledge()
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
- platform: one of RSS, NEWSAPI, NEWSCATCHER, TWITTER, FACEBOOK, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL
- Sources are linked to markets via SourceMarket join table (M:N)
- A source can serve multiple markets (e.g., AP News serves all)

### Market
- id, name, state, slug, latitude, longitude, radiusKm, keywords[], neighborhoods[]
- "National" is a market (not a flag)
- Markets have TV stations, radio stations, Google/Bing local feeds, Twitter searches, HyperLocal Intel
- Only sources linked to ACTIVE markets get polled
- Users only see stories matching their account's paid markets

### AccountStory (Copy-on-Write Derivative)
- When a user takes any action on a story (edit, assign, note, AI draft), a private derivative is created
- The derivative stays linked to the base story and receives upstream updates
- Account-private: editedTitle, editedSummary, notes, accountStatus, assignedTo, aiDrafts, aiScripts, aiVideos, research
- accountStatus: INBOX → ASSIGNED → IN_PROGRESS → DRAFT_READY → PUBLISHED → KILLED

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
- POST /api/v1/pipeline/poll-source/:id — poll single source now
- POST /api/v1/pipeline/cleanup-sources — deduplicate sources

### Content Generation
- POST /api/v1/conversation-starters/generate — AI discussion prompts (radio_talk, tv_anchor, podcast, social_engagement)
- POST /api/v1/first-drafts — generate AI story draft
- GET/PUT /api/v1/voice-tone — per-account AI voice/tone settings

### Moderation
- GET /api/v1/moderation/queue — stories pending review
- POST /api/v1/moderation/:storyId/approve|reject|flag
- GET/POST/DELETE /api/v1/moderation/words — blacklist/flag words
- GET/POST /api/v1/moderation/algorithm — scoring threshold tuning

### User Settings
- PATCH /api/v1/user/settings/profile — update name, phone, timezone
- POST /api/v1/user/settings/password — change password
- GET /api/v1/user/settings/access — see accounts, roles, markets
- GET/POST/PUT/DELETE /api/v1/user/views — saved dashboard views
- GET/POST/PATCH/DELETE /api/v1/user/subscriptions — email alert subscriptions

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

## Source Types
- RSS Feed: polls RSS/Atom URLs for articles
- API (News): Event Registry, HyperLocal Intel, Newscatcher
- Twitter/X: search API v2 for keywords per market
- Facebook: Graph API page monitoring
- GDELT: free global event validation
- AI (OpenAI/Grok/Gemini): LLM-generated news analysis
- Manual: manually submitted stories

## User Roles
- OWNER: full access, can modify algorithm, manage all accounts
- ADMIN: manage sources, markets, users, moderation
- EDITOR: assign stories, generate content, moderate
- VIEWER: read-only access to stories matching their markets

## Key Business Rules
1. Stories are shared globally — all accounts see the same base data
2. Account actions (edit, assign, AI draft) create private derivatives
3. Sources only poll when their markets have active accounts
4. Workers pause when no UI activity for 6 minutes (cost control)
5. Breaking detection: 3+ sources in 15 min OR breaking score > threshold
6. Local markets use lower scoring thresholds than national
7. Social engagement boosts breaking (+15%) and trending (+20%)
8. Score snapshots stored for growth percentage calculation
9. NLP search: natural language queries parsed into structured filters
10. Views can be saved with NLP prompts and subscribed to for email delivery


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
latitude (Float), longitude (Float), radiusKm (Float default 80), timezone (String),
isActive (Boolean default true), keywords (Json — string array), neighborhoods (Json — string array).

### AccountStory Fields
id (String cuid), accountId (String), baseStoryId (String), editedTitle (String?),
editedSummary (String? Text), notes (String? Text), editedBy (String?), editedAt (DateTime?),
accountStatus (String default INBOX), assignedTo (String?), assignedAt (DateTime?),
coveredAt (DateTime?), coverageFeedId (String?), aiDrafts (Json?), aiScripts (Json?),
aiVideos (Json?), research (Json?), tags (Json?), lastSyncedAt (DateTime), baseSnapshotAt (DateTime?).

### Enums
Platform: FACEBOOK, TWITTER, RSS, NEWSAPI, NEWSCATCHER, PERIGON, GDELT, LLM_OPENAI, LLM_CLAUDE, LLM_GROK, LLM_GEMINI, MANUAL
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

### POST /api/v1/admin/sources
- platform: Platform enum value (required)
- sourceType: SourceType enum value (required)
- name: string 1-255 (required)
- url: string URL (optional)
- marketId: string (optional, legacy single market)
- marketIds: string array (optional, M:N via SourceMarket)
- trustScore: number 0-1 (default 0.5)

### POST /api/v1/admin/markets
- name: string 1-255 (required)
- slug: string 2-64 lowercase-hyphenated (required)
- state: string max 10 (optional)
- latitude: number -90 to 90
- longitude: number -180 to 180
- radiusKm: number 1-500 (default 80)
- timezone: string (default America/Chicago)
- keywords: string array (optional)
- neighborhoods: string array (optional)

## User How-To Guide

### How do I find breaking stories?
Use the Stories page. Set the status filter to "BREAKING" or type "show me breaking news" in the search bar.

### How do I filter by market?
Use the "All Markets" dropdown on the Stories page. Select your market (e.g., Houston, TX). Only stories matching that market's location, keywords, and neighborhoods will show. Add "National" to also see national stories.

### How do I save a view?
Set up your filters (market, category, time range, etc.) and/or type an NLP query. Click the "Save" button next to the view name. Give it a name like "Houston Crime Watch". The view saves all your filter settings including the NLP prompt.

### How do I get email alerts?
Go to My Profile (click your avatar top-right) → Email Alerts tab. Click "Subscribe", select a saved view, enter your email, choose frequency (hourly/daily/weekly), and set max stories per email.

### How do I add a source?
Go to Sources & Data → Data Feeds. Click "+ Add Source". Choose the source type (RSS Feed, API, Twitter, etc.), enter the URL, assign to one or more markets, and save. Click the ▶ button to test-poll it immediately.

### How do I create a market?
Go to Sources & Data → Markets. Click "+ Add Market" or click "Sync All 50 Markets" to import all US MSA markets with pre-configured TV/radio stations.

### How do I assign a story to a reporter?
Open a story detail page. Use the "Your Workspace" bar at the top to change the status to "ASSIGNED" and set the assignedTo field. Or use the AI chatbot: "assign this story to John".

### How do I generate AI content?
Open a story detail page. Use the First Draft panel to generate TV scripts, web stories, social posts, or radio scripts. The AI uses your account's voice/tone settings (configurable in AI & Content → AI Config).

### How do I use the AI chatbot?
Click the blue bot icon (bottom-right) or press Cmd+K. Ask anything: "What's breaking?", "Show me Houston crime", "Clear failed jobs", "How many sources are active?". The chatbot can search stories, manage sources, explain scores, and navigate you to any page.

### How do I change my password?
Click your profile icon (top-right) → My Profile → Password tab.

### How does scoring work?
Each story gets 5 scores (0-100): Breaking (source velocity), Trending (growth rate), Confidence (source trust), Locality (market relevance), Social (engagement). The composite score blends these. Local market stories have lower thresholds to surface faster.

### What does each status mean?
BREAKING: urgent, high-velocity story. DEVELOPING: new, still gathering sources. TOP_STORY: popular, strong growth. ONGOING: established, not growing fast. STALE: no new activity. ARCHIVED: old/removed. ALERT: critical emergency.
`.trim();
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
