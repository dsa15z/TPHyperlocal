// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { EXPANDED_SOURCES } from '../data/expanded-sources.js';
import { SCRAPE_SOURCES } from '../data/scrape-sources.js';
import { MSA_DATABASE } from '../data/msa-database.js';
import { getPayload } from '../lib/route-helpers.js';


export async function sourceExpansionRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /pipeline/available-sources — list all available source seeds
  app.get('/pipeline/available-sources', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    // Source model is global — check all URLs
    const existingUrls = new Set(
      (await prisma.source.findMany({ select: { url: true } }))
        .map((s) => s.url).filter(Boolean)
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

    // Source model is GLOBAL (no accountId) — check all existing URLs
    const existingUrls = new Set(
      (await prisma.source.findMany({ select: { url: true } }))
        .map((s) => s.url).filter(Boolean)
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

    const market = await prisma.market.findFirst({ where: { accountId: payload.accountId } });

    const created = [];
    for (const source of toImport) {
      try {
        // Create global Source record (no accountId on Source model)
        const record = await prisma.source.create({
          data: {
            name: source.name,
            platform: source.platform,
            sourceType: source.sourceType === 'LOCAL_NEWS' ? 'NEWS_ORG' :
                        source.sourceType === 'GOVERNMENT' ? 'GOV_AGENCY' :
                        source.sourceType === 'POLICE' ? 'GOV_AGENCY' :
                        source.sourceType === 'FIRE' ? 'GOV_AGENCY' :
                        source.sourceType === 'COURTS' ? 'GOV_AGENCY' :
                        source.sourceType === 'UNIVERSITY' ? 'NEWS_ORG' :
                        source.sourceType === 'SPORTS' ? 'NEWS_ORG' :
                        source.sourceType === 'BUSINESS' ? 'NEWS_ORG' :
                        source.sourceType === 'NATIONAL' ? 'NEWS_ORG' :
                        source.sourceType === 'WEATHER' ? 'GOV_AGENCY' :
                        source.sourceType === 'TRAFFIC' ? 'GOV_AGENCY' :
                        source.sourceType === 'UTILITY' ? 'GOV_AGENCY' :
                        'RSS_FEED',
            url: source.url,
            trustScore: source.trustScore,
            marketId: market?.id || undefined,
            isActive: true,
          },
        });

        // Link to account via AccountSource
        await prisma.accountSource.create({
          data: {
            accountId: payload.accountId,
            sourceId: record.id,
            isEnabled: true,
          },
        }).catch(() => {}); // ignore if already linked

        created.push({ id: record.id, name: source.name });
      } catch (err) {
        // Skip duplicates
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

  // ─── MSA Database Endpoints ────────────────────────────────────────────────

  // GET /pipeline/msa-database — list all MSAs in the database
  app.get('/pipeline/msa-database', async (request, reply) => {
    const msas = (MSA_DATABASE || []).map((m) => ({
      name: m.name,
      slug: m.slug,
      state: m.state,
      latitude: m.latitude,
      longitude: m.longitude,
      radiusKm: m.radiusKm,
      timezone: m.timezone,
      neighborhoodCount: m.neighborhoods?.length || 0,
      tvStationCount: m.tvStations?.length || 0,
      radioStationCount: m.radioStations?.length || 0,
      keywordCount: m.keywords?.length || 0,
    }));

    return reply.send({
      data: msas,
      total: msas.length,
    });
  });

  // GET /pipeline/msa-database/:slug — get full details for one MSA
  app.get('/pipeline/msa-database/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const msa = (MSA_DATABASE || []).find((m) => m.slug === slug);
    if (!msa) return reply.status(404).send({ error: 'MSA not found' });
    return reply.send({ data: msa });
  });

  // POST /pipeline/seed-markets — create Market records from MSA database
  app.post('/pipeline/seed-markets', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      slugs: z.array(z.string()).optional(), // If empty, seed ALL MSAs
      includeMediaSources: z.boolean().default(true), // Also create Source records for TV/radio
    }).parse(request.body);

    const msasToSeed = body.slugs && body.slugs.length > 0
      ? (MSA_DATABASE || []).filter((m) => body.slugs!.includes(m.slug))
      : (MSA_DATABASE || []);

    const createdMarkets = [];
    const createdSources = [];
    const skippedMarkets = [];

    for (const msa of msasToSeed) {
      // Check if market already exists for this account
      const existing = await prisma.market.findFirst({
        where: { accountId: payload.accountId, slug: msa.slug },
      });

      if (existing) {
        // Update neighborhoods and keywords if empty
        const updates: Record<string, unknown> = {};
        if (!existing.neighborhoods && msa.neighborhoods?.length) {
          updates.neighborhoods = msa.neighborhoods;
        }
        if (!existing.keywords && msa.keywords?.length) {
          updates.keywords = msa.keywords;
        }
        if (Object.keys(updates).length > 0) {
          await prisma.market.update({ where: { id: existing.id }, data: updates });
        }
        skippedMarkets.push({ slug: msa.slug, name: msa.name, updated: Object.keys(updates).length > 0 });
        continue;
      }

      // Create market
      const market = await prisma.market.create({
        data: {
          accountId: payload.accountId,
          name: msa.name,
          slug: msa.slug,
          state: msa.state,
          latitude: msa.latitude,
          longitude: msa.longitude,
          radiusKm: msa.radiusKm,
          timezone: msa.timezone,
          keywords: msa.keywords,
          neighborhoods: msa.neighborhoods,
          isActive: true,
        },
      });
      createdMarkets.push({ id: market.id, name: msa.name, slug: msa.slug });

      // Create Source records for TV/radio stations
      if (body.includeMediaSources) {
        const existingUrls = new Set(
          (await prisma.source.findMany({ select: { url: true } }))
            .map((s) => s.url).filter(Boolean)
        );

        // TV stations
        for (const station of msa.tvStations || []) {
          const rssUrl = station.rssUrl || `${station.website}/feed`;
          if (existingUrls.has(rssUrl)) continue;

          try {
            const src = await prisma.source.create({
              data: {
                name: `${station.callSign} - ${station.name}`,
                platform: 'RSS',
                sourceType: 'NEWS_ORG',
                url: rssUrl,
                trustScore: 0.85,
                marketId: market.id,
                isActive: true,
                metadata: {
                  callSign: station.callSign,
                  network: station.network,
                  mediaType: 'TV',
                  website: station.website,
                  msaSlug: msa.slug,
                },
              },
            });
            await prisma.accountSource.create({
              data: { accountId: payload.accountId, sourceId: src.id, isEnabled: true },
            }).catch(() => {});
            createdSources.push({ id: src.id, name: src.name, type: 'TV', market: msa.slug });
          } catch { /* skip duplicates */ }
        }

        // Radio stations
        for (const station of msa.radioStations || []) {
          const rssUrl = station.rssUrl || `${station.website}/feed`;
          if (existingUrls.has(rssUrl)) continue;

          try {
            const src = await prisma.source.create({
              data: {
                name: `${station.callSign} - ${station.name}`,
                platform: 'RSS',
                sourceType: 'NEWS_ORG',
                url: rssUrl,
                trustScore: 0.75,
                marketId: market.id,
                isActive: true,
                metadata: {
                  callSign: station.callSign,
                  format: station.format,
                  mediaType: 'Radio',
                  website: station.website,
                  msaSlug: msa.slug,
                },
              },
            });
            await prisma.accountSource.create({
              data: { accountId: payload.accountId, sourceId: src.id, isEnabled: true },
            }).catch(() => {});
            createdSources.push({ id: src.id, name: src.name, type: 'Radio', market: msa.slug });
          } catch { /* skip duplicates */ }
        }
      }
    }

    return reply.status(201).send({
      markets: {
        created: createdMarkets.length,
        skipped: skippedMarkets.length,
        details: createdMarkets,
      },
      sources: {
        created: createdSources.length,
        details: createdSources,
      },
      totalMSAs: msasToSeed.length,
    });
  });
}
