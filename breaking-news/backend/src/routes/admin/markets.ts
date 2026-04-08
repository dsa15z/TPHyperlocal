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
  // ── International Markets ──
  'toronto_on': {
    lat: 43.6532, lon: -79.3832, tz: 'America/Toronto', radius: 60,
    keywords: ['toronto', 'gta', 'the six', 'the 6ix', 'yyz', 'tdot', 'peel region', 'york region', 'durham region', 'halton region', 'ontario'],
    neighborhoods: ['Downtown', 'Midtown', 'North York', 'Scarborough', 'Etobicoke', 'East York', 'Yorkville', 'The Annex', 'Kensington Market', 'Queen West', 'King West', 'Liberty Village', 'Leslieville', 'The Beaches', 'Danforth', 'Roncesvalles', 'High Park', 'Parkdale', 'Junction', 'Bloor West Village', 'Forest Hill', 'Lawrence Park', 'Leaside', 'Don Mills', 'Willowdale', 'Thornhill', 'Richmond Hill', 'Markham', 'Vaughan', 'Mississauga', 'Brampton', 'Oakville', 'Burlington', 'Ajax', 'Pickering', 'Oshawa', 'Whitby', 'Milton', 'Newmarket', 'Aurora', 'Caledon'],
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

    let markets: any[], total: number;
    try {
      [markets, total] = await Promise.all([
        prisma.market.findMany({
          where,
          include: {
            _count: { select: { sources: true, stories: true, sourceMarkets: true } },
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
    } catch (err1: any) {
      app.log.error({ err: err1.message }, 'Markets list primary query failed — trying simplified');
      try {
        [markets, total] = await Promise.all([
          prisma.market.findMany({
            where,
            include: {
              _count: { select: { sources: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
            skip: offset,
          }),
          prisma.market.count({ where }),
        ]);
        markets = markets.map((m: any) => ({ ...m, sources: [], account: null }));
      } catch (err2: any) {
        app.log.error({ err: err2.message }, 'Markets list simplified query also failed — trying raw SQL');
        // Ultra fallback: raw SQL that avoids any Prisma schema issues
        try {
          if (au.role === 'OWNER') {
            markets = await prisma.$queryRaw<any[]>`
              SELECT id, name, slug, state, latitude, longitude, "radiusKm",
                     timezone, "isActive", keywords, neighborhoods, "createdAt", "updatedAt"
              FROM "Market" ORDER BY "createdAt" ASC LIMIT ${limit} OFFSET ${offset}
            `;
          } else {
            markets = await prisma.$queryRaw<any[]>`
              SELECT id, name, slug, state, latitude, longitude, "radiusKm",
                     timezone, "isActive", keywords, neighborhoods, "createdAt", "updatedAt"
              FROM "Market" WHERE "accountId" = ${au.accountId}
              ORDER BY "createdAt" ASC LIMIT ${limit} OFFSET ${offset}
            `;
          }
        } catch {
          markets = await prisma.$queryRaw<any[]>`SELECT id, name, slug, state, "isActive" FROM "Market" ORDER BY name LIMIT ${limit}`;
        }
        const countResult = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "Market"`.catch(() => [{ count: 0 }]);
        total = countResult[0]?.count || 0;
        markets = markets.map((m: any) => ({ ...m, sources: [], account: null, _count: { sources: 0, stories: 0 } }));
      }
    }

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
        sourceCount: Math.max(m._count?.sources || 0, (m._count as any)?.sourceMarkets || 0),
        storyCount: m._count.stories,
        // Deduplicate sources by name (Event Registry scheduler created dupes)
        sources: [...new Map(m.sources.map(s => [s.name, s])).values()].map((s) => {
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
    let linksCreated = 0;
    const marketIds: string[] = [];

    // Helper: create source and link to markets via SourceMarket
    async function createAndLink(data: any, markets: string[]): Promise<string | null> {
      let src = await prisma.source.findFirst({ where: { name: data.name } });
      if (!src) {
        try {
          src = await prisma.source.create({ data });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } }).catch(() => {});
          sourcesCreated++;
        } catch { return null; }
      }
      // Link to markets via SourceMarket join table
      for (const mktId of markets) {
        try {
          await prisma.sourceMarket.create({ data: { sourceId: src.id, marketId: mktId } });
          linksCreated++;
        } catch { /* unique constraint = already linked */ }
      }
      return src.id;
    }

    // ── Step 1: Create National market ─────────────────────────────────
    let nationalMarket = await prisma.market.findFirst({ where: { slug: 'national', accountId: au.accountId } });
    if (!nationalMarket) {
      nationalMarket = await prisma.market.create({
        data: { accountId: au.accountId, name: 'USA National', slug: 'usa-national', state: null, latitude: 39.8283, longitude: -98.5795, radiusKm: 5000, timezone: 'America/New_York', keywords: ['national', 'us', 'usa', 'united states', 'federal', 'congress', 'white house', 'supreme court', 'america'], neighborhoods: [], isActive: true },
      });
      marketsSeeded++;
    }
    const nationalId = nationalMarket.id;
    marketIds.push(nationalId);

    // ── Step 2: Create MSA markets ─────────────────────────────────────
    for (const msa of MSA_DATABASE) {
      let market = await prisma.market.findFirst({ where: { slug: msa.slug, accountId: au.accountId } });
      if (!market) {
        try {
          market = await prisma.market.create({
            data: { accountId: au.accountId, name: msa.name, slug: msa.slug, state: msa.state, latitude: msa.latitude, longitude: msa.longitude, radiusKm: msa.radiusKm, timezone: msa.timezone, keywords: msa.keywords, neighborhoods: msa.neighborhoods, isActive: true },
          });
          marketsSeeded++;
        } catch { continue; }
      } else {
        await prisma.market.update({ where: { id: market.id }, data: { keywords: msa.keywords, neighborhoods: msa.neighborhoods } });
      }
      const mktId = market.id;
      marketIds.push(mktId);

      // TV stations — local to this market only
      for (const station of (msa.tvStations || [])) {
        await createAndLink({
          platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
          name: `${station.callSign} - ${station.name}`,
          url: station.rssUrl || station.website,
          trustScore: station.network === 'PBS' ? 0.90 : 0.85,
          isGlobal: false,
          metadata: { callSign: station.callSign, network: station.network, type: 'tv', website: station.website, feedUrl: station.rssUrl },
        }, [mktId]);
      }

      // Radio stations — local to this market only
      for (const station of (msa.radioStations || [])) {
        await createAndLink({
          platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
          name: `${station.callSign} - ${station.name}`,
          url: station.rssUrl || station.website,
          trustScore: station.format === 'NPR' ? 0.92 : 0.80,
          isGlobal: false,
          metadata: { callSign: station.callSign, format: station.format, type: 'radio', website: station.website, feedUrl: station.rssUrl },
        }, [mktId]);
      }

      // Per-market Google News local feed
      await createAndLink({
        platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
        name: `Google News Local - ${msa.name}`,
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${msa.name}" OR "${msa.name}, ${msa.state}"`)}&hl=en-US&gl=US&ceid=US:en`,
        trustScore: 0.75, isGlobal: false,
        metadata: { type: 'google-news-local', market: msa.name },
      }, [mktId]);

      // Per-market Bing News local feed
      await createAndLink({
        platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
        name: `Bing News Local - ${msa.name}`,
        url: `https://www.bing.com/news/search?q=${encodeURIComponent(`${msa.name} ${msa.state} local news`)}&format=RSS`,
        trustScore: 0.70, isGlobal: false,
        metadata: { type: 'bing-news-local', market: msa.name },
      }, [mktId]);

      // Per-market Twitter/X search — local breaking news
      await createAndLink({
        platform: 'TWITTER' as any, sourceType: 'PUBLIC_PAGE' as any,
        name: `X/Twitter - ${msa.name} News`,
        url: `${msa.name} ${msa.state} news`,
        trustScore: 0.65, isGlobal: false,
        metadata: { type: 'twitter-local', market: msa.name, state: msa.state, query: `${msa.name} ${msa.state} news -is:retweet lang:en` },
      }, [mktId]);

      await createAndLink({
        platform: 'TWITTER' as any, sourceType: 'PUBLIC_PAGE' as any,
        name: `X/Twitter - ${msa.name} Breaking`,
        url: `${msa.name} breaking`,
        trustScore: 0.60, isGlobal: false,
        metadata: { type: 'twitter-breaking', market: msa.name, state: msa.state, query: `${msa.name} breaking -is:retweet lang:en` },
      }, [mktId]);
    }

    // ── Step 3: Shared sources linked to ALL markets or National ──────
    // HyperLocal Intel — ONE source, linked to all MSA markets (iterates through them)
    await createAndLink({
      platform: 'NEWSAPI' as any, sourceType: 'API_PROVIDER' as any,
      name: 'HyperLocal Intel',
      url: 'https://futurilabs.com/hyperlocalhyperrecent/api/batch',
      trustScore: 0.80, isGlobal: false,
      metadata: { type: 'hyperlocal-intel', sources: ['Google News', 'Reddit', 'TikTok', 'X/Twitter', 'Facebook', 'YouTube', 'Threads', 'Patch.com'] },
    }, marketIds.filter(id => id !== nationalId)); // All MSA markets, not National

    // National wire/aggregator sources — linked to National market
    const nationalFeeds = [
      { name: 'Google News - US Top Stories', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', trust: 0.80, meta: { type: 'google-news', subtype: 'national' } },
      { name: 'Google News - US Business', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', trust: 0.75, meta: { type: 'google-news', subtype: 'business' } },
      { name: 'Google News - US Technology', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', trust: 0.75, meta: { type: 'google-news', subtype: 'technology' } },
      { name: 'Google News - US Sports', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', trust: 0.75, meta: { type: 'google-news', subtype: 'sports' } },
      { name: 'AP News - Top Stories', url: 'https://rsshub.app/apnews/topics/apf-topnews', trust: 0.95, meta: { type: 'wire', provider: 'AP' } },
      { name: 'AP News - US News', url: 'https://rsshub.app/apnews/topics/apf-usnews', trust: 0.95, meta: { type: 'wire', provider: 'AP' } },
      { name: 'Reuters - World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', trust: 0.95, meta: { type: 'wire', provider: 'Reuters' } },
      { name: 'NPR - News', url: 'https://feeds.npr.org/1001/rss.xml', trust: 0.92, meta: { type: 'wire', provider: 'NPR' } },
      { name: 'BBC News - US & Canada', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', trust: 0.92, meta: { type: 'wire', provider: 'BBC' } },
      { name: 'USA Today - Top Stories', url: 'https://rssfeeds.usatoday.com/UsatodaycomNation-TopStories', trust: 0.85, meta: { type: 'wire', provider: 'USA Today' } },
    ];

    for (const nf of nationalFeeds) {
      await createAndLink({
        platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
        name: nf.name, url: nf.url, trustScore: nf.trust, isGlobal: false,
        metadata: nf.meta,
      }, [nationalId]);
    }

    // ── Toronto (international market with Reddit source) ──
    try {
      const torontoData = KNOWN_CITIES['toronto_on'];
      if (torontoData) {
        const torontoMarket = await prisma.market.upsert({
          where: { accountId_slug: { accountId: au.accountId, slug: 'toronto' } },
          create: {
            accountId: au.accountId,
            name: 'Toronto',
            slug: 'toronto',
            state: 'ON',
            latitude: torontoData.lat,
            longitude: torontoData.lon,
            radiusKm: torontoData.radius,
            timezone: torontoData.tz,
            keywords: torontoData.keywords,
            neighborhoods: torontoData.neighborhoods,
          },
          update: {},
        });
        marketsSeeded++;

        // Reddit consolidated source for Toronto
        const redditSubreddits = ['Toronto', 'Ontario', 'askTO', 'TorontoRealEstate', 'FoodToronto', 'torontoraptors', 'leafs', 'BlueJays', 'Mississauga', 'Brampton', 'Markham', 'PersonalFinanceCanada', 'TorontoDriving'];
        await createAndLink({
          platform: 'REDDIT' as any, sourceType: 'RSS_FEED' as any,
          name: 'Reddit Toronto (13 subreddits)', url: 'https://www.reddit.com/r/Toronto',
          trustScore: 0.55, isGlobal: false,
          metadata: { subreddits: redditSubreddits, type: 'reddit-consolidated' },
        }, [torontoMarket.id]);

        // Toronto RSS news sources
        const torontoFeeds = [
          { name: 'CBC Toronto', url: 'https://www.cbc.ca/cmlink/rss-canada-toronto', trust: 0.90, meta: { type: 'news', network: 'CBC' } },
          { name: 'CTV Toronto', url: 'https://toronto.ctvnews.ca/rss/ctv-news-toronto-1.822319', trust: 0.88, meta: { type: 'news', network: 'CTV' } },
          { name: 'Global News Toronto', url: 'https://globalnews.ca/toronto/feed/', trust: 0.85, meta: { type: 'news', network: 'Global' } },
          { name: 'Toronto Star', url: 'https://www.thestar.com/search/?f=rss&t=article&c=news/gta*&l=50&s=start_time&sd=desc', trust: 0.85, meta: { type: 'newspaper' } },
          { name: 'Toronto Sun', url: 'https://torontosun.com/feed', trust: 0.75, meta: { type: 'newspaper' } },
          { name: 'BlogTO', url: 'https://www.blogto.com/feed/', trust: 0.65, meta: { type: 'blog', subtype: 'local' } },
          { name: 'CP24', url: 'https://www.cp24.com/rss/topstories', trust: 0.88, meta: { type: 'news', network: 'CP24' } },
          { name: 'Google News - Toronto', url: 'https://news.google.com/rss/search?q=Toronto+Ontario+news&hl=en-CA&gl=CA&ceid=CA:en', trust: 0.75, meta: { type: 'google-news', subtype: 'local' } },
        ];
        for (const tf of torontoFeeds) {
          await createAndLink({
            platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any,
            name: tf.name, url: tf.url, trustScore: tf.trust, isGlobal: false,
            metadata: tf.meta,
          }, [torontoMarket.id]);
        }
      }
    } catch (err: any) {
      app.log.warn({ err: err.message }, 'Toronto market seed failed (non-fatal)');
    }

    return reply.status(201).send({
      message: `Seeded ${marketsSeeded} markets (incl. National), created ${sourcesCreated} sources, ${linksCreated} market links`,
      marketsSeeded, sourcesCreated, linksCreated, total: MSA_DATABASE.length,
    });
  });

  // POST /admin/markets/autofill — MUST be before /:id routes
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

      const prompt = `For the city "${cityName}, ${stateName}", return a JSON object with:
{
  "latitude": number (city center),
  "longitude": number (city center),
  "timezone": "IANA timezone string (e.g. America/New_York, America/Toronto, Europe/London)",
  "radiusKm": number (reasonable coverage radius for local news, typically 30-80km),
  "country": "ISO 3166-1 alpha-2 country code (e.g. US, CA, GB, AU)",
  "language": "ISO 639-1 language code (e.g. en, fr, es)",
  "keywords": ["array of 5-8 local nicknames, abbreviations, county/province names, and common references"],
  "neighborhoods": ["array of 20-40 major neighborhoods, suburbs, and nearby communities that a local news station would cover"]
}

This city may be in ANY country, not just the United States. Use the state/province code to determine the country.
Be comprehensive with neighborhoods — include the city's major districts, suburbs, and surrounding communities within the coverage area.
Keywords should include the city name, abbreviations locals use, county/province name, and colloquial names.

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
        country: parsed.country || 'US',
        language: parsed.language || 'en',
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

}
