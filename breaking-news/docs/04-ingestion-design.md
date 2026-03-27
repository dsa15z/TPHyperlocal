# Section 4 — Platform-Specific Ingestion Design

## A) Local News RSS Feeds (Primary Source)

**Data**: title, description, link, pubDate, author, categories, media enclosures

**Auth**: None

**Strategy**: Poll every 2 minutes via `fast-xml-parser`. Dedup by `rss::{feedUrl}::{guid}`.

**Houston Sources (v1)**:
| Source | Feed URL | Trust Score |
|---|---|---|
| Houston Chronicle | houstonchronicle.com/rss/feed/Houston-breaking-news-702.php | 0.8 |
| KHOU 11 | khou.com/feeds/syndication/rss/news | 0.8 |
| KPRC / Click2Houston | click2houston.com/arcio/rss/category/news/ | 0.8 |
| ABC13 Houston | abc13.com/feed/ | 0.8 |
| Houston Public Media | houstonpublicmedia.org/feed/ | 0.8 |
| Harris County | harriscountytx.gov/rss | 0.9 |

**Parsing Logic**:
- Supports RSS 2.0 (`rss.channel.item`) and Atom (`feed.entry`)
- GUID extraction: `item.guid` → `item.link` → SHA-256 hash of `title+pubDate`
- Media: extracts from `media:content`, `enclosure` elements
- Content: prefers `content:encoded` > `description` > `title`

**Limitations**: Summaries only (not full articles). PubDate may lag. No engagement metrics.

**Fallback**: If RSS returns errors 3 times in a row, mark source as stale and alert admin.

## B) NewsAPI

**Data**: title, description, content (truncated 200 chars on free tier), source, author, url, publishedAt

**Auth**: API key in query param or header

**Strategy**: Poll every 3 minutes. Query: `q=Houston AND (breaking OR crime OR fire OR flood OR shooting)&language=en&sortBy=publishedAt&pageSize=50`

**Dedup key**: `newsapi::{sha256(article.url)}`

**Limitations**:
| Tier | Requests | Cost | Content |
|---|---|---|---|
| Free | 100/day | $0 | Truncated to 200 chars |
| Business | 250K/month | $449/mo | Full content |

Results lag 15-60 minutes behind real-time. Good for validation, not for breaking detection.

## C) Facebook Pages (Graph API)

**Data**: message, created_time, permalink_url, shares count, reactions summary, comments summary

**Auth**: App Access Token. Requires App Review for `pages_read_engagement` permission (~2-4 weeks).

**Strategy**: Poll every 5 minutes per page.
```
GET /{page-id}/posts?fields=id,message,story,created_time,permalink_url,shares,likes.summary(true),comments.summary(true),full_picture&limit=25&access_token={token}
```

**Curated Pages**:
| Page | Platform ID | Type | Trust |
|---|---|---|---|
| City of Houston | cityofhouston | GOV_AGENCY | 0.9 |
| Houston Police Dept | houstonpolice | GOV_AGENCY | 0.9 |
| Houston Fire Dept | HoustonFireDept | GOV_AGENCY | 0.9 |
| HoustonTranStar | houstontranstar | GOV_AGENCY | 0.9 |

**Rate Limiting**: 200 calls/user/hour. Handle 429 responses with `Retry-After` header.

**Limitations**: Must curate page list manually. No comment content. No group access. App Review required.

## D) Twitter/X API v2

**Data**: text, author, created_at, public_metrics (retweet_count, like_count, reply_count, quote_count), entities, geo

**Auth**: OAuth 2.0 Bearer Token. Basic tier: $100/mo.

**Strategy**: Recent search every 3 minutes.
```
GET /2/tweets/search/recent?query=houston (breaking OR fire OR shooting OR flood OR crash) -is:retweet lang:en&max_results=100&tweet.fields=created_at,public_metrics,entities,geo&expansions=author_id
```

**Engagement Scoring** (from x repo pattern):
```
engagement = retweets * 3 + likes * 1 + replies * 2 + quotes * 4
```

**Limitations**:
| Tier | Reads/month | Cost |
|---|---|---|
| Basic | 10,000 | $100/mo |
| Pro | 1,000,000 | $5,000/mo |

Basic tier burns fast at 100 results × 20 polls/hour × 24h = 48K reads/day. Need careful query optimization.

**Tip**: Curate a list of local news accounts (@HoustonChron, @ABOREL, @KABOREL, @housaborelicefd) and weight their tweets higher.

## E) GDELT Project

**Data**: event records with actors, locations, themes, tone, source URLs

**Auth**: None

**Strategy**: DOC API every 5 minutes.
```
GET https://api.gdeltproject.org/api/v2/doc/doc?query=Houston+Texas&mode=artlist&maxrecords=50&sort=datedesc&format=json
```

**Use case**: Validation layer. If GDELT + RSS both report same event → higher confidence score.

**Limitations**: Lags 15-60 minutes. Lower granularity than direct sources. Best for cross-reference.

## F) LLM Providers (NEW)

**Strategy**: Poll each enabled LLM every 10 minutes with a structured prompt asking for breaking local news. Returns JSON array of stories.

| Provider | Endpoint | Model | Real-Time Data | Trust Score |
|---|---|---|---|---|
| Grok (xAI) | api.x.ai/v1/chat/completions | grok-3 | **Yes** (X/Twitter access) | 0.35 |
| OpenAI | api.openai.com/v1/chat/completions | gpt-4o | No (web search plugin possible) | 0.30 |
| Claude | api.anthropic.com/v1/messages | claude-sonnet-4-6 | No | 0.30 |
| Gemini | generativelanguage.googleapis.com | gemini-2.0-flash | Google Search grounding | 0.30 |

**Prompt Design**: Structured JSON output with headline, summary, category, location, neighborhood, severity (1-10), confidence (0-1). See `llm-ingestion.worker.ts`.

**Cost Control**:
- Max 4 LLM calls per minute across all providers
- 10-minute polling interval (vs 2-3 min for RSS/NewsAPI)
- Skip items with confidence < 0.5
- Use cheapest models (gpt-4o-mini, haiku, flash) for frequent polling

**Dedup**: `{platform}::{model}::{contentHash first 16 chars}` — prevents the same LLM from creating duplicate stories across polls.

**Key Advantage**: Grok has real-time access to X/Twitter data, making it the best LLM source for breaking news detection. It should be the first LLM source enabled.

## Per-Account Credentials

Each account stores their own API keys via the `AccountCredential` model:

```
Account "Houston Daily"
├── Credential: NewsAPI (apiKey: "abc...")
├── Credential: OpenAI (apiKey: "sk-...")
├── Credential: Grok (apiKey: "xai-...")
└── Credential: Gemini (apiKey: "AIza...")
```

The ingestion scheduler reads credentials from the database and passes them to job payloads. This means:
- Each account pays for their own API usage
- Platform operator doesn't need to provide keys (except for global sources)
- Credentials are tested via the admin API before use
- Failed credentials are marked with `lastError` for admin visibility
