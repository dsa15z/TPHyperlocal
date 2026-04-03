import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";

// ── Prisma Client ────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ── Backend API Base URL ────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "breaking-news",
  version: "2.0.0",
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString() as unknown as T;
  if (Array.isArray(obj)) return obj.map(serializeDates) as unknown as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeDates(value);
    }
    return result as T;
  }
  return obj;
}

/** Helper to call backend REST API endpoints */
async function backendFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${BACKEND_URL}/api/v1${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Forward API key if available
  const apiKey = process.env.BACKEND_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({ error: "Non-JSON response" }));
  return { ok: response.ok, status: response.status, data };
}

/** Wrap a backend fetch result into an MCP tool response */
function backendResult(result: { ok: boolean; status: number; data: unknown }) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result.data, null, 2),
      },
    ],
    isError: !result.ok,
  };
}

// ── Tool: query_stories ──────────────────────────────────────────────────────

server.tool(
  "query_stories",
  "Search and filter stories with flexible sorting and filtering options",
  {
    query: z.string().optional().describe("Text search across title and summary"),
    status: z
      .enum(["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP", "STALE", "ARCHIVED"])
      .optional()
      .describe("Filter by story status"),
    category: z.string().optional().describe("Filter by category"),
    minScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Minimum composite score threshold"),
    sortBy: z
      .enum(["compositeScore", "breakingScore", "trendingScore", "firstSeenAt"])
      .optional()
      .describe("Field to sort by"),
    order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of results to return (default 20)"),
  },
  async ({ query, status, category, minScore, sortBy, order, limit }) => {
    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null,
    };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (category) where.category = category;
    if (minScore !== undefined) where.compositeScore = { gte: minScore };

    const stories = await prisma.story.findMany({
      where,
      orderBy: { [sortBy ?? "compositeScore"]: order ?? "desc" },
      take: limit ?? 20,
      include: {
        _count: { select: { storySources: true } },
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDates(stories), null, 2),
        },
      ],
    };
  },
);

// ── Tool: get_story ──────────────────────────────────────────────────────────

server.tool(
  "get_story",
  "Get a single story with full details including all source posts",
  {
    storyId: z.string().describe("The unique story ID"),
  },
  async ({ storyId }) => {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                    sourceType: true,
                    trustScore: true,
                  },
                },
              },
            },
          },
          orderBy: { similarityScore: "desc" },
        },
        scoreSnapshots: {
          orderBy: { snapshotAt: "desc" },
          take: 10,
        },
        mergedFrom: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!story) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Story not found", storyId }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDates(story), null, 2),
        },
      ],
    };
  },
);

// ── Tool: get_breaking_stories ───────────────────────────────────────────────

server.tool(
  "get_breaking_stories",
  "Get current breaking stories sorted by breaking score",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of results (default 10)"),
  },
  async ({ limit }) => {
    const stories = await prisma.story.findMany({
      where: {
        status: "BREAKING",
        mergedIntoId: null,
      },
      orderBy: { breakingScore: "desc" },
      take: limit ?? 10,
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                    sourceType: true,
                    trustScore: true,
                  },
                },
              },
            },
          },
          orderBy: { similarityScore: "desc" },
          take: 3,
        },
        _count: { select: { storySources: true } },
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDates(stories), null, 2),
        },
      ],
    };
  },
);

// ── Tool: get_trending_stories ───────────────────────────────────────────────

server.tool(
  "get_trending_stories",
  "Get current trending stories sorted by trending score",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of results (default 10)"),
  },
  async ({ limit }) => {
    const stories = await prisma.story.findMany({
      where: {
        status: "TOP_STORY",
        mergedIntoId: null,
      },
      orderBy: { trendingScore: "desc" },
      take: limit ?? 10,
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                    sourceType: true,
                    trustScore: true,
                  },
                },
              },
            },
          },
          orderBy: { similarityScore: "desc" },
          take: 3,
        },
        _count: { select: { storySources: true } },
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDates(stories), null, 2),
        },
      ],
    };
  },
);

// ── Tool: search_stories ─────────────────────────────────────────────────────

server.tool(
  "search_stories",
  "Full-text search across stories with optional date range and category filters",
  {
    query: z.string().describe("Search query text"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date filter (ISO 8601 string)"),
    dateTo: z
      .string()
      .optional()
      .describe("End date filter (ISO 8601 string)"),
    category: z.string().optional().describe("Filter by category"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of results (default 20)"),
  },
  async ({ query, dateFrom, dateTo, category, limit }) => {
    const where: Prisma.StoryWhereInput = {
      mergedIntoId: null,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } },
      ],
    };

    if (category) where.category = category;

    if (dateFrom || dateTo) {
      where.firstSeenAt = {};
      if (dateFrom) (where.firstSeenAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.firstSeenAt as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    const stories = await prisma.story.findMany({
      where,
      orderBy: { compositeScore: "desc" },
      take: limit ?? 20,
      include: {
        _count: { select: { storySources: true } },
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              resultCount: stories.length,
              stories: serializeDates(stories),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Tool: get_story_cluster ──────────────────────────────────────────────────

server.tool(
  "get_story_cluster",
  "Get all supporting source posts for a story, including similarity scores",
  {
    storyId: z.string().describe("The unique story ID"),
  },
  async ({ storyId }) => {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        storySources: {
          include: {
            sourcePost: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                    sourceType: true,
                    trustScore: true,
                  },
                },
              },
            },
          },
          orderBy: { similarityScore: "desc" },
        },
        mergedFrom: {
          select: { id: true, title: true, sourceCount: true },
        },
      },
    });

    if (!story) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Story not found", storyId }),
          },
        ],
        isError: true,
      };
    }

    const clusterSummary = {
      storyId: story.id,
      title: story.title,
      status: story.status,
      totalSources: story.storySources.length,
      mergedStories: story.mergedFrom.length,
      averageSimilarity:
        story.storySources.length > 0
          ? story.storySources.reduce((sum, s) => sum + s.similarityScore, 0) /
            story.storySources.length
          : 0,
      platforms: [
        ...new Set(story.storySources.map((s) => s.sourcePost.source.platform)),
      ],
      sourceTypes: [
        ...new Set(story.storySources.map((s) => s.sourcePost.source.sourceType)),
      ],
      scores: {
        breakingScore: story.breakingScore,
        trendingScore: story.trendingScore,
        confidenceScore: story.confidenceScore,
        localityScore: story.localityScore,
        compositeScore: story.compositeScore,
      },
      storySources: story.storySources,
      mergedFrom: story.mergedFrom,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDates(clusterSummary), null, 2),
        },
      ],
    };
  },
);

// ── Tool: get_source_stats ───────────────────────────────────────────────────

server.tool(
  "get_source_stats",
  "Get statistics about ingestion sources including post counts, last poll times, and health status",
  {},
  async () => {
    const sources = await prisma.source.findMany({
      include: {
        _count: { select: { posts: true } },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();
    const HEALTH_STALE_MINUTES = 15;

    const stats = sources.map((source) => {
      const minutesSinceLastPoll = source.lastPolledAt
        ? (now.getTime() - source.lastPolledAt.getTime()) / (1000 * 60)
        : null;

      let healthStatus: "healthy" | "stale" | "inactive" | "never_polled";
      if (!source.isActive) {
        healthStatus = "inactive";
      } else if (!source.lastPolledAt) {
        healthStatus = "never_polled";
      } else if (minutesSinceLastPoll! > HEALTH_STALE_MINUTES) {
        healthStatus = "stale";
      } else {
        healthStatus = "healthy";
      }

      return {
        sourceId: source.id,
        name: source.name,
        platform: source.platform,
        sourceType: source.sourceType,
        postCount: source._count.posts,
        lastPolledAt: source.lastPolledAt?.toISOString() ?? null,
        isActive: source.isActive,
        trustScore: source.trustScore,
        healthStatus,
        minutesSinceLastPoll: minutesSinceLastPoll
          ? Math.round(minutesSinceLastPoll)
          : null,
      };
    });

    const summary = {
      totalSources: stats.length,
      activeSources: stats.filter((s) => s.isActive).length,
      healthySources: stats.filter((s) => s.healthStatus === "healthy").length,
      staleSources: stats.filter((s) => s.healthStatus === "stale").length,
      totalPosts: stats.reduce((sum, s) => sum + s.postCount, 0),
      sources: stats,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  },
);

// ── Tool: heal_source ───────────────────────────────────────────────────────

server.tool(
  "heal_source",
  "Force self-heal and reactivate a single source. Tests alternate URLs, resets failure counters.",
  {
    sourceId: z.string().describe("The unique source ID to heal"),
  },
  async ({ sourceId }) => {
    const result = await backendFetch(`/pipeline/heal-source/${sourceId}`, {
      method: "POST",
    });
    return backendResult(result);
  },
);

// ── Tool: toggle_source ─────────────────────────────────────────────────────

server.tool(
  "toggle_source",
  "Activate or deactivate a news source",
  {
    sourceId: z.string().describe("The unique source ID"),
    active: z.boolean().describe("true to activate, false to deactivate"),
  },
  async ({ sourceId, active }) => {
    // Use Prisma directly for this simple toggle (same as assistant route)
    try {
      const source = await prisma.source.findUnique({ where: { id: sourceId } });
      if (!source) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "Source not found", sourceId }) },
          ],
          isError: true,
        };
      }

      const updateData: Record<string, unknown> = { isActive: active };

      // When reactivating, reset failure counters so source gets a fresh start
      if (active && !source.isActive) {
        const meta = (source.metadata || {}) as Record<string, unknown>;
        updateData.metadata = {
          ...meta,
          consecutiveFailures: 0,
          reactivatedAt: new Date().toISOString(),
          deactivateReason: undefined,
        };
      }

      await prisma.source.update({
        where: { id: sourceId },
        data: updateData,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              message: `Source ${active ? "activated" : "deactivated"}`,
              sourceId,
              name: source.name,
              isActive: active,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: trigger_ingestion ─────────────────────────────────────────────────

server.tool(
  "trigger_ingestion",
  "Trigger the ingestion pipeline for all active sources with a configurable lookback window",
  {
    lookbackHours: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe("Hours to look back for new content (default 1, max 24)"),
  },
  async ({ lookbackHours }) => {
    const result = await backendFetch("/pipeline/trigger", {
      method: "POST",
      body: { lookbackHours: lookbackHours ?? 1 },
    });
    return backendResult(result);
  },
);

// ── Tool: clear_failed_jobs ─────────────────────────────────────────────────

server.tool(
  "clear_failed_jobs",
  "Clear all failed jobs from a specific pipeline queue",
  {
    queue: z
      .string()
      .describe(
        "Queue name: ingestion, enrichment, clustering, scoring, llm-ingestion, or hyperlocal-intel",
      ),
  },
  async ({ queue }) => {
    const result = await backendFetch("/pipeline/clear-failed", {
      method: "POST",
      body: { queue },
    });
    return backendResult(result);
  },
);

// ── Tool: run_queue ─────────────────────────────────────────────────────────

server.tool(
  "run_queue",
  "Force-run a specific pipeline queue immediately (e.g. ingestion to poll RSS, scoring to re-score stories)",
  {
    queue: z
      .string()
      .describe(
        "Queue name: ingestion, enrichment, clustering, scoring, llm-ingestion, or hyperlocal-intel",
      ),
  },
  async ({ queue }) => {
    const result = await backendFetch("/pipeline/run-queue", {
      method: "POST",
      body: { queue },
    });
    return backendResult(result);
  },
);

// ── Tool: get_pipeline_status ───────────────────────────────────────────────

server.tool(
  "get_pipeline_status",
  "Get current status of all pipeline queues including job counts (waiting, active, completed, failed)",
  {},
  async () => {
    const result = await backendFetch("/pipeline/status");
    return backendResult(result);
  },
);

// ── Tool: verify_story ──────────────────────────────────────────────────────

server.tool(
  "verify_story",
  "Send a story to multiple LLMs (OpenAI + Grok) for independent fact verification. Returns confidence and reasoning from each model.",
  {
    storyId: z.string().describe("The unique story ID to verify"),
  },
  async ({ storyId }) => {
    const result = await backendFetch(`/stories/${storyId}/verify`, {
      method: "POST",
    });
    return backendResult(result);
  },
);

// ── Tool: generate_broadcast_package ────────────────────────────────────────

server.tool(
  "generate_broadcast_package",
  "Generate a full broadcast package (TV script, radio spot, social post, web article, push notification) from a single story",
  {
    storyId: z.string().describe("The story ID to generate content for"),
    formats: z
      .array(
        z.enum([
          "tv_30s",
          "tv_60s",
          "radio_30s",
          "radio_60s",
          "web_article",
          "social_post",
          "social_thread",
          "push_notification",
        ]),
      )
      .optional()
      .describe(
        "Content formats to generate (defaults to tv_30s, radio_30s, social_post, web_article, push_notification)",
      ),
  },
  async ({ storyId, formats }) => {
    const body: Record<string, unknown> = { storyId };
    if (formats && formats.length > 0) body.formats = formats;
    const result = await backendFetch("/broadcast-package/generate", {
      method: "POST",
      body,
    });
    return backendResult(result);
  },
);

// ── Tool: workflow_transition ───────────────────────────────────────────────

server.tool(
  "workflow_transition",
  "Move an account story to a new workflow stage (e.g. triage → assigned → drafting → review → published)",
  {
    accountStoryId: z.string().describe("The account story ID"),
    toStage: z.string().describe("Slug of the target workflow stage"),
    comment: z.string().optional().describe("Optional editorial comment for the transition"),
    assignTo: z.string().optional().describe("Optional user ID to assign the story to"),
  },
  async ({ accountStoryId, toStage, comment, assignTo }) => {
    const body: Record<string, unknown> = { accountStoryId, toStage };
    if (comment) body.comment = comment;
    if (assignTo) body.assignTo = assignTo;
    const result = await backendFetch("/workflow/transition", {
      method: "POST",
      body,
    });
    return backendResult(result);
  },
);

// ── Tool: generate_audio ────────────────────────────────────────────────────

server.tool(
  "generate_audio",
  "Generate a TTS audio spot for a story via OpenAI text-to-speech",
  {
    accountStoryId: z.string().describe("The account story ID"),
    script: z.string().min(10).describe("The script text to convert to speech"),
    voice: z
      .enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])
      .optional()
      .describe("TTS voice (default: alloy)"),
    format: z
      .enum(["15s", "30s", "60s", "full"])
      .optional()
      .describe("Target duration format (default: 30s)"),
  },
  async ({ accountStoryId, script, voice, format }) => {
    const body: Record<string, unknown> = { accountStoryId, script };
    if (voice) body.voice = voice;
    if (format) body.format = format;
    const result = await backendFetch("/workflow/audio", {
      method: "POST",
      body,
    });
    return backendResult(result);
  },
);

// ── Tool: publish_content ───────────────────────────────────────────────────

server.tool(
  "publish_content",
  "Publish content for an account story to an external platform (Twitter, Facebook, WordPress, etc.)",
  {
    accountStoryId: z.string().describe("The account story ID"),
    platform: z
      .enum([
        "wordpress",
        "rss",
        "twitter",
        "facebook",
        "linkedin",
        "tiktok",
        "youtube",
        "instagram",
        "custom_webhook",
      ])
      .describe("Target publishing platform"),
    content: z
      .object({
        title: z.string().describe("Content title"),
        body: z.string().describe("Content body text"),
        mediaUrls: z
          .array(z.string())
          .optional()
          .describe("Optional media URLs to include"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags/hashtags"),
      })
      .describe("The content to publish"),
    scheduledFor: z
      .string()
      .optional()
      .describe("Optional ISO 8601 datetime to schedule publication"),
  },
  async ({ accountStoryId, platform, content, scheduledFor }) => {
    const body: Record<string, unknown> = { accountStoryId, platform, content };
    if (scheduledFor) body.scheduledFor = scheduledFor;
    const result = await backendFetch("/workflow/publish", {
      method: "POST",
      body,
    });
    return backendResult(result);
  },
);

// ── Tool: fix_source_markets ────────────────────────────────────────────────

server.tool(
  "fix_source_markets",
  "Create missing market tables and link sources to their correct markets by name matching",
  {},
  async () => {
    const result = await backendFetch("/pipeline/fix-source-markets", {
      method: "POST",
    });
    return backendResult(result);
  },
);

// ── Tool: consolidate_sources ───────────────────────────────────────────────

server.tool(
  "consolidate_sources",
  "Merge per-market duplicate news sources (e.g. Bing/Google) into a single multi-market source",
  {},
  async () => {
    const result = await backendFetch("/pipeline/consolidate-news-sources", {
      method: "POST",
    });
    return backendResult(result);
  },
);

// ── Tool: backfill_famous ───────────────────────────────────────────────────

server.tool(
  "backfill_famous",
  "Scan existing stories for famous person mentions and backfill detection data",
  {},
  async () => {
    const result = await backendFetch("/pipeline/backfill-famous", {
      method: "POST",
    });
    return backendResult(result);
  },
);

// ── Tool: get_news_director_alerts ──────────────────────────────────────────

server.tool(
  "get_news_director_alerts",
  "Get current News Director AI alerts from Redis — includes breaking story alerts, source health warnings, and pipeline anomalies",
  {},
  async () => {
    // Read directly from Redis via the backend's assistant/alerts endpoint
    const result = await backendFetch("/assistant/alerts");

    if (result.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }

    // Fallback: try to read the Redis key directly if the endpoint isn't available
    // This requires ioredis, so we fall back gracefully
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "Could not fetch news director alerts",
              status: result.status,
              details: result.data,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  },
);

// ── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Breaking News MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
