#!/bin/bash
# TopicPulse Comprehensive E2E Test Suite (Fixed version)
# Tests ALL backend endpoints and frontend pages against production

BACKEND="https://tphyperlocal-production.up.railway.app"
FRONTEND="https://tp-hyperlocal.vercel.app"
PASS=0
FAIL=0
FAILURES=""

log_pass() {
  PASS=$((PASS + 1))
  echo "  PASS: $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  FAILURES="${FAILURES}${FAIL}. $1\n"
  echo "  FAIL: $1"
}

# Test a GET endpoint - returns http code
test_get() {
  local name="$1"
  local url="$2"
  local use_auth="$3"
  local expected="${4:-200}"

  local auth_header=""
  if [ "$use_auth" = "auth" ] && [ -n "$TOKEN" ]; then
    auth_header="-H \"Authorization: Bearer $TOKEN\""
  fi

  local http_code
  local body
  body=$(eval curl -s --connect-timeout 15 --max-time 30 $auth_header "\"$url\"" 2>&1)
  http_code=$(eval curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 $auth_header "\"$url\"" 2>&1)

  if [ "$http_code" = "$expected" ]; then
    if [ -z "$body" ] || [ "$body" = "null" ] || [ "$body" = "" ]; then
      log_fail "$name -> $http_code but EMPTY body"
    else
      log_pass "$name -> $http_code"
    fi
  elif [ "$http_code" = "000" ]; then
    log_fail "$name -> CONNECTION FAILED"
  else
    local snippet=$(echo "$body" | head -c 150)
    log_fail "$name -> expected $expected, got $http_code ($snippet)"
  fi

  LAST_BODY="$body"
  LAST_CODE="$http_code"
}

# Test a POST endpoint
test_post() {
  local name="$1"
  local url="$2"
  local data="$3"
  local use_auth="$4"
  local expected="${5:-200}"

  local auth_header=""
  if [ "$use_auth" = "auth" ] && [ -n "$TOKEN" ]; then
    auth_header="-H \"Authorization: Bearer $TOKEN\""
  fi

  local http_code
  http_code=$(eval curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 \
    -H \"Content-Type:\ application/json\" $auth_header -X POST -d "'$data'" "\"$url\"" 2>&1)

  if [ "$http_code" = "$expected" ]; then
    log_pass "$name -> $http_code"
  elif [ "$http_code" = "000" ]; then
    log_fail "$name -> CONNECTION FAILED"
  else
    log_fail "$name -> expected $expected, got $http_code"
  fi
  LAST_CODE="$http_code"
}

# Test frontend page
test_page() {
  local path="$1"
  local result
  result=$(curl -s -o /dev/null -w '%{http_code}:%{size_download}' --connect-timeout 15 --max-time 30 "${FRONTEND}${path}" 2>&1)
  local http_code=$(echo "$result" | cut -d: -f1)
  local size=$(echo "$result" | cut -d: -f2)

  if [ "$http_code" = "200" ]; then
    if [ "$size" -lt 500 ] 2>/dev/null; then
      log_fail "Page ${path} -> 200 but only ${size} bytes (suspiciously small)"
    else
      log_pass "Page ${path} -> 200 (${size}B)"
    fi
  elif [ "$http_code" = "000" ]; then
    log_fail "Page ${path} -> CONNECTION FAILED"
  else
    log_fail "Page ${path} -> expected 200, got $http_code"
  fi
}

echo "============================================================"
echo "  TopicPulse — Full E2E QA Test Suite"
echo "  Testing against PRODUCTION"
echo "============================================================"
echo "Backend:  $BACKEND"
echo "Frontend: $FRONTEND"
echo "Time:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ──── AUTHENTICATE ────
echo "--- AUTHENTICATION ---"

# Login
TOKEN=$(curl -s --connect-timeout 15 --max-time 30 \
  -H "Content-Type: application/json" \
  -X POST -d '{"email":"test-e2e@topicpulse.dev","password":"TestPass123!"}' \
  "${BACKEND}/api/v1/auth/login" 2>&1 | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  log_pass "POST /auth/login -> 200 (token obtained)"
else
  log_fail "POST /auth/login -> no token"
  echo "Trying register as fallback..."
  TOKEN=$(curl -s --connect-timeout 15 --max-time 30 \
    -H "Content-Type: application/json" \
    -X POST -d '{"email":"test-e2e-3@topicpulse.dev","password":"TestPass123!","displayName":"E2E3","accountName":"E2E3"}' \
    "${BACKEND}/api/v1/auth/register" 2>&1 | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    log_pass "POST /auth/register (fallback) -> token obtained"
  else
    log_fail "Cannot authenticate at all - aborting"
    exit 1
  fi
fi

# Bad login -> should be 401
BAD_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 \
  -H "Content-Type: application/json" \
  -X POST -d '{"email":"bad@x.com","password":"wrong"}' \
  "${BACKEND}/api/v1/auth/login" 2>&1)
if [ "$BAD_CODE" -ge 400 ] 2>/dev/null && [ "$BAD_CODE" -lt 500 ] 2>/dev/null; then
  log_pass "POST /auth/login (bad creds) -> $BAD_CODE (rejected)"
else
  log_fail "POST /auth/login (bad creds) -> $BAD_CODE (should be 4xx)"
fi

# /auth/me with token
test_get "GET /auth/me (authed)" "${BACKEND}/api/v1/auth/me" "auth"

# /auth/me without token -> 401
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 "${BACKEND}/api/v1/auth/me" 2>&1)
if [ "$NOAUTH" -ge 400 ] 2>/dev/null; then
  log_pass "GET /auth/me (no auth) -> $NOAUTH (rejected)"
else
  log_fail "GET /auth/me (no auth) -> $NOAUTH (should be 4xx)"
fi

test_get "GET /auth/is-superadmin" "${BACKEND}/api/v1/auth/is-superadmin" "auth"

# ──── HEALTH ────
echo ""
echo "--- HEALTH & CONNECTIVITY ---"
test_get "GET /health" "${BACKEND}/api/v1/health" "noauth"

# Validate health
HEALTH_BODY=$(curl -s --connect-timeout 15 --max-time 30 "${BACKEND}/api/v1/health" 2>&1)
if echo "$HEALTH_BODY" | grep -q '"healthy"'; then
  log_pass "Health: system healthy"
else
  log_fail "Health: system NOT healthy"
fi

test_get "GET /health/database" "${BACKEND}/api/v1/health/database" "noauth"
test_get "GET /health/detailed" "${BACKEND}/api/v1/health/detailed" "noauth"

# ──── STORIES ────
echo ""
echo "--- STORIES API ---"
test_get "GET /stories?limit=10" "${BACKEND}/api/v1/stories?limit=10&offset=0" "auth"
STORIES_BODY="$LAST_BODY"

# Validate response structure
if echo "$STORIES_BODY" | grep -q '"data":\['; then
  log_pass "Stories: response has data array"
else
  log_fail "Stories: response missing data array"
fi

FIRST_STORY_ID=$(echo "$STORIES_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$FIRST_STORY_ID" ]; then
  log_pass "Stories: found story id ($FIRST_STORY_ID)"
else
  log_fail "Stories: no story id in response"
fi

if echo "$STORIES_BODY" | grep -q '"compositeScore"'; then
  log_pass "Stories: has compositeScore"
else
  log_fail "Stories: missing compositeScore"
fi

if echo "$STORIES_BODY" | grep -q '"pagination"'; then
  log_pass "Stories: has pagination"
else
  log_fail "Stories: missing pagination"
fi

# Static story endpoints (MUST be before parametric /:id)
test_get "GET /stories/sources" "${BACKEND}/api/v1/stories/sources" "auth"
test_get "GET /stories/facets" "${BACKEND}/api/v1/stories/facets" "auth"
test_get "GET /stories/breaking" "${BACKEND}/api/v1/stories/breaking" "auth"
test_get "GET /stories/trending" "${BACKEND}/api/v1/stories/trending" "auth"
test_get "GET /stories/teaser (public)" "${BACKEND}/api/v1/stories/teaser" "noauth"
test_get "GET /stories/rising" "${BACKEND}/api/v1/stories/rising" "auth"
test_get "GET /stories/multilingual" "${BACKEND}/api/v1/stories/multilingual" "auth"

# Filter by status
for st in BREAKING DEVELOPING TOP_STORY ONGOING ALERT FOLLOW_UP STALE ARCHIVED; do
  test_get "GET /stories?status=$st" "${BACKEND}/api/v1/stories?status=$st&limit=3" "auth"
done

# Sort variations
for sort in compositeScore firstSeenAt sourceCount breakingScore trendingScore; do
  test_get "GET /stories?sort=$sort" "${BACKEND}/api/v1/stories?sort=$sort&order=desc&limit=3" "auth"
done

# Pagination check
P1_IDS=$(curl -s --connect-timeout 15 --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "${BACKEND}/api/v1/stories?limit=5&offset=0" 2>&1 | grep -o '"id":"[^"]*"' | sort -u)
P2_IDS=$(curl -s --connect-timeout 15 --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "${BACKEND}/api/v1/stories?limit=5&offset=5" 2>&1 | grep -o '"id":"[^"]*"' | sort -u)
OVERLAP=$(comm -12 <(echo "$P1_IDS") <(echo "$P2_IDS") | wc -l)
if [ "$OVERLAP" -eq 0 ] || [ -z "$P1_IDS" ]; then
  log_pass "Pagination: unique results across pages"
else
  log_fail "Pagination: $OVERLAP duplicate IDs between page 1 & 2"
fi

# Story detail + sub-resources
if [ -n "$FIRST_STORY_ID" ]; then
  test_get "GET /stories/:id detail" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}" "auth"
  test_get "GET /stories/:id/related" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/related" "auth"
  test_get "GET /stories/:id/transitions" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/transitions" "auth"
  test_get "GET /stories/:id/predictions" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/predictions" "auth"
  test_get "GET /stories/:id/fact-checks" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/fact-checks" "auth"
  test_get "GET /stories/:id/translations" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/translations" "auth"
  test_get "GET /stories/:id/annotations" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/annotations" "auth"
  test_get "GET /stories/:id/videos" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/videos" "auth"
  test_get "GET /stories/:id/first-drafts" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/first-drafts" "auth"
  test_get "GET /stories/:id/analytics" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/analytics" "auth"
  test_get "GET /stories/:id/research" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/research" "auth"
  test_get "GET /stories/:id/breaking-packages" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/breaking-packages" "auth"
  test_get "GET /stories/:id/headlines/test" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/headlines/test" "auth"
  test_get "GET /stories/:id/editors" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/editors" "auth"
  test_get "GET /conversation-starters/:id" "${BACKEND}/api/v1/conversation-starters/${FIRST_STORY_ID}" "auth"
fi

# ──── SEARCH & NLP ────
echo ""
echo "--- SEARCH & NLP ---"
test_get "GET /search?q=fire" "${BACKEND}/api/v1/search?q=fire&limit=10" "auth"
test_get "GET /search?q= (empty)" "${BACKEND}/api/v1/search?q=&limit=10" "auth"
test_get "GET /search/suggest" "${BACKEND}/api/v1/search/suggest?q=pol" "auth"
test_get "GET /search/trending" "${BACKEND}/api/v1/search/trending" "auth"
test_get "NLP: weather query" "${BACKEND}/api/v1/stories?nlp=breaking+weather+news&limit=5" "auth"
test_get "NLP: crime query" "${BACKEND}/api/v1/stories?nlp=crime+stories+today&limit=5" "auth"
test_get "Search with category filter" "${BACKEND}/api/v1/search?q=crime&category=Crime&limit=5" "auth"

# ──── ADMIN: SOURCES ────
echo ""
echo "--- ADMIN: SOURCES ---"
test_get "GET /admin/sources" "${BACKEND}/api/v1/admin/sources?limit=20" "auth"
test_get "GET /admin/sources/by-type" "${BACKEND}/api/v1/admin/sources/by-type" "auth"
test_post "POST /admin/sources/test (BBC RSS)" "${BACKEND}/api/v1/admin/sources/test" \
  '{"url":"https://feeds.bbci.co.uk/news/rss.xml","platform":"RSS"}' "auth"

# ──── ADMIN: MARKETS ────
echo ""
echo "--- ADMIN: MARKETS ---"
test_get "GET /admin/markets" "${BACKEND}/api/v1/admin/markets" "auth"
MARKETS_BODY="$LAST_BODY"
MARKET_COUNT=$(echo "$MARKETS_BODY" | grep -o '"name"' | wc -l)
if [ "$MARKET_COUNT" -gt 0 ]; then
  log_pass "Markets: found $MARKET_COUNT markets"
  FIRST_MARKET_ID=$(echo "$MARKETS_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$FIRST_MARKET_ID" ]; then
    test_get "GET /admin/markets/:id" "${BACKEND}/api/v1/admin/markets/${FIRST_MARKET_ID}" "auth"
  fi
else
  log_fail "Markets: EMPTY (no markets in database)"
fi
test_post "POST /admin/markets/autofill" "${BACKEND}/api/v1/admin/markets/autofill" \
  '{"city":"Dallas","state":"TX"}' "auth"
test_get "GET /pipeline/msa-database" "${BACKEND}/api/v1/pipeline/msa-database" "auth"

# ──── PIPELINE ────
echo ""
echo "--- PIPELINE ---"
test_get "GET /pipeline/status" "${BACKEND}/api/v1/pipeline/status" "auth"
for q in ingestion enrichment clustering scoring; do
  test_get "GET /pipeline/jobs/$q" "${BACKEND}/api/v1/pipeline/jobs/$q?state=failed&limit=5" "auth"
done
test_get "GET /activity" "${BACKEND}/api/v1/activity" "auth"
test_get "GET /pipeline/available-sources" "${BACKEND}/api/v1/pipeline/available-sources" "auth"
test_get "GET /pipeline/scrape-sources" "${BACKEND}/api/v1/pipeline/scrape-sources" "auth"

# ──── FEEDS ────
echo ""
echo "--- FEEDS ---"
test_get "GET /feeds" "${BACKEND}/api/v1/feeds" "noauth"
FEEDS_BODY="$LAST_BODY"
FEED_SLUG=$(echo "$FEEDS_BODY" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$FEED_SLUG" ]; then
  test_get "GET /feeds/$FEED_SLUG/rss" "${BACKEND}/api/v1/feeds/${FEED_SLUG}/rss" "noauth"
  if echo "$LAST_BODY" | grep -q '<rss\|<?xml'; then
    log_pass "RSS feed: valid XML structure"
  else
    log_fail "RSS feed: not valid XML"
  fi
else
  log_pass "Feeds: no feeds configured (empty list is valid)"
fi

# ──── ACCOUNT STORIES ────
echo ""
echo "--- ACCOUNT STORIES ---"
test_get "GET /account-stories" "${BACKEND}/api/v1/account-stories?limit=10" "auth"

# ──── CREDENTIALS ────
echo ""
echo "--- CREDENTIALS ---"
test_get "GET /admin/credentials" "${BACKEND}/api/v1/admin/credentials" "auth"

# ──── COVERAGE ────
echo ""
echo "--- COVERAGE ---"
test_get "GET /admin/coverage" "${BACKEND}/api/v1/admin/coverage" "auth"

# ──── ANALYTICS ────
echo ""
echo "--- ANALYTICS ---"
for ep in overview domain-scores timeline engagement velocity coverage pipeline content; do
  test_get "GET /analytics/$ep" "${BACKEND}/api/v1/analytics/$ep" "auth"
done
test_get "GET /analytics/stories/top" "${BACKEND}/api/v1/analytics/stories/top" "auth"
test_get "GET /analytics/reporters" "${BACKEND}/api/v1/analytics/reporters" "auth"
test_get "GET /analytics/realtime" "${BACKEND}/api/v1/analytics/realtime" "auth"

# ──── NEWSROOM FEATURES ────
echo ""
echo "--- NEWSROOM FEATURES ---"
test_get "GET /assignments" "${BACKEND}/api/v1/assignments" "auth"
test_get "GET /reporters" "${BACKEND}/api/v1/reporters" "auth"
test_get "GET /show-prep" "${BACKEND}/api/v1/show-prep" "auth"
test_get "GET /show-deadlines" "${BACKEND}/api/v1/show-deadlines" "auth"
test_get "GET /show-deadlines/status" "${BACKEND}/api/v1/show-deadlines/status" "auth"
test_get "GET /pulses" "${BACKEND}/api/v1/pulses" "auth"
test_get "GET /topic-clusters" "${BACKEND}/api/v1/topic-clusters" "auth"
test_get "GET /bookmarks" "${BACKEND}/api/v1/bookmarks" "auth"
test_get "GET /notifications" "${BACKEND}/api/v1/notifications" "auth"
test_get "GET /notifications/preferences" "${BACKEND}/api/v1/notifications/preferences" "auth"
test_get "GET /stocks/live" "${BACKEND}/api/v1/stocks/live" "auth"
test_get "GET /stocks/alerts" "${BACKEND}/api/v1/stocks/alerts" "auth"
test_get "GET /moderation/queue" "${BACKEND}/api/v1/moderation/queue" "auth"
test_get "GET /moderation/words" "${BACKEND}/api/v1/moderation/words" "auth"
test_get "GET /predictions/dashboard" "${BACKEND}/api/v1/predictions/dashboard" "auth"
test_get "GET /fact-checks/flagged" "${BACKEND}/api/v1/fact-checks/flagged" "auth"
test_get "GET /annotations/recent" "${BACKEND}/api/v1/annotations/recent" "auth"
test_get "GET /radio/scripts" "${BACKEND}/api/v1/radio/scripts" "auth"
test_get "GET /radio/history-of-the-day" "${BACKEND}/api/v1/radio/history-of-the-day" "auth"
test_get "GET /video/projects" "${BACKEND}/api/v1/video/projects" "auth"
test_get "GET /headlines/active-tests" "${BACKEND}/api/v1/headlines/active-tests" "auth"
test_get "GET /publish-queue" "${BACKEND}/api/v1/publish-queue" "auth"
test_get "GET /publish-queue/stats" "${BACKEND}/api/v1/publish-queue/stats" "auth"
test_get "GET /lineup/history" "${BACKEND}/api/v1/lineup/history" "auth"
test_get "GET /beat-alerts" "${BACKEND}/api/v1/beat-alerts" "auth"
test_get "GET /beat-alerts/active" "${BACKEND}/api/v1/beat-alerts/active" "auth"
test_get "GET /shift-briefings" "${BACKEND}/api/v1/shift-briefings" "auth"
test_get "GET /voice-tone" "${BACKEND}/api/v1/voice-tone" "auth"
test_get "GET /assistant/alerts" "${BACKEND}/api/v1/assistant/alerts" "auth"
test_get "GET /hyperlocal-intel/status" "${BACKEND}/api/v1/hyperlocal-intel/status" "auth"
test_get "GET /public-data/alerts" "${BACKEND}/api/v1/public-data/alerts" "auth"

# ──── ADMIN ENDPOINTS ────
echo ""
echo "--- ADMIN ENDPOINTS ---"
test_get "GET /admin/account" "${BACKEND}/api/v1/admin/account" "auth"
test_get "GET /admin/account/users" "${BACKEND}/api/v1/admin/account/users" "auth"
test_get "GET /admin/voices" "${BACKEND}/api/v1/admin/voices" "auth"
test_get "GET /admin/feature-flags" "${BACKEND}/api/v1/admin/feature-flags" "auth"
test_get "GET /admin/webhooks" "${BACKEND}/api/v1/admin/webhooks" "auth"
test_get "GET /admin/digests" "${BACKEND}/api/v1/admin/digests" "auth"
test_get "GET /admin/audit-logs" "${BACKEND}/api/v1/admin/audit-logs" "auth"
test_get "GET /admin/knowledge" "${BACKEND}/api/v1/admin/knowledge" "auth"
test_get "GET /admin/prompts" "${BACKEND}/api/v1/admin/prompts" "auth"
test_get "GET /admin/dashboards" "${BACKEND}/api/v1/admin/dashboards" "auth"
test_get "GET /admin/widgets" "${BACKEND}/api/v1/admin/widgets" "auth"
test_get "GET /admin/audio-sources" "${BACKEND}/api/v1/admin/audio-sources" "auth"
test_get "GET /admin/slack" "${BACKEND}/api/v1/admin/slack" "auth"
test_get "GET /admin/community-radar" "${BACKEND}/api/v1/admin/community-radar" "auth"
test_get "GET /admin/community-radar/feed" "${BACKEND}/api/v1/admin/community-radar/feed" "auth"
test_get "GET /admin/community-radar/sentiment" "${BACKEND}/api/v1/admin/community-radar/sentiment" "auth"
test_get "GET /admin/stories/review-queue" "${BACKEND}/api/v1/admin/stories/review-queue" "auth"
test_get "GET /admin/topicpulse-md" "${BACKEND}/api/v1/admin/topicpulse-md" "auth"
test_get "GET /broadcast-monitor/competitors" "${BACKEND}/api/v1/broadcast-monitor/competitors" "auth"
test_get "GET /broadcast-monitor/dashboard" "${BACKEND}/api/v1/broadcast-monitor/dashboard" "auth"
test_get "GET /broadcast-monitor/timeline" "${BACKEND}/api/v1/broadcast-monitor/timeline" "auth"
test_get "GET /cms/config" "${BACKEND}/api/v1/cms/config" "auth"
test_get "GET /cms/published" "${BACKEND}/api/v1/cms/published" "auth"
test_get "GET /mos/config" "${BACKEND}/api/v1/mos/config" "auth"
test_get "GET /social/accounts" "${BACKEND}/api/v1/social/accounts" "auth"
test_get "GET /admin/rbac/tenants" "${BACKEND}/api/v1/admin/rbac/tenants" "auth"
test_get "GET /admin/rbac/roles" "${BACKEND}/api/v1/admin/rbac/roles" "auth"
test_get "GET /admin/rbac/permissions" "${BACKEND}/api/v1/admin/rbac/permissions" "auth"
test_get "GET /auth/sso/metadata" "${BACKEND}/api/v1/auth/sso/metadata" "auth"
test_get "GET /auth/sso/accounts" "${BACKEND}/api/v1/auth/sso/accounts" "auth"
test_get "GET /billing/plans" "${BACKEND}/api/v1/billing/plans" "auth"
test_get "GET /billing/subscription" "${BACKEND}/api/v1/billing/subscription" "auth"
test_get "GET /surveys" "${BACKEND}/api/v1/surveys" "auth"
test_get "GET /merge-phrases" "${BACKEND}/api/v1/merge-phrases" "auth"
test_get "GET /media/pending" "${BACKEND}/api/v1/media/pending" "auth"
test_get "GET /feed-review/queue" "${BACKEND}/api/v1/feed-review/queue" "auth"
test_get "GET /activity/online" "${BACKEND}/api/v1/activity/online" "auth"

# ──── USER SETTINGS ────
echo ""
echo "--- USER SETTINGS ---"
test_get "GET /user/profile" "${BACKEND}/api/v1/user/profile" "auth"
test_get "GET /user/preferences" "${BACKEND}/api/v1/user/preferences" "auth"
test_get "GET /user/settings/access" "${BACKEND}/api/v1/user/settings/access" "auth"
test_get "GET /user/views" "${BACKEND}/api/v1/user/views" "auth"
test_get "GET /user/subscriptions" "${BACKEND}/api/v1/user/subscriptions" "auth"

# ──── WORKFLOW ────
echo ""
echo "--- WORKFLOW ---"
test_get "GET /workflow/stages" "${BACKEND}/api/v1/workflow/stages" "auth"
test_get "GET /workflow/publish-queue" "${BACKEND}/api/v1/workflow/publish-queue" "auth"

# ──── FRONTEND PAGES ────
echo ""
echo "--- FRONTEND PAGES ---"

for page in \
  "/" "/login" "/register" "/settings" "/settings/notifications" \
  "/assignments" "/reporters" "/deadlines" "/briefings" \
  "/show-prep" "/show-prep/rundown" "/radio" "/video" \
  "/publish" "/lineup" "/feeds" \
  "/analytics" "/analytics/realtime" "/stocks" "/bookmarks" \
  "/alerts" "/beat-alerts" "/predictions" "/rising" "/topics" "/pulses" \
  "/admin/sources" "/admin/markets" "/admin/cms-publish" \
  "/admin/social-accounts" "/admin/webhooks" \
  "/admin/voices" "/admin/knowledge" "/admin/editor" "/admin/prompts" \
  "/admin/accounts" "/admin/superadmin" "/admin/credentials" "/admin/feature-flags" \
  "/admin/audit-logs" "/admin/broadcast-monitor" "/admin/source-health" "/admin/audio-sources" \
  "/admin/coverage" "/admin/community-radar" "/admin/hyperlocal-intel" \
  "/admin/digests" "/admin/mos-integration" "/admin/slack" \
  "/admin/dashboards" "/admin/widgets"; do
  test_page "$page"
done

# ──── SUMMARY ────
echo ""
echo "============================================================"
echo "  RESULTS SUMMARY"
echo "============================================================"
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo "  Total:   $((PASS + FAIL))"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "============================================================"
  echo "  ALL FAILURES"
  echo "============================================================"
  echo -e "$FAILURES"
fi

echo ""
echo "Done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
