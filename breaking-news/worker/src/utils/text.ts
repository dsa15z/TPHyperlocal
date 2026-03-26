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

/**
 * Detect Houston neighborhoods mentioned in text
 */
export function detectNeighborhoods(text: string): string[] {
  const lowerText = text.toLowerCase();
  return HOUSTON_NEIGHBORHOODS.filter((neighborhood) =>
    lowerText.includes(neighborhood.toLowerCase())
  );
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
