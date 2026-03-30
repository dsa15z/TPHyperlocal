import { createHash } from 'crypto';

// Common English stopwords for filtering
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'it', 'its', 'he', 'she', 'they', 'them', 'we',
  'you', 'i', 'me', 'my', 'your', 'his', 'her', 'our', 'their', 'this',
  'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'because', 'as', 'until', 'while',
  'about', 'between', 'through', 'during', 'before', 'after', 'above',
  'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'also', 'said', 'says',
  'new', 'one', 'two', 'first', 'last', 'get', 'got', 'like',
]);

export const HOUSTON_NEIGHBORHOODS: string[] = [
  'Downtown', 'Midtown', 'Montrose', 'Heights', 'Houston Heights',
  'River Oaks', 'Galleria', 'Uptown', 'Memorial', 'Memorial Park',
  'West University', 'Bellaire', 'Meyerland', 'Medical Center',
  'Texas Medical Center', 'Museum District', 'Rice Village',
  'Third Ward', 'Fourth Ward', 'Fifth Ward', 'Sixth Ward',
  'East End', 'Second Ward', 'EaDo', 'East Downtown',
  'Katy', 'Sugar Land', 'The Woodlands', 'Pearland', 'Pasadena',
  'Clear Lake', 'League City', 'Cypress', 'Spring', 'Tomball',
  'Humble', 'Kingwood', 'Atascocita', 'Baytown', 'La Porte',
  'Deer Park', 'Missouri City', 'Stafford', 'Richmond', 'Rosenberg',
  'Conroe', 'Galveston', 'Texas City', 'Friendswood',
  'Westchase', 'Sharpstown', 'Alief', 'Gulfton', 'Spring Branch',
  'Garden Oaks', 'Oak Forest', 'Timbergrove', 'Lazybrook',
  'Greenway Plaza', 'Upper Kirby', 'Neartown', 'Eastwood',
  'Magnolia Park', 'Harrisburg', 'Denver Harbor', 'Independence Heights',
  'Acres Homes', 'Kashmere Gardens', 'Trinity Gardens',
  'Sunnyside', 'South Park', 'Hiram Clarke', 'Fondren',
  'Braeburn', 'Braeswood', 'Willowbend', 'South Main',
  'Energy Corridor', 'Briar Forest', 'Eldridge', 'Copperfield',
  'Champions', 'Willowbrook', 'Greenspoint', 'Aldine', 'North Houston',
  'IAH', 'Hobby', 'George Bush Intercontinental',
  'NRG Park', 'Minute Maid Park', 'Toyota Center',
  'Hermann Park', 'Discovery Green', 'Buffalo Bayou',
  'San Jacinto', 'Ship Channel', 'Port of Houston',
  'NASA', 'Johnson Space Center', 'Kemah',
  // Directional areas
  'Southeast Houston', 'Southwest Houston', 'Northeast Houston',
  'Northwest Houston', 'North Houston', 'South Houston',
  'East Houston', 'West Houston',
  // Additional areas
  'Harris County', 'Fort Bend County', 'Montgomery County',
  'Galveston County', 'Brazoria County', 'Waller County',
  'Liberty County', 'Chambers County',
  'Dickinson', 'Santa Fe', 'Hitchcock', 'Alvin', 'Angleton',
  'Lake Jackson', 'Freeport', 'Seabrook', 'Webster', 'Nassau Bay',
  'Manvel', 'Rosharon', 'Sienna', 'Cinco Ranch', 'Fulshear',
  'Magnolia', 'New Caney', 'Porter', 'Crosby', 'Mont Belvieu',
  'Dayton', 'Cleveland', 'Huntsville', 'Willis', 'Shenandoah',
  'Oak Ridge North', 'Panorama Village',
];

/**
 * Normalize text: lowercase, remove URLs, remove special chars, trim whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .replace(/[^a-z0-9\s]/g, ' ')      // Remove special chars
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .trim();
}

/**
 * Generate SHA-256 hash of normalized text content
 */
export function generateContentHash(text: string): string {
  const normalized = normalizeText(text);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Calculate Jaccard similarity between two sets
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  if (unionCount === 0) return 0;

  return intersectionCount / unionCount;
}

/**
 * Extract keywords from text (remove stopwords, return top terms by frequency)
 */
export function extractKeywords(text: string, maxKeywords: number = 20): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(
    (w) => w.length > 2 && !STOPWORDS.has(w)
  );

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Sort by frequency descending and return top N
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Get word set from text (for Jaccard similarity)
 */
export function getWordSet(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(
    (w) => w.length > 2 && !STOPWORDS.has(w)
  );
  return new Set(words);
}

// Short neighborhood names that are also common English words or surnames.
// These require stronger contextual signals (preposition + name) to match.
const AMBIGUOUS_NEIGHBORHOODS = new Set([
  'porter', 'spring', 'humble', 'richmond', 'stafford', 'cleveland',
  'webster', 'dayton', 'willis', 'magnolia', 'santa fe', 'alvin',
  'bellaire', 'kemah', 'sienna', 'fulshear', 'champions', 'memorial',
  'cypress', 'pearland', 'friendswood', 'liberty county',
]);

/**
 * Detect Houston neighborhoods mentioned in text.
 *
 * For unambiguous multi-word names we do a simple includes() check.
 * For ambiguous single-word names that double as common surnames/words
 * (e.g. Porter, Spring, Cleveland) we require either:
 *   - a locational preposition before the name ("in Porter", "near Spring"), OR
 *   - the word "area"/"community"/"neighborhood" nearby
 * This prevents "Arttu Porter" or "spring training" from matching.
 */
export function detectNeighborhoods(text: string): string[] {
  const lowerText = text.toLowerCase();
  return HOUSTON_NEIGHBORHOODS.filter((neighborhood) => {
    const lower = neighborhood.toLowerCase();
    if (!lowerText.includes(lower)) return false;

    if (AMBIGUOUS_NEIGHBORHOODS.has(lower)) {
      // Require locational context: preposition before the name, or "area/community" after
      const contextPattern = new RegExp(
        `(?:in|near|at|around|from|of)\\s+${lower}\\b` +
        `|\\b${lower}\\s+(?:area|community|neighborhood|resident|region)`,
        'i'
      );
      return contextPattern.test(text);
    }

    return true;
  });
}

/**
 * Extract the best location from text using multiple strategies:
 * 1. Directional Houston patterns ("southeast Houston", "north side")
 * 2. Neighborhood name matches
 * 3. "in/near/at [Location]" patterns
 * 4. Texas city/county mentions
 * 5. Fall back to "Houston" if any Houston reference found
 */
export function extractLocation(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Strategy 1: Directional Houston patterns (most specific)
  const directionalPattern = /(?:in|near|at|of|around)\s+((?:north|south|east|west|northeast|northwest|southeast|southwest)\s*(?:side\s+(?:of\s+)?)?houston)/i;
  const directionalMatch = text.match(directionalPattern);
  if (directionalMatch) {
    // Capitalize properly: "southeast Houston" -> "Southeast Houston"
    const raw = directionalMatch[1];
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Also match "southeast Houston" without a preposition
  const bareDirectional = /\b((?:north|south|east|west|northeast|northwest|southeast|southwest)\s+houston)\b/i;
  const bareMatch = text.match(bareDirectional);
  if (bareMatch) {
    return bareMatch[1].replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Strategy 2: Known neighborhood matches (sorted by specificity — longer names first)
  const neighborhoods = detectNeighborhoods(text);
  if (neighborhoods.length > 0) {
    // Prefer the most specific (longest) match
    return neighborhoods.sort((a, b) => b.length - a.length)[0];
  }

  // Strategy 3: "in [City/Area]" pattern with known Texas cities
  const texasCities = [
    'Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth',
    'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Laredo',
    'Lubbock', 'Garland', 'Irving', 'Amarillo', 'Brownsville',
    'Grand Prairie', 'McKinney', 'Frisco', 'Midland', 'Odessa',
  ];

  for (const city of texasCities) {
    if (lowerText.includes(city.toLowerCase())) {
      return city;
    }
  }

  // Strategy 4: "in [Place], Texas" pattern
  const texasPattern = /(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:Texas|TX)/;
  const texasMatch = text.match(texasPattern);
  if (texasMatch) return texasMatch[1];

  // Strategy 5: County mentions
  const countyPattern = /\b([A-Z][a-z]+)\s+County\b/;
  const countyMatch = text.match(countyPattern);
  if (countyMatch) return `${countyMatch[1]} County`;

  // Strategy 6: Any "Houston" mention at all → default to Houston
  if (lowerText.includes('houston')) return 'Houston';

  // Strategy 7: Texas mention → default to Texas
  if (lowerText.includes('texas') || lowerText.includes(' tx ') || lowerText.includes(', tx')) return 'Texas';

  return null;
}

/**
 * Calculate time proximity score (exponential decay)
 * Returns 1.0 for same time, decays with halfLifeHours
 */
export function calculateTimeProximity(
  timeA: Date,
  timeB: Date,
  halfLifeHours: number = 2
): number {
  const diffMs = Math.abs(timeA.getTime() - timeB.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  return Math.exp((-Math.LN2 * diffHours) / halfLifeHours);
}
