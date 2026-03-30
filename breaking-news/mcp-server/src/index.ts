import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";

// ── Prisma Client ────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "breaking-news",
  version: "1.0.0",
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
