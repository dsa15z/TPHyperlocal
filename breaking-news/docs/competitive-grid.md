# Competitive Feature Grid: TPHyperlocal vs TopicPulse vs World's Best Newsroom

## Summary

| Status | Count | % |
|--------|-------|---|
| **Built** (API + UI) | 58 | 47% |
| **API Only** (backend, no UI) | 8 | 6% |
| **Schema Only** (DB model, no code) | 24 | 20% |
| **Not Built** | 34 | 27% |
| **TOTAL** | **124** | |

## Critical Gaps (Must-Have, Not Built)

| Feature | Category | Impact | Effort |
|---------|----------|--------|--------|
| Firebase Push Notifications | Distribution | HIGH - editors need mobile alerts for ALERT/BREAKING | M - Device model ready, need FCM worker |
| Analytics Dashboard | Analytics | HIGH - editors can't see story performance | L - StoryAnalytics model ready, need UI |
| Elasticsearch Integration | Search | HIGH - ILIKE search won't scale | L - needs OpenSearch service + indexer worker |
| Redis Cache Layer | Performance | MEDIUM - every API call hits DB | S - wrap existing Redis connection |
| In-App Notification Center | Distribution | MEDIUM - no way to see alerts in the app | M - Notification model exists |
| Real-Time WebSocket Updates | UX | MEDIUM - 30s polling is sluggish for breaking news | M - add Socket.io or SSE |
| Story Performance Reports | Analytics | MEDIUM - no editorial reporting | M - need scheduled report generation |
| Domain Authority Scoring | Scoring | MEDIUM - no source reliability ranking | S - DomainScore model ready |
| Talking Points Generation | Broadcast | MEDIUM - show prep rundowns lack AI content | S - add to FirstDraft worker |
| Drag-and-Drop Rundown Editor | UX | LOW - show prep needs better UX | M |

## Where We Win vs TopicPulse

| Advantage | Why It Matters |
|-----------|---------------|
| 8-state editorial model (ALERT→ARCHIVED) | Matches how journalists actually think, not developer abstractions |
| 30-min breaking windows (vs 2h) | 6x faster detection for hyperlocal |
| Category-specific decay curves | Crime decays fast, weather sustains — matches real news cycles |
| Coverage gap detection | Unique: "show me what my newsroom missed" |
| Multi-LLM factory with fallback | Not locked to one AI provider |
| Modern TypeScript stack | vs TopicPulse's PHP monolith |
| Dual-horizon scoring | Breaking (fast) + Trending (slow) in one system |

## Where TopicPulse Still Wins

| Feature | Why It Matters |
|---------|---------------|
| Elasticsearch/OpenSearch | Powerful search across millions of articles |
| Video ecosystem (Vimeo/Wibbitz) | Auto-generated video from stories |
| RadioGPT | AI radio show content generation |
| Enterprise SSO/SAML | Required for large newsroom deployments |
| NetSuite/ERP integration | Enterprise billing and customer management |
| Read replicas | Database scaling for high-traffic |
| Mature analytics dashboards | Years of iteration on editorial reporting |
| Production-hardened at scale | Running in production across many stations |

## Features Neither Platform Has (Differentiators to Build)

| Feature | Why It's a Game-Changer |
|---------|------------------------|
| Real-time WebSocket story feed | Breaking news editors need sub-second updates |
| AI story clustering with explanation | "Why were these stories grouped?" |
| Competitive coverage comparison | Compare your coverage against rival newsrooms |
| Geo-fenced push alerts | "Alert me only for stories within 5 miles" |
| Story prediction scoring | "This story has 80% chance of going viral" |
| Multi-language news monitoring | Monitor Spanish-language Houston sources |
| Audio transcription (Whisper) | Ingest police scanner, press conferences |
| Collaborative story annotations | Editors leave notes/tags for each other on stories |
| Custom dashboards per role | Anchor sees different view than assignment editor |
| Story timeline visualization | Visual timeline of how a story developed |
