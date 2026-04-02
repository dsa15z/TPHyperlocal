import { Platform, SourceType, StoryStatus } from "./types.js";

// ── Houston Market Center ────────────────────────────────────────────────────

export const HOUSTON_CENTER = {
  latitude: 29.7604,
  longitude: -95.3698,
  name: "Houston, TX",
} as const;

export const DEFAULT_RADIUS_KM = 80;

// ── Composite Score Weights ──────────────────────────────────────────────────
// compositeScore = breaking*W + trending*W + confidence*W + locality*W + social*W

export const COMPOSITE_WEIGHTS = {
  breaking: 0.25,
  trending: 0.20,
  confidence: 0.15,
  locality: 0.15,
  social: 0.25,
} as const;

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

// ── Status Determination Thresholds ─────────────────────────────────────────
// Local markets use lower thresholds to surface stories faster

export const STATUS_THRESHOLDS = {
  breakingNational: 0.6,
  breakingLocal: 0.35,
  sourcesForBreaking: 3, // 3+ sources in 15 min → BREAKING
  sourceWindowMinutes: 15,
  staleAfterHours: 48,
  archiveAfterHours: 72,
  socialBreakingBoost: 0.15,
  socialTrendingBoost: 0.20,
} as const;

// ── Pipeline Defaults ───────────────────────────────────────────────────────

export const PIPELINE_DEFAULTS = {
  maxJobRetries: 3,
  jobBackoffMs: 5000,
  idleThresholdMs: 6 * 60 * 1000, // 6 minutes
  scoreDecayIntervalMs: 10 * 60 * 1000, // 10 minutes
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  pastScoresRetentionMs: 2 * 60 * 60 * 1000, // 2 hours
  defaultPageSize: 25,
  maxPageSize: 200,
} as const;

// ── Status Transitions ───────────────────────────────────────────────────────
// Maps each status to the set of statuses it can transition to.

export const STATUS_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  [StoryStatus.ALERT]: [StoryStatus.BREAKING, StoryStatus.DEVELOPING],
  [StoryStatus.BREAKING]: [StoryStatus.TOP_STORY, StoryStatus.DEVELOPING, StoryStatus.ONGOING],
  [StoryStatus.DEVELOPING]: [StoryStatus.ALERT, StoryStatus.BREAKING, StoryStatus.TOP_STORY, StoryStatus.ONGOING],
  [StoryStatus.TOP_STORY]: [StoryStatus.ONGOING, StoryStatus.FOLLOW_UP, StoryStatus.STALE],
  [StoryStatus.ONGOING]: [StoryStatus.TOP_STORY, StoryStatus.FOLLOW_UP, StoryStatus.STALE],
  [StoryStatus.FOLLOW_UP]: [StoryStatus.ONGOING, StoryStatus.STALE],
  [StoryStatus.STALE]: [StoryStatus.ONGOING, StoryStatus.ARCHIVED],
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
  [SourceType.LLM_PROVIDER]: 10 * 60 * 1000,    // 10 minutes (cost control)
};

/** Platform-specific polling intervals in milliseconds */
export const PLATFORM_POLLING_INTERVALS: Record<Platform, number> = {
  [Platform.FACEBOOK]: 3 * 60 * 1000,      // 3 minutes
  [Platform.TWITTER]: 1 * 60 * 1000,       // 1 minute
  [Platform.RSS]: 5 * 60 * 1000,           // 5 minutes
  [Platform.NEWSAPI]: 2 * 60 * 1000,       // 2 minutes
  [Platform.GDELT]: 5 * 60 * 1000,         // 5 minutes
  [Platform.LLM_OPENAI]: 10 * 60 * 1000,   // 10 minutes
  [Platform.LLM_CLAUDE]: 10 * 60 * 1000,   // 10 minutes
  [Platform.LLM_GROK]: 10 * 60 * 1000,     // 10 minutes
  [Platform.LLM_GEMINI]: 10 * 60 * 1000,   // 10 minutes
  [Platform.MANUAL]: 0,                    // Not polled
};

/** LLM trust scores — lower than traditional news sources because LLMs can hallucinate */
export const LLM_TRUST_SCORES: Partial<Record<Platform, number>> = {
  [Platform.LLM_OPENAI]: 0.3,
  [Platform.LLM_CLAUDE]: 0.3,
  [Platform.LLM_GROK]: 0.35, // Grok has real-time X data access
  [Platform.LLM_GEMINI]: 0.3,
};

/** Platforms that require per-account credentials */
export const CREDENTIAL_REQUIRED_PLATFORMS: Platform[] = [
  Platform.FACEBOOK,
  Platform.TWITTER,
  Platform.NEWSAPI,
  Platform.LLM_OPENAI,
  Platform.LLM_CLAUDE,
  Platform.LLM_GROK,
  Platform.LLM_GEMINI,
];
