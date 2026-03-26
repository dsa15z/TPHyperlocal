// ── Enums ────────────────────────────────────────────────────────────────────

export enum Platform {
  FACEBOOK = "FACEBOOK",
  TWITTER = "TWITTER",
  RSS = "RSS",
  NEWSAPI = "NEWSAPI",
  MANUAL = "MANUAL",
}

export enum SourceType {
  NEWS_ORG = "NEWS_ORG",
  GOV_AGENCY = "GOV_AGENCY",
  PUBLIC_PAGE = "PUBLIC_PAGE",
  RSS_FEED = "RSS_FEED",
  API_PROVIDER = "API_PROVIDER",
}

export enum StoryStatus {
  EMERGING = "EMERGING",
  BREAKING = "BREAKING",
  TRENDING = "TRENDING",
  ACTIVE = "ACTIVE",
  STALE = "STALE",
  ARCHIVED = "ARCHIVED",
}

export type Category =
  | "CRIME"
  | "WEATHER"
  | "TRAFFIC"
  | "POLITICS"
  | "BUSINESS"
  | "SPORTS"
  | "COMMUNITY"
  | "EMERGENCY"
  | "OTHER";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface StoryDTO {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  status: StoryStatus;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  breakingScore: number;
  trendingScore: number;
  confidenceScore: number;
  localityScore: number;
  compositeScore: number;
  sourceCount: number;
  firstSeenAt: string;
  lastUpdatedAt: string;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourcePostDTO {
  id: string;
  sourceId: string;
  platformPostId: string;
  content: string;
  title: string | null;
  url: string | null;
  authorName: string | null;
  authorId: string | null;
  engagementLikes: number;
  engagementShares: number;
  engagementComments: number;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  category: string | null;
  mediaUrls: unknown;
  publishedAt: string;
  collectedAt: string;
  source: {
    id: string;
    name: string;
    platform: Platform;
    sourceType: SourceType;
    trustScore: number;
  };
}

export interface StorySourceDTO {
  id: string;
  similarityScore: number;
  isPrimary: boolean;
  addedAt: string;
  sourcePost: SourcePostDTO;
}

export interface StoryDetailDTO extends StoryDTO {
  storySources: StorySourceDTO[];
}

export interface ScoreBreakdown {
  breakingScore: number;
  trendingScore: number;
  confidenceScore: number;
  localityScore: number;
  compositeScore: number;
}

// ── Pagination & Filters ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface StoryFilters {
  query?: string;
  status?: StoryStatus;
  category?: Category;
  minScore?: number;
  sortBy?: "compositeScore" | "breakingScore" | "trendingScore" | "firstSeenAt";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
}

// ── Source Stats ──────────────────────────────────────────────────────────────

export interface SourceStats {
  sourceId: string;
  name: string;
  platform: Platform;
  sourceType: SourceType;
  postCount: number;
  lastPolledAt: string | null;
  isActive: boolean;
  trustScore: number;
}
