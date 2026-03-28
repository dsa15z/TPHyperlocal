import { getAuthHeaders } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface Story {
  id: string;
  title: string;
  summary: string;
  status: "BREAKING" | "TRENDING" | "ACTIVE" | "STALE";
  category: string;
  location: string;
  breaking_score: number;
  trending_score: number;
  confidence_score: number;
  locality_score: number;
  composite_score: number;
  source_count: number;
  first_seen: string;
  last_updated: string;
  sources?: SourcePost[];
}

export interface SourcePost {
  id: string;
  platform: string;
  author: string;
  content: string;
  url: string;
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  published_at: string;
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface StoryFilters {
  q?: string;
  category?: string;
  status?: string;
  time_range?: string;
  min_score?: number;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface Feed {
  id: string;
  name: string;
  filters: {
    category?: string;
    status?: string;
    min_score?: number;
    keywords?: string;
  };
  rss_url: string;
  created_at: string;
}

export interface CreateFeedPayload {
  name: string;
  filters: {
    category?: string;
    status?: string;
    min_score?: number;
    keywords?: string;
  };
}

function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${errorBody}`);
  }

  return res.json();
}

// ─── Transformers (backend camelCase → frontend snake_case) ─────────────────

function timeRangeToMaxAge(timeRange?: string): number | undefined {
  if (!timeRange) return undefined;
  const map: Record<string, number> = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 168,
  };
  return map[timeRange];
}

const SORT_FIELD_MAP: Record<string, string> = {
  breaking_score: "breakingScore",
  trending_score: "trendingScore",
  confidence_score: "confidenceScore",
  composite_score: "compositeScore",
  first_seen: "firstSeenAt",
  last_updated: "lastUpdatedAt",
  source_count: "sourceCount",
};

function transformStory(raw: any): Story {
  return {
    id: raw.id,
    title: raw.editedTitle || raw.title,
    summary: raw.editedSummary || raw.aiSummary || raw.summary || "",
    status: raw.status,
    category: raw.category || "Unknown",
    location: raw.locationName || raw.neighborhood || "",
    breaking_score: raw.breakingScore ?? 0,
    trending_score: raw.trendingScore ?? 0,
    confidence_score: raw.confidenceScore ?? 0,
    locality_score: raw.localityScore ?? 0,
    composite_score: raw.compositeScore ?? 0,
    source_count: raw._count?.storySources ?? raw.sourceCount ?? 0,
    first_seen: raw.firstSeenAt,
    last_updated: raw.lastUpdatedAt,
    sources: raw.storySources?.map(transformStorySource),
  };
}

function transformStorySource(raw: any): SourcePost {
  const post = raw.sourcePost || raw;
  return {
    id: post.id,
    platform: post.source?.platform || post.platform || "Unknown",
    author: post.authorName || post.source?.name || "Unknown",
    content: post.content || "",
    url: post.url || "",
    engagement: {
      likes: post.engagementLikes ?? 0,
      shares: post.engagementShares ?? 0,
      comments: post.engagementComments ?? 0,
    },
    published_at: post.publishedAt,
  };
}

// ─── Stories ────────────────────────────────────────────────────────────────

export async function fetchStories(
  filters: StoryFilters = {}
): Promise<StoriesResponse> {
  const page = filters.page || 1;
  const pageSize = filters.page_size || 25;

  const backendParams: Record<string, any> = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    sort: SORT_FIELD_MAP[filters.sort_by || ""] || "compositeScore",
    order: filters.sort_order || "desc",
  };

  if (filters.status) backendParams.status = filters.status;
  if (filters.category) backendParams.category = filters.category;
  if (filters.time_range) {
    const maxAge = timeRangeToMaxAge(filters.time_range);
    if (maxAge) backendParams.maxAge = maxAge;
  }
  if (filters.min_score && filters.min_score > 0) {
    backendParams.minScore = filters.min_score / 100;
  }

  // If there's a search query, use the search endpoint instead
  if (filters.q) {
    return fetchStoriesViaSearch(filters.q, backendParams, page, pageSize);
  }

  const qs = buildQueryString(backendParams);
  const raw = await apiFetch<any>(`/api/v1/stories${qs}`);

  const stories = (raw.data || []).map(transformStory);
  const total = raw.pagination?.total ?? stories.length;

  return {
    stories,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function fetchStoriesViaSearch(
  query: string,
  params: Record<string, any>,
  page: number,
  pageSize: number
): Promise<StoriesResponse> {
  const qs = buildQueryString({ q: query, ...params });
  const raw = await apiFetch<any>(`/api/v1/search${qs}`);

  const stories = (raw.data?.stories || []).map(transformStory);
  const total = raw.pagination?.total ?? stories.length;

  return {
    stories,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function fetchStory(id: string): Promise<Story> {
  const raw = await apiFetch<any>(`/api/v1/stories/${id}`);
  return transformStory(raw.data || raw);
}

export async function fetchBreakingStories(): Promise<StoriesResponse> {
  const raw = await apiFetch<any>("/api/v1/stories/breaking");
  const stories = (raw.data || []).map(transformStory);
  return {
    stories,
    total: stories.length,
    page: 1,
    page_size: stories.length,
    total_pages: 1,
  };
}

export async function fetchTrendingStories(): Promise<StoriesResponse> {
  const raw = await apiFetch<any>("/api/v1/stories/trending");
  const stories = (raw.data || []).map(transformStory);
  return {
    stories,
    total: stories.length,
    page: 1,
    page_size: stories.length,
    total_pages: 1,
  };
}

export async function searchStories(
  query: string,
  filters: StoryFilters = {}
): Promise<StoriesResponse> {
  const page = filters.page || 1;
  const pageSize = filters.page_size || 25;
  const params: Record<string, any> = {
    q: query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  if (filters.category) params.category = filters.category;

  const qs = buildQueryString(params);
  const raw = await apiFetch<any>(`/api/v1/search${qs}`);
  const stories = (raw.data?.stories || []).map(transformStory);
  const total = raw.pagination?.total ?? stories.length;

  return {
    stories,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function fetchFeeds(): Promise<Feed[]> {
  return apiFetch<Feed[]>("/api/v1/feeds");
}

export async function createFeed(data: CreateFeedPayload): Promise<Feed> {
  return apiFetch<Feed>("/api/v1/feeds", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteFeed(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/feeds/${id}`, { method: "DELETE" });
}

// ─── User Profile & Preferences ─────────────────────────────────────────────

export interface MarketInfo {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  keywords: string[] | null;
  isActive: boolean;
}

export interface UserPreferences {
  defaultMarketId: string | null;
  categories: string[] | null;
  minScore: number;
  keywords: string[] | null;
}

export interface UserProfile {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  account: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  } | null;
  markets: MarketInfo[];
  preferences: UserPreferences | null;
}

export async function fetchUserProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/user/profile", {
    headers: getAuthHeaders(),
  });
}

export async function updateUserPreferences(
  data: Partial<UserPreferences>
): Promise<{ preferences: UserPreferences }> {
  return apiFetch<{ preferences: UserPreferences }>(
    "/api/v1/user/preferences",
    {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }
  );
}

// ─── Pipeline Status ────────────────────────────────────────────────────────

export interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface PipelineStatus {
  timestamp: string;
  summary: {
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    is_processing: boolean;
  };
  queues: QueueStatus[];
}

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  return apiFetch<PipelineStatus>("/api/v1/pipeline/status");
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; displayName: string };
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  displayName: string,
  accountName: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, accountName }),
  });
}

// ─── Admin: Sources ──────────────────────────────────────────────────────────

export async function fetchSources(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/api/v1/admin/sources", {
    headers: getAuthHeaders(),
  });
}

export async function createSource(data: {
  name: string;
  platform: string;
  sourceType: string;
  url: string;
  marketId?: string;
  trustScore: number;
}): Promise<unknown> {
  return apiFetch<unknown>("/api/v1/admin/sources", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function toggleSource(
  id: string,
  enabled: boolean
): Promise<unknown> {
  return apiFetch<unknown>(`/api/v1/admin/sources/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ isActive: enabled }),
  });
}

// ─── Admin: Credentials ─────────────────────────────────────────────────────

export async function fetchCredentials(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/api/v1/admin/credentials", {
    headers: getAuthHeaders(),
  });
}

export async function createCredential(data: {
  platform: string;
  name: string;
  apiKey: string;
  apiSecret?: string;
  accessToken?: string;
}): Promise<unknown> {
  return apiFetch<unknown>("/api/v1/admin/credentials", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function testCredential(
  id: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(
    `/api/v1/admin/credentials/${id}/test`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );
}

export async function deleteCredential(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/admin/credentials/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

// ─── Admin: Markets ─────────────────────────────────────────────────────────

export async function fetchMarkets(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/api/v1/admin/markets", {
    headers: getAuthHeaders(),
  });
}

export async function createMarket(
  data: Record<string, unknown>
): Promise<unknown> {
  return apiFetch<unknown>("/api/v1/admin/markets", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateMarket(
  id: string,
  data: Record<string, unknown>
): Promise<unknown> {
  return apiFetch<unknown>(`/api/v1/admin/markets/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deleteMarket(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/admin/markets/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}
