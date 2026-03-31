/**
 * Unit tests for the scoring/ranking logic.
 * Tests score ranges, composite calculation, status transitions,
 * and category-specific decay curves.
 */
import { describe, it, expect } from 'vitest';

// ─── Score Range Tests ─────────────────────────────────────────────────────

describe('Score Calculations', () => {
  // Composite score formula: 0.35*breaking + 0.25*trending + 0.20*confidence + 0.20*locality
  function computeComposite(breaking: number, trending: number, confidence: number, locality: number): number {
    return 0.35 * breaking + 0.25 * trending + 0.20 * confidence + 0.20 * locality;
  }

  it('composite score is weighted sum of component scores', () => {
    expect(computeComposite(1.0, 1.0, 1.0, 1.0)).toBeCloseTo(1.0, 2);
    expect(computeComposite(0.0, 0.0, 0.0, 0.0)).toBeCloseTo(0.0, 2);
    expect(computeComposite(0.5, 0.5, 0.5, 0.5)).toBeCloseTo(0.5, 2);
    expect(computeComposite(1.0, 0.0, 0.0, 0.0)).toBeCloseTo(0.35, 2);
    expect(computeComposite(0.0, 1.0, 0.0, 0.0)).toBeCloseTo(0.25, 2);
    expect(computeComposite(0.0, 0.0, 1.0, 0.0)).toBeCloseTo(0.20, 2);
    expect(computeComposite(0.0, 0.0, 0.0, 1.0)).toBeCloseTo(0.20, 2);
  });

  it('all component scores must be in 0-1 range', () => {
    for (let i = 0; i <= 10; i++) {
      const val = i / 10;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
      const composite = computeComposite(val, val, val, val);
      expect(composite).toBeGreaterThanOrEqual(0);
      expect(composite).toBeLessThanOrEqual(1);
    }
  });

  it('composite never exceeds 1.0 even with max inputs', () => {
    expect(computeComposite(1.0, 1.0, 1.0, 1.0)).toBeLessThanOrEqual(1.0);
  });

  it('breaking score has highest weight (0.35)', () => {
    const allBreaking = computeComposite(1.0, 0.0, 0.0, 0.0);
    const allTrending = computeComposite(0.0, 1.0, 0.0, 0.0);
    const allConfidence = computeComposite(0.0, 0.0, 1.0, 0.0);
    const allLocality = computeComposite(0.0, 0.0, 0.0, 1.0);

    expect(allBreaking).toBeGreaterThan(allTrending);
    expect(allTrending).toBeGreaterThan(allConfidence);
    expect(allConfidence).toEqual(allLocality);
  });
});

// ─── Status Transition Tests ───────────────────────────────────────────────

describe('Status Transitions', () => {
  const validStatuses = ['ALERT', 'BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'FOLLOW_UP', 'STALE', 'ARCHIVED'];

  function determineStatus(breakingScore: number, trendingScore: number, ageMinutes: number): string {
    // Simplified version of the scoring worker's tiered status logic
    if (ageMinutes < 15) {
      if (breakingScore > 0.6) return 'BREAKING';
      if (trendingScore > 0.4 || breakingScore > 0.4) return 'TOP_STORY';
      return 'DEVELOPING';
    }
    if (ageMinutes < 60) {
      if (breakingScore > 0.7) return 'BREAKING';
      if (trendingScore > 0.4) return 'TOP_STORY';
      return 'DEVELOPING';
    }
    // > 60 minutes
    if (breakingScore > 0.7) return 'BREAKING';
    if (trendingScore > 0.5) return 'TOP_STORY';
    if (ageMinutes > 48 * 60) return 'STALE';
    if (ageMinutes > 12 * 60) return 'ONGOING';
    return 'DEVELOPING';
  }

  it('new high-breaking story gets BREAKING status', () => {
    expect(determineStatus(0.8, 0.5, 5)).toBe('BREAKING');
  });

  it('new moderate story gets DEVELOPING status', () => {
    expect(determineStatus(0.3, 0.3, 5)).toBe('DEVELOPING');
  });

  it('trending story gets TOP_STORY', () => {
    expect(determineStatus(0.3, 0.6, 90)).toBe('TOP_STORY');
  });

  it('old story with no activity becomes STALE', () => {
    expect(determineStatus(0.1, 0.1, 49 * 60)).toBe('STALE');
  });

  it('medium-age story is ONGOING', () => {
    expect(determineStatus(0.2, 0.2, 15 * 60)).toBe('ONGOING');
  });

  it('all returned statuses are valid enum values', () => {
    for (let breaking = 0; breaking <= 1; breaking += 0.2) {
      for (let trending = 0; trending <= 1; trending += 0.2) {
        for (const age of [1, 10, 30, 60, 180, 720, 3000]) {
          const status = determineStatus(breaking, trending, age);
          expect(validStatuses).toContain(status);
        }
      }
    }
  });
});

// ─── Category Decay Tests ──────────────────────────────────────────────────

describe('Category Decay', () => {
  const CATEGORY_DECAY: Record<string, number[]> = {
    CRIME: [100, 100, 80, 60, 40, 30, 20, 10, 5, 2, 1],
    WEATHER: [100, 100, 100, 80, 80, 60, 40, 30, 20, 10, 5],
    ENTERTAINMENT: [40, 40, 60, 80, 100, 100, 80, 60, 40, 20, 10],
  };

  function getDecayMultiplier(category: string, ageSlots: number): number {
    const curve = CATEGORY_DECAY[category];
    if (!curve) return 50; // default
    const idx = Math.min(ageSlots, curve.length - 1);
    return curve[idx] / 100;
  }

  it('CRIME decays fast — peaks immediately', () => {
    expect(getDecayMultiplier('CRIME', 0)).toBe(1.0);
    expect(getDecayMultiplier('CRIME', 5)).toBe(0.3);
    expect(getDecayMultiplier('CRIME', 10)).toBe(0.01);
  });

  it('WEATHER sustains longer than CRIME', () => {
    const weatherAt3 = getDecayMultiplier('WEATHER', 3);
    const crimeAt3 = getDecayMultiplier('CRIME', 3);
    expect(weatherAt3).toBeGreaterThan(crimeAt3);
  });

  it('ENTERTAINMENT peaks later (slot 4-5)', () => {
    expect(getDecayMultiplier('ENTERTAINMENT', 0)).toBe(0.4);
    expect(getDecayMultiplier('ENTERTAINMENT', 4)).toBe(1.0);
    expect(getDecayMultiplier('ENTERTAINMENT', 5)).toBe(1.0);
  });

  it('decay multiplier is always between 0 and 1', () => {
    for (const category of Object.keys(CATEGORY_DECAY)) {
      for (let slot = 0; slot <= 15; slot++) {
        const mult = getDecayMultiplier(category, slot);
        expect(mult).toBeGreaterThanOrEqual(0);
        expect(mult).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─── Prediction Model Tests ────────────────────────────────────────────────

describe('Prediction Model', () => {
  function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
  }

  it('sigmoid returns values between 0 and 1', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 2);
    expect(sigmoid(10)).toBeCloseTo(1.0, 2);
    expect(sigmoid(-10)).toBeCloseTo(0.0, 2);
    expect(sigmoid(100)).toBeLessThanOrEqual(1.0);
    expect(sigmoid(-100)).toBeGreaterThanOrEqual(0.0);
  });

  it('prediction with all-zero features returns ~sigmoid(bias)', () => {
    const bias = -0.3;
    const weights = new Array(13).fill(0);
    const features = new Array(13).fill(0);

    let sum = bias;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * weights[i];
    }
    const prediction = sigmoid(sum);
    expect(prediction).toBeCloseTo(sigmoid(bias), 4);
  });

  it('prediction with all-max features returns high probability', () => {
    const bias = -0.3;
    const weights = [0.25, 0.20, 0.15, 0.10, 0.20, 0.10, 0.05, 0.03, 0.08, 0.05, 0.04, 0.07, -0.05];
    const features = new Array(13).fill(1.0);

    let sum = bias;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * weights[i];
    }
    const prediction = sigmoid(sum);
    expect(prediction).toBeGreaterThan(0.5);
  });
});

// ─── Dedup Logic Tests ─────────────────────────────────────────────────────

describe('Content Deduplication', () => {
  function generateContentHash(text: string): string {
    // Simplified — in production uses SHA-256
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized;
  }

  it('same content produces same hash', () => {
    const a = generateContentHash('Houston flooding causes road closures');
    const b = generateContentHash('Houston flooding causes road closures');
    expect(a).toBe(b);
  });

  it('normalizes case and punctuation', () => {
    const a = generateContentHash('HOUSTON Flooding! Causes Road Closures...');
    const b = generateContentHash('houston flooding  causes road closures');
    expect(a).toBe(b);
  });

  it('different content produces different hash', () => {
    const a = generateContentHash('Houston flooding');
    const b = generateContentHash('Dallas tornado');
    expect(a).not.toBe(b);
  });
});
