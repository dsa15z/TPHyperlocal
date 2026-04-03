#!/bin/bash
# TopicPulse Comprehensive E2E Test Suite
# Tests ALL backend endpoints and frontend pages against production

BACKEND="https://tphyperlocal-production.up.railway.app"
FRONTEND="https://tp-hyperlocal.vercel.app"
PASS=0
FAIL=0
SKIP=0
FAILURES=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  FAILURES="${FAILURES}\n  ${FAIL}. $1"
  echo -e "  ${RED}✗${NC} $1"
}

log_skip() {
  SKIP=$((SKIP + 1))
  echo -e "  ${YELLOW}⊘${NC} $1 (skipped)"
}

# Helper: test a GET endpoint
test_get() {
  local name="$1"
  local url="$2"
  local auth="$3"
  local expected="${4:-200}"

  local headers=""
  if [ "$auth" = "auth" ] && [ -n "$TOKEN" ]; then
    headers="-H \"Authorization: Bearer $TOKEN\""
  fi

  local result
  result=$(eval curl -s -w '\n%{http_code}' --connect-timeout 15 --max-time 30 $headers "\"$url\"" 2>&1)
  local http_code=$(echo "$result" | tail -1)
  local body=$(echo "$result" | head -n -1)

  if [ "$http_code" = "$expected" ]; then
    # Check if body is non-empty JSON or has content
    if [ -z "$body" ] || [ "$body" = "null" ]; then
      log_fail "$name → $http_code but EMPTY BODY"
    else
      log_pass "$name → $http_code"
    fi
  elif [ "$http_code" = "000" ]; then
    log_fail "$name → CONNECTION FAILED"
  else
    local detail=$(echo "$body" | head -c 200)
    log_fail "$name → expected $expected, got $http_code: $detail"
  fi

  echo "$body"
}

# Helper: test a POST endpoint
test_post() {
  local name="$1"
  local url="$2"
  local data="$3"
  local auth="$4"
  local expected="${5:-200}"

  local headers="-H \"Content-Type: application/json\""
  if [ "$auth" = "auth" ] && [ -n "$TOKEN" ]; then
    headers="$headers -H \"Authorization: Bearer $TOKEN\""
  fi

  local result
  result=$(eval curl -s -w '\n%{http_code}' --connect-timeout 15 --max-time 30 $headers -X POST -d "'$data'" "\"$url\"" 2>&1)
  local http_code=$(echo "$result" | tail -1)
  local body=$(echo "$result" | head -n -1)

  if [ "$http_code" = "$expected" ]; then
    log_pass "$name → $http_code"
  elif [ "$http_code" = "000" ]; then
    log_fail "$name → CONNECTION FAILED"
  else
    local detail=$(echo "$body" | head -c 200)
    log_fail "$name → expected $expected, got $http_code: $detail"
  fi

  echo "$body"
}

# Helper: test frontend page
test_page() {
  local path="$1"
  local result
  result=$(curl -s -o /dev/null -w '%{http_code}:%{size_download}:%{time_total}' --connect-timeout 15 --max-time 30 "${FRONTEND}${path}" 2>&1)
  local http_code=$(echo "$result" | cut -d: -f1)
  local size=$(echo "$result" | cut -d: -f2)
  local time=$(echo "$result" | cut -d: -f3)

  if [ "$http_code" = "200" ]; then
    if [ "$size" -lt 500 ]; then
      log_fail "Page ${path} → 200 but only ${size} bytes (too small)"
    else
      log_pass "Page ${path} → 200 (${size}B, ${time}s)"
    fi
  elif [ "$http_code" = "000" ]; then
    log_fail "Page ${path} → CONNECTION FAILED"
  else
    log_fail "Page ${path} → expected 200, got $http_code"
  fi
}

echo "╔══════════════════════════════════════════════════════╗"
echo "║  TopicPulse — Full E2E QA Test Suite                 ║"
echo "║  Testing against PRODUCTION                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "Backend:  $BACKEND"
echo "Frontend: $FRONTEND"
echo "Time:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ──── AUTHENTICATE ────
echo "═══ AUTHENTICATION ═══"
LOGIN_RESULT=$(curl -s -w '\n%{http_code}' --connect-timeout 15 --max-time 30 \
  -H "Content-Type: application/json" \
  -X POST -d '{"email":"test-e2e@topicpulse.dev","password":"TestPass123!"}' \
  "${BACKEND}/api/v1/auth/login" 2>&1)
LOGIN_CODE=$(echo "$LOGIN_RESULT" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESULT" | head -n -1)

if [ "$LOGIN_CODE" = "200" ]; then
  TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    log_pass "POST /auth/login → 200 (token received)"
  else
    log_fail "POST /auth/login → 200 but no token in response"
    echo "CRITICAL: Cannot proceed without auth token"
    exit 1
  fi
else
  log_fail "POST /auth/login → $LOGIN_CODE"
  echo "CRITICAL: Cannot authenticate. Trying register..."

  REG_RESULT=$(curl -s -w '\n%{http_code}' --connect-timeout 15 --max-time 30 \
    -H "Content-Type: application/json" \
    -X POST -d '{"email":"test-e2e-2@topicpulse.dev","password":"TestPass123!","displayName":"E2E Tester 2","accountName":"E2E Test 2"}' \
    "${BACKEND}/api/v1/auth/register" 2>&1)
  REG_CODE=$(echo "$REG_RESULT" | tail -1)
  REG_BODY=$(echo "$REG_RESULT" | head -n -1)

  if [ "$REG_CODE" = "201" ] || [ "$REG_CODE" = "200" ]; then
    TOKEN=$(echo "$REG_BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
    log_pass "POST /auth/register → $REG_CODE (fallback)"
  else
    log_fail "POST /auth/register → $REG_CODE: Cannot authenticate at all"
    echo "Proceeding with unauthenticated tests only..."
  fi
fi

# Test bad login
BAD_LOGIN=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 \
  -H "Content-Type: application/json" \
  -X POST -d '{"email":"bad@test.com","password":"wrong"}' \
  "${BACKEND}/api/v1/auth/login" 2>&1)
if [ "$BAD_LOGIN" -ge 400 ] && [ "$BAD_LOGIN" -lt 500 ]; then
  log_pass "POST /auth/login bad creds → $BAD_LOGIN (correctly rejected)"
else
  log_fail "POST /auth/login bad creds → $BAD_LOGIN (should be 4xx)"
fi

# Test /auth/me with auth
ME_RESULT=$(curl -s -w '\n%{http_code}' --connect-timeout 15 --max-time 30 \
  -H "Authorization: Bearer $TOKEN" \
  "${BACKEND}/api/v1/auth/me" 2>&1)
ME_CODE=$(echo "$ME_RESULT" | tail -1)
if [ "$ME_CODE" = "200" ]; then
  log_pass "GET /auth/me (authenticated) → 200"
else
  log_fail "GET /auth/me (authenticated) → $ME_CODE"
fi

# Test /auth/me without auth
NOAUTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 30 \
  "${BACKEND}/api/v1/auth/me" 2>&1)
if [ "$NOAUTH_CODE" -ge 400 ] && [ "$NOAUTH_CODE" -lt 500 ]; then
  log_pass "GET /auth/me (no auth) → $NOAUTH_CODE (correctly rejected)"
else
  log_fail "GET /auth/me (no auth) → $NOAUTH_CODE (should be 4xx)"
fi

# ──── HEALTH ────
echo ""
echo "═══ HEALTH & CONNECTIVITY ═══"
HEALTH_BODY=$(test_get "GET /health" "${BACKEND}/api/v1/health" "noauth" "200")
# Validate health response has db + redis
if echo "$HEALTH_BODY" | grep -q '"database".*"healthy"'; then
  log_pass "Health: database is healthy"
else
  log_fail "Health: database NOT healthy"
fi
if echo "$HEALTH_BODY" | grep -q '"redis".*"healthy"'; then
  log_pass "Health: redis is healthy"
else
  log_fail "Health: redis NOT healthy"
fi
test_get "GET /health/database" "${BACKEND}/api/v1/health/database" "noauth" > /dev/null
test_get "GET /health/detailed" "${BACKEND}/api/v1/health/detailed" "noauth" > /dev/null

# ──── STORIES ────
echo ""
echo "═══ STORIES API ═══"
STORIES_BODY=$(test_get "GET /stories?limit=10" "${BACKEND}/api/v1/stories?limit=10&offset=0" "auth")

# Validate stories response structure
if echo "$STORIES_BODY" | grep -q '"data":\['; then
  log_pass "Stories: has data array"

  # Check first story has required fields
  FIRST_STORY_ID=$(echo "$STORIES_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$FIRST_STORY_ID" ]; then
    log_pass "Stories: first story has id ($FIRST_STORY_ID)"
  else
    log_fail "Stories: no story id found"
  fi

  if echo "$STORIES_BODY" | grep -q '"title"'; then
    log_pass "Stories: has title field"
  else
    log_fail "Stories: missing title field"
  fi

  if echo "$STORIES_BODY" | grep -q '"status"'; then
    log_pass "Stories: has status field"
  else
    log_fail "Stories: missing status field"
  fi

  if echo "$STORIES_BODY" | grep -q '"compositeScore"'; then
    log_pass "Stories: has compositeScore field"
  else
    log_fail "Stories: missing compositeScore field"
  fi

  if echo "$STORIES_BODY" | grep -q '"pagination"'; then
    log_pass "Stories: has pagination object"
  else
    log_fail "Stories: missing pagination"
  fi
else
  if echo "$STORIES_BODY" | grep -q '"data":\[\]'; then
    log_fail "Stories: data array is EMPTY (no stories in database)"
  else
    log_fail "Stories: missing data array entirely"
  fi
fi

# Static endpoints first
test_get "GET /stories/sources" "${BACKEND}/api/v1/stories/sources" "auth" > /dev/null
test_get "GET /stories/facets" "${BACKEND}/api/v1/stories/facets" "auth" > /dev/null
test_get "GET /stories/breaking" "${BACKEND}/api/v1/stories/breaking" "auth" > /dev/null
test_get "GET /stories/trending" "${BACKEND}/api/v1/stories/trending" "auth" > /dev/null
test_get "GET /stories/teaser" "${BACKEND}/api/v1/stories/teaser" "noauth" > /dev/null
test_get "GET /stories/rising" "${BACKEND}/api/v1/stories/rising" "auth" > /dev/null
test_get "GET /stories/multilingual" "${BACKEND}/api/v1/stories/multilingual" "auth" > /dev/null

# Filter by status
for status in BREAKING DEVELOPING TOP_STORY ONGOING ALERT FOLLOW_UP STALE ARCHIVED; do
  test_get "GET /stories?status=$status" "${BACKEND}/api/v1/stories?status=$status&limit=3" "auth" > /dev/null
done

# Sorting
for sort in compositeScore firstSeenAt sourceCount breakingScore trendingScore; do
  test_get "GET /stories?sort=$sort" "${BACKEND}/api/v1/stories?sort=$sort&order=desc&limit=3" "auth" > /dev/null
done

# Pagination uniqueness
PAGE1=$(curl -s --connect-timeout 15 --max-time 30 \
  -H "Authorization: Bearer $TOKEN" \
  "${BACKEND}/api/v1/stories?limit=5&offset=0" 2>&1)
PAGE2=$(curl -s --connect-timeout 15 --max-time 30 \
  -H "Authorization: Bearer $TOKEN" \
  "${BACKEND}/api/v1/stories?limit=5&offset=5" 2>&1)
IDS1=$(echo "$PAGE1" | grep -o '"id":"[^"]*"' | sort)
IDS2=$(echo "$PAGE2" | grep -o '"id":"[^"]*"' | sort)
OVERLAP=$(comm -12 <(echo "$IDS1") <(echo "$IDS2") | wc -l)
if [ "$OVERLAP" -eq 0 ]; then
  log_pass "Pagination: no duplicate stories across pages"
else
  log_fail "Pagination: $OVERLAP duplicate stories found across page 1 and 2"
fi

# Single story detail + sub-resources
if [ -n "$FIRST_STORY_ID" ]; then
  test_get "GET /stories/:id (detail)" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}" "auth" > /dev/null
  test_get "GET /stories/:id/related" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/related" "auth" > /dev/null
  test_get "GET /stories/:id/transitions" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/transitions" "auth" > /dev/null
  test_get "GET /stories/:id/predictions" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/predictions" "auth" > /dev/null
  test_get "GET /stories/:id/fact-checks" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/fact-checks" "auth" > /dev/null
  test_get "GET /stories/:id/translations" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/translations" "auth" > /dev/null
  test_get "GET /stories/:id/annotations" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/annotations" "auth" > /dev/null
  test_get "GET /stories/:id/videos" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/videos" "auth" > /dev/null
  test_get "GET /stories/:id/first-drafts" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/first-drafts" "auth" > /dev/null
  test_get "GET /stories/:id/analytics" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/analytics" "auth" > /dev/null
  test_get "GET /stories/:id/research" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/research" "auth" > /dev/null
  test_get "GET /stories/:id/breaking-packages" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/breaking-packages" "auth" > /dev/null
  test_get "GET /stories/:id/headlines/test" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/headlines/test" "auth" > /dev/null
  test_get "GET /stories/:id/editors" "${BACKEND}/api/v1/stories/${FIRST_STORY_ID}/editors" "auth" > /dev/null
  test_get "GET /conversation-starters/:id" "${BACKEND}/api/v1/conversation-starters/${FIRST_STORY_ID}" "auth" > /dev/null
fi

# ──── SEARCH & NLP ────
echo ""
echo "═══ SEARCH & NLP ═══"
test_get "GET /search?q=fire" "${BACKEND}/api/v1/search?q=fire&limit=10" "auth" > /dev/null
test_get "GET /search?q= (empty)" "${BACKEND}/api/v1/search?q=&limit=10" "auth" > /dev/null
test_get "GET /search/suggest" "${BACKEND}/api/v1/search/suggest?q=pol" "auth" > /dev/null
test_get "GET /search/trending" "${BACKEND}/api/v1/search/trending" "auth" > /dev/null
test_get "NLP: weather last 24h" "${BACKEND}/api/v1/stories?nlp=breaking+news+about+weather&limit=5" "auth" > /dev/null
test_get "NLP: crime stories" "${BACKEND}/api/v1/stories?nlp=crime+stories+today&limit=5" "auth" > /dev/null

# ──── ADMIN: SOURCES ────
echo ""
echo "═══ ADMIN: SOURCES ═══"
test_get "GET /admin/sources" "${BACKEND}/api/v1/admin/sources?limit=20" "auth" > /dev/null
test_get "GET /admin/sources/by-type" "${BACKEND}/api/v1/admin/sources/by-type" "auth" > /dev/null
test_post "POST /admin/sources/test (BBC RSS)" "${BACKEND}/api/v1/admin/sources/test" '{"url":"https://feeds.bbci.co.uk/news/rss.xml","platform":"RSS"}' "auth" > /dev/null

# ──── ADMIN: MARKETS ────
echo ""
echo "═══ ADMIN: MARKETS ═══"
MARKETS_BODY=$(test_get "GET /admin/markets" "${BACKEND}/api/v1/admin/markets" "auth")
MARKET_COUNT=$(echo "$MARKETS_BODY" | grep -o '"id":"[^"]*"' | wc -l)
if [ "$MARKET_COUNT" -gt 0 ]; then
  log_pass "Markets: found $MARKET_COUNT markets"
  FIRST_MARKET_ID=$(echo "$MARKETS_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$FIRST_MARKET_ID" ]; then
    test_get "GET /admin/markets/:id" "${BACKEND}/api/v1/admin/markets/${FIRST_MARKET_ID}" "auth" > /dev/null
  fi
else
  log_fail "Markets: no markets found"
fi
test_post "POST /admin/markets/autofill" "${BACKEND}/api/v1/admin/markets/autofill" '{"city":"Dallas","state":"TX"}' "auth" > /dev/null
test_get "GET /pipeline/msa-database" "${BACKEND}/api/v1/pipeline/msa-database" "auth" > /dev/null

# ──── PIPELINE ────
echo ""
echo "═══ PIPELINE ═══"
PIPE_BODY=$(test_get "GET /pipeline/status" "${BACKEND}/api/v1/pipeline/status" "auth")
if echo "$PIPE_BODY" | grep -q '"queues"'; then
  log_pass "Pipeline: has queues info"
else
  log_fail "Pipeline: missing queues info"
fi

for queue in ingestion enrichment clustering scoring; do
  test_get "GET /pipeline/jobs/$queue" "${BACKEND}/api/v1/pipeline/jobs/$queue?state=failed&limit=5" "auth" > /dev/null
done

test_get "GET /activity" "${BACKEND}/api/v1/activity" "auth" > /dev/null
test_get "GET /pipeline/available-sources" "${BACKEND}/api/v1/pipeline/available-sources" "auth" > /dev/null
test_get "GET /pipeline/scrape-sources" "${BACKEND}/api/v1/pipeline/scrape-sources" "auth" > /dev/null

# ──── FEEDS ────
echo ""
echo "═══ FEEDS ═══"
FEEDS_BODY=$(test_get "GET /feeds" "${BACKEND}/api/v1/feeds" "noauth")
FEED_SLUG=$(echo "$FEEDS_BODY" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$FEED_SLUG" ]; then
  RSS_BODY=$(test_get "GET /feeds/$FEED_SLUG/rss" "${BACKEND}/api/v1/feeds/${FEED_SLUG}/rss" "noauth")
  if echo "$RSS_BODY" | grep -q '<rss\|<?xml'; then
    log_pass "RSS feed: valid XML content"
  else
    log_fail "RSS feed: not valid XML"
  fi
fi

# ──── ACCOUNT STORIES ────
echo ""
echo "═══ ACCOUNT STORIES ═══"
test_get "GET /account-stories" "${BACKEND}/api/v1/account-stories?limit=10" "auth" > /dev/null

# ──── CREDENTIALS ────
echo ""
echo "═══ CREDENTIALS ═══"
test_get "GET /admin/credentials" "${BACKEND}/api/v1/admin/credentials" "auth" > /dev/null

# ──── COVERAGE ────
echo ""
echo "═══ COVERAGE ═══"
test_get "GET /admin/coverage" "${BACKEND}/api/v1/admin/coverage" "auth" > /dev/null

# ──── ANALYTICS ────
echo ""
echo "═══ ANALYTICS ═══"
for ep in overview domain-scores timeline engagement velocity coverage pipeline content; do
  test_get "GET /analytics/$ep" "${BACKEND}/api/v1/analytics/$ep" "auth" > /dev/null
done
test_get "GET /analytics/stories/top" "${BACKEND}/api/v1/analytics/stories/top" "auth" > /dev/null
test_get "GET /analytics/reporters" "${BACKEND}/api/v1/analytics/reporters" "auth" > /dev/null
test_get "GET /analytics/realtime" "${BACKEND}/api/v1/analytics/realtime" "auth" > /dev/null

# ──── NEWSROOM FEATURES ────
echo ""
echo "═══ NEWSROOM FEATURES ═══"
test_get "GET /assignments" "${BACKEND}/api/v1/assignments" "auth" > /dev/null
test_get "GET /reporters" "${BACKEND}/api/v1/reporters" "auth" > /dev/null
test_get "GET /show-prep" "${BACKEND}/api/v1/show-prep" "auth" > /dev/null
test_get "GET /show-deadlines" "${BACKEND}/api/v1/show-deadlines" "auth" > /dev/null
test_get "GET /show-deadlines/status" "${BACKEND}/api/v1/show-deadlines/status" "auth" > /dev/null
test_get "GET /pulses" "${BACKEND}/api/v1/pulses" "auth" > /dev/null
test_get "GET /topic-clusters" "${BACKEND}/api/v1/topic-clusters" "auth" > /dev/null
test_get "GET /bookmarks" "${BACKEND}/api/v1/bookmarks" "auth" > /dev/null
test_get "GET /notifications" "${BACKEND}/api/v1/notifications" "auth" > /dev/null
test_get "GET /notifications/preferences" "${BACKEND}/api/v1/notifications/preferences" "auth" > /dev/null
test_get "GET /stocks/live" "${BACKEND}/api/v1/stocks/live" "auth" > /dev/null
test_get "GET /stocks/alerts" "${BACKEND}/api/v1/stocks/alerts" "auth" > /dev/null
test_get "GET /moderation/queue" "${BACKEND}/api/v1/moderation/queue" "auth" > /dev/null
test_get "GET /moderation/words" "${BACKEND}/api/v1/moderation/words" "auth" > /dev/null
test_get "GET /predictions/dashboard" "${BACKEND}/api/v1/predictions/dashboard" "auth" > /dev/null
test_get "GET /fact-checks/flagged" "${BACKEND}/api/v1/fact-checks/flagged" "auth" > /dev/null
test_get "GET /annotations/recent" "${BACKEND}/api/v1/annotations/recent" "auth" > /dev/null
test_get "GET /radio/scripts" "${BACKEND}/api/v1/radio/scripts" "auth" > /dev/null
test_get "GET /radio/history-of-the-day" "${BACKEND}/api/v1/radio/history-of-the-day" "auth" > /dev/null
test_get "GET /video/projects" "${BACKEND}/api/v1/video/projects" "auth" > /dev/null
test_get "GET /headlines/active-tests" "${BACKEND}/api/v1/headlines/active-tests" "auth" > /dev/null
test_get "GET /publish-queue" "${BACKEND}/api/v1/publish-queue" "auth" > /dev/null
test_get "GET /publish-queue/stats" "${BACKEND}/api/v1/publish-queue/stats" "auth" > /dev/null
test_get "GET /lineup/history" "${BACKEND}/api/v1/lineup/history" "auth" > /dev/null
test_get "GET /beat-alerts" "${BACKEND}/api/v1/beat-alerts" "auth" > /dev/null
test_get "GET /beat-alerts/active" "${BACKEND}/api/v1/beat-alerts/active" "auth" > /dev/null
test_get "GET /shift-briefings" "${BACKEND}/api/v1/shift-briefings" "auth" > /dev/null
test_get "GET /voice-tone" "${BACKEND}/api/v1/voice-tone" "auth" > /dev/null
test_get "GET /assistant/alerts" "${BACKEND}/api/v1/assistant/alerts" "auth" > /dev/null
test_get "GET /hyperlocal-intel/status" "${BACKEND}/api/v1/hyperlocal-intel/status" "auth" > /dev/null
test_get "GET /public-data/alerts" "${BACKEND}/api/v1/public-data/alerts" "auth" > /dev/null

# ──── ADMIN ENDPOINTS ────
echo ""
echo "═══ ADMIN ENDPOINTS ═══"
test_get "GET /admin/account" "${BACKEND}/api/v1/admin/account" "auth" > /dev/null
test_get "GET /admin/account/users" "${BACKEND}/api/v1/admin/account/users" "auth" > /dev/null
test_get "GET /admin/voices" "${BACKEND}/api/v1/admin/voices" "auth" > /dev/null
test_get "GET /admin/feature-flags" "${BACKEND}/api/v1/admin/feature-flags" "auth" > /dev/null
test_get "GET /admin/webhooks" "${BACKEND}/api/v1/admin/webhooks" "auth" > /dev/null
test_get "GET /admin/digests" "${BACKEND}/api/v1/admin/digests" "auth" > /dev/null
test_get "GET /admin/audit-logs" "${BACKEND}/api/v1/admin/audit-logs" "auth" > /dev/null
test_get "GET /admin/knowledge" "${BACKEND}/api/v1/admin/knowledge" "auth" > /dev/null
test_get "GET /admin/prompts" "${BACKEND}/api/v1/admin/prompts" "auth" > /dev/null
test_get "GET /admin/dashboards" "${BACKEND}/api/v1/admin/dashboards" "auth" > /dev/null
test_get "GET /admin/widgets" "${BACKEND}/api/v1/admin/widgets" "auth" > /dev/null
test_get "GET /admin/audio-sources" "${BACKEND}/api/v1/admin/audio-sources" "auth" > /dev/null
test_get "GET /admin/slack" "${BACKEND}/api/v1/admin/slack" "auth" > /dev/null
test_get "GET /admin/community-radar" "${BACKEND}/api/v1/admin/community-radar" "auth" > /dev/null
test_get "GET /admin/community-radar/feed" "${BACKEND}/api/v1/admin/community-radar/feed" "auth" > /dev/null
test_get "GET /admin/community-radar/sentiment" "${BACKEND}/api/v1/admin/community-radar/sentiment" "auth" > /dev/null
test_get "GET /admin/stories/review-queue" "${BACKEND}/api/v1/admin/stories/review-queue" "auth" > /dev/null
test_get "GET /admin/topicpulse-md" "${BACKEND}/api/v1/admin/topicpulse-md" "auth" > /dev/null

# Integration endpoints
test_get "GET /broadcast-monitor/competitors" "${BACKEND}/api/v1/broadcast-monitor/competitors" "auth" > /dev/null
test_get "GET /broadcast-monitor/dashboard" "${BACKEND}/api/v1/broadcast-monitor/dashboard" "auth" > /dev/null
test_get "GET /broadcast-monitor/timeline" "${BACKEND}/api/v1/broadcast-monitor/timeline" "auth" > /dev/null
test_get "GET /cms/config" "${BACKEND}/api/v1/cms/config" "auth" > /dev/null
test_get "GET /cms/published" "${BACKEND}/api/v1/cms/published" "auth" > /dev/null
test_get "GET /mos/config" "${BACKEND}/api/v1/mos/config" "auth" > /dev/null
test_get "GET /social/accounts" "${BACKEND}/api/v1/social/accounts" "auth" > /dev/null

# RBAC
test_get "GET /admin/rbac/tenants" "${BACKEND}/api/v1/admin/rbac/tenants" "auth" > /dev/null
test_get "GET /admin/rbac/roles" "${BACKEND}/api/v1/admin/rbac/roles" "auth" > /dev/null
test_get "GET /admin/rbac/permissions" "${BACKEND}/api/v1/admin/rbac/permissions" "auth" > /dev/null

# SSO
test_get "GET /auth/sso/metadata" "${BACKEND}/api/v1/auth/sso/metadata" "auth" > /dev/null
test_get "GET /auth/sso/accounts" "${BACKEND}/api/v1/auth/sso/accounts" "auth" > /dev/null

# Billing
test_get "GET /billing/plans" "${BACKEND}/api/v1/billing/plans" "auth" > /dev/null
test_get "GET /billing/subscription" "${BACKEND}/api/v1/billing/subscription" "auth" > /dev/null

# Surveys / merge phrases
test_get "GET /surveys" "${BACKEND}/api/v1/surveys" "auth" > /dev/null
test_get "GET /merge-phrases" "${BACKEND}/api/v1/merge-phrases" "auth" > /dev/null

# Media / feed review
test_get "GET /media/pending" "${BACKEND}/api/v1/media/pending" "auth" > /dev/null
test_get "GET /feed-review/queue" "${BACKEND}/api/v1/feed-review/queue" "auth" > /dev/null
test_get "GET /activity/online" "${BACKEND}/api/v1/activity/online" "auth" > /dev/null

# ──── USER SETTINGS ────
echo ""
echo "═══ USER SETTINGS ═══"
test_get "GET /user/profile" "${BACKEND}/api/v1/user/profile" "auth" > /dev/null
test_get "GET /user/preferences" "${BACKEND}/api/v1/user/preferences" "auth" > /dev/null
test_get "GET /user/settings/access" "${BACKEND}/api/v1/user/settings/access" "auth" > /dev/null
test_get "GET /user/views" "${BACKEND}/api/v1/user/views" "auth" > /dev/null
test_get "GET /user/subscriptions" "${BACKEND}/api/v1/user/subscriptions" "auth" > /dev/null

# ──── WORKFLOW ────
echo ""
echo "═══ WORKFLOW ═══"
test_get "GET /workflow/stages" "${BACKEND}/api/v1/workflow/stages" "auth" > /dev/null
test_get "GET /workflow/publish-queue" "${BACKEND}/api/v1/workflow/publish-queue" "auth" > /dev/null

# ──── FRONTEND PAGES ────
echo ""
echo "═══ FRONTEND PAGES ═══"

PAGES=(
  "/"
  "/login"
  "/register"
  "/settings"
  "/settings/notifications"
  "/assignments"
  "/reporters"
  "/deadlines"
  "/briefings"
  "/show-prep"
  "/show-prep/rundown"
  "/radio"
  "/video"
  "/publish"
  "/lineup"
  "/feeds"
  "/analytics"
  "/analytics/realtime"
  "/stocks"
  "/bookmarks"
  "/alerts"
  "/beat-alerts"
  "/predictions"
  "/rising"
  "/topics"
  "/pulses"
  "/admin/sources"
  "/admin/markets"
  "/admin/cms-publish"
  "/admin/social-accounts"
  "/admin/webhooks"
  "/admin/voices"
  "/admin/knowledge"
  "/admin/editor"
  "/admin/prompts"
  "/admin/accounts"
  "/admin/superadmin"
  "/admin/credentials"
  "/admin/feature-flags"
  "/admin/audit-logs"
  "/admin/broadcast-monitor"
  "/admin/source-health"
  "/admin/audio-sources"
  "/admin/coverage"
  "/admin/community-radar"
  "/admin/hyperlocal-intel"
  "/admin/digests"
  "/admin/mos-integration"
  "/admin/slack"
  "/admin/dashboards"
  "/admin/widgets"
)

for page in "${PAGES[@]}"; do
  test_page "$page"
done

# ──── SUMMARY ────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  RESULTS SUMMARY                                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "  ${GREEN}✓ PASSED:${NC}  $PASS"
echo -e "  ${RED}✗ FAILED:${NC}  $FAIL"
echo -e "  ${YELLOW}⊘ SKIPPED:${NC} $SKIP"
echo "  Total:     $((PASS + FAIL + SKIP))"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ALL FAILURES                                        ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "$FAILURES"
fi

echo ""
echo "Done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
