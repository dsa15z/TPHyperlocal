# Section 1 — Reality Check and Feasibility

## Facebook

| Access Method | Description | Viability |
|---|---|---|
| Graph API (Pages) | Read public Page posts via `/{page-id}/posts`. Requires App Review for `pages_read_engagement`. Returns text, reactions, shares, comments count. Rate: 200 calls/hr/token. | **Viable now** (2-4 week review) |
| Graph API (Groups) | Requires group admin approval + `groups_access_member_info`. Most local groups won't grant this. | **Viable with partnerships only** |
| Personal profiles / News Feed | No API access whatsoever. | **Not viable** |
| CrowdTangle | Shut down August 14, 2024. | **Dead** |
| Meta Content Library | Research-only. Requires academic IRB. Cannot be used commercially. | **Not viable** |
| Scraping | Violates ToS. Meta aggressively litigates. Accounts banned, IPs blocked. | **High risk — forbidden** |

**Bottom line**: We can read public Page posts from curated Houston news/government pages via an approved app. That's it. No groups, no profiles, no firehose.

## Instagram

| Access Method | Description | Viability |
|---|---|---|
| Basic Display API | Deprecated April 4, 2024. | **Dead** |
| Instagram Graph API | Only works for Business/Creator accounts that grant your app permission. No public search. No discovery. Hashtag search only for authorized accounts. | **Viable with partnerships only** |
| Scraping | Instagram aggressively blocks automated access. Violates ToS. | **High risk — forbidden** |

**Bottom line**: Unless Houston news orgs install your app, Instagram is inaccessible. Deprioritize entirely for v1.

## Nextdoor

| Access Method | Description | Viability |
|---|---|---|
| Public API | Does not exist. No developer program. | **Not viable** |
| Scraping | Content behind auth. Private by default. ToS violation. | **High risk — forbidden** |
| Data partnerships | Select municipal partnerships only. Not available to startups. | **Not viable** |

**Bottom line**: Nextdoor is completely off the table. Do not attempt.

## LLM Providers as News Sources

| Provider | Access | Real-Time Data | Viability | Cost |
|---|---|---|---|---|
| OpenAI (GPT-4o) | REST API | No native real-time; training cutoff | **Viable** — useful for validation | ~$0.01/query |
| Anthropic (Claude) | REST API | No native real-time; training cutoff | **Viable** — useful for validation | ~$0.01/query |
| xAI (Grok) | OpenAI-compatible API at api.x.ai | **Yes** — has real-time X/Twitter access | **Best for breaking news** | ~$0.01/query |
| Google (Gemini) | REST API | Grounding with Google Search available | **Viable** — good for verification | ~$0.005/query |

**Key insight**: Grok has a significant advantage because it accesses real-time X/Twitter data. It should be polled more frequently and given a slightly higher trust score (0.35 vs 0.3 for others). All LLM sources get lower trust scores than traditional news because they can hallucinate.

## Viable Alternative Sources

| Source | Access Method | Viability | Data Quality | Cost |
|---|---|---|---|---|
| Local News RSS (15+ feeds) | Standard RSS/Atom | **Ship now** | High | Free |
| NewsAPI.org | REST API with key | **Ship now** | High | Free (100/day), $449/mo prod |
| Twitter/X API v2 | OAuth 2.0 Bearer | **Ship now** | Medium-High | $100/mo basic |
| Google News RSS | RSS feed | **Ship now** | Medium | Free (unofficial) |
| Facebook Pages | Graph API | **After App Review** | High | Free (2-4 week review) |
| GDELT Project | REST API | **Ship now** | Medium | Free |
| Reddit (r/houston) | API | **Viable ($)** | Low-Medium | Rate limited |
| LLM Providers (4) | REST APIs | **Ship now** | Medium (may hallucinate) | ~$50-100/mo total |

## Recommended v1 Source Mix

1. **Local news RSS feeds** — Houston Chronicle, KHOU, KPRC, ABC13, CW39, Houston Public Media, Harris County — highest signal, zero cost, immediate
2. **NewsAPI** — broad coverage, easy integration, 15-60 min lag
3. **LLM providers (Grok priority)** — Grok for real-time X data, others for cross-validation
4. **GDELT** — cross-reference and validation layer — free
5. **Curated Facebook Pages** — City of Houston, HPD, HFD, HoustonTranStar — requires App Review (~2-4 weeks)
6. **Twitter/X API v2** — real-time local chatter — $100/mo basic tier

## What Is Fantasy

- "Real-time Nextdoor feed" — cannot be done without a partnership that doesn't exist
- "All public Instagram posts about Houston" — Instagram has no public search API
- "CrowdTangle-style Facebook monitoring" — CrowdTangle is dead
- "Free unlimited Twitter access" — costs $100-5000/mo depending on volume
- "Perfect LLM news without hallucination" — LLMs can and do fabricate events. Always cross-validate.
