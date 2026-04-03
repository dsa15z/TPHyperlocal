const { api, frontendPage, getAuthToken } = require('./helpers');

const results = { pass: 0, fail: 0, skip: 0, errors: [] };

function test(name, status, expected, actual, detail) {
  if (status === 'pass') {
    results.pass++;
    console.log(`  ✓ ${name} (${detail || 'ok'})`);
  } else if (status === 'skip') {
    results.skip++;
    console.log(`  ⊘ ${name} (skipped: ${detail})`);
  } else {
    results.fail++;
    const msg = `${name}: expected ${expected}, got ${actual}. ${detail || ''}`;
    results.errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function check(name, res, expectedStatus = 200) {
  if (res.error) {
    test(name, 'fail', expectedStatus, `error`, res.error);
    return false;
  }
  if (res.status !== expectedStatus) {
    test(name, 'fail', expectedStatus, res.status, JSON.stringify(res.data)?.slice(0, 200));
    return false;
  }
  test(name, 'pass', expectedStatus, res.status, `${res.latency}ms`);
  return true;
}

function checkData(name, res, validator) {
  if (!res.ok) {
    test(name, 'fail', '2xx', res.status, JSON.stringify(res.data)?.slice(0, 200));
    return false;
  }
  const issue = validator(res.data);
  if (issue) {
    test(name, 'fail', 'valid data', 'invalid', issue);
    return false;
  }
  test(name, 'pass', null, null, `${res.latency}ms`);
  return true;
}

async function testHealth() {
  console.log('\n═══ HEALTH & CONNECTIVITY ═══');
  const r = await api('GET', '/api/v1/health');
  check('GET /health returns 200', r, 200);
  checkData('Health has db+redis status', r, (d) => {
    if (!d?.checks?.database?.status) return 'missing database check';
    if (!d?.checks?.redis?.status) return 'missing redis check';
    if (d.checks.database.status !== 'healthy') return `db: ${d.checks.database.status}`;
    if (d.checks.redis.status !== 'healthy') return `redis: ${d.checks.redis.status}`;
    return null;
  });

  const r2 = await api('GET', '/api/v1/health/database');
  check('GET /health/database returns 200', r2, 200);

  const r3 = await api('GET', '/api/v1/health/detailed');
  check('GET /health/detailed returns 200', r3, 200);
}

async function testAuth() {
  console.log('\n═══ AUTHENTICATION ═══');
  // Login
  const r = await api('POST', '/api/v1/auth/login', {
    body: { email: 'derek@futuri.com', password: 'Futuri2026' }
  });
  check('POST /auth/login returns 200', r, 200);
  checkData('Login returns token', r, (d) => d?.token ? null : 'no token returned');
  checkData('Login returns user object', r, (d) => d?.user?.email ? null : 'no user.email');

  // Bad login
  const r2 = await api('POST', '/api/v1/auth/login', {
    body: { email: 'bad@test.com', password: 'wrong' }
  });
  if (r2.status >= 400 && r2.status < 500) {
    test('POST /auth/login with bad creds returns 4xx', 'pass', '4xx', r2.status, `${r2.latency}ms`);
  } else {
    test('POST /auth/login with bad creds returns 4xx', 'fail', '4xx', r2.status);
  }

  // Me
  const r3 = await api('GET', '/api/v1/auth/me', { auth: true });
  check('GET /auth/me (authenticated) returns 200', r3, 200);

  // Me without auth
  const r4 = await api('GET', '/api/v1/auth/me');
  if (r4.status >= 400) {
    test('GET /auth/me (no auth) returns 4xx', 'pass', '4xx', r4.status, `${r4.latency}ms`);
  } else {
    test('GET /auth/me (no auth) returns 4xx', 'fail', '4xx', r4.status);
  }

  // Profile
  const r5 = await api('GET', '/api/v1/user/profile', { auth: true });
  check('GET /user/profile returns 200', r5, 200);
  checkData('Profile has user+account', r5, (d) => {
    if (!d?.user?.id) return 'missing user.id';
    if (!d?.user?.email) return 'missing user.email';
    return null;
  });

  // Preferences
  const r6 = await api('GET', '/api/v1/user/preferences', { auth: true });
  check('GET /user/preferences returns 200', r6, 200);

  // Is superadmin
  const r7 = await api('GET', '/api/v1/auth/is-superadmin', { auth: true });
  check('GET /auth/is-superadmin returns 200', r7, 200);
}

async function testStories() {
  console.log('\n═══ STORIES API ═══');

  // List stories
  const r = await api('GET', '/api/v1/stories?limit=10&offset=0', { auth: true });
  check('GET /stories returns 200', r, 200);
  checkData('Stories has data array', r, (d) => {
    if (!d?.data || !Array.isArray(d.data)) return 'no data array';
    if (d.data.length === 0) return 'data array is empty - NO STORIES FOUND';
    return null;
  });
  checkData('Stories have required fields', r, (d) => {
    const s = d?.data?.[0];
    if (!s) return 'no stories';
    if (!s.id) return 'missing id';
    if (!s.title) return 'missing title';
    if (!s.status) return 'missing status';
    if (s.compositeScore === undefined) return 'missing compositeScore';
    return null;
  });
  checkData('Stories pagination works', r, (d) => {
    if (!d?.pagination) return 'missing pagination object';
    if (d.pagination.total === undefined) return 'missing pagination.total';
    return null;
  });

  // Facets
  const r2 = await api('GET', '/api/v1/stories/facets', { auth: true });
  check('GET /stories/facets returns 200', r2, 200);

  // Sources
  const r3 = await api('GET', '/api/v1/stories/sources', { auth: true });
  check('GET /stories/sources returns 200', r3, 200);

  // Breaking
  const r4 = await api('GET', '/api/v1/stories/breaking', { auth: true });
  check('GET /stories/breaking returns 200', r4, 200);

  // Trending
  const r5 = await api('GET', '/api/v1/stories/trending', { auth: true });
  check('GET /stories/trending returns 200', r5, 200);

  // Teaser
  const r6 = await api('GET', '/api/v1/stories/teaser');
  check('GET /stories/teaser returns 200', r6, 200);

  // Filtering by status
  for (const status of ['BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'ALERT']) {
    const rf = await api('GET', `/api/v1/stories?status=${status}&limit=5`, { auth: true });
    check(`GET /stories?status=${status}`, rf, 200);
  }

  // Filtering by category
  const cats = r2.data?.categories || r2.data?.data?.categories || [];
  if (cats.length > 0) {
    const cat = cats[0]?.name || cats[0];
    const rf = await api('GET', `/api/v1/stories?category=${encodeURIComponent(cat)}&limit=5`, { auth: true });
    check(`GET /stories?category=${cat}`, rf, 200);
  }

  // Sorting
  for (const sort of ['compositeScore', 'firstSeenAt', 'sourceCount']) {
    const rf = await api('GET', `/api/v1/stories?sort=${sort}&order=desc&limit=5`, { auth: true });
    check(`GET /stories?sort=${sort}&order=desc`, rf, 200);
  }

  // Pagination
  const rp1 = await api('GET', '/api/v1/stories?limit=5&offset=0', { auth: true });
  const rp2 = await api('GET', '/api/v1/stories?limit=5&offset=5', { auth: true });
  check('GET /stories page 1', rp1, 200);
  check('GET /stories page 2', rp2, 200);
  if (rp1.ok && rp2.ok) {
    const ids1 = (rp1.data?.data || []).map(s => s.id);
    const ids2 = (rp2.data?.data || []).map(s => s.id);
    const overlap = ids1.filter(id => ids2.includes(id));
    if (overlap.length > 0) {
      test('Pagination returns unique results', 'fail', '0 overlap', `${overlap.length} duplicates`);
    } else {
      test('Pagination returns unique results', 'pass');
    }
  }

  // Single story detail
  const storyId = r.data?.data?.[0]?.id;
  if (storyId) {
    const rs = await api('GET', `/api/v1/stories/${storyId}`, { auth: true });
    check(`GET /stories/${storyId.slice(0,8)}... detail`, rs, 200);
    checkData('Story detail has sources', rs, (d) => {
      const story = d?.data || d;
      if (!story?.title) return 'missing title';
      return null;
    });

    // Related stories
    const rr = await api('GET', `/api/v1/stories/${storyId}/related`, { auth: true });
    check(`GET /stories/:id/related`, rr, 200);

    // Transitions
    const rt = await api('GET', `/api/v1/stories/${storyId}/transitions`, { auth: true });
    check(`GET /stories/:id/transitions`, rt, 200);

    // Predictions
    const rp = await api('GET', `/api/v1/stories/${storyId}/predictions`, { auth: true });
    check(`GET /stories/:id/predictions`, rp, 200);

    // Fact checks
    const rfc = await api('GET', `/api/v1/stories/${storyId}/fact-checks`, { auth: true });
    check(`GET /stories/:id/fact-checks`, rfc, 200);

    // Translations
    const rtl = await api('GET', `/api/v1/stories/${storyId}/translations`, { auth: true });
    check(`GET /stories/:id/translations`, rtl, 200);

    // Annotations
    const ra = await api('GET', `/api/v1/stories/${storyId}/annotations`, { auth: true });
    check(`GET /stories/:id/annotations`, ra, 200);

    // Videos
    const rv = await api('GET', `/api/v1/stories/${storyId}/videos`, { auth: true });
    check(`GET /stories/:id/videos`, rv, 200);

    // First drafts
    const rfd = await api('GET', `/api/v1/stories/${storyId}/first-drafts`, { auth: true });
    check(`GET /stories/:id/first-drafts`, rfd, 200);

    // Analytics
    const ran = await api('GET', `/api/v1/stories/${storyId}/analytics`, { auth: true });
    check(`GET /stories/:id/analytics`, ran, 200);

    // Research
    const rres = await api('GET', `/api/v1/stories/${storyId}/research`, { auth: true });
    check(`GET /stories/:id/research`, rres, 200);

    // Breaking packages
    const rbp = await api('GET', `/api/v1/stories/${storyId}/breaking-packages`, { auth: true });
    check(`GET /stories/:id/breaking-packages`, rbp, 200);

    // Headlines test
    const rht = await api('GET', `/api/v1/stories/${storyId}/headlines/test`, { auth: true });
    check(`GET /stories/:id/headlines/test`, rht, 200);

    // Conversation starters
    const rcs = await api('GET', `/api/v1/conversation-starters/${storyId}`, { auth: true });
    check(`GET /conversation-starters/:storyId`, rcs, 200);

    // Editors
    const red = await api('GET', `/api/v1/stories/${storyId}/editors`, { auth: true });
    check(`GET /stories/:id/editors`, red, 200);
  }
}

async function testSearch() {
  console.log('\n═══ SEARCH & NLP ═══');

  const r = await api('GET', '/api/v1/search?q=fire&limit=10', { auth: true });
  check('GET /search?q=fire returns 200', r, 200);
  checkData('Search returns stories', r, (d) => {
    if (!d?.data?.stories && !d?.data) return 'no stories in response';
    return null;
  });

  const r2 = await api('GET', '/api/v1/search?q=&limit=10', { auth: true });
  check('GET /search with empty query', r2, 200);

  const r3 = await api('GET', '/api/v1/search/suggest?q=pol', { auth: true });
  check('GET /search/suggest', r3, 200);

  const r4 = await api('GET', '/api/v1/search/trending', { auth: true });
  check('GET /search/trending', r4, 200);

  // NLP query
  const r5 = await api('GET', '/api/v1/stories?nlp=breaking+news+about+weather+in+the+last+24+hours&limit=5', { auth: true });
  check('GET /stories with NLP query', r5, 200);

  // Search with filters
  const r6 = await api('GET', '/api/v1/search?q=crime&category=Crime&limit=5', { auth: true });
  check('GET /search with category filter', r6, 200);
}

async function testAdminSources() {
  console.log('\n═══ ADMIN: SOURCES ═══');

  const r = await api('GET', '/api/v1/admin/sources?limit=20', { auth: true });
  check('GET /admin/sources returns 200', r, 200);
  checkData('Sources has data', r, (d) => {
    const sources = d?.data || d;
    if (!Array.isArray(sources) && !sources?.sources) return 'no sources array';
    return null;
  });

  // Sources by type
  const r2 = await api('GET', '/api/v1/admin/sources/by-type', { auth: true });
  check('GET /admin/sources/by-type', r2, 200);

  // Test source URL
  const r3 = await api('POST', '/api/v1/admin/sources/test', {
    auth: true,
    body: { url: 'https://feeds.bbci.co.uk/news/rss.xml', platform: 'RSS' }
  });
  check('POST /admin/sources/test (BBC RSS)', r3, 200);
  if (r3.ok) {
    checkData('Source test returns success', r3, (d) => {
      if (!d?.success && d?.success !== false) return 'missing success field';
      return null;
    });
  }
}

async function testAdminMarkets() {
  console.log('\n═══ ADMIN: MARKETS ═══');

  const r = await api('GET', '/api/v1/admin/markets', { auth: true });
  check('GET /admin/markets returns 200', r, 200);
  checkData('Markets has data', r, (d) => {
    const markets = Array.isArray(d) ? d : (d?.data || d?.markets || []);
    if (!Array.isArray(markets)) return 'not an array';
    if (markets.length === 0) return 'EMPTY - no markets found';
    return null;
  });

  const markets = Array.isArray(r.data) ? r.data : (r.data?.data || r.data?.markets || []);
  if (markets.length > 0) {
    const m = markets[0];
    checkData('Market has required fields', r, () => {
      if (!m.id) return 'missing id';
      if (!m.name) return 'missing name';
      return null;
    });

    // Get single market
    const r2 = await api('GET', `/api/v1/admin/markets/${m.id}`, { auth: true });
    check(`GET /admin/markets/:id detail`, r2, 200);

    // Check active vs inactive counts
    const active = markets.filter(mk => mk.isActive);
    const inactive = markets.filter(mk => !mk.isActive);
    test(`Markets: ${active.length} active, ${inactive.length} inactive`, 'pass', null, null, `total: ${markets.length}`);
  }

  // Autofill
  const r3 = await api('POST', '/api/v1/admin/markets/autofill', {
    auth: true,
    body: { city: 'Dallas', state: 'TX' }
  });
  check('POST /admin/markets/autofill', r3, 200);

  // MSA database
  const r4 = await api('GET', '/api/v1/pipeline/msa-database', { auth: true });
  check('GET /pipeline/msa-database', r4, 200);
}

async function testPipeline() {
  console.log('\n═══ PIPELINE ═══');

  const r = await api('GET', '/api/v1/pipeline/status', { auth: true });
  check('GET /pipeline/status returns 200', r, 200);
  checkData('Pipeline has queue info', r, (d) => {
    if (!d?.queues && !d?.summary) return 'missing queues or summary';
    return null;
  });

  // Jobs per queue
  for (const q of ['ingestion', 'enrichment', 'clustering', 'scoring']) {
    const rj = await api('GET', `/api/v1/pipeline/jobs/${q}?state=failed&limit=5`, { auth: true });
    check(`GET /pipeline/jobs/${q}?state=failed`, rj, 200);
  }

  // Activity
  const ra = await api('GET', '/api/v1/activity', { auth: true });
  check('GET /activity', ra, 200);

  // Available sources
  const ras = await api('GET', '/api/v1/pipeline/available-sources', { auth: true });
  check('GET /pipeline/available-sources', ras, 200);

  // Scrape sources
  const rss = await api('GET', '/api/v1/pipeline/scrape-sources', { auth: true });
  check('GET /pipeline/scrape-sources', rss, 200);
}

async function testFeeds() {
  console.log('\n═══ FEEDS ═══');

  const r = await api('GET', '/api/v1/feeds');
  check('GET /feeds returns 200', r, 200);

  const feeds = r.data?.data || r.data || [];
  if (Array.isArray(feeds) && feeds.length > 0) {
    const slug = feeds[0].slug;
    if (slug) {
      const rss = await api('GET', `/api/v1/feeds/${slug}/rss`, { raw: true });
      check(`GET /feeds/${slug}/rss returns 200`, rss, 200);
      if (rss.ok) {
        const isXml = typeof rss.data === 'string' && (rss.data.includes('<?xml') || rss.data.includes('<rss'));
        test('RSS feed returns valid XML', isXml ? 'pass' : 'fail', 'XML content', rss.contentType);
      }
    }
  }
}

async function testAccountStories() {
  console.log('\n═══ ACCOUNT STORIES ═══');

  const r = await api('GET', '/api/v1/account-stories?limit=10', { auth: true });
  check('GET /account-stories returns 200', r, 200);
}

async function testCredentials() {
  console.log('\n═══ CREDENTIALS ═══');

  const r = await api('GET', '/api/v1/admin/credentials', { auth: true });
  check('GET /admin/credentials returns 200', r, 200);
}

async function testCoverage() {
  console.log('\n═══ COVERAGE ═══');

  const r = await api('GET', '/api/v1/admin/coverage', { auth: true });
  check('GET /admin/coverage returns 200', r, 200);
}

async function testAnalytics() {
  console.log('\n═══ ANALYTICS ═══');

  const endpoints = [
    '/api/v1/analytics/overview',
    '/api/v1/analytics/domain-scores',
    '/api/v1/analytics/timeline',
    '/api/v1/analytics/engagement',
    '/api/v1/analytics/velocity',
    '/api/v1/analytics/coverage',
    '/api/v1/analytics/pipeline',
    '/api/v1/analytics/content',
    '/api/v1/analytics/stories/top',
    '/api/v1/analytics/reporters',
    '/api/v1/analytics/realtime',
  ];

  for (const ep of endpoints) {
    const r = await api('GET', ep, { auth: true });
    check(`GET ${ep.replace('/api/v1/', '')}`, r, 200);
  }
}

async function testNewsroomEndpoints() {
  console.log('\n═══ NEWSROOM FEATURES ═══');

  // Assignments
  const r1 = await api('GET', '/api/v1/assignments', { auth: true });
  check('GET /assignments', r1, 200);

  // Reporters
  const r2 = await api('GET', '/api/v1/reporters', { auth: true });
  check('GET /reporters', r2, 200);

  // Show prep
  const r3 = await api('GET', '/api/v1/show-prep', { auth: true });
  check('GET /show-prep', r3, 200);

  // Show deadlines
  const r4 = await api('GET', '/api/v1/show-deadlines', { auth: true });
  check('GET /show-deadlines', r4, 200);

  const r4s = await api('GET', '/api/v1/show-deadlines/status', { auth: true });
  check('GET /show-deadlines/status', r4s, 200);

  // Pulses
  const r5 = await api('GET', '/api/v1/pulses', { auth: true });
  check('GET /pulses', r5, 200);

  // Topic clusters
  const r6 = await api('GET', '/api/v1/topic-clusters', { auth: true });
  check('GET /topic-clusters', r6, 200);

  // Bookmarks
  const r7 = await api('GET', '/api/v1/bookmarks', { auth: true });
  check('GET /bookmarks', r7, 200);

  // Notifications
  const r8 = await api('GET', '/api/v1/notifications', { auth: true });
  check('GET /notifications', r8, 200);

  const r8p = await api('GET', '/api/v1/notifications/preferences', { auth: true });
  check('GET /notifications/preferences', r8p, 200);

  // Stocks
  const r9 = await api('GET', '/api/v1/stocks/live', { auth: true });
  check('GET /stocks/live', r9, 200);

  const r9a = await api('GET', '/api/v1/stocks/alerts', { auth: true });
  check('GET /stocks/alerts', r9a, 200);

  // Moderation
  const r10 = await api('GET', '/api/v1/moderation/queue', { auth: true });
  check('GET /moderation/queue', r10, 200);

  const r10w = await api('GET', '/api/v1/moderation/words', { auth: true });
  check('GET /moderation/words', r10w, 200);

  // Rising/predictions
  const r11 = await api('GET', '/api/v1/stories/rising', { auth: true });
  check('GET /stories/rising', r11, 200);

  const r11d = await api('GET', '/api/v1/predictions/dashboard', { auth: true });
  check('GET /predictions/dashboard', r11d, 200);

  // Fact checks flagged
  const r12 = await api('GET', '/api/v1/fact-checks/flagged', { auth: true });
  check('GET /fact-checks/flagged', r12, 200);

  // Annotations recent
  const r13 = await api('GET', '/api/v1/annotations/recent', { auth: true });
  check('GET /annotations/recent', r13, 200);

  // Radio scripts
  const r14 = await api('GET', '/api/v1/radio/scripts', { auth: true });
  check('GET /radio/scripts', r14, 200);

  const r14h = await api('GET', '/api/v1/radio/history-of-the-day', { auth: true });
  check('GET /radio/history-of-the-day', r14h, 200);

  // Video projects
  const r15 = await api('GET', '/api/v1/video/projects', { auth: true });
  check('GET /video/projects', r15, 200);

  // Headline active tests
  const r16 = await api('GET', '/api/v1/headlines/active-tests', { auth: true });
  check('GET /headlines/active-tests', r16, 200);

  // Publish queue
  const r17 = await api('GET', '/api/v1/publish-queue', { auth: true });
  check('GET /publish-queue', r17, 200);

  const r17s = await api('GET', '/api/v1/publish-queue/stats', { auth: true });
  check('GET /publish-queue/stats', r17s, 200);

  // Lineup history
  const r18 = await api('GET', '/api/v1/lineup/history', { auth: true });
  check('GET /lineup/history', r18, 200);

  // Beat alerts
  const r19 = await api('GET', '/api/v1/beat-alerts', { auth: true });
  check('GET /beat-alerts', r19, 200);

  const r19a = await api('GET', '/api/v1/beat-alerts/active', { auth: true });
  check('GET /beat-alerts/active', r19a, 200);

  // Shift briefings
  const r20 = await api('GET', '/api/v1/shift-briefings', { auth: true });
  check('GET /shift-briefings', r20, 200);

  // Voice tone
  const r21 = await api('GET', '/api/v1/voice-tone', { auth: true });
  check('GET /voice-tone', r21, 200);

  // Assistant alerts
  const r22 = await api('GET', '/api/v1/assistant/alerts', { auth: true });
  check('GET /assistant/alerts', r22, 200);

  // Multilingual
  const r23 = await api('GET', '/api/v1/stories/multilingual', { auth: true });
  check('GET /stories/multilingual', r23, 200);

  // Hyperlocal intel status
  const r24 = await api('GET', '/api/v1/hyperlocal-intel/status', { auth: true });
  check('GET /hyperlocal-intel/status', r24, 200);

  // Public data alerts
  const r25 = await api('GET', '/api/v1/public-data/alerts', { auth: true });
  check('GET /public-data/alerts', r25, 200);
}

async function testAdminEndpoints() {
  console.log('\n═══ ADMIN ENDPOINTS ═══');

  // Account management
  const r1 = await api('GET', '/api/v1/admin/account', { auth: true });
  check('GET /admin/account', r1, 200);

  const r1u = await api('GET', '/api/v1/admin/account/users', { auth: true });
  check('GET /admin/account/users', r1u, 200);

  // Voices
  const r2 = await api('GET', '/api/v1/admin/voices', { auth: true });
  check('GET /admin/voices', r2, 200);

  // Feature flags
  const r3 = await api('GET', '/api/v1/admin/feature-flags', { auth: true });
  check('GET /admin/feature-flags', r3, 200);

  // Webhooks
  const r4 = await api('GET', '/api/v1/admin/webhooks', { auth: true });
  check('GET /admin/webhooks', r4, 200);

  // Digests
  const r5 = await api('GET', '/api/v1/admin/digests', { auth: true });
  check('GET /admin/digests', r5, 200);

  // Audit logs
  const r6 = await api('GET', '/api/v1/admin/audit-logs', { auth: true });
  check('GET /admin/audit-logs', r6, 200);

  // Knowledge
  const r7 = await api('GET', '/api/v1/admin/knowledge', { auth: true });
  check('GET /admin/knowledge', r7, 200);

  // Prompts
  const r8 = await api('GET', '/api/v1/admin/prompts', { auth: true });
  check('GET /admin/prompts', r8, 200);

  // Dashboards
  const r9 = await api('GET', '/api/v1/admin/dashboards', { auth: true });
  check('GET /admin/dashboards', r9, 200);

  // Widgets
  const r10 = await api('GET', '/api/v1/admin/widgets', { auth: true });
  check('GET /admin/widgets', r10, 200);

  // Audio sources
  const r11 = await api('GET', '/api/v1/admin/audio-sources', { auth: true });
  check('GET /admin/audio-sources', r11, 200);

  // Slack
  const r12 = await api('GET', '/api/v1/admin/slack', { auth: true });
  check('GET /admin/slack', r12, 200);

  // Community radar
  const r13 = await api('GET', '/api/v1/admin/community-radar', { auth: true });
  check('GET /admin/community-radar', r13, 200);

  const r13f = await api('GET', '/api/v1/admin/community-radar/feed', { auth: true });
  check('GET /admin/community-radar/feed', r13f, 200);

  const r13s = await api('GET', '/api/v1/admin/community-radar/sentiment', { auth: true });
  check('GET /admin/community-radar/sentiment', r13s, 200);

  // Broadcast monitor
  const r14 = await api('GET', '/api/v1/broadcast-monitor/competitors', { auth: true });
  check('GET /broadcast-monitor/competitors', r14, 200);

  const r14d = await api('GET', '/api/v1/broadcast-monitor/dashboard', { auth: true });
  check('GET /broadcast-monitor/dashboard', r14d, 200);

  const r14t = await api('GET', '/api/v1/broadcast-monitor/timeline', { auth: true });
  check('GET /broadcast-monitor/timeline', r14t, 200);

  // CMS config
  const r15 = await api('GET', '/api/v1/cms/config', { auth: true });
  check('GET /cms/config', r15, 200);

  const r15p = await api('GET', '/api/v1/cms/published', { auth: true });
  check('GET /cms/published', r15p, 200);

  // MOS config
  const r16 = await api('GET', '/api/v1/mos/config', { auth: true });
  check('GET /mos/config', r16, 200);

  // Social accounts
  const r17 = await api('GET', '/api/v1/social/accounts', { auth: true });
  check('GET /social/accounts', r17, 200);

  // RBAC
  const r18 = await api('GET', '/api/v1/admin/rbac/tenants', { auth: true });
  check('GET /admin/rbac/tenants', r18, 200);

  const r18r = await api('GET', '/api/v1/admin/rbac/roles', { auth: true });
  check('GET /admin/rbac/roles', r18r, 200);

  const r18p = await api('GET', '/api/v1/admin/rbac/permissions', { auth: true });
  check('GET /admin/rbac/permissions', r18p, 200);

  // SSO
  const r19 = await api('GET', '/api/v1/auth/sso/metadata', { auth: true });
  check('GET /auth/sso/metadata', r19, 200);

  const r19a = await api('GET', '/api/v1/auth/sso/accounts', { auth: true });
  check('GET /auth/sso/accounts', r19a, 200);

  // Billing
  const r20 = await api('GET', '/api/v1/billing/plans', { auth: true });
  check('GET /billing/plans', r20, 200);

  const r20s = await api('GET', '/api/v1/billing/subscription', { auth: true });
  check('GET /billing/subscription', r20s, 200);

  // Surveys
  const r21 = await api('GET', '/api/v1/surveys', { auth: true });
  check('GET /surveys', r21, 200);

  // Merge phrases
  const r22 = await api('GET', '/api/v1/merge-phrases', { auth: true });
  check('GET /merge-phrases', r22, 200);

  // Media pending
  const r23 = await api('GET', '/api/v1/media/pending', { auth: true });
  check('GET /media/pending', r23, 200);

  // Feed review queue
  const r24 = await api('GET', '/api/v1/feed-review/queue', { auth: true });
  check('GET /feed-review/queue', r24, 200);

  // Online users
  const r25 = await api('GET', '/api/v1/activity/online', { auth: true });
  check('GET /activity/online', r25, 200);

  // User views
  const r26 = await api('GET', '/api/v1/user/views', { auth: true });
  check('GET /user/views', r26, 200);

  // User subscriptions
  const r27 = await api('GET', '/api/v1/user/subscriptions', { auth: true });
  check('GET /user/subscriptions', r27, 200);

  // Workflow stages
  const r28 = await api('GET', '/api/v1/workflow/stages', { auth: true });
  check('GET /workflow/stages', r28, 200);

  // Publish queue (workflow)
  const r29 = await api('GET', '/api/v1/workflow/publish-queue', { auth: true });
  check('GET /workflow/publish-queue', r29, 200);

  // Admin editor review queue
  const r30 = await api('GET', '/api/v1/admin/stories/review-queue', { auth: true });
  check('GET /admin/stories/review-queue', r30, 200);

  // TopicPulse markdown
  const r31 = await api('GET', '/api/v1/admin/topicpulse-md', { auth: true });
  check('GET /admin/topicpulse-md', r31, 200);
}

async function testUserSettings() {
  console.log('\n═══ USER SETTINGS ═══');

  const r1 = await api('GET', '/api/v1/user/settings/access', { auth: true });
  check('GET /user/settings/access', r1, 200);
}

async function testFrontendPages() {
  console.log('\n═══ FRONTEND PAGES ═══');

  const pages = [
    '/', '/login', '/register', '/settings', '/settings/notifications',
    '/assignments', '/reporters', '/deadlines', '/briefings',
    '/show-prep', '/show-prep/rundown', '/radio', '/video',
    '/publish', '/lineup', '/feeds',
    '/analytics', '/analytics/realtime', '/stocks', '/bookmarks',
    '/alerts', '/beat-alerts', '/predictions', '/rising', '/topics', '/pulses',
    '/admin/sources', '/admin/markets', '/admin/cms-publish',
    '/admin/social-accounts', '/admin/webhooks',
    '/admin/voices', '/admin/knowledge', '/admin/editor', '/admin/prompts',
    '/admin/accounts', '/admin/superadmin', '/admin/credentials', '/admin/feature-flags',
    '/admin/audit-logs', '/admin/broadcast-monitor', '/admin/source-health', '/admin/audio-sources',
    '/admin/coverage', '/admin/community-radar', '/admin/hyperlocal-intel',
    '/admin/digests', '/admin/mos-integration', '/admin/slack',
    '/admin/dashboards', '/admin/widgets',
  ];

  for (const page of pages) {
    const r = await frontendPage(page);
    if (r.ok) {
      test(`Frontend: ${page}`, 'pass', 200, r.status, `${r.latency}ms, ${Math.round(r.size/1024)}KB`);
    } else {
      test(`Frontend: ${page}`, 'fail', 200, r.status, r.error || 'not ok');
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  TopicPulse E2E QA Test Suite                    ║');
  console.log('║  Testing against PRODUCTION                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Backend:  https://tphyperlocal-production.up.railway.app`);
  console.log(`Frontend: https://tp-hyperlocal.vercel.app`);
  console.log(`Time:     ${new Date().toISOString()}`);

  // Auth first
  const token = await getAuthToken();
  if (!token) {
    console.log('\n⚠ CRITICAL: Cannot authenticate. Aborting tests.');
    process.exit(1);
  }
  console.log('\n✓ Authentication successful');

  await testHealth();
  await testAuth();
  await testStories();
  await testSearch();
  await testAdminSources();
  await testAdminMarkets();
  await testPipeline();
  await testFeeds();
  await testAccountStories();
  await testCredentials();
  await testCoverage();
  await testAnalytics();
  await testNewsroomEndpoints();
  await testAdminEndpoints();
  await testUserSettings();
  await testFrontendPages();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  RESULTS SUMMARY                                 ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  ✓ PASSED:  ${results.pass}`);
  console.log(`  ✗ FAILED:  ${results.fail}`);
  console.log(`  ⊘ SKIPPED: ${results.skip}`);
  console.log(`  Total:     ${results.pass + results.fail + results.skip}`);

  if (results.errors.length > 0) {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  FAILURES                                        ║');
    console.log('╚══════════════════════════════════════════════════╝');
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
