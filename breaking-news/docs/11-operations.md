# Section 11 — Background Jobs and Operations

## Polling Schedules

| Source Type | Interval | Queue | Notes |
|---|---|---|---|
| RSS Feeds | 2 min | `ingestion` | Highest frequency, zero cost |
| NewsAPI | 3 min | `ingestion` | Watch daily quota on free tier |
| Facebook Pages | 5 min | `ingestion` | 200 calls/hr rate limit |
| Twitter/X | 3 min | `ingestion` | Watch monthly read quota |
| GDELT | 5 min | `ingestion` | Free, cross-validation |
| LLM Providers | 10 min | `llm-ingestion` | Cost-controlled, max 4/min |
| Score Decay | 10 min | `scoring` | Re-score all non-archived |
| Cleanup/Archive | 60 min | `scoring` | Archive 72h+ inactive stories |

## Queue Architecture (BullMQ)

```
ingestion ──→ enrichment ──→ clustering ──→ scoring
llm-ingestion ──↗
```

| Queue | Concurrency | Retry | Notes |
|---|---|---|---|
| `ingestion` | 5 | 3× exponential (2s, 8s, 32s) | Main source polling |
| `llm-ingestion` | 3 | 3× exponential | Rate-limited: 4 jobs/min |
| `enrichment` | 10 | 3× exponential | Fast keyword matching |
| `clustering` | 5 | 3× exponential | Compares against recent stories |
| `scoring` | 5 | 3× exponential | Score calculation |

## Job Lifecycle

- **Job TTL**: 1 hour (stale jobs discarded)
- **Remove on complete**: Keep last 1000 jobs / 24 hours
- **Remove on fail**: Keep last 5000 failed jobs / 7 days
- **Dead letter**: After max retries, jobs remain in failed state for inspection

## Idempotency

| Stage | Guard |
|---|---|
| Ingestion | `platformPostId` unique index — duplicate insert fails gracefully |
| Clustering | `StorySource(storyId, sourcePostId)` unique constraint |
| Scoring | Score snapshots are append-only. Re-scoring is safe to repeat. |

## Backfill Support

- Admin can trigger manual ingestion for a specific source + time range
- Backfill jobs use lower BullMQ priority to avoid blocking live polling
- Idempotency guards prevent duplicate data from backfills

## Observability

| Layer | Tool |
|---|---|
| Structured logging | Pino with JSON output, child loggers per worker |
| Queue metrics | BullMQ built-in: completion rate, wait time, active count |
| Health checks | `/api/v1/health` — DB latency, Redis latency, queue depth |
| Alerts | Log warnings when queue depth > 100, error when source not polled in 3× interval |

## Admin Operations

| Operation | Method |
|---|---|
| Manual re-score | POST job to scoring queue for specific story |
| Force re-cluster | Recalculate story-source links for a time range |
| Source pause/resume | Toggle `isActive` on Source record |
| Credential test | POST `/admin/credentials/:id/test` — validates API key |
| Story merge/split | Admin API endpoints (v2) |
