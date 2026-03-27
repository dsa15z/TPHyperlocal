// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { normalizeText, detectNeighborhoods } from '../utils/text.js';

const logger = createChildLogger('enrichment');

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
  ],
  WEATHER: [
    'hurricane', 'tropical', 'storm', 'flood', 'flooding', 'tornado', 'weather',
    'rain', 'rainfall', 'thunder', 'lightning', 'hail', 'wind', 'drought',
    'heat', 'freeze', 'ice', 'temperature', 'forecast', 'evacuation',
    'national weather service', 'nws', 'advisory', 'warning', 'watch',
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
    'nfl', 'nba', 'mlb', 'mls', 'football', 'baseball', 'basketball', 'soccer',
    'game', 'score', 'playoff', 'championship', 'coach', 'player', 'team',
    'stadium', 'nrg', 'minute maid', 'toyota center',
  ],
  COMMUNITY: [
    'community', 'neighborhood', 'volunteer', 'charity', 'nonprofit', 'event',
    'festival', 'parade', 'celebration', 'school', 'education', 'library',
    'park', 'museum', 'art', 'culture', 'church', 'mosque', 'temple',
    'health', 'hospital', 'clinic', 'food', 'restaurant', 'local',
  ],
  EMERGENCY: [
    'emergency', 'fire', 'explosion', 'hazmat', 'evacuation', 'rescue',
    'ambulance', 'ems', 'paramedic', 'firefighter', 'hazardous', 'chemical',
    'spill', 'leak', 'gas leak', 'power outage', 'outage', 'critical',
    'alert', 'amber alert', 'silver alert', 'missing', 'search',
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
      if (normalized.includes(keyword)) {
        score++;
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

async function processEnrichment(job: Job<EnrichmentJob>): Promise<void> {
  const { sourcePostId } = job.data;

  logger.info({ sourcePostId }, 'Enriching source post');

  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
    include: { source: true },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found, skipping enrichment');
    return;
  }

  const fullText = `${post.title || ''} ${post.content}`;

  // Categorize
  const category = categorizeContent(fullText);

  // Extract entities
  const entities = extractEntities(fullText);

  // Detect neighborhoods for locality
  const neighborhoods = detectNeighborhoods(fullText);
  const locationName = neighborhoods.length > 0
    ? neighborhoods[0]
    : entities.locations.length > 0
      ? entities.locations[0]
      : undefined;

  // Update the SourcePost with enrichment data
  await prisma.sourcePost.update({
    where: { id: sourcePostId },
    data: {
      category,
      locationName: locationName || undefined,
      rawData: {
        ...(post.rawData as Record<string, unknown> || {}),
        _enrichment: {
          entities,
          neighborhoods,
          category,
          enrichedAt: new Date().toISOString(),
        },
      },
    },
  });

  // Enqueue to clustering queue
  const clusteringQueue = new Queue('clustering', {
    connection: getSharedConnection(),
  });

  await clusteringQueue.add('cluster', {
    sourcePostId: post.id,
    category,
    locationName,
    neighborhoods,
    entities,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  await clusteringQueue.close();

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
