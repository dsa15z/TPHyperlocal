# Section 5 — Story Aggregation and Deduplication

## Canonical Story Cluster Model

A **Story** is the canonical record for a real-world event. Multiple **SourcePosts** link to it via the **StorySource** join table:

```
Story: "Major fire at Galleria-area apartment complex"
├── StorySource[0] → SourcePost (RSS, Houston Chronicle, similarity: 0.92, isPrimary: true)
├── StorySource[1] → SourcePost (NewsAPI, AP, similarity: 0.87)
├── StorySource[2] → SourcePost (Facebook, HFD Page, similarity: 0.71)
├── StorySource[3] → SourcePost (LLM_GROK, grok-3, similarity: 0.65)
└── StorySource[4] → SourcePost (Twitter, @HoustonFire, similarity: 0.58)
```

## v1 Approach: Jaccard + Entity Overlap + Time Proximity

### Text Normalization Pipeline

```
1. Lowercase all text
2. Remove URLs: /https?:\/\/\S+/g → ""
3. Remove special characters: /[^a-z0-9\s]/g → ""
4. Remove stopwords (80+ English words: the, a, an, is, was, etc.)
5. Collapse whitespace: /\s+/g → " "
6. Generate contentHash = SHA-256(normalizedText)
```

### Dedup Strategy (3 Layers)

| Layer | Check | Action |
|---|---|---|
| **Exact dupe** | `platformPostId` unique index | Skip silently at ingestion |
| **Content dupe** | Same `contentHash` | Skip at ingestion |
| **Near dupe** | Jaccard similarity on word sets > 0.6 | Merge into existing story |

### Similarity Scoring Formula

```
combined_similarity = 0.6 × text_similarity + 0.2 × entity_similarity + 0.2 × time_proximity
```

**Text similarity**: Jaccard coefficient on word sets (after normalization + stopword removal)
```
jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

**Entity similarity**: Overlap of extracted entities weighted by type
```
category_match = 1.0 if same non-OTHER category, else 0.0
location_match = 1.0 if shared location/neighborhood, else 0.0
neighborhood_match = 1.0 if same neighborhood, else 0.0
entity_similarity = (category_match + location_match + neighborhood_match) / 3
```

**Time proximity**: Exponential decay with 2-hour half-life
```
time_proximity = exp(-|timeA - timeB| / (2 × 3600))
```

**Clustering threshold**: `combined_similarity > 0.4` → merge into existing story

### Cross-Platform Clustering Algorithm

When a new SourcePost arrives after enrichment:

1. Check `contentHash` for exact duplicate → skip if match
2. Fetch all Stories updated in last 24 hours with `status != ARCHIVED` and `mergedIntoId = null`
3. For each story, compare against its most recent 10 source posts:
   a. Calculate max text similarity across all story posts
   b. Calculate entity similarity against story's category/location/neighborhood
   c. Calculate time proximity against story's lastUpdatedAt
   d. Combine: `0.6 × text + 0.2 × entity + 0.2 × time`
4. Find best matching story
5. If `best_match > 0.4`:
   - Create StorySource link (isPrimary: false, similarityScore: best_match)
   - Increment sourceCount
   - Update category if new post has more specific category
   - Update location if story doesn't have one yet
   - Update lastUpdatedAt
6. If no match:
   - Create new Story with this as primary source (isPrimary: true, similarityScore: 1.0)
   - Copy title, category, location from the source post

### Entity Extraction (v1 — Regex-Based)

**Locations**: Match against 90+ Houston neighborhoods:
```
Downtown, Midtown, Montrose, Heights, Galleria, River Oaks, Memorial,
Katy, Sugar Land, The Woodlands, Spring, Pearland, Pasadena, Baytown,
League City, Clear Lake, Cypress, Humble, Kingwood, Bellaire, West U,
Third Ward, Fifth Ward, East End, EaDo, Sharpstown, Gulfton, Alief...
```

**Organizations**: Known list (HPD, HFD, METRO, HISD, Harris County, TxDOT) + title-case multi-word patterns with org keywords (Police, Department, Authority, University, Hospital, Inc)

**People**: Title-case bigrams/trigrams not matching known orgs or locations

**Categories**: Keyword lists per category (30+ keywords each for CRIME, WEATHER, TRAFFIC, etc.)

### Merging Updates Into Existing Stories

| Field | Strategy |
|---|---|
| title | Use title from highest-trust source post |
| summary | Use longest content snippet from most credible source |
| category | Keep existing unless new post has non-OTHER and story is OTHER |
| location | Most specific mentioned (neighborhood > city > county) |
| neighborhood | First detected, then only overridden by higher-trust source |
| firstSeenAt | Earliest source post timestamp (never changes) |
| lastUpdatedAt | Always update to now() |
| sourceCount | Recalculated from StorySource count |

### Handling Conflicts

- **Disagreeing categories**: If source posts disagree, lower confidenceScore
- **Single low-trust source**: Stay EMERGING, don't promote to BREAKING
- **Conflicting locations**: Flag for human review if 2+ sources report different neighborhoods
- **LLM vs traditional disagreement**: Always prefer traditional news sources over LLM claims

## v2 Approach: Semantic Embeddings + LLM Summarization

### Embeddings
- Use OpenAI `text-embedding-3-small` (1536 dimensions, $0.02/1M tokens)
- Store in PostgreSQL via `pgvector` extension
- Cosine similarity > 0.8 for clustering (much more accurate than Jaccard)
- Index with IVFFlat or HNSW for fast nearest-neighbor search

### LLM Summarization
- When a story reaches 3+ source posts, generate a canonical summary via LLM
- Dual-AI pipeline (from x repo pattern):
  1. **Pass 1 (Grok/GPT-4o)**: Synthesize all source posts into structured JSON (headline, summary, key_points, people, organizations, category)
  2. **Pass 2 (Claude)**: Polish to publication quality, fact-check against source posts
  3. If Pass 2 fails, fall back to Pass 1 output
- Store in `story.aiSummary`
- Estimated cost: ~$0.15/1K summaries

### Status-Based Processing (from x repo pattern)
```
PENDING → PROCESSING → SUMMARIZED → POLISHED → PUBLISHED
```
With retry limits and FAILED state for error handling.
