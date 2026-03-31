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
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

  // POST /admin/markets/seed — seed default markets if none exist
  app.post('/markets/seed', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    // Check if any markets exist (OWNER sees all, regular sees own account)
    const where = au.role === 'OWNER' ? {} : { accountId: au.accountId };
    const existing = await prisma.market.count({ where });
    if (existing > 0) {
      return reply.status(200).send({ message: 'Markets already exist', count: existing, seeded: 0 });
    }

    // Seed default markets from KNOWN_CITIES
    const defaults = [
      'houston_tx', 'dallas_tx', 'san antonio_tx', 'austin_tx',
      'new york_ny', 'los angeles_ca', 'chicago_il', 'miami_fl',
      'phoenix_az', 'atlanta_ga',
    ];

    let seeded = 0;
    for (const key of defaults) {
      const city = KNOWN_CITIES[key];
      if (!city) continue;

      const [name, stateRaw] = key.split('_');
      const marketName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const state = (stateRaw || '').toUpperCase();
      const slug = key.replace(/_/g, '-').replace(/ /g, '-');

      try {
        await prisma.market.create({
          data: {
            accountId: au.accountId,
            name: marketName,
            slug,
            state,
            latitude: city.lat,
            longitude: city.lon,
            radiusKm: city.radius,
            timezone: city.tz,
            keywords: city.keywords,
            neighborhoods: city.neighborhoods,
            isActive: true,
          },
        });
        seeded++;
      } catch {
        // Slug conflict or other issue — skip
      }
    }

    return reply.status(201).send({ message: `Seeded ${seeded} markets`, seeded });
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
