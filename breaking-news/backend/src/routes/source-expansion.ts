// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { EXPANDED_SOURCES } from '../data/expanded-sources.js';
import { SCRAPE_SOURCES } from '../data/scrape-sources.js';

function getPayload(req: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

export async function sourceExpansionRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /pipeline/available-sources — list all available source seeds
  app.get('/pipeline/available-sources', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const existingUrls = new Set(
      (await prisma.source.findMany({
        where: { accountId: payload.accountId },
        select: { url: true },
      })).map((s) => s.url).filter(Boolean)
    );

    const sources = EXPANDED_SOURCES.map((s) => ({
      ...s,
      isImported: existingUrls.has(s.url),
    }));

    const categories = [...new Set(EXPANDED_SOURCES.map((s) => s.sourceType))].sort();

    return reply.send({
      data: sources,
      total: sources.length,
      imported: sources.filter((s) => s.isImported).length,
      categories,
    });
  });

  // POST /pipeline/import-sources — bulk import sources from seed data
  app.post('/pipeline/import-sources', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      categories: z.array(z.string()).optional(),
      includeUnverified: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    }).parse(request.body);

    let sources = EXPANDED_SOURCES;
    if (body.categories && body.categories.length > 0) {
      sources = sources.filter((s) => body.categories!.includes(s.sourceType));
    }

    const existingUrls = new Set(
      (await prisma.source.findMany({
        where: { accountId: payload.accountId },
        select: { url: true },
      })).map((s) => s.url).filter(Boolean)
    );

    const toImport = sources.filter((s) => !existingUrls.has(s.url));
    const skipped = sources.length - toImport.length;

    if (body.dryRun) {
      return reply.send({
        dryRun: true,
        wouldImport: toImport.length,
        wouldSkip: skipped,
        sources: toImport.map((s) => ({ name: s.name, url: s.url, sourceType: s.sourceType })),
      });
    }

    // Get or create default market
    const market = await prisma.market.findFirst({ where: { accountId: payload.accountId } });

    const created = [];
    for (const source of toImport) {
      try {
        const record = await prisma.source.create({
          data: {
            accountId: payload.accountId,
            name: source.name,
            platform: source.platform,
            sourceType: source.sourceType === 'LOCAL_NEWS' ? 'NEWS_ORG' :
                        source.sourceType === 'GOVERNMENT' ? 'GOV_AGENCY' :
                        source.sourceType === 'POLICE' ? 'GOV_AGENCY' :
                        'RSS_FEED',
            url: source.url,
            trustScore: source.trustScore,
            marketId: market?.id || undefined,
            isActive: true,
          },
        });
        created.push({ id: record.id, name: source.name });
      } catch (err) {
        // Skip duplicates or errors
      }
    }

    return reply.status(201).send({
      imported: created.length,
      skipped,
      total: sources.length,
      sources: created,
    });
  });

  // POST /pipeline/validate-feeds — validate RSS feed URLs
  app.post('/pipeline/validate-feeds', async (request, reply) => {
    const body = z.object({
      urls: z.array(z.string().url()).max(50),
    }).parse(request.body);

    const results = await Promise.allSettled(
      body.urls.map(async (url) => {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const isRSS = text.includes('<rss') || text.includes('<feed') || text.includes('<channel');
        return { url, valid: isRSS, status: res.status };
      })
    );

    return reply.send({
      data: results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { url: body.urls[i], valid: false, error: (r.reason as Error).message };
      }),
    });
  });

  // POST /pipeline/import-scrape-sources — bulk import web scrape sources
  app.post('/pipeline/import-scrape-sources', async (request, reply) => {
    try {
      const payload = getPayload(request);
      if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

      // Source model doesn't have accountId — sources are global, linked via AccountSource
      const existingSources = await prisma.source.findMany({
        select: { id: true, url: true },
      });
      const existingUrls = new Set(existingSources.map((s) => s.url).filter(Boolean));

      const market = await prisma.market.findFirst({ where: { accountId: payload.accountId } });

      const created = [];
      const errors = [];
      for (const source of SCRAPE_SOURCES) {
        if (existingUrls.has(source.url)) continue;

        try {
          // Create the global Source record
          const record = await prisma.source.create({
          data: {
            name: source.name,
            platform: 'RSS',
            sourceType: 'RSS_FEED',
            url: source.url,
            trustScore: source.trustScore,
            marketId: market?.id || undefined,
            isActive: true,
            metadata: {
              scrapeSource: true,
              originalSourceType: 'SCRAPE',
              category: source.category,
            },
          },
        });
        // Link to the account via AccountSource
        await prisma.accountSource.create({
          data: {
            accountId: payload.accountId,
            sourceId: record.id,
            isEnabled: true,
          },
        }).catch(() => {}); // ignore if already linked

        created.push({ id: record.id, name: source.name, url: source.url });
      } catch (err) {
        errors.push({ name: source.name, error: (err as Error).message?.substring(0, 100) });
      }
    }

    return reply.status(201).send({
      imported: created.length,
      total: SCRAPE_SOURCES.length,
      skipped: SCRAPE_SOURCES.length - created.length - errors.length,
      errors: errors.length,
      errorDetails: errors,
      sources: created,
    });
    } catch (outerErr) {
      return reply.status(500).send({
        error: 'Import failed',
        message: (outerErr as Error).message?.substring(0, 200),
        scrapeSourceCount: SCRAPE_SOURCES.length,
      });
    }
  });

  // GET /pipeline/scrape-sources — list available scrape sources
  app.get('/pipeline/scrape-sources', async (request, reply) => {
    return reply.send({
      data: SCRAPE_SOURCES,
      total: SCRAPE_SOURCES.length,
    });
  });
}
