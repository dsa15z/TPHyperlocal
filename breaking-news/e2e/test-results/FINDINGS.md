# QA Test Report — TPHyperlocal Breaking News Intelligence Platform

**Date:** March 31, 2026
**Tester:** Automated QA (Playwright + curl)
**Backend:** https://tphyperlocal-production.up.railway.app
**Frontend:** Vercel (auto-deploy from main)

---

## Executive Summary

- **API Endpoints Tested:** 15
- **Bugs Found:** 5 (2 critical, 2 major, 1 minor)
- **Security Issues:** 0 critical (admin endpoints properly reject unauthenticated requests)
- **Performance Issues:** 2 (queue backlog, slow story endpoint)
- **Data Validation:** Story data passes schema validation (scores 0-1, valid statuses)

---

## CRITICAL BUGS

### BUG-001: Search endpoint returns 500 (Internal Server Error)
**Severity:** CRITICAL
**Endpoint:** `GET /api/v1/search?q=Houston`
**Error:** `Invalid prisma.sourcePost.groupBy() invocation` — the enhanced search route uses `groupBy` with a `select` syntax that isn't supported by the current Prisma version. The `select` inside `groupBy` expects `_count` as a direct field, not nested.
**Impact:** Search is completely broken. Users cannot search for stories.
**Fix:** Update the `groupBy` query in `breaking-news/backend/src/routes/search.ts` to use the correct Prisma syntax: `_count: { id: true }` instead of `select: { _count: { select: { id: true } } }`.
**Reproduction:**
```bash
curl https://tphyperlocal-production.up.railway.app/api/v1/search?q=Houston
```

### BUG-002: Public Data Alerts table doesn't exist
**Severity:** CRITICAL
**Endpoint:** `GET /api/v1/public-data/alerts`
**Error:** `The table public.PublicDataAlert does not exist in the current database` (Prisma P2021)
**Impact:** Public alerts page is broken. Weather, court, government agenda alerts cannot display.
**Fix:** Run Prisma migration to create the missing table: `cd backend && npx prisma migrate deploy` or `npx prisma db push`.
**Reproduction:**
```bash
curl https://tphyperlocal-production.up.railway.app/api/v1/public-data/alerts
```

---

## MAJOR BUGS

### BUG-003: Ingestion queue has 6,471 waiting jobs with 0 active workers
**Severity:** MAJOR
**Observation:** Pipeline status shows `ingestion: waiting=6471, active=0, completed=151, failed=544`.
**Impact:** No new stories are being ingested. The worker service is either not running or not processing the ingestion queue. RSS feeds are being polled (queuing jobs) but nothing is consuming them.
**Likely Cause:** Worker service on Railway may not have redeployed after recent code changes, or has crashed due to missing dependencies (new workers reference modules that don't exist yet).
**Fix:** Check Railway worker service logs. Redeploy worker. Verify all worker imports resolve correctly.

### BUG-004: 544 failed ingestion jobs (RSS feeds returning 404)
**Severity:** MAJOR
**Observation:** Multiple RSS feed URLs are returning 404. These are likely from the 200+ expanded source seed data that contains constructed URLs that may not be real.
**Impact:** ~25% of ingestion jobs fail, wasting queue resources and generating noise in logs.
**Fix:** Validate all RSS feed URLs in `expanded-sources.ts`. Remove or disable sources with invalid URLs. The `POST /pipeline/validate-feeds` endpoint exists for this purpose.

---

## MINOR BUGS

### BUG-005: Frontend Vercel returns 401 on all routes
**Severity:** MINOR (environment config)
**Observation:** All Vercel deployment URLs return HTTP 401.
**Likely Cause:** Vercel deployment may have authentication enabled (Vercel Authentication / password protection), or the deployment is behind a preview URL that requires login to Vercel.
**Fix:** Check Vercel project settings → General → Password Protection. If enabled, disable for production deployment.

---

## SECURITY AUDIT

### Authentication
| Test | Result |
|------|--------|
| Admin endpoints reject unauthenticated requests | ✅ PASS (401) |
| `/api/v1/admin/sources` without auth | 401 ✅ |
| `/api/v1/admin/markets` without auth | 401 ✅ |
| `/api/v1/admin/coverage` without auth | 401 ✅ |
| Public endpoints accessible without auth | ✅ PASS |
| Stories/search/health accessible publicly | ✅ PASS |

### Data Validation
| Test | Result |
|------|--------|
| Story scores are 0-1 range | ✅ PASS |
| Story statuses are valid enum values | ✅ PASS |
| Source counts are non-negative | ✅ PASS |
| No PII leaked in public endpoints | ✅ PASS |

### Error Handling
| Test | Result |
|------|--------|
| 500 errors expose internal Prisma stack traces | ⚠️ FAIL — error messages contain full Prisma query text |
| Error responses have consistent format | ✅ PASS (statusCode, error, message) |

**Recommendation:** In production, error messages should NOT contain Prisma query details. Add an error handler that sanitizes error messages in production mode.

---

## PERFORMANCE

| Endpoint | Response Time | Status |
|----------|:---:|--------|
| `GET /health` | 1.37s | ⚠️ Slow for health check (should be <200ms) |
| `GET /stories?limit=3` | ~1.5s | Acceptable |
| `GET /stories/breaking` | 0.73s | Good |
| `GET /analytics/overview` | 0.30s | Good |
| `GET /stories/trending` | 0.51s | Good |
| `GET /stories/sources` | 0.22s | Good |
| `GET /search?q=Houston` | 0.29s | 500 error (see BUG-001) |
| `GET /analytics/domain-scores` | 0.34s | Good |

### Queue Health
| Queue | Waiting | Active | Completed | Failed |
|-------|:---:|:---:|:---:|:---:|
| ingestion | 6,471 | 0 | 151 | 544 |

**Critical:** Ingestion queue is backlogged with no active workers. This means NO new content is flowing through the pipeline.

---

## DATA QUALITY

### Story Data (from API)
- Stories have valid composite scores (0.37-0.47 range observed)
- Stories have valid statuses (STALE for older stories)
- Source counts are high (10-54 per story) — some may be inflated by pre-fix duplicates
- Categories are assigned (SPORTS, BUSINESS observed)
- Stories have titles and timestamps

### Deduplication
- One story "Gary Woodland Leads 2026 Houston Open" has 42 sources — possibly still includes pre-dedup duplicates from the same RSS feed
- Verify the content-hash dedup fix is active by checking if new stories have lower source counts

---

## RECOMMENDATIONS

### Immediate (fix today)
1. **Fix search endpoint** — correct the Prisma groupBy syntax
2. **Run database migrations** — `npx prisma db push` to create missing tables (PublicDataAlert, etc.)
3. **Restart/redeploy worker** — ingestion queue has 6K+ stuck jobs
4. **Sanitize error messages** — don't expose Prisma internals in 500 responses
5. **Validate RSS URLs** — run `/pipeline/validate-feeds` on expanded sources

### Short-term (this week)
6. **Fix health endpoint latency** — 1.37s is too slow; add a fast-path that skips DB check
7. **Add rate limiting to search** — currently no rate limit on search endpoint
8. **Clean up failed ingestion jobs** — 544 failed jobs are consuming Redis memory
9. **Monitor queue depth** — set up alerts when waiting > 100

### Medium-term
10. **Add integration tests to CI** — the Playwright suite in `e2e/` should run on every deploy
11. **Add database health monitoring** — missing tables should be caught before deployment
12. **Add error alerting** — 500 errors should trigger Slack/email notifications

---

## TEST SUITE LOCATION

```
breaking-news/e2e/
├── playwright.config.ts        # Playwright configuration
├── lib/
│   └── helpers.ts              # Test utilities, login, collectors
├── tests/
│   ├── 01-app-mapping.spec.ts  # Full app crawl + sitemap generation
│   ├── 02-dashboard.spec.ts    # Dashboard table, filters, sorting, views
│   ├── 03-story-detail.spec.ts # Story detail page + AI panels
│   ├── 04-admin-pages.spec.ts  # All 23 admin pages load check
│   ├── 05-newsroom-pages.spec.ts # All 18 newsroom pages load check
│   ├── 06-api-health.spec.ts   # Backend API endpoint validation
│   └── 07-navigation.spec.ts   # Sidebar nav link verification
└── test-results/               # Output directory
```

### Running Tests
```bash
cd breaking-news/e2e
npm install
npx playwright test                    # Run all tests
npx playwright test tests/06-api       # Run specific test file
npx playwright test --reporter=html    # Generate HTML report
```
