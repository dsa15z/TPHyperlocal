// @ts-nocheck
/**
 * Public data feed worker — polls NWS weather alerts, utility outages,
 * court filings, government agendas, and traffic incidents.
 */
import { Worker, Job, Queue } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('public-data');

interface PublicDataJob {
  feedId: string;
}

/**
 * NWS Weather Alerts API (free, no key)
 */
async function fetchNWSAlerts(zone: string): Promise<any[]> {
  const url = `https://api.weather.gov/alerts/active?zone=${zone}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BreakingNewsIntelligence/1.0', 'Accept': 'application/geo+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`NWS API ${res.status}`);
  const data = await res.json();
  return (data.features || []).map((f: any) => ({
    id: f.properties.id,
    type: 'SEVERE_WEATHER',
    severity: f.properties.severity === 'Extreme' ? 'CRITICAL' :
              f.properties.severity === 'Severe' ? 'WARNING' :
              f.properties.severity === 'Moderate' ? 'WATCH' : 'INFO',
    title: f.properties.headline || f.properties.event,
    description: f.properties.description,
    location: f.properties.areaDesc,
    expiresAt: f.properties.expires ? new Date(f.properties.expires) : undefined,
  }));
}

/**
 * Generic RSS/Atom public data feed (court records, gov agendas, etc.)
 */
async function fetchRSSPublicData(url: string, type: string): Promise<any[]> {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const res = await fetch(url, {
    headers: { 'User-Agent': 'BreakingNewsIntelligence/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RSS fetch ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel || parsed?.feed;
  const entries = channel?.item || channel?.entry || [];
  const list = Array.isArray(entries) ? entries : [entries];

  return list.map((entry: any) => ({
    id: entry.guid || entry.link?.['@_href'] || entry.link || `${type}-${Date.now()}-${Math.random()}`,
    type,
    severity: 'INFO',
    title: (typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] || '').trim(),
    description: (entry.description || entry.summary || entry.content || '').substring(0, 2000),
    location: null,
  })).filter((item: any) => item.title);
}

async function processPublicDataFeed(job: Job<PublicDataJob>): Promise<void> {
  const { feedId } = job.data;

  const feed = await prisma.publicDataFeed.findUnique({ where: { id: feedId } });
  if (!feed || !feed.isActive) return;

  logger.info({ feedId, name: feed.name, type: feed.type }, 'Polling public data feed');

  let alerts: any[] = [];
  try {
    switch (feed.type) {
      case 'NWS_WEATHER': {
        const config = (feed.apiConfig as any) || {};
        const zone = config.zone || 'TXZ163'; // Harris County default
        alerts = await fetchNWSAlerts(zone);
        break;
      }
      case 'COURT_FILING':
      case 'GOV_AGENDA':
      case 'TRAFFIC_INCIDENT':
      case 'UTILITY_OUTAGE':
      case 'POLICE_DISPATCH':
        alerts = await fetchRSSPublicData(feed.url, feed.type);
        break;
      default:
        alerts = await fetchRSSPublicData(feed.url, feed.type);
    }
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ feedId, err: msg }, 'Failed to fetch public data');
    await prisma.publicDataFeed.update({ where: { id: feedId }, data: { lastError: msg, lastPolledAt: new Date() } });
    throw err;
  }

  let created = 0;
  for (const alert of alerts) {
    try {
      const externalId = `${feed.type}::${alert.id}`;
      const existing = await prisma.publicDataAlert.findUnique({ where: { externalId } });
      if (existing) continue;

      await prisma.publicDataAlert.create({
        data: {
          feedId,
          externalId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          location: alert.location,
          latitude: alert.latitude,
          longitude: alert.longitude,
          rawData: alert,
          expiresAt: alert.expiresAt,
        },
      });
      created++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // dedup
      logger.error({ err: (err as Error).message }, 'Failed to create public data alert');
    }
  }

  await prisma.publicDataFeed.update({
    where: { id: feedId },
    data: { lastPolledAt: new Date(), lastError: null },
  });

  logger.info({ feedId, name: feed.name, fetched: alerts.length, created }, 'Public data feed complete');
}

export function createPublicDataWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<PublicDataJob>('public-data', async (job) => {
    await processPublicDataFeed(job);
  }, { connection, concurrency: 3 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Public data job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Public data job failed'));
  return worker;
}
