// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { metrics } from '../lib/metrics.js';
import { normalizeText, detectNeighborhoods, extractLocation } from '../utils/text.js';
import { generate } from '../lib/llm-factory.js';

const logger = createChildLogger('enrichment');

/**
 * Normalize RSS titles by stripping source attribution suffixes.
 * E.g. "Fire breaks out in Montrose - FOX 26 Houston" → "Fire breaks out in Montrose"
 */
function normalizeTitle(title: string): string {
  return title
    // Remove source attribution suffixes: " - FOX 26 Houston", " | CNN", " – ABC13"
    .replace(/\s*[-–—|]\s*(FOX|CNN|ABC|NBC|CBS|KHOU|KPRC|KTRK|KRIV|KIAH|AP|Reuters|BBC|NPR|Axios|Houston Chronicle|chron\.com|Click2Houston|The Hill|Washington Post|New York Times|USA Today)[^|–—-]*$/i, '')
    // Remove " - Source Name" generic pattern (anything after last dash if > 3 words before)
    .replace(/\s+[-–—]\s+[A-Z][A-Za-z\s.]+$/, (match) => {
      // Only remove if the part after the dash looks like a source name (< 4 words)
      const afterDash = match.replace(/^\s*[-–—]\s*/, '');
      return afterDash.split(' ').length <= 4 ? '' : match;
    })
    // Remove leading/trailing whitespace
    .trim();
}

interface EnrichmentJob {
  sourcePostId: string;
}

// Category keywords for simple v1 categorization
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  CRIME: [
    'murder', 'shooting', 'robbery', 'theft', 'assault', 'arrested', 'arrest',
    'suspect', 'police', 'crime', 'homicide', 'stabbing', 'burglary', 'carjacking',
    'drug', 'drugs', 'gang', 'violent', 'victim', 'killed', 'investigation',
    'detective', 'felony', 'misdemeanor', 'warrant', 'fugitive', 'armed',
    'weapon', 'gun', 'firearm', 'hpd', 'sheriff', 'constable',
    'custody', 'handcuffed', 'handcuff', 'escaped', 'escape', 'inmate', 'prison',
    'jail', 'sentence', 'sentenced', 'indicted', 'indictment', 'charges', 'charged',
    'convicted', 'conviction', 'prosecution', 'prosecutor', 'defendant',
    'manslaughter', 'kidnapping', 'abduction', 'fraud', 'embezzlement',
    'arson', 'vandalism', 'domestic violence', 'dui', 'dwi', 'mugshot',
    'perpetrator', 'accomplice', 'getaway', 'fled', 'fleeing', 'pursuit',
    'standoff', 'hostage', 'ransom', 'extortion', 'bribery',
  ],
  WEATHER: [
    'hurricane', 'tropical storm', 'storm', 'flood', 'flooding', 'tornado', 'weather',
    'rain', 'rainfall', 'thunder', 'thunderstorm', 'lightning', 'hail', 'drought',
    'freeze', 'blizzard', 'temperature', 'forecast', 'weather advisory',
    'national weather service', 'nws', 'tropical depression', 'wind advisory',
    'flood warning', 'tornado warning', 'winter storm', 'heat wave', 'cold front',
  ],
  TRAFFIC: [
    'traffic', 'accident', 'crash', 'collision', 'highway', 'freeway', 'interstate',
    'road', 'closure', 'detour', 'construction', 'commute', 'metro', 'transit',
    'bus', 'rail', 'i-45', 'i-10', 'i-69', 'us-59', 'i-610', 'beltway',
    'loop 610', 'highway 290', 'highway 288', 'toll road', 'hardy toll',
    'westpark tollway', 'sam houston tollway', 'pileup',
  ],
  POLITICS: [
    'mayor', 'council', 'election', 'vote', 'voting', 'ballot', 'candidate',
    'republican', 'democrat', 'governor', 'senator', 'representative',
    'legislation', 'law', 'bill', 'ordinance', 'policy', 'government',
    'city hall', 'county', 'harris county', 'congress', 'political', 'campaign',
  ],
  BUSINESS: [
    'business', 'company', 'corporate', 'stock', 'market', 'economy', 'economic',
    'jobs', 'employment', 'layoff', 'hiring', 'startup', 'investment',
    'revenue', 'profit', 'oil', 'gas', 'energy', 'real estate', 'development',
    'construction', 'opening', 'closing', 'bankruptcy', 'merger', 'acquisition',
  ],
  SPORTS: [
    'texans', 'astros', 'rockets', 'dynamo', 'dash', 'cougars', 'rice owls',
    'nfl', 'nba', 'mlb', 'mls', 'nhl', 'hockey', 'football', 'baseball',
    'basketball', 'soccer', 'game', 'score', 'playoff', 'championship',
    'coach', 'player', 'team', 'stadium', 'nrg', 'minute maid', 'toyota center',
    'goal', 'goals', 'assist', 'assists', 'touchdown', 'yards', 'quarterback',
    'pitcher', 'batting', 'home run', 'slam dunk', 'rebound', 'hat trick',
    'overtime', 'penalty', 'halftime', 'inning', 'roster', 'draft pick',
    'free agent', 'mvp', 'rookie', 'season', 'preseason', 'postseason',
    'world series', 'super bowl', 'stanley cup', 'finals',
    'dallas stars', 'dallas cowboys', 'dallas mavericks', 'texas rangers',
    'san antonio spurs', 'flyers', 'lakers', 'yankees', 'puck', 'rink',
    'ncaa', 'college football', 'sec', 'big 12',
  ],
  COMMUNITY: [
    'community', 'neighborhood', 'volunteer', 'charity', 'nonprofit', 'event',
    'festival', 'parade', 'celebration', 'school', 'education', 'library',
    'park', 'museum', 'art', 'culture', 'church', 'mosque', 'temple',
    'health', 'hospital', 'clinic', 'food', 'restaurant', 'local',
  ],
  EMERGENCY: [
    'emergency', 'fire department', 'explosion', 'hazmat', 'evacuation', 'rescue',
    'ambulance', 'ems', 'paramedic', 'firefighter', 'hazardous', 'chemical spill',
    'gas leak', 'power outage', 'outage', 'structure fire', 'house fire',
    'amber alert', 'silver alert', 'missing person', 'search and rescue',
    'wildfire', 'building collapse', 'mass casualty',
  ],
};

/**
 * Categorize content based on keyword matching
 */
function categorizeContent(text: string): string {
  const normalized = normalizeText(text);
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      // Use word boundary matching to avoid false positives
      // e.g. "watch" shouldn't match "watched" for WEATHER
      if (keyword.includes(' ')) {
        // Multi-word keywords: exact phrase match
        if (normalized.includes(keyword)) score++;
      } else {
        // Single-word: word boundary match
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(normalized)) score++;
      }
    }
    scores[category] = score;
  }

  // Find the category with highest score
  let bestCategory = 'OTHER';
  let bestScore = 0;

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Only assign if there's meaningful match (at least 2 keyword hits)
  return bestScore >= 2 ? bestCategory : 'OTHER';
}

/**
 * Extract entity-like patterns from text using regex (v1 simple approach)
 */
function extractEntities(text: string): {
  locations: string[];
  organizations: string[];
  people: string[];
} {
  const locations: string[] = [];
  const organizations: string[] = [];
  const people: string[] = [];

  // Extract Houston neighborhoods/areas
  const neighborhoods = detectNeighborhoods(text);
  locations.push(...neighborhoods);

  // Simple regex: Capitalized phrases that look like proper nouns (2-4 words)
  const properNounPattern = /(?:^|[.!?]\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g;
  let match;
  while ((match = properNounPattern.exec(text)) !== null) {
    const phrase = match[1];
    if (phrase) {
      // Skip very short matches and common sentence starters
      const skipWords = new Set(['The', 'This', 'That', 'There', 'These', 'Those', 'When', 'Where', 'What', 'Which', 'Who', 'How', 'But', 'And', 'For', 'Not', 'You', 'All', 'Can', 'Had', 'Her', 'Was', 'One', 'Our', 'Out']);
      const firstWord = phrase.split(' ')[0];
      if (firstWord && !skipWords.has(firstWord)) {
        // Heuristic: phrases with "Police", "Department", "Authority" -> org
        if (/(?:police|department|authority|agency|commission|board|office|city|county|district|university|college|school|hospital|center|inc|corp|llc|co\b)/i.test(phrase)) {
          organizations.push(phrase);
        }
        // Phrases with "Street", "Road", "Avenue", "Boulevard", "Park" -> location
        else if (/(?:street|road|avenue|boulevard|park|drive|lane|highway|freeway|bridge|bayou|creek|river)/i.test(phrase)) {
          locations.push(phrase);
        }
        // Two-word capitalized phrases that don't match above -> potential people
        else if (phrase.split(' ').length === 2 || phrase.split(' ').length === 3) {
          people.push(phrase);
        }
      }
    }
  }

  // Deduplicate
  return {
    locations: [...new Set(locations)],
    organizations: [...new Set(organizations)],
    people: [...new Set(people)],
  };
}

/**
 * Use LLM to extract category and location when keyword matching fails.
 * Only called when heuristic returns OTHER or no location.
 */
interface LLMEnrichResult {
  category: string;
  location: string;
  entities: { name: string; type: string; confidence: number }[];
  famousPersons: string[]; // notable/famous people mentioned
}

async function llmEnrich(title: string, content: string): Promise<LLMEnrichResult> {
  try {
    const prompt = `Analyze this news article and extract:
1. CATEGORY: Choose exactly one from: CRIME, WEATHER, TRAFFIC, POLITICS, BUSINESS, SPORTS, COMMUNITY, EMERGENCY, HEALTH, EDUCATION, TECHNOLOGY, ENTERTAINMENT, ENVIRONMENT, FINANCE
2. LOCATION: The MOST SPECIFIC location mentioned. Prefer neighborhood/district names over city names. If national/international news, respond "National".
3. ENTITIES: Extract named entities. List each as TYPE:NAME (one per line). Types: PERSON, ORGANIZATION, LOCATION, EVENT.
4. FAMOUS: List any famous/notable people mentioned (politicians, celebrities, athletes, CEOs, public figures). One per line. Write NONE if no famous people.

Article title: ${title}
Article content: ${content.substring(0, 1500)}

Respond in exactly this format:
CATEGORY: <category>
LOCATION: <location>
ENTITIES:
PERSON: <name>
ORGANIZATION: <name>
LOCATION: <name>
FAMOUS:
<name or NONE>`;

    const result = await generate(prompt, {
      maxTokens: 300,
      temperature: 0.1,
      systemPrompt: 'You extract structured data from news articles. Be precise. Only list real named entities, not generic terms. For FAMOUS, only list truly well-known public figures (presidents, governors, celebrities, pro athletes, Fortune 500 CEOs). Do not list local officials or unknown people.',
    });

    const lines = result.text.split('\n');
    let category = 'OTHER';
    let location = 'National';
    const entities: { name: string; type: string; confidence: number }[] = [];
    const famousPersons: string[] = [];
    let section = 'main'; // 'main', 'entities', 'famous'

    for (const line of lines) {
      const catMatch = line.match(/^CATEGORY:\s*(.+)/i);
      if (catMatch) { category = catMatch[1].trim().toUpperCase(); section = 'main'; continue; }
      const locMatch = line.match(/^LOCATION:\s*(.+)/i);
      if (locMatch && section === 'main') { location = locMatch[1].trim(); continue; }
      if (/^ENTITIES:/i.test(line)) { section = 'entities'; continue; }
      if (/^FAMOUS:/i.test(line)) { section = 'famous'; continue; }

      if (section === 'entities') {
        const entityMatch = line.match(/^(PERSON|ORGANIZATION|LOCATION|EVENT):\s*(.+)/i);
        if (entityMatch) {
          const name = entityMatch[2].trim();
          if (name && name.length > 1 && name !== 'N/A' && name !== 'None') {
            entities.push({ name, type: entityMatch[1].toUpperCase(), confidence: 0.8 });
          }
        }
      }

      if (section === 'famous') {
        const name = line.trim().replace(/^[-•*]\s*/, '');
        if (name && name.length > 2 && name !== 'NONE' && name !== 'None' && name !== 'N/A') {
          famousPersons.push(name);
        }
      }
    }

    return { category, location, entities, famousPersons };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'LLM enrichment failed, using heuristic');
    return { category: 'OTHER', location: '', entities: [], famousPersons: [] };
  }
}

async function processEnrichment(job: Job<EnrichmentJob>): Promise<void> {
  const { sourcePostId } = job.data;

  logger.info({ sourcePostId }, 'Enriching source post');

  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
    include: { source: { include: { market: true } } },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found, skipping enrichment');
    return;
  }

  const fullText = `${post.title || ''} ${post.content}`;

  // Step 1: Keyword-based categorization (fast, free)
  let category = categorizeContent(fullText);

  // Step 2: Extract entities via regex
  const entities = extractEntities(fullText);

  // Step 3: Extract location using multi-strategy approach
  // Priority: most granular first (neighborhood > street > city > region)
  // Load market-specific neighborhoods if the source belongs to a market
  const marketNeighborhoods = (post.source?.market?.neighborhoods as string[]) || [];
  const neighborhoods = detectNeighborhoods(fullText, marketNeighborhoods);
  const extractedLocation = extractLocation(fullText);
  const entityLocation = entities.locations.length > 0 ? entities.locations[0] : undefined;

  // Prefer neighborhood over city-level location for maximum granularity
  // Qualify neighborhoods with market name to avoid ambiguity (e.g., "Downtown, Toronto" not just "Downtown")
  const marketName = post.source?.market?.name;
  let locationName: string | undefined;
  if (neighborhoods.length > 0) {
    const nb = neighborhoods[0];
    // Only qualify if the neighborhood is generic (short or common name) and market is known
    const isGeneric = ['Downtown', 'Midtown', 'Uptown', 'East Side', 'West Side', 'North Side', 'South Side'].some(g => nb.toLowerCase() === g.toLowerCase());
    locationName = (isGeneric && marketName) ? `${nb}, ${marketName}` : nb;
  } else if (entityLocation) {
    locationName = entityLocation;
  } else if (extractedLocation) {
    locationName = extractedLocation;
  } else if (marketName && !marketName.toLowerCase().includes('national')) {
    // Fallback: use the source's market name as location
    locationName = marketName;
  }

  // Build structured entity list from regex extraction
  let structuredEntities: { name: string; type: string; confidence: number }[] = [
    ...entities.people.map(n => ({ name: n, type: 'PERSON', confidence: 0.5 })),
    ...entities.organizations.map(n => ({ name: n, type: 'ORGANIZATION', confidence: 0.5 })),
    ...entities.locations.map(n => ({ name: n, type: 'LOCATION', confidence: 0.5 })),
  ];

  // Step 4: If keyword categorization returned OTHER or no location, use LLM
  // Also use LLM for entity extraction (always, to get better NER than regex)
  let llmResult: LLMEnrichResult | null = null;
  if (category === 'OTHER' || !locationName || structuredEntities.length < 2) {
    const llmStart = Date.now();
    llmResult = await llmEnrich(post.title || '', post.content);
    metrics.timing('enrichment.llm_latency_ms', llmStart);
    metrics.increment('enrichment.llm_calls', 1, { provider: llmResult ? 'openai' : 'unknown' });
    if (category === 'OTHER' && llmResult.category !== 'OTHER') {
      category = llmResult.category;
      logger.info({ sourcePostId, category }, 'LLM assigned category');
    }
    if (!locationName && llmResult.location) {
      locationName = llmResult.location;
      logger.info({ sourcePostId, location: locationName }, 'LLM assigned location');
    }
    // Merge LLM entities with regex entities (LLM takes priority on overlap)
    if (llmResult.entities.length > 0) {
      const existingNames = new Set(structuredEntities.map(e => e.name.toLowerCase()));
      for (const e of llmResult.entities) {
        if (!existingNames.has(e.name.toLowerCase())) {
          structuredEntities.push(e);
          existingNames.add(e.name.toLowerCase());
        } else {
          // Boost confidence for entities found by both regex and LLM
          const existing = structuredEntities.find(x => x.name.toLowerCase() === e.name.toLowerCase());
          if (existing) existing.confidence = Math.min(1, existing.confidence + 0.3);
        }
      }
    }
  }

  // Normalize the title (strip source attribution suffixes from RSS titles)
  const normalizedTitle = post.title ? normalizeTitle(post.title) : undefined;

  // Update the SourcePost with enrichment data
  await prisma.sourcePost.update({
    where: { id: sourcePostId },
    data: {
      ...(normalizedTitle && normalizedTitle !== post.title ? { title: normalizedTitle } : {}),
      category,
      locationName: locationName || undefined,
      rawData: {
        ...(post.rawData as Record<string, unknown> || {}),
        _enrichment: {
          entities,
          neighborhoods,
          category,
          originalTitle: post.title,
          enrichedAt: new Date().toISOString(),
        },
      },
    },
  });

  // ── Generate embedding (fire-and-forget — don't block pipeline) ──
  // This runs async without awaiting, so enrichment completes immediately
  // and the clustering queue gets the job faster.
  const postId = post.id;
  const textForEmbedding = `${post.title || ''} ${post.content.substring(0, 4000)}`;
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey && textForEmbedding.length > 20) {
    fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: textForEmbedding.slice(0, 8000) }),
      signal: AbortSignal.timeout(15000),
    }).then(async (embRes) => {
      if (embRes.ok) {
        const embData = await embRes.json();
        const embedding = embData.data?.[0]?.embedding;
        if (embedding && Array.isArray(embedding)) {
          await prisma.sourcePost.update({ where: { id: postId }, data: { embeddingJson: embedding } });
        }
      }
    }).catch(() => {}); // Non-fatal, silently skip
  }

  // Enqueue to clustering queue
  const clusteringQueue = new Queue('clustering', {
    connection: getSharedConnection(),
  });

  // Collect famous persons from LLM (if enrichment ran)
  const famousPersons: string[] = llmResult?.famousPersons || [];

  await clusteringQueue.add('cluster', {
    sourcePostId: post.id,
    category,
    locationName,
    neighborhoods,
    entities,
    structuredEntities,
    famousPersons,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  await clusteringQueue.close();

  // Metrics
  metrics.increment('enrichment.processed', 1);
  if (llmResult) metrics.increment('enrichment.llm_used', 1);
  else metrics.increment('enrichment.keyword_only', 1);

  logger.info({ sourcePostId, category, locationName }, 'Enrichment complete');
}

export function createEnrichmentWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<EnrichmentJob>(
    'enrichment',
    async (job) => {
      await processEnrichment(job);
    },
    {
      connection,
      concurrency: 10,
      removeOnComplete: { count: 100, age: 3600 },
      removeOnFail: { count: 50, age: 86400 },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Enrichment job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Enrichment job failed');
  });

  return worker;
}
