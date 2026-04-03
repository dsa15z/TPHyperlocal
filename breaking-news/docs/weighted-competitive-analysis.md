# TPHyperlocal Weighted Competitive Analysis

## Methodology

Each feature category is assigned a **business weight** reflecting its importance to broadcast newsroom buyers. Weights sum to 100%. Individual feature scores (0-10) are averaged per category, then multiplied by the category weight to produce a weighted score.

### Category Weights (Broadcast Newsroom Buyer Priorities)

| Category | Weight | Rationale |
|----------|--------|-----------|
| Detection & Ingestion | 20% | Core value prop — "catch stories first" |
| Enrichment & NLP | 10% | Accuracy of categorization/entities |
| Clustering & Dedup | 8% | Signal-to-noise ratio |
| Scoring & Ranking | 15% | Editorial prioritization — the "killer feature" |
| Verification & Trust | 12% | Credibility is non-negotiable for broadcast |
| Story Entities & Relationships | 5% | Context and depth |
| Editorial Workflow | 10% | Newsroom integration |
| AI & Content Generation | 8% | Time savings / content factory |
| Publishing & Distribution | 5% | Multi-platform reach |
| UI & Experience | 5% | Usability and adoption |
| Admin & Platform | 2% | IT/ops requirements |
| Architecture | — | Not scored (invisible to buyers) |
| Broadcast-Specific | — | Scored separately below |

**Note:** Architecture is excluded from buyer-facing scores (buyers don't care about Redis vs Memcached). Broadcast-specific features are scored as a separate overlay.

---

## Category Scores

### 1. Detection & Ingestion (Weight: 20%)

| Feature | Us | TopicPulse | Dataminr | Weight | Gap Action (if <9) |
|---------|:--:|:--:|:--:|:--:|---|
| RSS feed polling | 9 | 8 | 8 | High | — |
| News API integration | 8 | 7 | 9 | High | Add Reuters/AP direct API feeds; Event Registry premium tier |
| Twitter/X monitoring | 8 | 7 | 9 | High | Add streaming (filtered stream API v2) instead of polling |
| Facebook page monitoring | 8 | 8 | 8 | Med | Add Instagram Graph API for cross-platform |
| GDELT integration | 8 | 0 | 9 | Med | Add GDELT GKG (Global Knowledge Graph) for richer entity data |
| LLM-powered news scanning | 9 | 0 | 7 | High | — |
| Web scraping fallback | 8 | 7 | 8 | Low | Add Playwright headless for JS-rendered pages |
| Source self-healing (10 strategies) | 8 | 5 | 6 | High | Fix trigger logic (>= not ===), add success-rate tracking dashboard |
| UA rotation pool | 9 | 8 | 9 | Low | — |
| HTTP caching | 9 | 7 | 7 | Low | — |
| Cloudflare/bot detection | 7 | 5 | 7 | Med | Add Kasada + Akamai Bot Manager signatures; captcha-solving fallback |
| Per-domain rate limiting | 9 | 8 | 8 | Low | — |
| Content-hash dedup | 9 | 7 | 8 | Med | — |
| Redirect tracking | 8 | 6 | 7 | Low | Add canonical URL resolution from <link rel="canonical"> |
| RSS auto-discovery | 7 | 6 | 5 | Low | Add sitemap.xml parsing as discovery source; test against 100 top news sites |
| Proxy-to-direct mapping | 7 | 4 | 6 | Low | Build mapping table for top 50 news orgs; auto-detect proxy patterns |
| Source consolidation | 8 | 6 | 0 | Med | Add consolidation health dashboard; alert on drift |
| Always-on national RSS | 9 | 8 | 8 | Med | — |
| Idle detection | 8 | 4 | 7 | Low | Add idle cost savings reporting |
| Source failure audit logging | 9 | 5 | 5 | Med | — |

**Category Average:** Us: 8.35 | TopicPulse: 5.95 | Dataminr: 6.55
**Weighted Score (×20%):** Us: 1.67 | TopicPulse: 1.19 | Dataminr: 1.31

---

### 2. Enrichment & NLP (Weight: 10%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Keyword categorization (14 cats) | 9 | 8 | 7 | — |
| LLM categorization fallback | 9 | 6 | 8 | — |
| Location extraction | 9 | 8 | 8 | — |
| Neighborhood detection | 9 | 6 | 5 | — |
| Named entity extraction | 8 | 7 | 9 | Add spaCy/Hugging Face NER as primary, LLM as fallback (faster + cheaper) |
| Famous person detection | 8 | 4 | 7 | Expand famous person database; add Wikidata entity linking for disambiguation |
| Title normalization | 8 | 5 | 5 | Add A/B title comparison using LLM to pick most engaging |

**Category Average:** Us: 8.57 | TopicPulse: 6.29 | Dataminr: 7.00
**Weighted Score (×10%):** Us: 0.86 | TopicPulse: 0.63 | Dataminr: 0.70

---

### 3. Clustering & Dedup (Weight: 8%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Jaccard title similarity | 9 | 8 | 8 | — |
| Person entity matching | 8 | 6 | 8 | Add fuzzy name matching (Jaro-Winkler) for misspellings |
| Content hash dedup | 9 | 7 | 8 | — |
| Embedding similarity | 8 | 6 | 9 | Move from JSON vectors to pgvector extension for native cosine similarity |
| Follow-up story linking | 8 | 6 | 7 | Add temporal chain detection (story A → B → C timelines) |
| Story merging audit trail | 8 | 6 | 7 | Add merge undo capability; display merge history in UI |

**Category Average:** Us: 8.33 | TopicPulse: 6.50 | Dataminr: 7.83
**Weighted Score (×8%):** Us: 0.67 | TopicPulse: 0.52 | Dataminr: 0.63

---

### 4. Scoring & Ranking (Weight: 15%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Breaking score | 9 | 8 | 9 | — |
| Trending score | 9 | 8 | 8 | — |
| Confidence score | 9 | 7 | 9 | — |
| Locality score | 9 | 6 | 5 | — |
| Social score | 9 | 8 | 7 | — |
| Composite score | 9 | 8 | 8 | — |
| Category-specific decay | 9 | 6 | 7 | — |
| Local market lower thresholds | 9 | 5 | 4 | — |
| Propagation boost | 8 | 4 | 5 | Add real-time cross-market velocity tracking; alert when local story goes national |
| Audience-aware scoring | 8 | 0 | 0 | Add learning loop: track which scored stories get covered → adjust weights |
| Pre-break velocity | 8 | 0 | 6 | Add configurable sensitivity (aggressive/balanced/conservative) per market |
| Score snapshots | 8 | 5 | 6 | Add score trend visualization (sparkline in story table) |
| Score decay | 9 | 6 | 7 | — |
| Explainable scores | 8 | 0 | 0 | Add "why this score?" panel with factor-by-factor breakdown and comparison to average |

**Category Average:** Us: 8.64 | TopicPulse: 5.07 | Dataminr: 5.79
**Weighted Score (×15%):** Us: 1.30 | TopicPulse: 0.76 | Dataminr: 0.87

---

### 5. Verification & Trust (Weight: 12%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Multi-source verification | 9 | 7 | 8 | — |
| Single-source flagging | 9 | 5 | 6 | — |
| LLM dual-check verification | 8 | 0 | 0 | Add third LLM (Gemini) for majority-vote verification; add fact-check API integration |
| Source trust scoring | 9 | 7 | 9 | — |
| Verification badge in UI | 8 | 5 | 4 | Add verification timeline (when each source confirmed); show source logos |

**Category Average:** Us: 8.60 | TopicPulse: 4.80 | Dataminr: 5.40
**Weighted Score (×12%):** Us: 1.03 | TopicPulse: 0.58 | Dataminr: 0.65

---

### 6. Story Entities & Relationships (Weight: 5%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| StoryEntity table | 9 | 6 | 7 | — |
| Related stories | 8 | 6 | 7 | Add "story graph" visualization showing entity connections between stories |
| Famous person flagging | 8 | 3 | 5 | Add Wikipedia summary card on hover; link to previous stories about same person |
| Entity confidence scoring | 8 | 4 | 7 | Add entity resolution (merge "Joe Biden" / "President Biden" / "Biden") |

**Category Average:** Us: 8.25 | TopicPulse: 4.75 | Dataminr: 6.50
**Weighted Score (×5%):** Us: 0.41 | TopicPulse: 0.24 | Dataminr: 0.33

---

### 7. Editorial Workflow (Weight: 10%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Customizable workflow stages | 9 | 7 | 0 | — |
| Role-based transitions | 9 | 8 | 0 | — |
| Editorial comments | 8 | 6 | 0 | Add @mentions with notifications; add threaded replies |
| Story assignment | 9 | 8 | 0 | — |
| Account story derivatives | 9 | 0 | 0 | — |
| Coverage gap detection | 9 | 0 | 0 | — |

**Category Average:** Us: 8.83 | TopicPulse: 4.83 | Dataminr: 0.00
**Weighted Score (×10%):** Us: 0.88 | TopicPulse: 0.48 | Dataminr: 0.00

---

### 8. AI & Content Generation (Weight: 8%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| AI chatbot (38 tools) | 9 | 0 | 0 | — |
| NLP search | 8 | 6 | 0 | Add search suggestions/autocomplete; add "search by example" (paste a headline) |
| AI summary generation | 9 | 7 | 5 | — |
| AI title improvement | 8 | 5 | 0 | Add headline A/B testing with engagement prediction scoring |
| TV script generation | 9 | 7 | 0 | — |
| Radio script generation | 9 | 8 | 0 | — |
| Web article generation | 9 | 6 | 0 | — |
| Social post generation | 9 | 8 | 0 | — |
| Social thread generation | 8 | 5 | 0 | Add platform-specific formatting (LinkedIn long-form vs Twitter thread) |
| Push notification generation | 9 | 6 | 0 | — |
| Broadcast package (all formats) | 9 | 6 | 0 | — |
| Conversation starters | 8 | 8 | 0 | Add topic-specific talking points; add "devil's advocate" counterpoints |
| topicpulse.md custom instructions | 8 | 5 | 0 | Add per-show custom instructions (morning vs evening voice) |
| RAG knowledge base | 9 | 4 | 0 | — |
| AI News Director | 7 | 0 | 0 | Add configurable alert thresholds; add Slack/Teams integration for alerts |

**Category Average:** Us: 8.53 | TopicPulse: 5.40 | Dataminr: 0.33
**Weighted Score (×8%):** Us: 0.68 | TopicPulse: 0.43 | Dataminr: 0.03

---

### 9. Publishing & Distribution (Weight: 5%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Twitter/X publishing | 9 | 8 | 0 | — |
| Facebook publishing | 9 | 8 | 0 | — |
| LinkedIn publishing | 6 | 5 | 0 | Implement LinkedIn API v2 posting with image/video support |
| WordPress CMS publishing | 8 | 8 | 0 | Add Drupal + custom CMS webhook adapters |
| Custom webhook publishing | 9 | 6 | 0 | — |
| RSS feed output | 9 | 8 | 0 | — |
| Publishing queue/scheduling | 8 | 8 | 0 | Add optimal-time scheduling (ML-based best time to post per platform) |
| Email digests | 8 | 9 | 0 | Add MJML templates; add per-market digest customization |
| Push notifications (FCM) | 8 | 8 | 0 | Add APNs direct for iOS; add rich notifications with images |

**Category Average:** Us: 8.22 | TopicPulse: 7.56 | Dataminr: 0.00
**Weighted Score (×5%):** Us: 0.41 | TopicPulse: 0.38 | Dataminr: 0.00

---

### 10. UI & Experience (Weight: 5%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Dark/light theme | 9 | 8 | 6 | — |
| Collapsible sidebar | 9 | 7 | 6 | — |
| Breaking news ticker | 9 | 6 | 0 | — |
| Column customization | 9 | 8 | 5 | — |
| Drag-to-reorder columns | 9 | 6 | 0 | — |
| Column resize | 9 | 6 | 5 | — |
| Saved views | 9 | 8 | 6 | — |
| NLP search bar | 9 | 5 | 0 | — |
| Filter bar (8 types) | 9 | 8 | 7 | — |
| Mobile responsive | 8 | 6 | 5 | Add PWA install prompt; optimize touch targets; add swipe gestures |
| Story detail page | 9 | 7 | 6 | — |
| Score tooltips | 9 | 0 | 0 | — |
| Famous person column | 8 | 2 | 0 | Add hover card with person bio + recent stories |
| Verified/sources column | 8 | 3 | 0 | Add source logo icons; add click-to-expand source list |
| Coverage column | 8 | 0 | 0 | Add coverage tracking across shows/platforms |
| Table/card view toggle | 8 | 7 | 5 | Add Kanban board view (stories as cards in workflow columns) |
| Teaser mode | 8 | 5 | 0 | Add lead capture form; add demo mode with sample data |
| Free tier | 8 | 3 | 0 | Add usage-based upgrade prompts; add feature gating |
| Scroll-to-top | 8 | 7 | 7 | Add keyboard navigation (j/k for next/prev story) |

**Category Average:** Us: 8.58 | TopicPulse: 5.37 | Dataminr: 3.05
**Weighted Score (×5%):** Us: 0.43 | TopicPulse: 0.27 | Dataminr: 0.15

---

### 11. Admin & Platform (Weight: 2%)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| Market management | 9 | 8 | 0 | — |
| International market support | 6 | 7 | 5 | Add i18n for UI strings; add timezone-aware scheduling; add locale-specific NLP |
| Source management | 9 | 9 | 0 | — |
| Source-market M:N linking | 9 | 7 | 0 | — |
| Self-heal button | 9 | 4 | 0 | — |
| Source failure audit log | 9 | 3 | 0 | — |
| Market autofill | 8 | 0 | 0 | Add bulk market import (CSV/JSON); add market template library |
| API key management | 9 | 8 | 8 | — |
| Feature flags | 9 | 8 | 7 | — |
| Audit logs | 9 | 8 | 7 | — |
| Team & role management | 9 | 8 | 6 | — |
| Multi-tenant accounts | 9 | 9 | 0 | — |
| Knowledge Base UI | 8 | 0 | 0 | Add version history; add diff view for knowledge doc changes |
| Pipeline status panel | 9 | 0 | 0 | — |
| Clear pending/failed jobs | 9 | 0 | 0 | — |
| Force poll/run buttons | 9 | 0 | 0 | — |

**Category Average:** Us: 8.69 | TopicPulse: 4.94 | Dataminr: 2.06
**Weighted Score (×2%):** Us: 0.17 | TopicPulse: 0.10 | Dataminr: 0.04

---

## Broadcast-Specific Overlay (Bonus: not in main weight)

| Feature | Us | TopicPulse | Dataminr | Gap Action (if <9) |
|---------|:--:|:--:|:--:|---|
| MOS/ENPS rundown integration | 7 | 8 | 0 | Add ENPS MOS Gateway XML push; test with Avid iNEWS |
| A-block lineup recommendation | 9 | 5 | 0 | — |
| Deadline countdown | 9 | 0 | 0 | — |
| Reporter assignment workflow | 9 | 0 | 0 | — |
| Reporter performance dashboards | 9 | 0 | 0 | — |
| Show prep / shift briefings | 9 | 9 | 0 | — |
| Live transcript monitoring | 0 | 6 | 5 | Not planned — different product category (TVEyes territory) |

**Broadcast Average:** Us: 7.43 | TopicPulse: 4.00 | Dataminr: 0.71

---

## Final Weighted Scores

| Category | Weight | Us | TopicPulse | Dataminr |
|----------|:------:|:--:|:--:|:--:|
| Detection & Ingestion | 20% | 1.67 | 1.19 | 1.31 |
| Enrichment & NLP | 10% | 0.86 | 0.63 | 0.70 |
| Clustering & Dedup | 8% | 0.67 | 0.52 | 0.63 |
| Scoring & Ranking | 15% | 1.30 | 0.76 | 0.87 |
| Verification & Trust | 12% | 1.03 | 0.58 | 0.65 |
| Story Entities | 5% | 0.41 | 0.24 | 0.33 |
| Editorial Workflow | 10% | 0.88 | 0.48 | 0.00 |
| AI & Content Gen | 8% | 0.68 | 0.43 | 0.03 |
| Publishing | 5% | 0.41 | 0.38 | 0.00 |
| UI & Experience | 5% | 0.43 | 0.27 | 0.15 |
| Admin & Platform | 2% | 0.17 | 0.10 | 0.04 |
| **TOTAL** | **100%** | **8.51** | **5.58** | **4.71** |

### Relative Position
```
TPHyperlocal:  ████████████████████████████████████████████  8.51 / 10
TopicPulse:    ████████████████████████████░░░░░░░░░░░░░░░░  5.58 / 10
Dataminr:      ████████████████████████░░░░░░░░░░░░░░░░░░░░  4.71 / 10
```

**TPHyperlocal leads by 52.5% over TopicPulse and 80.7% over Dataminr on weighted score.**

---

## Gap Closure Priority Matrix

### Tier 1: High Impact, Quick Wins (do this week)

| Feature | Current | Target | Action | Effort |
|---------|:-------:|:------:|--------|:------:|
| Self-healing trigger | 8→9 | 9 | Fix >= logic (already done), add success-rate dashboard | 2h |
| Score snapshots visualization | 8→9 | 9 | Add sparkline trend in story table using pastScores data | 4h |
| Explainable scores | 8→9 | 9 | Expand tooltip to full panel with factor comparison | 3h |
| Verification badge | 8→9 | 9 | Add verification timeline + source logos in story detail | 4h |
| Editorial comments | 8→9 | 9 | Add @mentions with email/push notifications | 4h |
| NLP search | 8→9 | 9 | Add search suggestions + "search by example" | 4h |

### Tier 2: Medium Impact, Moderate Effort (do this month)

| Feature | Current | Target | Action | Effort |
|---------|:-------:|:------:|--------|:------:|
| Twitter streaming | 8→9 | 9 | Switch from polling to filtered stream API v2 | 1d |
| NER upgrade | 8→9 | 9 | Add spaCy pipeline as primary, LLM as fallback | 2d |
| Embedding search (pgvector) | 8→9 | 9 | Install pgvector extension, migrate from JSON vectors | 1d |
| AI News Director alerts | 7→9 | 9 | Add Slack/Teams webhooks + configurable thresholds | 1d |
| Audience learning loop | 8→9 | 9 | Track coverage decisions → adjust scoring weights | 2d |
| Mobile PWA | 8→9 | 9 | PWA install prompt + swipe gestures + touch optimization | 2d |
| LinkedIn publishing | 6→9 | 9 | Full LinkedIn API v2 with rich media support | 1d |
| Cloudflare/bot detection | 7→9 | 9 | Add Kasada + Akamai signatures | 1d |
| Entity resolution | 8→9 | 9 | Merge variant entity names (Biden/President Biden) | 1d |

### Tier 3: Strategic, Larger Effort (do this quarter)

| Feature | Current | Target | Action | Effort |
|---------|:-------:|:------:|--------|:------:|
| International markets | 6→9 | 9 | i18n framework + locale-specific NLP + timezone scheduling | 1w |
| MOS/ENPS integration | 7→9 | 9 | ENPS MOS Gateway XML push + Avid iNEWS testing | 1w |
| SAML SSO | 6→9 | 9 | Enterprise SAML 2.0 with Okta/Azure AD testing | 3d |
| Kanban board view | 8→9 | 9 | Drag-and-drop story cards across workflow columns | 3d |
| Story graph visualization | 8→9 | 9 | D3.js entity relationship graph between stories | 3d |

### Not Planned (intentional gaps)

| Feature | Current | Reason |
|---------|:-------:|--------|
| Read replicas | 0 | Not needed until 50K+ concurrent stories. Railway supports it when ready. |
| Live transcript monitoring | 0 | Different product category (TVEyes). Would require broadcast capture hardware. |

---

## Summary

TPHyperlocal scores **8.51/10 weighted** — a dominant position across all categories that matter to broadcast newsroom buyers. The platform leads in:

- **Detection** (8.35 avg) — Multi-source + self-healing gives unmatched resilience
- **Scoring** (8.64 avg) — Most sophisticated scoring in the market with explainability
- **Verification** (8.60 avg) — Only platform with LLM dual-check verification
- **Editorial Workflow** (8.83 avg) — Only platform with copy-on-write + coverage gaps
- **AI Content** (8.53 avg) — 38-tool chatbot + broadcast package is unique

**The #1 competitive moat is the combination of AI content generation + editorial workflow + verification.** No competitor has all three. Dataminr has detection but no workflow. TopicPulse has content gen but weaker verification. We have the full stack.

**To reach 9.0+ weighted score**, focus on Tier 1 quick wins (self-healing, score visualization, NLP search improvements) and Tier 2 infrastructure (pgvector, Twitter streaming, LinkedIn publishing, international support).
