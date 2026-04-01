// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createMarketSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  state: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90).default(0),
  longitude: z.number().min(-180).max(180).default(0),
  radiusKm: z.number().positive().max(500).default(80),
  timezone: z.string().default('America/Chicago'),
  keywords: z.array(z.string()).optional(),
  neighborhoods: z.array(z.string()).optional(),
});

const updateMarketSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  state: z.string().max(10).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(500).optional(),
  timezone: z.string().optional(),
  keywords: z.array(z.string()).optional().nullable(),
  neighborhoods: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    const err = new Error('Forbidden: ADMIN role or higher required');
    (err as any).statusCode = 403;
    throw err;
  }
}

// ─── Well-known US cities (instant lookup, no API call needed) ────────────────

const KNOWN_CITIES: Record<string, {
  lat: number; lon: number; tz: string; radius: number;
  keywords: string[]; neighborhoods: string[];
}> = {
  'houston_tx': {
    lat: 29.7604, lon: -95.3698, tz: 'America/Chicago', radius: 80,
    keywords: ['houston', 'htx', 'h-town', 'harris county', 'space city', 'bayou city'],
    neighborhoods: ['Downtown', 'Midtown', 'Montrose', 'Heights', 'River Oaks', 'Galleria', 'Uptown', 'Memorial', 'West University', 'Bellaire', 'Meyerland', 'Medical Center', 'Museum District', 'Rice Village', 'Third Ward', 'Fifth Ward', 'East End', 'EaDo', 'Katy', 'Sugar Land', 'The Woodlands', 'Pearland', 'Pasadena', 'Clear Lake', 'Cypress', 'Spring', 'Humble', 'Kingwood', 'Baytown', 'Missouri City', 'Conroe', 'Galveston', 'Friendswood', 'League City', 'Tomball', 'Atascocita', 'Spring Branch', 'Sharpstown', 'Alief', 'Energy Corridor', 'Greenspoint', 'Willowbrook', 'Champions'],
  },
  'dallas_tx': {
    lat: 32.7767, lon: -96.7970, tz: 'America/Chicago', radius: 60,
    keywords: ['dallas', 'dfw', 'big d', 'dallas county', 'north texas'],
    neighborhoods: ['Downtown', 'Uptown', 'Deep Ellum', 'Bishop Arts', 'Oak Lawn', 'Highland Park', 'University Park', 'Lakewood', 'Lower Greenville', 'Knox-Henderson', 'Design District', 'Victory Park', 'Cedars', 'Oak Cliff', 'Pleasant Grove', 'Lake Highlands', 'Preston Hollow', 'North Dallas', 'Far North Dallas', 'Plano', 'Frisco', 'McKinney', 'Richardson', 'Garland', 'Irving', 'Arlington', 'Grand Prairie', 'Mesquite', 'Carrollton', 'Allen'],
  },
  'san antonio_tx': {
    lat: 29.4241, lon: -98.4936, tz: 'America/Chicago', radius: 50,
    keywords: ['san antonio', 'satx', 'alamo city', 'bexar county', 'sa'],
    neighborhoods: ['Downtown', 'River Walk', 'Alamo Heights', 'Monte Vista', 'Southtown', 'King William', 'Pearl District', 'Stone Oak', 'Helotes', 'Leon Valley', 'Medical Center', 'Terrell Hills', 'Olmos Park', 'Tobin Hill', 'Five Points', 'Dignowity Hill', 'Mahncke Park', 'Government Hill', 'Boerne', 'New Braunfels', 'Schertz', 'Converse', 'Universal City', 'Live Oak'],
  },
  'austin_tx': {
    lat: 30.2672, lon: -97.7431, tz: 'America/Chicago', radius: 45,
    keywords: ['austin', 'atx', 'keep austin weird', 'travis county', 'capital city'],
    neighborhoods: ['Downtown', 'South Congress', 'East Austin', 'Zilker', 'Barton Hills', 'Hyde Park', 'Mueller', 'Domain', 'Rainey Street', 'West Campus', 'Clarksville', 'Bouldin Creek', 'Travis Heights', 'Crestview', 'Allandale', 'Westlake Hills', 'Lakeway', 'Cedar Park', 'Round Rock', 'Pflugerville', 'Georgetown', 'Kyle', 'Buda', 'Dripping Springs', 'Bee Cave'],
  },
  'new york_ny': {
    lat: 40.7128, lon: -74.0060, tz: 'America/New_York', radius: 30,
    keywords: ['new york', 'nyc', 'big apple', 'gotham', 'manhattan'],
    neighborhoods: ['Manhattan', 'Midtown', 'Harlem', 'SoHo', 'TriBeCa', 'Chelsea', 'Greenwich Village', 'East Village', 'Lower East Side', 'Upper East Side', 'Upper West Side', 'Williamsburg', 'DUMBO', 'Park Slope', 'Astoria', 'Long Island City', 'Bushwick', 'Crown Heights', 'Flatbush', 'Bay Ridge', 'Bronx', 'Staten Island', 'Flushing', 'Jamaica', 'South Bronx'],
  },
  'los angeles_ca': {
    lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles', radius: 60,
    keywords: ['los angeles', 'la', 'city of angels', 'socal', 'la county'],
    neighborhoods: ['Downtown', 'Hollywood', 'Silver Lake', 'Echo Park', 'Los Feliz', 'Koreatown', 'Venice', 'Santa Monica', 'Beverly Hills', 'West Hollywood', 'Pasadena', 'Glendale', 'Burbank', 'Culver City', 'Inglewood', 'Compton', 'Long Beach', 'Torrance', 'Arcadia', 'South Gate', 'Watts', 'Boyle Heights', 'Highland Park', 'Eagle Rock', 'Encino', 'Sherman Oaks', 'Van Nuys'],
  },
  'chicago_il': {
    lat: 41.8781, lon: -87.6298, tz: 'America/Chicago', radius: 40,
    keywords: ['chicago', 'chi-town', 'windy city', 'cook county'],
    neighborhoods: ['Loop', 'River North', 'Gold Coast', 'Lincoln Park', 'Wicker Park', 'Bucktown', 'Logan Square', 'Pilsen', 'Bronzeville', 'Hyde Park', 'Lakeview', 'Wrigleyville', 'Old Town', 'South Loop', 'West Loop', 'Humboldt Park', 'Rogers Park', 'Uptown', 'Chatham', 'Austin', 'Englewood', 'Back of the Yards', 'Bridgeport', 'Chinatown', 'Evanston', 'Oak Park'],
  },
  'miami_fl': {
    lat: 25.7617, lon: -80.1918, tz: 'America/New_York', radius: 40,
    keywords: ['miami', 'magic city', 'mia', 'dade county', 'south florida'],
    neighborhoods: ['Downtown', 'Brickell', 'Wynwood', 'Little Havana', 'Coconut Grove', 'Coral Gables', 'South Beach', 'Miami Beach', 'Hialeah', 'Doral', 'Kendall', 'Homestead', 'North Miami', 'Aventura', 'Key Biscayne', 'Overtown', 'Liberty City', 'Little Haiti', 'Edgewater', 'Design District'],
  },
  'phoenix_az': {
    lat: 33.4484, lon: -112.0740, tz: 'America/Phoenix', radius: 50,
    keywords: ['phoenix', 'phx', 'valley of the sun', 'maricopa county'],
    neighborhoods: ['Downtown', 'Arcadia', 'Scottsdale', 'Tempe', 'Mesa', 'Chandler', 'Gilbert', 'Glendale', 'Peoria', 'Surprise', 'Ahwatukee', 'Paradise Valley', 'Camelback East', 'Maryvale', 'South Mountain', 'Encanto', 'Central City', 'North Phoenix'],
  },
  'atlanta_ga': {
    lat: 33.7490, lon: -84.3880, tz: 'America/New_York', radius: 45,
    keywords: ['atlanta', 'atl', 'hotlanta', 'fulton county', 'dekalb county'],
    neighborhoods: ['Downtown', 'Midtown', 'Buckhead', 'Virginia-Highland', 'Little Five Points', 'Decatur', 'East Atlanta', 'Grant Park', 'Inman Park', 'Old Fourth Ward', 'West End', 'Kirkwood', 'Poncey-Highland', 'Cabbagetown', 'Edgewood', 'Sandy Springs', 'Roswell', 'Marietta', 'Dunwoody', 'Brookhaven'],
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function marketRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/markets — list markets (OWNER sees all, others see own account)
  app.get('/markets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }
    const { limit, offset } = query.data;

    // Superadmin (OWNER) sees all markets across all accounts
    const where = au.role === 'OWNER' ? {} : { accountId: au.accountId };

    const [markets, total] = await Promise.all([
      prisma.market.findMany({
        where,
        include: {
          _count: { select: { sources: true, stories: true } },
          account: { select: { name: true } },
          sources: {
            select: {
              id: true,
              name: true,
              platform: true,
              sourceType: true,
              url: true,
              isActive: true,
              trustScore: true,
              metadata: true,
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.market.count({ where }),
    ]);

    return reply.status(200).send({
      data: markets.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        state: m.state,
        latitude: m.latitude,
        longitude: m.longitude,
        radiusKm: m.radiusKm,
        timezone: m.timezone,
        isActive: m.isActive,
        keywords: m.keywords,
        neighborhoods: m.neighborhoods,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        sourceCount: m._count.sources,
        storyCount: m._count.stories,
        sources: m.sources.map((s) => {
          const meta = s.metadata as Record<string, any> | null;
          return {
            id: s.id,
            name: s.name,
            platform: s.platform,
            sourceType: s.sourceType,
            url: s.url,
            isActive: s.isActive,
            trustScore: s.trustScore,
            type: meta?.type || (s.sourceType === 'NEWS_ORG' ? (meta?.network ? 'tv' : meta?.format ? 'radio' : 'news') : 'other'),
            callSign: meta?.callSign,
            network: meta?.network,
            format: meta?.format,
          };
        }),
      })),
      total,
      limit,
      offset,
    });
  });

  // POST /admin/markets — create market
  app.post('/markets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const parsed = createMarketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    // Check maxMarkets limit
    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { maxMarkets: true },
    });
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const currentCount = await prisma.market.count({
      where: { accountId: au.accountId, isActive: true },
    });
    if (currentCount >= account.maxMarkets) {
      return reply.status(400).send({
        error: `Market limit reached (${account.maxMarkets}). Upgrade your plan or deactivate an existing market.`,
      });
    }

    // Check slug uniqueness within account
    const existingSlug = await prisma.market.findUnique({
      where: { accountId_slug: { accountId: au.accountId, slug: data.slug } },
    });
    if (existingSlug) {
      return reply.status(400).send({ error: 'A market with this slug already exists in your account' });
    }

    const market = await prisma.market.create({
      data: {
        accountId: au.accountId,
        name: data.name,
        slug: data.slug,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        radiusKm: data.radiusKm,
        timezone: data.timezone,
        keywords: data.keywords ?? undefined,
        neighborhoods: data.neighborhoods ?? undefined,
      },
    });

    return reply.status(201).send(market);
  });

  // POST /admin/markets/seed — MUST be registered before /:id routes
  app.post('/markets/seed', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    let MSA_DATABASE: any[];
    try {
      const mod = await import('../../data/msa-database.js');
      MSA_DATABASE = mod.MSA_DATABASE;
    } catch (err: any) {
      return reply.status(500).send({ error: 'MSA database not available: ' + err.message });
    }

    if (!MSA_DATABASE || MSA_DATABASE.length === 0) {
      return reply.status(500).send({ error: 'MSA database is empty' });
    }

    let marketsSeeded = 0;
    let sourcesCreated = 0;
    const skipped: string[] = [];

    for (const msa of MSA_DATABASE) {
      const existingMarket = await prisma.market.findFirst({
        where: { slug: msa.slug, accountId: au.accountId },
      });

      let marketId: string;

      if (existingMarket) {
        marketId = existingMarket.id;
        await prisma.market.update({
          where: { id: existingMarket.id },
          data: { keywords: msa.keywords, neighborhoods: msa.neighborhoods, latitude: msa.latitude, longitude: msa.longitude, radiusKm: msa.radiusKm, timezone: msa.timezone },
        });
        skipped.push(msa.name);
      } else {
        try {
          const market = await prisma.market.create({
            data: { accountId: au.accountId, name: msa.name, slug: msa.slug, state: msa.state, latitude: msa.latitude, longitude: msa.longitude, radiusKm: msa.radiusKm, timezone: msa.timezone, keywords: msa.keywords, neighborhoods: msa.neighborhoods, isActive: true },
          });
          marketId = market.id;
          marketsSeeded++;
        } catch {
          skipped.push(msa.name + ' (create failed)');
          continue;
        }
      }

      // Create TV station sources
      for (const station of (msa.tvStations || [])) {
        const exists = await prisma.source.findFirst({ where: { name: { contains: station.callSign, mode: 'insensitive' }, marketId } });
        if (exists) continue;
        try {
          const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: `${station.callSign} - ${station.name}`, url: station.rssUrl || station.website, marketId, trustScore: station.network === 'PBS' ? 0.90 : 0.85, isGlobal: false, metadata: { callSign: station.callSign, network: station.network, type: 'tv', website: station.website, feedUrl: station.rssUrl } } });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: !!station.rssUrl } });
          sourcesCreated++;
        } catch { /* dedup */ }
      }

      // Create radio station sources
      for (const station of (msa.radioStations || [])) {
        const exists = await prisma.source.findFirst({ where: { name: { contains: station.callSign, mode: 'insensitive' }, marketId } });
        if (exists) continue;
        try {
          const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: `${station.callSign} - ${station.name}`, url: station.rssUrl || station.website, marketId, trustScore: station.format === 'NPR' ? 0.92 : 0.80, isGlobal: false, metadata: { callSign: station.callSign, format: station.format, type: 'radio', website: station.website, feedUrl: station.rssUrl } } });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: !!station.rssUrl } });
          sourcesCreated++;
        } catch { /* dedup */ }
      }

      // Create HyperLocal Intel source
      const hlName = `HyperLocal Intel - ${msa.name}`;
      const existingHL = await prisma.source.findFirst({ where: { name: hlName, marketId } });
      if (!existingHL) {
        try {
          const hlSrc = await prisma.source.create({ data: { platform: 'NEWSAPI' as any, sourceType: 'API_PROVIDER' as any, name: hlName, url: `https://futurilabs.com/hyperlocalhyperrecent/api/lookup?city=${encodeURIComponent(msa.name)}&state=${msa.state}`, marketId, trustScore: 0.80, isGlobal: false, metadata: { type: 'hyperlocal-intel', city: msa.name, state: msa.state, sources: ['Google News', 'Reddit', 'TikTok', 'X/Twitter', 'Facebook', 'YouTube', 'Threads', 'Patch.com', 'Nextdoor (public)', 'Local blogs', 'Government feeds', 'School districts'] } } });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: hlSrc.id, isEnabled: true } });
          sourcesCreated++;
        } catch { /* dedup */ }
      }

      // Create Google News RSS feeds for this market
      // Google News provides free RSS feeds by geo location and keyword search
      const googleKeywords = [
        msa.name, // "Houston"
        `${msa.name} ${msa.state}`, // "Houston TX"
        ...(msa.keywords || []).slice(0, 5), // Top 5 market keywords
      ];
      // Also add category-specific feeds
      const googleCategories = [
        { topic: 'NATION', label: 'Top Stories' },
        { topic: 'BUSINESS', label: 'Business' },
        { topic: 'TECHNOLOGY', label: 'Technology' },
        { topic: 'ENTERTAINMENT', label: 'Entertainment' },
        { topic: 'SPORTS', label: 'Sports' },
        { topic: 'SCIENCE', label: 'Science' },
        { topic: 'HEALTH', label: 'Health' },
      ];

      for (const kw of googleKeywords) {
        const gName = `Google News - ${msa.name} - ${kw}`;
        const exists = await prisma.source.findFirst({ where: { name: gName, marketId } });
        if (!exists) {
          try {
            const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=en-US&gl=US&ceid=US:en`;
            const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: gName, url: gUrl, marketId, trustScore: 0.75, isGlobal: false, metadata: { type: 'google-news', keyword: kw, market: msa.name } } });
            await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } });
            sourcesCreated++;
          } catch { /* dedup */ }
        }
      }

      // Google News geo-local feed
      const geoName = `Google News - ${msa.name} Local`;
      const geoExists = await prisma.source.findFirst({ where: { name: geoName, marketId } });
      if (!geoExists) {
        try {
          const geoUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(msa.name)}+local+news&hl=en-US&gl=US&ceid=US:en`;
          const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: geoName, url: geoUrl, marketId, trustScore: 0.75, isGlobal: false, metadata: { type: 'google-news', subtype: 'local', market: msa.name } } });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } });
          sourcesCreated++;
        } catch { /* dedup */ }
      }

      // Google News category feeds for this market
      for (const cat of googleCategories) {
        const catName = `Google News - ${msa.name} ${cat.label}`;
        const catExists = await prisma.source.findFirst({ where: { name: catName, marketId } });
        if (!catExists) {
          try {
            const catUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(msa.name)}+${encodeURIComponent(cat.label.toLowerCase())}&hl=en-US&gl=US&ceid=US:en`;
            const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: catName, url: catUrl, marketId, trustScore: 0.70, isGlobal: false, metadata: { type: 'google-news', subtype: 'category', category: cat.topic, market: msa.name } } });
            await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } });
            sourcesCreated++;
          } catch { /* dedup */ }
        }
      }

      // Create Bing News RSS feeds for this market
      const bingKeywords = [
        msa.name,
        `${msa.name} ${msa.state} news`,
        `${msa.name} breaking news`,
        `${msa.name} crime`,
        `${msa.name} weather`,
      ];

      for (const kw of bingKeywords) {
        const bName = `Bing News - ${msa.name} - ${kw}`;
        const exists = await prisma.source.findFirst({ where: { name: bName, marketId } });
        if (!exists) {
          try {
            const bUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(kw)}&format=RSS`;
            const src = await prisma.source.create({ data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name: bName, url: bUrl, marketId, trustScore: 0.70, isGlobal: false, metadata: { type: 'bing-news', keyword: kw, market: msa.name } } });
            await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } });
            sourcesCreated++;
          } catch { /* dedup */ }
        }
      }
    }

    return reply.status(201).send({ message: `Seeded ${marketsSeeded} markets, created ${sourcesCreated} sources (TV, radio, Google News, Bing News, HyperLocal)`, marketsSeeded, sourcesCreated, marketsUpdated: skipped.length, total: MSA_DATABASE.length });
  });

  // POST /admin/markets/autofill — MUST also be before /:id routes
  // (moved up from below)

  // GET /admin/markets/:id — get market details
  app.get('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const market = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
      include: {
        _count: { select: { sources: true, stories: true } },
      },
    });

    if (!market) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    return reply.status(200).send({
      id: market.id,
      name: market.name,
      slug: market.slug,
      state: market.state,
      latitude: market.latitude,
      longitude: market.longitude,
      radiusKm: market.radiusKm,
      timezone: market.timezone,
      isActive: market.isActive,
      keywords: market.keywords,
      neighborhoods: market.neighborhoods,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
      sourceCount: market._count.sources,
      storyCount: market._count.stories,
    });
  });

  // PATCH /admin/markets/:id — update market
  app.patch('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const parsed = updateMarketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    // Verify market belongs to account
    const existing = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const data = parsed.data;

    // If slug is changing, check uniqueness within account
    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await prisma.market.findUnique({
        where: { accountId_slug: { accountId: au.accountId, slug: data.slug } },
      });
      if (slugTaken) {
        return reply.status(400).send({ error: 'A market with this slug already exists in your account' });
      }
    }

    const market = await prisma.market.update({
      where: { id },
      data,
    });

    return reply.status(200).send(market);
  });

  // DELETE /admin/markets/:id — soft delete (set isActive=false)
  app.delete('/markets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const existing = await prisma.market.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const market = await prisma.market.update({
      where: { id },
      data: { isActive: false },
    });

    return reply.status(200).send({ message: 'Market deactivated', id: market.id });
  });

  // POST /admin/markets/autofill — AI-powered market data autofill
  app.post('/markets/autofill', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      name: z.string().min(1),
      state: z.string().min(1),
    }).parse(request.body);

    const cityName = body.name.trim();
    const stateName = body.state.trim().toUpperCase();
    const lookupKey = `${cityName.toLowerCase()}_${stateName.toLowerCase()}`;

    // Check well-known cities first (instant, no API call)
    const known = KNOWN_CITIES[lookupKey];
    if (known) {
      return reply.send({
        source: 'known_cities',
        latitude: known.lat,
        longitude: known.lon,
        timezone: known.tz,
        radiusKm: known.radius,
        keywords: known.keywords,
        neighborhoods: known.neighborhoods,
        slug: cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    }

    // Fall back to LLM for unknown cities
    const apiKey = process.env['OPENAI_API_KEY'] || process.env['XAI_API_KEY'];
    if (!apiKey) {
      return reply.status(200).send({
        source: 'default',
        latitude: 0,
        longitude: 0,
        timezone: 'America/Chicago',
        radiusKm: 50,
        keywords: [cityName.toLowerCase()],
        neighborhoods: [],
        slug: cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    }

    try {
      const isOpenAI = !!process.env['OPENAI_API_KEY'];
      const url = isOpenAI
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.x.ai/v1/chat/completions';

      const prompt = `For the city "${cityName}, ${stateName}" in the United States, return a JSON object with:
{
  "latitude": number (city center),
  "longitude": number (city center),
  "timezone": "America/..." (IANA timezone),
  "radiusKm": number (reasonable coverage radius for local news, typically 30-80km),
  "keywords": ["array of 5-8 local nicknames, abbreviations, county names, and common references"],
  "neighborhoods": ["array of 20-40 major neighborhoods, suburbs, and nearby communities that a local news station would cover"]
}

Be comprehensive with neighborhoods — include the city's major districts, suburbs, and surrounding communities within the coverage area. Keywords should include the city name, abbreviations locals use, county name, and colloquial names.

Return ONLY the JSON object, no other text.`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: isOpenAI ? 'gpt-4o-mini' : 'grok-3-mini',
          messages: [
            { role: 'system', content: 'You return precise geographic and local knowledge data as JSON. Be accurate with coordinates and comprehensive with local area names.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
          ...(isOpenAI ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`LLM API error: ${res.status}`);

      const data = await res.json();
      let content = data.choices?.[0]?.message?.content || '';

      // Strip markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1];

      const parsed = JSON.parse(content.trim());

      return reply.send({
        source: 'ai',
        latitude: parsed.latitude || 0,
        longitude: parsed.longitude || 0,
        timezone: parsed.timezone || 'America/Chicago',
        radiusKm: parsed.radiusKm || 50,
        keywords: parsed.keywords || [cityName.toLowerCase()],
        neighborhoods: parsed.neighborhoods || [],
        slug: cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    } catch (err) {
      // On any error, return sensible defaults
      return reply.send({
        source: 'default',
        latitude: 0,
        longitude: 0,
        timezone: 'America/Chicago',
        radiusKm: 50,
        keywords: [cityName.toLowerCase(), stateName.toLowerCase()],
        neighborhoods: [],
        slug: cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    }
  });
}
