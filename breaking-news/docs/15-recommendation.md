# Section 15 — Recommended Implementation

## Build This First (Week 1-2)

1. **RSS feeds + NewsAPI ingestion** → works today, zero friction, high signal
2. **Grok LLM polling** → real-time X data access, best LLM for breaking news
3. **Jaccard clustering + keyword enrichment** → simple, good enough for v1
4. **Scored/ranked table** → the core product experience
5. **Single-tenant deploy to Railway + Vercel** → prove the pipeline works end-to-end

## Build Next (Week 3-4)

6. **Multi-tenant auth** (already coded) → register, login, account switching
7. **Admin UI** for markets, sources, credentials → let users bring their own API keys
8. **All 4 LLM providers** → OpenAI, Claude, Grok, Gemini
9. **REST API** with docs → enable third-party integration
10. **RSS feed generation** → immediate value for newsroom workflows
11. **MCP server** → differentiator for AI-native workflows

## Build Later (Month 2+)

12. Facebook Pages (after App Review)
13. Twitter/X API integration
14. Semantic embeddings (pgvector) for better clustering
15. LLM-generated story summaries
16. Full-text article extraction
17. Better NER (spaCy or Hugging Face models)
18. Meilisearch for search
19. Webhook notifications
20. Additional metros

## What to Avoid

| Avoid | Why |
|---|---|
| Instagram integration | No useful public API exists |
| Nextdoor integration | No API exists for third parties |
| Any form of scraping | Legal risk, unreliable, not worth it |
| Full-text copyrighted article storage | Store summaries, link to originals |
| Complex ML before simple heuristics work | Jaccard + keywords gets 70% accuracy |
| Over-trusting LLM news sources | They hallucinate. Always require corroboration. |
| Building multi-metro before Houston works | Prove the model in one market first |

## What Is Fantasy

- "Real-time Nextdoor feed" — cannot be done
- "All public Instagram posts about Houston" — no API
- "CrowdTangle-style Facebook monitoring" — CrowdTangle is dead
- "Free unlimited Twitter access" — $100-5000/mo
- "Perfect deduplication" — will always need human review
- "LLMs as primary breaking news sources" — they should validate, not originate

## The Honest Architecture

```
v1 Reality:
┌─────────────────────────────────────────────────────┐
│  RSS Feeds (15+ Houston sources)     ← FREE         │
│  NewsAPI (Houston filtered)          ← $449/mo prod │
│  Grok LLM (real-time X access)      ← ~$5/day      │
│  OpenAI/Claude/Gemini (validation)   ← ~$10/day     │
│  Facebook Pages (5-10 curated)       ← Free + review│
├─────────────────────────────────────────────────────┤
│  Ingestion → Enrichment → Clustering → Scoring      │
├─────────────────────────────────────────────────────┤
│  PostgreSQL + Redis (Railway)                        │
├─────────────────────────────────────────────────────┤
│  REST API + RSS Feeds + MCP Server                   │
│  Next.js Dashboard + Admin UI                        │
│  Multi-tenant with per-account credentials           │
└─────────────────────────────────────────────────────┘
```

This produces 50-200 stories/day from legitimate sources. It won't have every neighborhood Facebook group post, but it will have every story that matters — plus LLM cross-validation that no competitor offers.

## Blunt Assessment

**Ship RSS + NewsAPI + Grok first.** This is the fastest path to a useful product. Everything else is enhancement.

**The LLM angle is the differentiator.** No other local news aggregator polls 4 LLMs for breaking news. Grok's real-time X access is especially valuable.

**Multi-tenancy with per-account credentials is the business model.** Each customer brings their own API keys, scales their own costs, configures their own markets.

**Don't build what you can't legally access.** Instagram and Nextdoor are off the table. Accept it and build something better with what you have.
