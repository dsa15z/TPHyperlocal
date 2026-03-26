import { Platform, SourceType, StoryStatus } from "./types.js";

// ── Houston Market Center ────────────────────────────────────────────────────

export const HOUSTON_CENTER = {
  latitude: 29.7604,
  longitude: -95.3698,
  name: "Houston, TX",
} as const;

export const DEFAULT_RADIUS_KM = 80;

// ── Score Thresholds ─────────────────────────────────────────────────────────

export const SCORE_THRESHOLDS = {
  breaking: 0.7,
  trending: 0.5,
  confidence: 0.4,
  locality: 0.3,
  composite: {
    high: 0.75,
    medium: 0.5,
    low: 0.25,
  },
} as const;

// ── Status Transitions ───────────────────────────────────────────────────────
// Maps each status to the set of statuses it can transition to.

export const STATUS_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  [StoryStatus.EMERGING]: [
    StoryStatus.BREAKING,
    StoryStatus.TRENDING,
    StoryStatus.ACTIVE,
    StoryStatus.STALE,
  ],
  [StoryStatus.BREAKING]: [
    StoryStatus.TRENDING,
    StoryStatus.ACTIVE,
    StoryStatus.STALE,
  ],
  [StoryStatus.TRENDING]: [
    StoryStatus.ACTIVE,
    StoryStatus.STALE,
  ],
  [StoryStatus.ACTIVE]: [
    StoryStatus.TRENDING,
    StoryStatus.STALE,
  ],
  [StoryStatus.STALE]: [
    StoryStatus.ACTIVE,
    StoryStatus.ARCHIVED,
  ],
  [StoryStatus.ARCHIVED]: [],
};

// ── Timing ───────────────────────────────────────────────────────────────────

export const MAX_STORY_AGE_HOURS = 72;

/** Polling intervals in milliseconds per source type */
export const POLLING_INTERVALS: Record<SourceType, number> = {
  [SourceType.NEWS_ORG]: 2 * 60 * 1000,       // 2 minutes
  [SourceType.GOV_AGENCY]: 5 * 60 * 1000,      // 5 minutes
  [SourceType.PUBLIC_PAGE]: 3 * 60 * 1000,      // 3 minutes
  [SourceType.RSS_FEED]: 5 * 60 * 1000,         // 5 minutes
  [SourceType.API_PROVIDER]: 1 * 60 * 1000,     // 1 minute
};

/** Platform-specific polling intervals in milliseconds */
export const PLATFORM_POLLING_INTERVALS: Record<Platform, number> = {
  [Platform.FACEBOOK]: 3 * 60 * 1000,   // 3 minutes
  [Platform.TWITTER]: 1 * 60 * 1000,    // 1 minute
  [Platform.RSS]: 5 * 60 * 1000,        // 5 minutes
  [Platform.NEWSAPI]: 2 * 60 * 1000,    // 2 minutes
  [Platform.MANUAL]: 0,                 // Not polled
};
