// @ts-nocheck
/**
 * Court record worker — polls CourtListener RSS feeds for new filings,
 * creates PublicDataAlerts with appropriate severity levels.
 */
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('court-records');

interface CourtRecordJob {
  feedUrl: string;
  accountId?: string;
}

/** Keywords that indicate high-severity filings */
const CRITICAL_KEYWORDS = ['indictment', 'arrest', 'murder', 'homicide', 'capital murder', 'grand jury'];
const WARNING_KEYWORDS = ['lawsuit', 'injunction', 'restraining order', 'class action', 'felony', 'fraud'];

function classifySeverity(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (CRITICAL_KEYWORDS.some((kw) => text.includes(kw))) return 'CRITICAL';
  if (WARNING_KEYWORDS.some((kw) => text.includes(kw))) return 'WARNING';
  return 'INFO';
}

/**
 * Parse CourtListener RSS feed and return structured items.
 */
async function fetchCourtListenerFeed(feedUrl: string): Promise<any[]> {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'BreakingNewsIntelligence/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`CourtListener RSS fetch failed: ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel || parsed?.feed;
  const entries = channel?.item || channel?.entry || [];
  const list = Array.isArray(entries) ? entries : [entries];

  return list
    .map((entry: any) => {
      const title = (typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] || '').trim();
      const link = typeof entry.link === 'string' ? entry.link : entry.link?.['@_href'] || '';
      const description = (entry.description || entry.summary || entry.content || '').substring(0, 2000);
      const pubDate = entry.pubDate || entry.published || entry.updated || null;
      const guid = entry.guid || link || `court-${Date.now()}-${Math.random()}`;

      return {
        id: guid,
        title,
        link,
        description,
        pubDate: pubDate ? new Date(pubDate) : new Date(),
        severity: classifySeverity(title, description),
      };
    })
    .filter((item: any) => item.title);
}

async function processCourtRecordFeed(job: Job<CourtRecordJob>): Promise<void> {
  const { feedUrl, accountId } = job.data;

  logger.info({ feedUrl, accountId }, 'Polling CourtListener RSS feed');

  // Look up the PublicDataFeed if one exists for this URL
  const feed = await prisma.publicDataFeed.findFirst({
    where: { url: feedUrl, type: 'COURT_FILING' },
  });

  let items: any[] = [];
  try {
    items = await fetchCourtListenerFeed(feedUrl);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ feedUrl, err: msg }, 'Failed to fetch CourtListener feed');
    if (feed) {
      await prisma.publicDataFeed.update({
        where: { id: feed.id },
        data: { lastError: msg, lastPolledAt: new Date() },
      });
    }
    throw err;
  }

  let created = 0;
  for (const item of items) {
    try {
      const externalId = `COURT_FILING::${item.id}`;
      const existing = await prisma.publicDataAlert.findUnique({ where: { externalId } });
      if (existing) continue;

      await prisma.publicDataAlert.create({
        data: {
          feedId: feed?.id || null,
          externalId,
          type: 'COURT_FILING',
          severity: item.severity,
          title: item.title,
          description: item.description,
          location: null,
          rawData: {
            caseName: item.title,
            court: null,
            filingDate: item.pubDate.toISOString(),
            url: item.link,
          },
        },
      });
      created++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // dedup unique constraint
      logger.error({ err: (err as Error).message, title: item.title }, 'Failed to create court record alert');
    }
  }

  // Update feed poll timestamp
  if (feed) {
    await prisma.publicDataFeed.update({
      where: { id: feed.id },
      data: { lastPolledAt: new Date(), lastError: null },
    });
  }

  logger.info({ feedUrl, fetched: items.length, created }, 'Court record feed processing complete');
}

export function createCourtRecordWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<CourtRecordJob>('court-records', async (job) => {
    await processCourtRecordFeed(job);
  }, { connection, concurrency: 2 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Court record job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Court record job failed'));
  return worker;
}
