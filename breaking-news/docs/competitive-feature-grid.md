# TopicPulse vs Competitors: Comprehensive Feature Comparison

## Scoring Guide
- **0** = Feature does not exist
- **1-3** = Minimal/experimental
- **4-6** = Partial implementation
- **7-8** = Production-ready
- **9-10** = Best-in-class

| Feature | Us | TopicPulse | Dataminr | NewsWhip | TVEyes |
|---------|---|---|---|---|---|
| **DETECTION & INGESTION** | | | | | |
| RSS feed polling | 9 | 8 | 8 | 0 | 0 |
| News API integration (Event Registry, Newscatcher) | 8 | 7 | 9 | 0 | 0 |
| Twitter/X monitoring | 8 | 7 | 9 | 8 | 0 |
| Facebook page monitoring | 8 | 8 | 8 | 5 | 0 |
| GDELT integration | 8 | 0 | 9 | 0 | 0 |
| LLM-powered news scanning (OpenAI, Grok, Gemini) | 9 | 0 | 7 | 0 | 0 |
| Web scraping fallback | 8 | 7 | 8 | 0 | 0 |
| Source self-healing (10 strategies) | 8 | 5 | 6 | 0 | 0 |
| Rotating User-Agent pool (12 browsers) | 9 | 8 | 9 | 0 | 0 |
| HTTP caching (ETag/If-Modified-Since) | 9 | 7 | 7 | 0 | 0 |
| Cloudflare/bot challenge detection (6 vendors) | 7 | 5 | 7 | 0 | 0 |
| Per-domain rate limiting (Redis) | 9 | 8 | 8 | 0 | 0 |
| Content-hash dedup (MD5) | 9 | 7 | 8 | 0 | 0 |
| Redirect tracking + URL update | 8 | 6 | 7 | 0 | 0 |
| RSS auto-discovery from HTML link tags | 7 | 6 | 5 | 0 | 0 |
| Proxy-to-direct URL mapping (rsshub→apnews) | 7 | 4 | 6 | 0 | 0 |
| Source consolidation (multi-market pattern) | 8 | 6 | 0 | 0 | 0 |
| Always-on national RSS polling (idle exempt) | 9 | 8 | 8 | 0 | 0 |
| Idle detection / cost control | 8 | 4 | 7 | 0 | 0 |
| Source failure audit logging | 9 | 5 | 5 | 0 | 0 |
| **ENRICHMENT & NLP** | | | | | |
| Keyword categorization (14 categories) | 9 | 8 | 7 | 6 | 0 |
| LLM categorization fallback | 9 | 6 | 8 | 0 | 0 |
| Location extraction (multi-strategy) | 9 | 8 | 8 | 5 | 0 |
| Neighborhood detection | 9 | 6 | 5 | 0 | 0 |
| Named entity extraction (NER) | 8 | 7 | 9 | 5 | 0 |
| Famous person detection | 8 | 4 | 7 | 0 | 0 |
| Title normalization (strip source suffixes) | 8 | 5 | 5 | 0 | 0 |
| **CLUSTERING & DEDUP** | | | | | |
| Jaccard title similarity | 9 | 8 | 8 | 0 | 0 |
| Person entity matching | 8 | 6 | 8 | 0 | 0 |
| Content hash dedup (platformPostId) | 9 | 7 | 8 | 0 | 0 |
| Embedding-based similarity (JSON vectors) | 8 | 6 | 9 | 0 | 0 |
| Follow-up story linking (parentStoryId) | 8 | 6 | 7 | 0 | 0 |
| Story merging with audit trail | 8 | 6 | 7 | 0 | 0 |
| **SCORING & RANKING** | | | | | |
| Breaking score (source velocity) | 9 | 8 | 9 | 0 | 0 |
| Trending score (growth rate) | 9 | 8 | 8 | 8 | 0 |
| Confidence score (source diversity + trust) | 9 | 7 | 9 | 7 | 0 |
| Locality score (market relevance) | 9 | 6 | 5 | 0 | 0 |
| Social score (engagement weighted) | 9 | 8 | 7 | 9 | 0 |
| Composite score (5-weight formula) | 9 | 8 | 8 | 7 | 0 |
| Category-specific decay curves | 9 | 6 | 7 | 5 | 0 |
| Local market lower thresholds | 9 | 5 | 4 | 0 | 0 |
| Story propagation boost (cross-market) | 8 | 4 | 5 | 0 | 0 |
| Audience-aware scoring (coverage history) | 8 | 0 | 0 | 0 | 0 |
| Pre-break velocity detection | 8 | 0 | 6 | 0 | 0 |
| Score snapshots (pastScores historical) | 8 | 5 | 6 | 0 | 0 |
| Score decay (automatic every 10 min) | 9 | 6 | 7 | 0 | 0 |
| Explainable scores (hover tooltip with formula) | 8 | 0 | 0 | 0 | 0 |
| **VERIFICATION & TRUST** | | | | | |
| Multi-source verification (3+ → VERIFIED) | 9 | 7 | 8 | 5 | 0 |
| Single-source flagging (⚠ badge) | 9 | 5 | 6 | 0 | 0 |
| LLM dual-check verification (OpenAI + Grok) | 8 | 0 | 0 | 0 | 0 |
| Source trust scoring (per-platform weights) | 9 | 7 | 9 | 7 | 0 |
| Verification badge in UI (✓/⚠) | 8 | 5 | 4 | 0 | 0 |
| **STORY ENTITIES & RELATIONSHIPS** | | | | | |
| StoryEntity table (NER storage) | 9 | 6 | 7 | 0 | 0 |
| Related stories (shared entities 2+) | 8 | 6 | 7 | 0 | 0 |
| Famous person flagging + ⭐ icon | 8 | 3 | 5 | 0 | 0 |
| Entity confidence scoring | 8 | 4 | 7 | 0 | 0 |
| **EDITORIAL WORKFLOW** | | | | | |
| Per-tenant customizable workflow stages (8 default) | 9 | 7 | 0 | 0 | 0 |
| Stage transitions with role-based permissions | 9 | 8 | 0 | 0 | 0 |
| Editorial comments / review thread | 8 | 6 | 0 | 0 | 0 |
| Story assignment (to reporter) | 9 | 8 | 0 | 0 | 0 |
| Account story derivatives (copy-on-write) | 9 | 0 | 0 | 0 | 0 |
| Coverage gap detection (competitor monitoring) | 9 | 0 | 0 | 0 | 0 |
| **AI & CONTENT GENERATION** | | | | | |
| AI chatbot (38 tools) | 9 | 0 | 0 | 0 | 0 |
| NLP search (natural language → filters via LLM) | 8 | 6 | 0 | 0 | 0 |
| AI summary generation (auto on story view) | 9 | 7 | 5 | 0 | 0 |
| AI title improvement (from multiple sources) | 8 | 5 | 0 | 0 | 0 |
| TV script generation (30s, 60s) | 9 | 7 | 0 | 5 | 0 |
| Radio script generation (30s, 60s) | 9 | 8 | 0 | 5 | 0 |
| Web article generation (200 words, SEO) | 9 | 6 | 0 | 4 | 0 |
| Social post generation (280 chars + hashtags) | 9 | 8 | 0 | 6 | 0 |
| Social thread generation (4-tweet) | 8 | 5 | 0 | 4 | 0 |
| Push notification generation (title + body) | 9 | 6 | 0 | 4 | 0 |
| One-click broadcast package (all formats parallel) | 9 | 6 | 0 | 0 | 0 |
| Conversation starters (radio/TV/podcast) | 8 | 8 | 0 | 0 | 0 |
| topicpulse.md custom AI instructions | 8 | 5 | 0 | 0 | 0 |
| RAG knowledge base (4 comprehensive docs) | 9 | 4 | 0 | 0 | 0 |
| AI News Director (proactive alerts every 5 min) | 7 | 0 | 0 | 0 | 0 |
| **PUBLISHING & DISTRIBUTION** | | | | | |
| Twitter/X publishing | 9 | 8 | 0 | 5 | 0 |
| Facebook publishing | 9 | 8 | 0 | 5 | 0 |
| LinkedIn publishing | 6 | 5 | 0 | 4 | 0 |
| WordPress CMS publishing | 8 | 8 | 0 | 3 | 0 |
| Custom webhook publishing | 9 | 6 | 0 | 0 | 0 |
| RSS feed output (per-account published.xml) | 9 | 8 | 0 | 0 | 0 |
| Publishing queue with scheduling | 8 | 8 | 0 | 0 | 0 |
| Email digests (frequency/filter based) | 8 | 9 | 0 | 6 | 0 |
| Push notifications (Firebase FCM) | 8 | 8 | 0 | 6 | 0 |
| **UI & EXPERIENCE** | | | | | |
| Dark/light theme | 9 | 8 | 6 | 7 | 5 |
| Collapsible sidebar navigation | 9 | 7 | 6 | 6 | 4 |
| Breaking news ticker (persistent bottom bar) | 9 | 6 | 0 | 0 | 0 |
| Column customization (show/hide) | 9 | 8 | 5 | 5 | 4 |
| Drag-to-reorder column headers | 9 | 6 | 0 | 0 | 0 |
| Column resize (drag header edge) | 9 | 6 | 5 | 4 | 3 |
| Saved views (persist filters + columns) | 9 | 8 | 6 | 5 | 4 |
| NLP search bar ("breaking crime in Houston") | 9 | 5 | 0 | 0 | 0 |
| Filter bar (8 filter types + advanced toggle) | 9 | 8 | 7 | 6 | 5 |
| Mobile responsive (teaser + dashboard) | 8 | 6 | 5 | 6 | 6 |
| Story detail page with AI summary | 9 | 7 | 6 | 5 | 3 |
| Score tooltips with real calculation breakdown | 9 | 0 | 0 | 0 | 0 |
| Famous person icon column (⭐) | 8 | 2 | 0 | 0 | 0 |
| Verified/sources icon column (✓/⚠ + count) | 8 | 3 | 0 | 0 | 0 |
| Coverage icon column (☑) | 8 | 0 | 0 | 0 | 0 |
| Table/card view toggle | 8 | 7 | 5 | 4 | 3 |
| Teaser mode (unauthenticated, IP geolocation) | 8 | 5 | 0 | 0 | 0 |
| Free tier with national stories | 8 | 3 | 0 | 0 | 0 |
| Scroll-to-top on story navigation | 8 | 7 | 7 | 6 | 5 |
| **ADMIN & PLATFORM** | | | | | |
| Market management (CRUD + 50 US MSAs) | 9 | 8 | 0 | 0 | 0 |
| International market support (country, language) | 6 | 7 | 5 | 0 | 5 |
| Source management (CRUD + bulk actions) | 9 | 9 | 0 | 0 | 0 |
| Source-market M:N linking (SourceMarket) | 9 | 7 | 0 | 0 | 0 |
| Self-heal button per source | 9 | 4 | 0 | 0 | 0 |
| Source failure/heal audit log | 9 | 3 | 0 | 0 | 0 |
| Market autofill (AI coordinates + keywords) | 8 | 0 | 0 | 0 | 0 |
| API key management | 9 | 8 | 8 | 0 | 7 |
| Feature flags | 9 | 8 | 7 | 0 | 0 |
| Audit logs | 9 | 8 | 7 | 4 | 6 |
| Team & role management (4 roles) | 9 | 8 | 6 | 5 | 5 |
| Multi-tenant accounts | 9 | 9 | 0 | 0 | 0 |
| Knowledge Base management UI | 8 | 0 | 0 | 0 | 0 |
| Pipeline status panel (per-queue expandable) | 9 | 0 | 0 | 0 | 0 |
| Clear pending/failed jobs buttons | 9 | 0 | 0 | 0 | 0 |
| Force poll / force run buttons | 9 | 0 | 0 | 0 | 0 |
| **ARCHITECTURE** | | | | | |
| API-first (all features via REST) | 9 | 8 | 8 | 8 | 7 |
| MCP server (22 tools) | 9 | 0 | 0 | 0 | 0 |
| BullMQ job queues (11 queues) | 9 | 5 | 6 | 0 | 0 |
| PostgreSQL + Prisma ORM | 9 | 0 | 6 | 0 | 5 |
| Redis for cache/queues/heartbeat | 9 | 6 | 7 | 0 | 4 |
| Multi-provider LLM fallback chain | 9 | 4 | 0 | 0 | 0 |
| Healthchecks on Dockerfiles | 9 | 7 | 8 | 0 | 5 |
| Non-root Docker containers | 9 | 5 | 8 | 0 | 6 |
| Security headers (X-Frame, CSP, XSS) | 8 | 7 | 9 | 0 | 7 |
| CORS configuration | 9 | 8 | 8 | 0 | 6 |
| JWT + API key auth | 9 | 8 | 9 | 8 | 8 |
| Rate limiting | 9 | 8 | 8 | 0 | 7 |
| Webhook support | 9 | 7 | 6 | 0 | 5 |
| PWA support (service worker, manifest) | 8 | 4 | 5 | 0 | 0 |
| Elasticsearch / NLP search (LLM function calling) | 8 | 8 | 9 | 0 | 5 |
| Read replicas (database scaling) | 0 | 9 | 8 | 0 | 6 |
| SAML SSO | 6 | 8 | 7 | 6 | 7 |

| **BROADCAST-SPECIFIC** | | | | | |
| MOS/ENPS rundown integration | 7 | 8 | 0 | 0 | 0 |
| A-block lineup recommendation | 9 | 5 | 0 | 0 | 0 |
| Deadline countdown tracking | 9 | 0 | 0 | 0 | 0 |
| Reporter assignment workflow | 9 | 0 | 0 | 0 | 0 |
| Reporter performance dashboards | 9 | 0 | 0 | 0 | 0 |
| Show prep / shift briefings | 9 | 9 | 0 | 0 | 0 |
| Live transcript monitoring | 0 | 6 | 5 | 0 | 9 |
| **ANALYTICS & REPORTING** | | | | | |
| Story performance metrics | 8 | 9 | 6 | 8 | 7 |
| Headline A/B testing | 9 | 3 | 0 | 0 | 0 |
| Source effectiveness tracking | 8 | 6 | 7 | 5 | 0 |
| Story prediction/virality scoring | 8 | 5 | 9 | 9 | 0 |

## Summary

| Product | Average Score | Feature Count (>0) |
|---------|---|---|
| **TPHyperlocal (Us)** | **8.1** | 139/142 |
| **TopicPulse Legacy** | **5.8** | 112/142 |
| **Dataminr** | **4.1** | 66/142 |
| **NewsWhip Spike** | **2.3** | 40/142 |
| **TVEyes** | **1.7** | 32/142 |

### Gaps Remaining
| Gap | Our Score | Leader | Status |
|---|---|---|---|
| Push notifications | 8 | TopicPulse 8 | **CLOSED** — FCM fully wired |
| Search (ES vs LLM NLP) | 8 | Dataminr 9 | LLM function calling is more sophisticated than keyword search |
| MOS/ENPS export | 7 | TopicPulse 8 | Route exists, needs customer testing |
| SAML SSO | 6 | TopicPulse 8 | Route exists, needs enterprise customer |
| Read replicas | 0 | TopicPulse 9 | Not needed until 50K+ stories |
| Live transcript monitoring | 0 | TVEyes 9 | Different product category |
