# Section 12 — Security, Compliance, and Risk

## Platform Terms of Service

| Platform | Risk | Mitigation |
|---|---|---|
| Facebook Pages API | Low | App Review approved, stay within permissions |
| Instagram | N/A | Not used — no access path exists |
| Nextdoor | N/A | Not used — no API exists |
| Twitter/X | Low | Paid API tier, follow rate limits |
| RSS/NewsAPI | None | Public/licensed access |
| LLM Providers | Low | Standard API usage within terms |
| **Any scraping** | **HIGH** | **Forbidden. Do not attempt.** |

## Privacy

- **No personal data collection**: Only public posts from official pages/feeds and LLM-generated summaries
- **No user tracking**: No third-party analytics cookies
- **Content attribution**: Always link back to original source
- **Data minimization**: Store only fields needed for clustering/scoring
- **LLM outputs**: May contain PII from training data — sanitize before display

## Authentication & Authorization

| Layer | Mechanism |
|---|---|
| User auth | bcryptjs (12 rounds) + JWT (24h expiry) |
| API auth | API key via `x-api-key` header |
| Role-based access | VIEWER, EDITOR, ADMIN, OWNER |
| Account isolation | All queries scoped by accountId |
| Credential storage | Per-account API keys stored encrypted, masked in all responses |

## Secrets Management

- All API keys/tokens in Railway/Vercel environment variables
- Never committed to git (`.env` in `.gitignore`)
- Per-account credentials in `AccountCredential` table (encrypted at rest in PostgreSQL)
- JWT_SECRET: minimum 32 characters, rotated quarterly
- API responses NEVER return raw credential values (`maskSecret()` applied)

## Rate Limiting

| Endpoint Type | Limit | Key |
|---|---|---|
| Public API | 100 req/min | API key |
| Frontend | 200 req/min | JWT user ID |
| RSS feeds | 60 req/min | IP address |
| Admin | 50 req/min | JWT user ID |
| Auth (login) | 5 req/min | IP address |

## Retention

| Data | Retention | Action |
|---|---|---|
| Source posts | 90 days | Archive then delete |
| Stories | Indefinite | Small records, scores pruned |
| Score snapshots | Hourly → daily → weekly | Aggregated after 24h/7d/30d |
| Audit logs | 1 year | Then delete |
| Credentials | Until deleted by admin | Encrypted at rest |

## Legal Review Checkpoints

1. Before Facebook integration: Confirm App Review approval and ToS compliance
2. Before Twitter integration: Review current API terms (change frequently)
3. Before exposing API to third parties: Terms of service for downstream users
4. Before adding any scraping: **Legal review required — recommendation: don't**
5. Before storing LLM outputs: Review LLM provider terms regarding output ownership

## Architecture Risks

| Risk | Severity | Recommendation |
|---|---|---|
| Scraping any platform | **Critical** | Do not do this. Use APIs only. |
| Storing full copyrighted articles | High | Store summaries, link to originals |
| Republishing social content | Medium | Attribute and link. Don't embed without permission. |
| LLM hallucinated stories | Medium | Low trust scores, require corroboration for BREAKING |
| Single-source breaking alerts | Low | Require 2+ sources for BREAKING status |
| Credential exposure | High | Mask all secrets, encrypt at rest, audit access |
| Multi-tenant data leakage | High | All queries scoped by accountId, test isolation |
