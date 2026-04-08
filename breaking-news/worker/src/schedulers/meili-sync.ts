// @ts-nocheck
/**
 * Meilisearch Sync — Pushes new/updated stories to the search index.
 * Runs every 30 seconds, syncs stories updated since last sync.
 */
import { createChildLogger } from '../lib/logger.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('meili-sync');
const MEILI_URL = process.env['MEILI_URL'] || '';
const MEILI_KEY = process.env['MEILI_API_KEY'] || '';
let lastSyncAt = new Date(Date.now() - 60 * 60 * 1000); // Start 1h ago
let syncInterval = null;
let initialized = false;

async function mf(path, opts = {}) {
  if (!MEILI_URL) return null;
  const res = await fetch(`${MEILI_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MEILI_KEY}`, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  return res.ok ? res.json() : null;
}

async function initIndex() {
  if (initialized || !MEILI_URL) return;
  try {
    await mf('/indexes/stories', { method: 'POST', body: JSON.stringify({ uid: 'stories', primaryKey: 'id' }) });
    await mf('/indexes/stories/settings', { method: 'PATCH', body: JSON.stringify({
      searchableAttributes: ['title', 'summary', 'category', 'location'],
      filterableAttributes: ['status', 'category', 'compositeScore', 'firstSeenAt', 'sourceCount'],
      sortableAttributes: ['compositeScore', 'breakingScore', 'firstSeenAt', 'lastUpdatedAt', 'sourceCount'],
    }) });
    initialized = true;
    logger.info('Meilisearch index initialized');
  } catch (err) {
    logger.debug({ err: err.message }, 'Meilisearch not available (non-fatal)');
  }
}

async function syncStories() {
  if (!MEILI_URL) return;
  if (!initialized) await initIndex();
  if (!initialized) return;

  try {
    const stories = await prisma.story.findMany({
      where: { mergedIntoId: null, lastUpdatedAt: { gte: lastSyncAt } },
      select: {
        id: true, title: true, summary: true, aiSummary: true, status: true,
        category: true, locationName: true, compositeScore: true, breakingScore: true,
        trendingScore: true, sourceCount: true, firstSeenAt: true, lastUpdatedAt: true,
      },
      take: 200,
      orderBy: { lastUpdatedAt: 'desc' },
    });

    if (stories.length === 0) return;

    const docs = stories.map(s => ({
      id: s.id,
      title: s.title || '',
      summary: s.aiSummary || s.summary || '',
      status: s.status,
      category: s.category || 'UNKNOWN',
      location: s.locationName || 'National',
      compositeScore: s.compositeScore,
      breakingScore: s.breakingScore,
      sourceCount: s.sourceCount,
      firstSeenAt: s.firstSeenAt ? Math.floor(new Date(s.firstSeenAt).getTime() / 1000) : 0,
      lastUpdatedAt: s.lastUpdatedAt ? Math.floor(new Date(s.lastUpdatedAt).getTime() / 1000) : 0,
    }));

    await mf('/indexes/stories/documents', { method: 'POST', body: JSON.stringify(docs) });
    lastSyncAt = new Date();
    logger.info({ count: docs.length }, 'Synced stories to Meilisearch');
  } catch (err) {
    logger.debug({ err: err.message }, 'Meilisearch sync failed (non-fatal)');
  }
}

export function startMeiliSync() {
  if (!MEILI_URL) { logger.info('MEILI_URL not set — Meilisearch sync disabled'); return; }
  logger.info('Starting Meilisearch sync (every 30s)');
  setTimeout(() => { syncStories(); syncInterval = setInterval(syncStories, 30000); }, 5000);
}

export function stopMeiliSync() { if (syncInterval) clearInterval(syncInterval); }
