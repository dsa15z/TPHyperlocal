# TopicPulse E2E QA Report

**Date:** 2026-04-03
**Tested against:** Production (Railway + Vercel)
**Backend:** tphyperlocal-production.up.railway.app
**Frontend:** tp-hyperlocal.vercel.app

---

## Executive Summary

| Category | Result |
|----------|--------|
| **Tests Run** | 214 |
| **Passed** | 188 (88%) |
| **Failed** | 26 (12%) |
| **Frontend Pages** | 51/51 pass (100%) |
| **Backend Endpoints** | 137/163 pass (84%) |
| **Critical Bugs** | 4 |
| **High-Severity Bugs** | 8 |
| **Medium Bugs** | 14 |

---

## CRITICAL BUGS (Fix immediately)

### C1. Pagination Returns Duplicate Stories
- **Endpoint:** `GET /stories?limit=5&offset=0` vs `offset=5`
- **Impact:** Users scrolling through stories see repeated items. Data tables show unreliable results.
- **Root Cause:** Missing tiebreaker in `ORDER BY`. When multiple stories share the same `compositeScore`, PostgreSQL returns them in non-deterministic order.
- **File:** `backend/src/routes/stories.ts` ~line 492
- **Fix:** Add `{ id: 'asc' }` as secondary sort:
  ```typescript
  orderBy: [{ [sort]: order }, { id: 'asc' }]
  ```

### C2. Hardcoded Credentials in Frontend
- **File:** `frontend/src/app/login/page.tsx` lines 57, 71
- **Impact:** Production code contains hardcoded email/password for a "bypass" login button.
- **Fix:** Remove the hardcoded credentials and bypass button entirely.

### C3. Admin Markets Endpoint Crashes (500)
- **Endpoint:** `GET /admin/markets` -> 500 Internal Server Error
- **Impact:** The entire Markets admin page is broken. Cannot view, edit, or manage markets.
- **Root Cause:** Missing `request.accountUser` property - middleware not setting it correctly.
- **File:** `backend/src/routes/admin/markets.ts` ~line 123
- **Fix:** Use `getAccountUser(request)` helper with null check.

### C4. Account Stories Endpoint Crashes (500)
- **Endpoint:** `GET /account-stories` -> 500
- **Impact:** The copy-on-write derivative system is broken. Users cannot see their personalized story workspace.
- **Root Cause:** Missing null check after `getAccountUser(request)` - accessing `.accountId` on null.
- **File:** `backend/src/routes/account-stories.ts` ~line 55
- **Fix:** Add `if (!au) return reply.status(401).send(...)` guard.

---

## HIGH-SEVERITY BUGS

### H1. Admin Pages Not Auth-Protected (Frontend)
- **Impact:** All 25+ admin pages render UI without checking user role. Non-admin users can load admin pages.
- **Files:** All `frontend/src/app/admin/*/page.tsx`
- **Fix:** Add `useUser()` hook check + redirect at top of each admin page.

### H2. Notifications Endpoints Crash (500)
- **Endpoints:** `GET /notifications`, `GET /notifications/preferences`
- **Root Cause:** Wrong query field (`recipient` instead of `userId`) and invalid composite key syntax.
- **File:** `backend/src/routes/notifications.ts` lines 18, 37-38

### H3. RBAC Endpoints All Crash (500)
- **Endpoints:** `GET /admin/rbac/tenants`, `/rbac/roles`, `/rbac/permissions`
- **Root Cause:** Missing null check after `requireSuperAdmin(request, reply)`.
- **File:** `backend/src/routes/admin/rbac.ts`

### H4. Stocks Live Feed Crashes (500)
- **Endpoint:** `GET /stocks/live`
- **Root Cause:** Cache library not initialized or Redis cache function failing.
- **File:** `backend/src/routes/stocks.ts` lines 55-65

### H5. Moderation Queue Crashes (500)
- **Endpoint:** `GET /moderation/queue`
- **Root Cause:** Missing safeParse error handling on query parameters.
- **File:** `backend/src/routes/moderation.ts` line 25-32

### H6. Social Accounts Crashes (500)
- **Endpoint:** `GET /social/accounts`
- **Root Cause:** Missing payload validation after `getPayload(request)`.
- **File:** `backend/src/routes/social-publish.ts` line 393

### H7. Double Admin Prefix on Webhooks Route (404)
- **Endpoint:** `GET /admin/webhooks` -> 404
- **Root Cause:** Route defined as `/admin/webhooks` but registered under `/admin` prefix, resulting in `/admin/admin/webhooks`.
- **File:** `backend/src/routes/admin/webhooks.ts` line 59
- **Fix:** Remove `/admin` prefix from route definitions in webhooks.ts.

### H8. Double Admin Prefix on Review Queue (404)
- **Endpoint:** `GET /admin/stories/review-queue` -> 404
- **Root Cause:** Same double-prefix issue as H7.
- **File:** `backend/src/routes/admin/editor.ts` line 147
- **Fix:** Change routes from `/admin/stories/...` to `/stories/...`.

---

## MEDIUM-SEVERITY BUGS

### M1. Sort by sourceCount Not Supported (400)
- **Endpoint:** `GET /stories?sort=sourceCount`
- **Impact:** Frontend "Sources" column header click fails silently.
- **Root Cause:** Zod enum doesn't include `sourceCount`.
- **File:** `backend/src/routes/stories.ts` lines 21-29
- **Fix:** Add `'sourceCount'` to the sort enum and handle in orderBy.

### M2. Annotations Endpoints Crash (500)
- **Endpoints:** `GET /stories/:id/annotations`, `GET /annotations/recent`
- **Root Cause:** Missing Prisma relation or field reference on StoryAnnotation model.
- **File:** `backend/src/routes/annotations.ts`

### M3. Conversation Starters Crash (500)
- **Endpoint:** `GET /conversation-starters/:storyId`
- **Root Cause:** Array method called on null `aiDrafts`.
- **File:** `backend/src/routes/conversation-starters.ts` line 130

### M4. User Settings Access Crashes (500)
- **Endpoint:** `GET /user/settings/access`
- **Root Cause:** Invalid Prisma include/select nesting for `account.markets`.
- **File:** `backend/src/routes/user-settings.ts` line 79

### M5. Workflow Publish Queue Crashes (500)
- **Endpoint:** `GET /workflow/publish-queue`
- **Root Cause:** Invalid nested include syntax for `accountStory.baseStory`.
- **File:** `backend/src/routes/workflow.ts` line 382

### M6. Markets Autofill Crashes (500)
- **Endpoint:** `POST /admin/markets/autofill`
- **Root Cause:** Unhandled LLM API error (missing try-catch).
- **File:** `backend/src/routes/admin/markets.ts` line 564

### M7. Empty Search Query Returns 400
- **Endpoint:** `GET /search?q=`
- **Impact:** If user clears search box and presses Enter, they get an error instead of all results.
- **Root Cause:** Zod validates `q` must be at least 1 character.
- **Fix:** Either allow empty string (return all results) or handle gracefully in frontend.

### M8. No Token Refresh on 401
- **File:** `frontend/src/lib/api.ts` lines 159-175
- **Impact:** When JWT expires, all API calls fail with generic errors instead of redirecting to login.
- **Fix:** Add 401 handler to `apiFetch()` that clears token and redirects.

### M9. Missing Error States on 6+ Frontend Pages
- **Files:** alerts, rising, radio, briefings, bookmarks pages
- **Impact:** Pages show empty state instead of error message when API fails.

### M10. CMS/MOS Config Requires Admin Role (403)
- **Endpoints:** `GET /cms/config`, `GET /cms/published`, `GET /mos/config`
- **Impact:** Test account (OWNER role) gets 403. May affect non-superadmin users.
- **Note:** May be intentional - needs role-based access review.

### M11. Headline Test Returns 404 (Expected)
- **Endpoint:** `GET /stories/:id/headlines/test` -> 404
- **Impact:** Low - returns "No headline test found" which is correct if no test exists.

### M12. FilterBar Sort State Not Persisted
- **Impact:** Sort order is not saved to URL or views, creating inconsistency with filters.

### M13. Settings Page Null-Check Issues
- **File:** `frontend/src/app/settings/page.tsx`
- **Impact:** Potential crashes when accessing deeply nested profile properties.

### M14. Login Credentials from Handoff Document Invalid
- **Credentials:** `derek@futuri.com / Futuri2026` -> 401 Unauthorized
- **Impact:** Previous session credentials no longer work. Password may have been changed.

---

## WHAT'S WORKING WELL

### Backend (137/163 endpoints pass = 84%)
- **Health system:** All 3 health endpoints return correctly with db+redis status
- **Authentication:** Login, register, JWT validation, bad-credential rejection all work
- **Stories API:** Full CRUD, all 8 status filters, 4/5 sort fields, detail + sub-resources
- **Search:** Full-text search, NLP queries, suggest, trending all work
- **Pipeline:** Status, all 4 queue job listings, source polling all work
- **Analytics:** All 11 analytics endpoints return data
- **Admin sources:** List, filter by type, test RSS feed URL all work
- **All editorial features:** Assignments, reporters, show prep, deadlines, pulses, topic clusters, bookmarks, beat alerts, shift briefings, voice tone, radio scripts, video projects, lineup history
- **Credentials, coverage, feeds, billing, SSO, surveys, merge phrases** all working

### Frontend (51/51 pages = 100% render)
- Every single one of the 51 frontend routes returns HTTP 200 with substantial HTML (22-28KB each)
- No broken pages, no 404s, no 500s on any frontend route
- Proper page sizes indicate real content rendering, not empty shells

---

## ENDPOINT TEST RESULTS (Full List)

### Passed (188)
```
AUTH: login, bad-login-reject, /me, /me-noauth, is-superadmin
HEALTH: /health, /health/database, /health/detailed, db+redis healthy
STORIES: list, data-array, id-field, compositeScore, pagination-object,
  /sources, /facets, /breaking, /trending, /teaser, /rising, /multilingual,
  ?status=BREAKING/DEVELOPING/TOP_STORY/ONGOING/ALERT/FOLLOW_UP/STALE/ARCHIVED,
  ?sort=compositeScore/firstSeenAt/breakingScore/trendingScore,
  /:id detail, /:id/related, /:id/transitions, /:id/predictions,
  /:id/fact-checks, /:id/translations, /:id/videos, /:id/first-drafts,
  /:id/analytics, /:id/research, /:id/breaking-packages, /:id/editors
SEARCH: ?q=fire, /suggest, /trending, NLP-weather, NLP-crime, +category
ADMIN SOURCES: list, by-type, test-rss
ADMIN MARKETS: msa-database
PIPELINE: status, jobs/ingestion/enrichment/clustering/scoring,
  /activity, available-sources, scrape-sources
FEEDS: list
ANALYTICS: overview, domain-scores, timeline, engagement, velocity,
  coverage, pipeline, content, stories/top, reporters, realtime
NEWSROOM: assignments, reporters, show-prep, show-deadlines, deadlines/status,
  pulses, topic-clusters, bookmarks, stocks/alerts, moderation/words,
  predictions/dashboard, fact-checks/flagged, radio/scripts, history-of-the-day,
  video/projects, headlines/active-tests, publish-queue, publish-queue/stats,
  lineup/history, beat-alerts, beat-alerts/active, shift-briefings, voice-tone,
  assistant/alerts, hyperlocal-intel/status, public-data/alerts
ADMIN: account, account/users, voices, feature-flags, digests, audit-logs,
  knowledge, prompts, dashboards, widgets, audio-sources, slack,
  community-radar, community-radar/feed, community-radar/sentiment,
  topicpulse-md, broadcast-monitor/competitors/dashboard/timeline,
  sso/metadata, sso/accounts, billing/plans, billing/subscription,
  surveys, merge-phrases, media/pending, feed-review/queue, activity/online
USER: profile, preferences, views, subscriptions
WORKFLOW: stages
FRONTEND: all 51 pages render (100%)
```

### Failed (26)
```
500 ERRORS (14):
  /stories/:id/annotations, /conversation-starters/:id,
  /admin/markets, /admin/markets/autofill, /account-stories,
  /notifications, /notifications/preferences, /stocks/live,
  /moderation/queue, /annotations/recent, /social/accounts,
  /admin/rbac/tenants, /admin/rbac/roles, /admin/rbac/permissions,
  /user/settings/access, /workflow/publish-queue

404 ERRORS (2):
  /admin/webhooks (double prefix bug),
  /admin/stories/review-queue (double prefix bug)

403 ERRORS (3):
  /cms/config, /cms/published, /mos/config (admin role required)

400 ERRORS (2):
  /stories?sort=sourceCount (missing from enum),
  /search?q= (empty string validation)

LOGIC BUGS (2):
  Pagination duplicates (missing ORDER BY tiebreaker),
  Markets: empty result (likely linked to 500)

SECURITY (1):
  Hardcoded credentials in login page

AUTH (1):
  No 401/token-refresh handler
```

---

## RECOMMENDED FIX PRIORITY

### Sprint 1 (Immediate)
1. Fix pagination tiebreaker (C1) - 1 line change
2. Remove hardcoded credentials (C2) - delete 2 lines
3. Fix admin/markets null check (C3) - 3 lines
4. Fix account-stories null check (C4) - 3 lines
5. Fix double-prefix on webhooks + editor routes (H7, H8) - rename routes

### Sprint 2 (This week)
6. Add auth guards to admin pages (H1)
7. Fix notifications query (H2)
8. Fix RBAC null checks (H3)
9. Fix stocks cache (H4)
10. Fix moderation query (H5)
11. Add sourceCount to sort enum (M1)

### Sprint 3 (Next week)
12. Fix annotations relations (M2)
13. Fix conversation-starters null check (M3)
14. Fix user-settings Prisma query (M4)
15. Fix workflow publish-queue query (M5)
16. Add 401 handler to frontend API client (M8)
17. Add error states to 6+ frontend pages (M9)
