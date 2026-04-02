import { getAuthHeaders } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface CoverageInfo {
  isCovered: boolean;
  feedName: string;
}

export interface SourceSummary {
  name: string;
  platform: string;
  url: string | null;
  published_at: string;
}

export interface Story {
  id: string;
  title: string;
  summary: string;
  ai_summary: string | null;
  ai_summary_model: string | null;
  ai_summary_at: string | null;
  status: "ALERT" | "BREAKING" | "DEVELOPING" | "TOP_STORY" | "ONGOING" | "FOLLOW_UP" | "STALE" | "ARCHIVED";
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
  source_summaries?: SourceSummary[];
  coverage?: CoverageInfo[];
  sparkline?: number[]; // recent composite scores for trend visualization
  trend?: "rising" | "declining" | "flat";
  merged_from?: Array<{ id: string; title: string; compositeScore: number }>;
  parentStory?: { id: string; title: string; status: string; compositeScore: number; firstSeenAt: string } | null;
  followUps?: Array<{ id: string; title: string; status: string; compositeScore: number; firstSeenAt: string }>;
  // Famous person detection
  hasFamousPerson?: boolean;
  famousPersonNames?: string[];
  // Verification status
  verificationStatus?: string;
  verificationScore?: number;
  // Account derivative overlay (present when authenticated)
  accountStory?: AccountStoryOverlay | null;
}

export interface SourcePost {
  id: string;
  platform: string;
  author: string;
  title: string;
  content: string;
  full_article: string | null;
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
  facets?: {
    categories: FacetItem[];
    statuses: FacetItem[];
    sources: SourceWithCount[];
  };
}

export interface StoryFilters {
  q?: string;
  nlp?: string; // NLP natural language query — parsed server-side into structured filters
  category?: string;
  status?: string;
  time_range?: string;
  min_score?: number;
  source_ids?: string[];
  market_ids?: string[];
  uncovered_only?: boolean;
  trend?: "rising" | "declining" | "all";
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface SourceWithCount {
  id: string;
  name: string;
  platform: string;
  storyCount: number;
}

export async function fetchStorySources(): Promise<SourceWithCount[]> {
  const raw = await apiFetch<any>("/api/v1/stories/sources");
  return raw.data || [];
}

export interface FacetItem {
  name: string;
  count: number;
}

export interface StoryFacets {
  categories: FacetItem[];
  statuses: FacetItem[];
}

export async function fetchStoryFacets(): Promise<StoryFacets> {
  return apiFetch<StoryFacets>("/api/v1/stories/facets");
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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
  const storySources = raw.storySources || [];

  // Deduplicate sources: same source name + platform = keep only the first
  // (prevents duplicate RSS entries from inflating source counts and tooltips)
  const seenSourceKeys = new Set<string>();
  const uniqueStorySources = storySources.filter((ss: any) => {
    const post = ss.sourcePost || ss;
    const name = post.source?.name || post.authorName || "Unknown";
    const platform = post.source?.platform || "Unknown";
    const key = `${platform}::${name}`;
    if (seenSourceKeys.has(key)) return false;
    seenSourceKeys.add(key);
    return true;
  });

  return {
    id: raw.id,
    title: raw.editedTitle || raw.title,
    summary: raw.editedSummary || raw.aiSummary || raw.summary || "",
    ai_summary: raw.aiSummary || null,
    ai_summary_model: raw.aiSummaryModel || null,
    ai_summary_at: raw.aiSummaryAt || null,
    status: raw.status,
    category: raw.category || "Unknown",
    location: raw.locationName || raw.neighborhood || "",
    breaking_score: raw.breakingScore ?? 0,
    trending_score: raw.trendingScore ?? 0,
    confidence_score: raw.confidenceScore ?? 0,
    locality_score: raw.localityScore ?? 0,
    composite_score: raw.compositeScore ?? 0,
    source_count: uniqueStorySources.length || (raw._count?.storySources ?? raw.sourceCount ?? 0),
    first_seen: raw.firstSeenAt,
    last_updated: raw.lastUpdatedAt,
    sources: uniqueStorySources.map(transformStorySource),
    source_summaries: uniqueStorySources.map((ss: any) => {
      const post = ss.sourcePost || ss;
      return {
        name: post.source?.name || post.authorName || "Unknown",
        platform: post.source?.platform || "Unknown",
        url: post.url || null,
        published_at: post.publishedAt,
      };
    }),
    coverage: (raw.coverageMatches || []).map((cm: any) => ({
      isCovered: cm.isCovered,
      feedName: cm.coverageFeed?.name || "Unknown",
    })),
    sparkline: (raw.scoreSnapshots || [])
      .slice(0, 12)
      .reverse()
      .map((s: any) => s.compositeScore || 0),
    trend: (() => {
      const snaps = raw.scoreSnapshots || [];
      if (snaps.length < 2) return "flat" as const;
      const latest = snaps[0]?.compositeScore || 0;
      const prev = snaps[Math.min(snaps.length - 1, 3)]?.compositeScore || 0;
      return latest > prev ? "rising" as const : latest < prev ? "declining" as const : "flat" as const;
    })(),
    merged_from: (raw.mergedFrom || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      compositeScore: m.compositeScore ?? 0,
    })),
    hasFamousPerson: raw.hasFamousPerson || false,
    famousPersonNames: raw.famousPersonNames || null,
    verificationStatus: raw.verificationStatus || 'UNVERIFIED',
    verificationScore: raw.verificationScore || 0,
    parentStory: raw.parentStory || null,
    followUps: (raw.followUps || []).map((f: any) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      compositeScore: f.compositeScore ?? 0,
      firstSeenAt: f.firstSeenAt,
    })),
  };
}

function transformStorySource(raw: any): SourcePost {
  const post = raw.sourcePost || raw;
  return {
    id: post.id,
    platform: post.source?.platform || post.platform || "Unknown",
    author: post.authorName || post.source?.name || "Unknown",
    title: post.title || "",
    content: post.content || "",
    full_article: post.fullArticleText || null,
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
  if (filters.source_ids && filters.source_ids.length > 0) {
    backendParams.sourceIds = filters.source_ids.join(",");
  }
  if (filters.market_ids && filters.market_ids.length > 0) {
    backendParams.marketIds = filters.market_ids.join(",");
  }
  if (filters.nlp) {
    backendParams.nlp = filters.nlp;
  }
  if (filters.uncovered_only) {
    backendParams.uncoveredOnly = true;
  }
  if (filters.trend && filters.trend !== "all") {
    backendParams.trend = filters.trend;
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
    facets: raw.facets || undefined,
  };
}

async function fetchStoriesViaSearch(
  query: string,
  params: Record<string, any>,
  page: number,
  pageSize: number
): Promise<StoriesResponse> {
  // Map story sort fields to search-compatible values
  const searchParams = { ...params };
  const sortMap: Record<string, string> = {
    compositeScore: "score",
    breakingScore: "score",
    trendingScore: "score",
    firstSeenAt: "date",
    lastUpdatedAt: "date",
    sourceCount: "relevance",
  };
  if (searchParams.sort && sortMap[searchParams.sort]) {
    searchParams.sort = sortMap[searchParams.sort];
  }
  const qs = buildQueryString({ q: query, ...searchParams });
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

export interface TeaserResponse {
  stories: Story[];
  market: { name: string; city: string; state: string } | null;
  total: number;
  isTeaser: true;
}

export async function fetchTeaserStories(): Promise<TeaserResponse> {
  const raw = await apiFetch<any>("/api/v1/stories/teaser");
  const stories = (raw.stories || []).map(transformStory);
  return {
    stories,
    market: raw.market || null,
    total: raw.total || stories.length,
    isTeaser: true,
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
  const raw = await apiFetch<any>("/api/v1/feeds");
  const feeds = raw.data || raw || [];
  return (Array.isArray(feeds) ? feeds : []).map((f: any) => ({
    id: f.id,
    name: f.name,
    filters: f.filters || {},
    rss_url: f.rssUrl || `/api/v1/feeds/${f.slug}/rss`,
    created_at: f.createdAt,
  }));
}

export async function createFeed(data: CreateFeedPayload): Promise<Feed> {
  // Backend expects slug; generate from name
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const raw = await apiFetch<any>("/api/v1/feeds", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      slug,
      filters: {
        categories: data.filters.category ? [data.filters.category] : undefined,
        statuses: data.filters.status ? [data.filters.status] : undefined,
        minScore:
          data.filters.min_score && data.filters.min_score > 0
            ? data.filters.min_score / 100
            : undefined,
      },
      isPublic: true,
    }),
  });
  const f = raw.data || raw;
  return {
    id: f.id,
    name: f.name,
    filters: f.filters || {},
    rss_url: f.rssUrl || `/api/v1/feeds/${f.slug}/rss`,
    created_at: f.createdAt,
  };
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

export interface TriggerResponse {
  message: string;
  queued: number;
  totalSources: number;
  lookbackHours: number;
}

export interface PipelineJob {
  id: string;
  name: string;
  state: string;
  data: {
    type?: string;
    sourceId?: string;
    feedUrl?: string;
    query?: string;
  };
  failedReason: string | null;
  stacktrace: string | null;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
}

export interface PipelineJobsResponse {
  queue: string;
  state: string;
  jobs: PipelineJob[];
  total: number;
}

export async function fetchPipelineJobs(
  queue: string,
  state: string = "failed",
  limit: number = 20
): Promise<PipelineJobsResponse> {
  const qs = buildQueryString({ state, limit });
  return apiFetch<PipelineJobsResponse>(
    `/api/v1/pipeline/jobs/${queue}${qs}`
  );
}

export async function triggerPipelineIngestion(
  lookbackHours: number = 24
): Promise<TriggerResponse> {
  return apiFetch<TriggerResponse>("/api/v1/pipeline/trigger", {
    method: "POST",
    body: JSON.stringify({ lookbackHours }),
  });
}

export async function clearFailedJobs(queue: string): Promise<{ removed: number }> {
  return apiFetch("/api/v1/pipeline/clear-failed", {
    method: "POST",
    body: JSON.stringify({ queue }),
  });
}

export async function clearAllJobs(queue: string): Promise<{ message: string }> {
  return apiFetch("/api/v1/pipeline/clear-all", {
    method: "POST",
    body: JSON.stringify({ queue }),
  });
}

export async function forceRunQueue(queue: string): Promise<{ message: string; queued?: number }> {
  return apiFetch("/api/v1/pipeline/run-queue", {
    method: "POST",
    body: JSON.stringify({ queue }),
  });
}

export async function pollSourceNow(sourceId: string): Promise<{ message: string }> {
  return apiFetch(`/api/v1/pipeline/poll-source/${sourceId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
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

export async function fetchSources(params?: { limit?: number; offset?: number; search?: string; isActive?: boolean }): Promise<unknown> {
  const qs = new URLSearchParams();
  qs.set('limit', String(params?.limit || 200));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.search) qs.set('search', params.search);
  if (params?.isActive !== undefined) qs.set('isActive', String(params.isActive));
  return apiFetch<unknown>(`/api/v1/admin/sources?${qs}`, {
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

export async function deleteSource(id: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/v1/admin/sources/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export interface TestSourceResult {
  success: boolean;
  feedTitle?: string;
  itemCount?: number;
  contentType?: string;
  url: string;
  message?: string;
  error?: string;
  statusCode?: number;
}

export async function testSource(url: string, platform: string): Promise<TestSourceResult> {
  return apiFetch<TestSourceResult>("/api/v1/admin/sources/test", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ url, platform }),
  });
}

export async function bulkSourceAction(
  ids: string[],
  action: "activate" | "deactivate" | "delete" | "assign_markets",
  marketIds?: string[]
): Promise<{ message: string; count: number }> {
  return apiFetch<{ message: string; count: number }>("/api/v1/admin/sources/bulk", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids, action, marketIds }),
  });
}

// ─── Account Stories (per-account derivative workspace) ─────────────────────

export interface AccountStoryOverlay {
  id: string;
  editedTitle: string | null;
  editedSummary: string | null;
  accountStatus: string;
  assignedTo: string | null;
  notes: string | null;
  coveredAt: string | null;
  tags: string[] | null;
  aiDraftCount: number;
  aiScriptCount: number;
  aiVideoCount: number;
}

export async function activateAccountStory(baseStoryId: string): Promise<unknown> {
  return apiFetch(`/api/v1/account-stories/${baseStoryId}/activate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
}

export async function updateAccountStory(
  baseStoryId: string,
  data: {
    editedTitle?: string;
    editedSummary?: string;
    notes?: string;
    accountStatus?: string;
    assignedTo?: string;
    tags?: string[];
  }
): Promise<unknown> {
  return apiFetch(`/api/v1/account-stories/${baseStoryId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function addAIDraft(
  baseStoryId: string,
  data: { format: string; content: string; model?: string }
): Promise<unknown> {
  return apiFetch(`/api/v1/account-stories/${baseStoryId}/ai-draft`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function addResearch(
  baseStoryId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  return apiFetch(`/api/v1/account-stories/${baseStoryId}/research`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function syncAccountStory(baseStoryId: string): Promise<unknown> {
  return apiFetch(`/api/v1/account-stories/${baseStoryId}/sync`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
}

export async function fetchAccountStories(params?: {
  status?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.assignedTo) qs.set("assignedTo", params.assignedTo);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch(`/api/v1/account-stories?${qs}`, { headers: getAuthHeaders() });
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

// ─── Admin: Coverage Feeds ──────────────────────────────────────────────────

export interface CoverageFeedData {
  id: string;
  name: string;
  type: string;
  url: string;
  pollIntervalMin: number;
  isActive: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  itemCount: number;
  stats: { covered: number; gaps: number; total: number };
}

export async function fetchCoverageFeeds(): Promise<CoverageFeedData[]> {
  const raw = await apiFetch<any>("/api/v1/admin/coverage", {
    headers: getAuthHeaders(),
  });
  return raw.data || [];
}

export async function createCoverageFeed(data: {
  name: string;
  type: string;
  url: string;
  pollIntervalMin?: number;
  cssSelector?: string;
}): Promise<unknown> {
  return apiFetch<unknown>("/api/v1/admin/coverage", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deleteCoverageFeed(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/admin/coverage/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export async function triggerCoverageCheck(id: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/v1/admin/coverage/${id}/check`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
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
    method: "PATCH",
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
