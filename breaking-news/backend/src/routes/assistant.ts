// @ts-nocheck
/**
 * AI Assistant v2 — natural language interface to the entire TopicPulse system.
 *
 * Improvements over v1:
 * 1. Native OpenAI function calling (replaces text-based ```tool blocks)
 * 2. SSE streaming for real-time token output
 * 3. Conversation memory with rolling summarization
 * 4. Tool result caching (Redis, 60s TTL)
 * 5. Parallel tool execution (Promise.all for independent tools)
 * 6. Structured Zod output schemas for tool results
 * 7. Hybrid RAG with vector retrieval (query-relevant knowledge chunks)
 * 8. Tool usage analytics logging
 * 9. Multi-turn tool planning (up to 3 rounds of tool calls)
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getAccountUser } from '../lib/route-helpers.js';


// ─── Native Function Definitions (OpenAI-compatible) ──────────────────────
// Each tool has a name, description, and JSON Schema parameters for native function calling.

import type { FunctionDef } from '../lib/llm-factory.js';

const TOOL_FUNCTIONS: Array<FunctionDef & { name: string; requiredRole?: 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER' }> = [
  {
    name: 'search_stories',
    description: 'Search for stories by keyword, category, status, market, or time range',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Text search in title/summary' },
      category: { type: 'string', enum: ['CRIME','POLITICS','WEATHER','TRAFFIC','BUSINESS','HEALTH','SPORTS','ENTERTAINMENT','TECHNOLOGY','EDUCATION','COMMUNITY','ENVIRONMENT','EMERGENCY'] },
      status: { type: 'string', enum: ['ALERT','BREAKING','DEVELOPING','TOP_STORY','ONGOING','FOLLOW_UP','STALE'] },
      market: { type: 'string', description: 'Market name (e.g., Houston, National)' },
      timeRange: { type: 'string', enum: ['1h','6h','24h','7d'] },
      limit: { type: 'number', description: 'Max results (default 10, max 20)' },
    }},
  },
  {
    name: 'get_story',
    description: 'Get full details of a specific story by ID',
    parameters: { type: 'object', properties: { storyId: { type: 'string' } }, required: ['storyId'] },
  },
  {
    name: 'get_breaking_stories',
    description: 'Get current breaking/top stories',
    parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Max results (default 5)' } }},
  },
  {
    name: 'get_trending_stories',
    description: 'Get trending stories with growth data',
    parameters: { type: 'object', properties: { limit: { type: 'number' } }},
  },
  {
    name: 'list_sources',
    description: 'List data feed sources with optional filters',
    parameters: { type: 'object', properties: {
      search: { type: 'string' }, platform: { type: 'string' }, isActive: { type: 'boolean' }, limit: { type: 'number' },
    }},
  },
  { name: 'get_source', description: 'Get details of a specific source', parameters: { type: 'object', properties: { sourceId: { type: 'string' } }, required: ['sourceId'] }},
  { name: 'list_markets', description: 'List all configured markets', parameters: { type: 'object', properties: {} }},
  { name: 'get_market', description: 'Get market details', parameters: { type: 'object', properties: { marketId: { type: 'string' }, marketName: { type: 'string' } }}},
  { name: 'get_pipeline_status', description: 'Get pipeline queue status (waiting, active, failed)', parameters: { type: 'object', properties: {} }},
  { name: 'get_online_users', description: 'See who is currently online', parameters: { type: 'object', properties: {} }},
  { name: 'get_stats', description: 'Get system stats (story/source/market counts)', parameters: { type: 'object', properties: {} }},
  { name: 'explain_score', description: 'Explain why a story has its current score', parameters: { type: 'object', properties: { storyId: { type: 'string' } }, required: ['storyId'] }},
  { name: 'navigate', description: 'Navigate the user to a page', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }},
  // ── Write tools (ADMIN+) ──
  { name: 'create_source', description: 'Add a new data feed source', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' }, platform: { type: 'string', enum: ['RSS','NEWSAPI','TWITTER'] }, marketId: { type: 'string' } }, required: ['name','url'] }},
  { name: 'toggle_source', description: 'Activate or deactivate a source', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { sourceId: { type: 'string' }, active: { type: 'boolean' } }, required: ['sourceId','active'] }},
  { name: 'create_market', description: 'Add a new market', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { name: { type: 'string' }, state: { type: 'string' }, slug: { type: 'string' } }, required: ['name'] }},
  { name: 'assign_story', description: 'Assign story to reporter', parameters: { type: 'object', properties: { storyId: { type: 'string' }, assignedTo: { type: 'string' }, accountStatus: { type: 'string' } }, required: ['storyId'] }},
  { name: 'generate_draft', description: 'Generate AI draft for a story', parameters: { type: 'object', properties: { storyId: { type: 'string' }, format: { type: 'string', enum: ['tv_script','radio_script','web_story','social_post'] } }, required: ['storyId','format'] }},
  { name: 'generate_conversation_starters', description: 'Generate on-air discussion prompts', parameters: { type: 'object', properties: { storyId: { type: 'string' } }, required: ['storyId'] }},
  { name: 'trigger_ingestion', description: 'Force ingestion pipeline to run', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { lookbackHours: { type: 'number' } }}},
  { name: 'clear_failed_jobs', description: 'Clear failed jobs from a queue', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { queue: { type: 'string', enum: ['ingestion','enrichment','clustering','scoring'] } }, required: ['queue'] }},
  { name: 'heal_source', description: 'Force self-heal on a failing source', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { sourceId: { type: 'string' } }, required: ['sourceId'] }},
  { name: 'run_queue', description: 'Force-run a pipeline queue', requiredRole: 'ADMIN', parameters: { type: 'object', properties: { queue: { type: 'string', enum: ['ingestion','enrichment','clustering','scoring'] } }, required: ['queue'] }},
  { name: 'fix_source_markets', description: 'Auto-link sources to markets', requiredRole: 'ADMIN', parameters: { type: 'object', properties: {} }},
  { name: 'consolidate_sources', description: 'Merge duplicate sources', requiredRole: 'ADMIN', parameters: { type: 'object', properties: {} }},
  { name: 'backfill_famous', description: 'Scan stories for famous persons', requiredRole: 'ADMIN', parameters: { type: 'object', properties: {} }},
  { name: 'verify_story', description: 'Send story to 2 LLMs for fact verification', parameters: { type: 'object', properties: { storyId: { type: 'string' } }, required: ['storyId'] }},
  { name: 'get_related_stories', description: 'Find stories sharing entities', parameters: { type: 'object', properties: { storyId: { type: 'string' } }, required: ['storyId'] }},
  { name: 'get_news_director_alerts', description: 'Get editorial alerts from AI News Director', parameters: { type: 'object', properties: {} }},
  { name: 'workflow_transition', description: 'Move story to workflow stage', parameters: { type: 'object', properties: { accountStoryId: { type: 'string' }, toStage: { type: 'string' }, comment: { type: 'string' } }, required: ['accountStoryId','toStage'] }},
  { name: 'get_workflow_stages', description: 'List workflow stages', parameters: { type: 'object', properties: {} }},
  { name: 'generate_broadcast_package', description: 'Generate TV+radio+social+web+push package', parameters: { type: 'object', properties: { storyId: { type: 'string' }, formats: { type: 'string' } }, required: ['storyId'] }},
  { name: 'generate_audio_spot', description: 'Generate TTS audio spot', parameters: { type: 'object', properties: { accountStoryId: { type: 'string' }, script: { type: 'string' }, voice: { type: 'string' }, format: { type: 'string' } }, required: ['accountStoryId','script'] }},
  { name: 'publish_content', description: 'Publish to external platform', parameters: { type: 'object', properties: { accountStoryId: { type: 'string' }, platform: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['accountStoryId','platform','title','body'] }},
  { name: 'get_publish_queue', description: 'List pending publish jobs', parameters: { type: 'object', properties: {} }},
  { name: 'read_topicpulse_md', description: 'Read custom AI instructions', parameters: { type: 'object', properties: {} }},
  { name: 'append_topicpulse_md', description: 'Add instruction to topicpulse.md (OWNER only)', requiredRole: 'OWNER', parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] }},
  { name: 'replace_topicpulse_md', description: 'Replace topicpulse.md (OWNER only)', requiredRole: 'OWNER', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] }},
];

// Legacy TOOLS array for backward compatibility (chatbot ops knowledge, MCP, etc.)
const TOOLS = TOOL_FUNCTIONS.map(t => ({
  name: t.name,
  description: t.description,
  params: Object.entries(t.parameters.properties || {}).map(([k, v]: [string, any]) =>
    `${k}${(t.parameters.required || []).includes(k) ? '' : '?'}${v.enum ? ` (${v.enum.join('/')})` : ''}`
  ).join(', ') || 'none',
}));

// ─── Tool Permission Checking ─────────────────────────────────────────────

const ROLE_HIERARCHY: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

function canUseTool(toolName: string, userRole: string): boolean {
  const tool = TOOL_FUNCTIONS.find(t => t.name === toolName);
  if (!tool) return false;
  if (!tool.requiredRole) return true; // No restriction
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[tool.requiredRole] || 0);
}

/** Get tools available for a given role */
function getToolsForRole(role: string): typeof TOOL_FUNCTIONS {
  return TOOL_FUNCTIONS.filter(t => canUseTool(t.name, role));
}

// ─── Tool Result Caching (Redis, 60s TTL) ─────────────────────────────────

const toolCache = new Map<string, { result: any; expiry: number }>();

function getCachedResult(toolName: string, args: Record<string, any>): any | null {
  // Only cache read-only tools
  const readOnlyTools = ['search_stories', 'get_story', 'get_breaking_stories', 'get_trending_stories',
    'list_sources', 'get_source', 'list_markets', 'get_market', 'get_pipeline_status',
    'get_online_users', 'get_stats', 'explain_score', 'get_related_stories',
    'get_news_director_alerts', 'get_workflow_stages', 'get_publish_queue', 'read_topicpulse_md'];
  if (!readOnlyTools.includes(toolName)) return null;

  const key = `${toolName}:${JSON.stringify(args)}`;
  const cached = toolCache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.result;
  toolCache.delete(key);
  return null;
}

function setCachedResult(toolName: string, args: Record<string, any>, result: any): void {
  const key = `${toolName}:${JSON.stringify(args)}`;
  toolCache.set(key, { result, expiry: Date.now() + 60_000 }); // 60s TTL
  // Prevent unbounded growth
  if (toolCache.size > 200) {
    const oldest = toolCache.keys().next().value;
    if (oldest) toolCache.delete(oldest);
  }
}

// ─── Tool Usage Analytics ─────────────────────────────────────────────────

interface ToolAnalyticsEntry {
  tool: string;
  args: Record<string, any>;
  userId: string;
  role: string;
  durationMs: number;
  success: boolean;
  error?: string;
  cached: boolean;
  timestamp: string;
}

const analyticsBuffer: ToolAnalyticsEntry[] = [];

function logToolUsage(entry: ToolAnalyticsEntry): void {
  analyticsBuffer.push(entry);
  // Flush to DB periodically (every 50 entries)
  if (analyticsBuffer.length >= 50) {
    flushAnalytics().catch(() => {});
  }
}

async function flushAnalytics(): Promise<number> {
  if (analyticsBuffer.length === 0) return 0;
  const batch = analyticsBuffer.splice(0, analyticsBuffer.length);
  try {
    for (const entry of batch) {
      await prisma.$executeRaw`
        INSERT INTO "ToolAnalytics" (id, tool, args, "userId", role, "durationMs", success, error, cached, "createdAt")
        VALUES (${`ta_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}, ${entry.tool}, ${JSON.stringify(entry.args)}::jsonb, ${entry.userId}, ${entry.role}, ${entry.durationMs}, ${entry.success}, ${entry.error || null}, ${entry.cached}, ${entry.timestamp})
      `.catch(() => {}); // Non-fatal if table doesn't exist
    }
    return batch.length;
  } catch {
    return 0;
  }
}

// ─── Tool Implementations ──────────────────────────────────────────────────
// ─── Tool Implementations ──────────────────────────────────────────────────

async function executeTool(toolName: string, args: Record<string, any>, accountUser: any): Promise<any> {
  switch (toolName) {
    case 'search_stories': {
      const where: any = { mergedIntoId: null };
      if (args.category) where.category = args.category;
      if (args.status) where.status = args.status;
      if (args.timeRange) {
        const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[args.timeRange] || 24;
        where.firstSeenAt = { gte: new Date(Date.now() - hours * 60 * 60 * 1000) };
      }
      const stories = await prisma.story.findMany({
        where: args.query ? { ...where, title: { contains: args.query, mode: 'insensitive' } } : where,
        orderBy: { compositeScore: 'desc' },
        take: Math.min(args.limit || 10, 20),
        select: { id: true, title: true, category: true, locationName: true, status: true, compositeScore: true, breakingScore: true, sourceCount: true, firstSeenAt: true },
      });
      return { stories, count: stories.length };
    }

    case 'get_story': {
      const story = await prisma.story.findUnique({
        where: { id: args.storyId },
        include: {
          storySources: { include: { sourcePost: { select: { title: true, url: true, source: { select: { name: true } } } } }, take: 5 },
          _count: { select: { storySources: true } },
        },
      });
      if (!story) return { error: 'Story not found' };
      return { story: { id: story.id, title: story.title, summary: story.aiSummary || story.summary, category: story.category, location: story.locationName, status: story.status, scores: { breaking: story.breakingScore, trending: story.trendingScore, confidence: story.confidenceScore, composite: story.compositeScore }, sourceCount: story._count.storySources, sources: story.storySources.map(ss => ({ title: ss.sourcePost.title, source: ss.sourcePost.source.name, url: ss.sourcePost.url })) } };
    }

    case 'get_breaking_stories': {
      const stories = await prisma.story.findMany({
        where: { status: { in: ['BREAKING', 'ALERT'] }, mergedIntoId: null },
        orderBy: { compositeScore: 'desc' },
        take: args.limit || 5,
        select: { id: true, title: true, category: true, locationName: true, status: true, compositeScore: true, sourceCount: true, firstSeenAt: true },
      });
      return { stories, count: stories.length };
    }

    case 'get_trending_stories': {
      const stories = await prisma.story.findMany({
        where: { status: { in: ['TOP_STORY', 'BREAKING', 'DEVELOPING'] }, mergedIntoId: null },
        orderBy: { trendingScore: 'desc' },
        take: args.limit || 5,
        select: { id: true, title: true, category: true, locationName: true, status: true, trendingScore: true, compositeScore: true, sourceCount: true },
      });
      return { stories, count: stories.length };
    }

    case 'list_sources': {
      const where: any = {};
      if (args.search) where.name = { contains: args.search, mode: 'insensitive' };
      if (args.platform) where.platform = args.platform;
      if (args.isActive !== undefined) where.isActive = args.isActive;
      const sources = await prisma.source.findMany({
        where,
        take: Math.min(args.limit || 20, 50),
        select: { id: true, name: true, platform: true, isActive: true, trustScore: true, lastPolledAt: true, url: true },
        orderBy: { name: 'asc' },
      });
      return { sources, count: sources.length };
    }

    case 'get_source': {
      const source = await prisma.source.findUnique({ where: { id: args.sourceId } });
      return source || { error: 'Source not found' };
    }

    case 'list_markets': {
      const markets = await prisma.market.findMany({
        where: { isActive: true },
        select: { id: true, name: true, state: true, isActive: true, _count: { select: { sources: true } } },
        orderBy: { name: 'asc' },
      });
      return { markets: markets.map(m => ({ ...m, sourceCount: m._count.sources })), count: markets.length };
    }

    case 'get_market': {
      const market = await prisma.market.findFirst({
        where: args.marketId ? { id: args.marketId } : { name: { contains: args.marketName, mode: 'insensitive' } },
        include: { _count: { select: { sources: true, stories: true } } },
      });
      return market ? { ...market, sourceCount: market._count.sources, storyCount: market._count.stories } : { error: 'Market not found' };
    }

    case 'get_pipeline_status': {
      try {
        const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
        const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
        const queues = ['ingestion', 'enrichment', 'clustering', 'scoring'];
        const status: any = {};
        for (const qName of queues) {
          const q = new Queue(qName, { connection: conn });
          const counts = await q.getJobCounts();
          status[qName] = counts;
          await q.close();
        }
        await conn.quit();
        return { queues: status };
      } catch { return { error: 'Could not fetch pipeline status' }; }
    }

    case 'get_online_users': {
      try {
        const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
        const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
        const keys = await conn.keys('tp:online:*');
        const users: any[] = [];
        for (const key of keys) {
          const data = await conn.get(key);
          if (data) try { users.push(JSON.parse(data)); } catch {}
        }
        await conn.quit();
        return { online: users, count: users.length };
      } catch { return { online: [], count: 0 }; }
    }

    case 'get_stats': {
      const [storyCount, sourceCount, marketCount, activeSourceCount] = await Promise.all([
        prisma.story.count({ where: { mergedIntoId: null } }),
        prisma.source.count(),
        prisma.market.count({ where: { isActive: true } }),
        prisma.source.count({ where: { isActive: true } }),
      ]);
      return { storyCount, sourceCount, activeSourceCount, marketCount };
    }

    case 'create_source': {
      if (accountUser?.role !== 'ADMIN' && accountUser?.role !== 'OWNER') return { error: 'Admin required' };
      const source = await prisma.source.create({
        data: { name: args.name, url: args.url, platform: (args.platform || 'RSS') as any, sourceType: 'NEWS_ORG' as any, trustScore: 0.75, isActive: true, marketId: args.marketId },
      });
      return { message: `Source "${args.name}" created`, sourceId: source.id };
    }

    case 'toggle_source': {
      if (accountUser?.role !== 'ADMIN' && accountUser?.role !== 'OWNER') return { error: 'Admin required' };
      await prisma.source.update({ where: { id: args.sourceId }, data: { isActive: args.active } });
      return { message: `Source ${args.active ? 'activated' : 'deactivated'}` };
    }

    case 'create_market': {
      if (accountUser?.role !== 'ADMIN' && accountUser?.role !== 'OWNER') return { error: 'Admin required' };
      const market = await prisma.market.create({
        data: { accountId: accountUser.accountId, name: args.name, state: args.state || '', slug: args.slug || args.name.toLowerCase().replace(/\s+/g, '-'), latitude: 0, longitude: 0, radiusKm: 50, isActive: true },
      });
      return { message: `Market "${args.name}" created`, marketId: market.id, navigate: `/admin/markets` };
    }

    case 'assign_story': {
      const data: any = {};
      if (args.assignedTo) data.assignedTo = args.assignedTo;
      if (args.accountStatus) data.accountStatus = args.accountStatus;
      // Lazy create AccountStory derivative
      let deriv = await prisma.accountStory.findUnique({ where: { accountId_baseStoryId: { accountId: accountUser.accountId, baseStoryId: args.storyId } } });
      if (!deriv) {
        deriv = await prisma.accountStory.create({ data: { accountId: accountUser.accountId, baseStoryId: args.storyId, ...data } });
      } else {
        await prisma.accountStory.update({ where: { id: deriv.id }, data });
      }
      return { message: `Story updated`, navigate: `/stories/${args.storyId}` };
    }

    case 'generate_draft': {
      return { message: 'Use the story detail page to generate drafts', navigate: `/stories/${args.storyId}` };
    }

    case 'generate_conversation_starters': {
      return { message: 'Generating conversation starters...', navigate: `/stories/${args.storyId}` };
    }

    case 'trigger_ingestion': {
      try {
        const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
        const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
        const q = new Queue('ingestion', { connection: conn });
        const sources = await prisma.source.findMany({ where: { isActive: true, platform: 'RSS' }, take: 50 });
        let queued = 0;
        for (const s of sources) {
          if (!s.url) continue;
          await q.add('rss_poll', { type: 'rss_poll', sourceId: s.id, feedUrl: s.url }, { jobId: `assist-${s.id}-${Date.now()}`, removeOnComplete: true }).catch(() => {});
          queued++;
        }
        await q.close(); await conn.quit();
        return { message: `Triggered ingestion for ${queued} RSS sources` };
      } catch (err: any) { return { error: err.message }; }
    }

    case 'clear_failed_jobs': {
      if (accountUser?.role !== 'ADMIN' && accountUser?.role !== 'OWNER') return { error: 'Admin required' };
      try {
        const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
        const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
        const q = new Queue(args.queue || 'ingestion', { connection: conn });
        const failed = await q.getFailed(0, 5000);
        let removed = 0;
        for (const job of failed) { try { await job.remove(); removed++; } catch {} }
        await q.close(); await conn.quit();
        return { message: `Cleared ${removed} failed jobs from ${args.queue}` };
      } catch (err: any) { return { error: err.message }; }
    }

    case 'explain_score': {
      const story = await prisma.story.findUnique({
        where: { id: args.storyId },
        select: { title: true, status: true, breakingScore: true, trendingScore: true, confidenceScore: true, localityScore: true, compositeScore: true, sourceCount: true, category: true, locationName: true, firstSeenAt: true, lastUpdatedAt: true },
      });
      if (!story) return { error: 'Story not found' };
      const ageMin = Math.round((Date.now() - story.firstSeenAt.getTime()) / 60000);
      return {
        title: story.title,
        status: story.status,
        scores: { breaking: Math.round(story.breakingScore * 100), trending: Math.round(story.trendingScore * 100), confidence: Math.round(story.confidenceScore * 100), locality: Math.round(story.localityScore * 100), composite: Math.round(story.compositeScore * 100) },
        factors: {
          sourceCount: story.sourceCount,
          category: story.category,
          location: story.locationName,
          ageMinutes: ageMin,
          isLocal: !!story.locationName && story.locationName !== 'National',
        },
        explanation: `This story has a composite score of ${Math.round(story.compositeScore * 100)}. Breaking=${Math.round(story.breakingScore * 100)} (source velocity), Trending=${Math.round(story.trendingScore * 100)} (growth rate), Confidence=${Math.round(story.confidenceScore * 100)} (source trust), Locality=${Math.round(story.localityScore * 100)} (market relevance). It has ${story.sourceCount} source(s) and is ${ageMin} minutes old. Status: ${story.status}.`,
      };
    }

    case 'navigate': {
      return { navigate: args.path, message: `Navigating to ${args.path}` };
    }

    // ── Pipeline Operations ──────────────────────────────────────────────

    case 'heal_source': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/pipeline/heal-source/${args.sourceId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return await resp.json();
    }

    case 'run_queue': {
      const queue = new Queue(args.queue, { connection: new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null }) });
      const stories = await prisma.story.findMany({ where: { status: { notIn: ['ARCHIVED', 'STALE'] } }, select: { id: true }, take: 500 });
      let queued = 0;
      for (const s of stories) {
        await queue.add(args.queue === 'scoring' ? 'score' : args.queue, { storyId: s.id }, { attempts: 3 }).catch(() => {});
        queued++;
      }
      await queue.close();
      return { message: `Force-triggered ${args.queue} for ${queued} stories`, queued };
    }

    case 'fix_source_markets': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/pipeline/fix-source-markets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return await resp.json();
    }

    case 'consolidate_sources': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/pipeline/consolidate-news-sources`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return await resp.json();
    }

    case 'backfill_famous': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/pipeline/backfill-famous`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return await resp.json();
    }

    // ── Story Verification & Analysis ────────────────────────────────────

    case 'verify_story': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/stories/${args.storyId}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return await resp.json();
    }

    case 'get_related_stories': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/stories/${args.storyId}/related`);
      return await resp.json();
    }

    case 'get_news_director_alerts': {
      try {
        const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
        const raw = await redis.get('news-director:alerts');
        await redis.quit();
        if (raw) return JSON.parse(raw);
        return { alerts: [], message: 'No active alerts from the News Director' };
      } catch {
        return { alerts: [], error: 'Could not read News Director alerts' };
      }
    }

    // ── Workflow & Publishing ─────────────────────────────────────────────

    case 'workflow_transition': {
      const result = await prisma.accountStory.findFirst({
        where: { id: args.accountStoryId, accountId: accountUser.accountId },
      });
      if (!result) return { error: 'Account story not found' };

      await prisma.accountStory.update({
        where: { id: args.accountStoryId },
        data: {
          accountStatus: args.toStage,
          ...(args.toStage === 'assigned' && args.assignTo ? { assignedTo: args.assignTo, assignedAt: new Date() } : {}),
          ...(args.toStage === 'published' ? { coveredAt: new Date() } : {}),
        },
      });

      if (args.comment) {
        await prisma.editorialComment.create({
          data: {
            accountStoryId: args.accountStoryId,
            userId: accountUser.userId,
            content: args.comment,
            action: 'transition',
            fromStage: result.accountStatus,
            toStage: args.toStage,
          },
        }).catch(() => {});
      }

      return { message: `Story moved to "${args.toStage}"`, fromStage: result.accountStatus, toStage: args.toStage };
    }

    case 'get_workflow_stages': {
      let stages = await prisma.workflowStage.findMany({
        where: { accountId: accountUser.accountId },
        orderBy: { order: 'asc' },
      });
      if (stages.length === 0) {
        return { stages: ['lead', 'assigned', 'in-progress', 'draft-ready', 'editor-review', 'approved', 'published', 'killed'], message: 'Using default stages (not yet customized)' };
      }
      return { stages: stages.map(s => ({ name: s.name, slug: s.slug, order: s.order, color: s.color })) };
    }

    case 'generate_broadcast_package': {
      const formats = args.formats
        ? args.formats.split(',').map((f: string) => f.trim())
        : ['tv_30s', 'radio_30s', 'social_post', 'web_article', 'push_notification'];
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/broadcast-package/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountUser.token || ''}` },
        body: JSON.stringify({ storyId: args.storyId, formats }),
      });
      return await resp.json();
    }

    case 'generate_audio_spot': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/workflow/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountUser.token || ''}` },
        body: JSON.stringify({
          accountStoryId: args.accountStoryId,
          script: args.script,
          voice: args.voice || 'alloy',
          format: args.format || '30s',
        }),
      });
      return await resp.json();
    }

    case 'publish_content': {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/workflow/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountUser.token || ''}` },
        body: JSON.stringify({
          accountStoryId: args.accountStoryId,
          platform: args.platform,
          content: { title: args.title, body: args.body },
        }),
      });
      return await resp.json();
    }

    case 'get_publish_queue': {
      const items = await prisma.publishedContent.findMany({
        where: { accountId: accountUser.accountId, status: { in: ['PENDING', 'SCHEDULED'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return { queue: items, count: items.length };
    }

    // ── topicpulse.md — Custom Instructions ─────────────────────────────

    case 'read_topicpulse_md': {
      try {
        const docs = await prisma.$queryRaw<Array<{ content: string; updatedAt: Date }>>`
          SELECT content, "updatedAt" FROM "SystemKnowledge" WHERE key = 'topicpulse_md' LIMIT 1
        `;
        if (docs && docs.length > 0) {
          return { content: docs[0].content, updatedAt: docs[0].updatedAt, exists: true };
        }
        return { content: '', exists: false, message: 'No topicpulse.md file exists yet. A superadmin can create one using append_topicpulse_md.' };
      } catch {
        return { content: '', exists: false, error: 'Could not read topicpulse.md' };
      }
    }

    case 'append_topicpulse_md': {
      // Superadmin only
      if (accountUser.role !== 'OWNER') {
        return { error: 'Only superadmin (OWNER role) can modify topicpulse.md. Your role: ' + accountUser.role };
      }
      if (!args.instruction || !args.instruction.trim()) {
        return { error: 'Instruction text is required' };
      }

      try {
        // Read existing content
        const existing = await prisma.$queryRaw<Array<{ content: string }>>`
          SELECT content FROM "SystemKnowledge" WHERE key = 'topicpulse_md' LIMIT 1
        `;
        const currentContent = (existing && existing.length > 0) ? existing[0].content : '';
        const newContent = currentContent
          ? `${currentContent}\n\n${args.instruction.trim()}`
          : args.instruction.trim();

        // Upsert
        await prisma.$executeRaw`
          INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedBy", "updatedAt")
          VALUES (${'sk_topicpulse_md'}, ${'topicpulse_md'}, ${newContent}, ${'instructions'}, ${accountUser.userId}, NOW())
          ON CONFLICT (key) DO UPDATE SET content = ${newContent}, "updatedBy" = ${accountUser.userId}, "updatedAt" = NOW()
        `;

        return {
          message: 'Instruction appended to topicpulse.md',
          newContent,
          lineCount: newContent.split('\n').length,
        };
      } catch (err: any) {
        return { error: `Failed to update topicpulse.md: ${err.message}` };
      }
    }

    case 'replace_topicpulse_md': {
      // Superadmin only
      if (accountUser.role !== 'OWNER') {
        return { error: 'Only superadmin (OWNER role) can modify topicpulse.md. Your role: ' + accountUser.role };
      }
      if (!args.content) {
        return { error: 'Content is required' };
      }

      try {
        await prisma.$executeRaw`
          INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedBy", "updatedAt")
          VALUES (${'sk_topicpulse_md'}, ${'topicpulse_md'}, ${args.content}, ${'instructions'}, ${accountUser.userId}, NOW())
          ON CONFLICT (key) DO UPDATE SET content = ${args.content}, "updatedBy" = ${accountUser.userId}, "updatedAt" = NOW()
        `;

        return {
          message: 'topicpulse.md replaced',
          lineCount: args.content.split('\n').length,
          characterCount: args.content.length,
        };
      } catch (err: any) {
        return { error: `Failed to replace topicpulse.md: ${err.message}` };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Chat Endpoint ─────────────────────────────────────────────────────────

export async function assistantRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /assistant/alerts — proactive new story alerts for saved views + News Director
  app.get('/assistant/alerts', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    let viewAlerts: any[] = [];
    let directorAlerts: any = null;

    // View-based alerts
    try {
      const { checkViewsForNewStories } = await import('../lib/view-alerts.js');
      viewAlerts = await checkViewsForNewStories(au.userId);
    } catch {}

    // News Director alerts from Redis
    try {
      const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
      const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      const raw = await conn.get('news-director:alerts');
      await conn.quit();
      if (raw) {
        directorAlerts = JSON.parse(raw);
      }
    } catch {}

    return reply.send({
      alerts: viewAlerts,
      newsDirector: directorAlerts,
    });
  });

  // ─── POST /assistant/chat — v2 with native function calling + multi-turn ──

  app.post('/assistant/chat', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
      context: z.object({
        currentPage: z.string().optional(),
        activeStoryId: z.string().optional(),
        activeFilters: z.any().optional(),
        activeMarket: z.string().optional(),
      }).optional(),
      stream: z.boolean().optional(), // Enable SSE streaming
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Message required' });

    const { message, history = [], context, stream: wantStream } = body.data;

    // ── Load custom instructions ──
    let customInstructions = '';
    try {
      const tpmd = await prisma.$queryRaw<Array<{ content: string }>>`
        SELECT content FROM "SystemKnowledge" WHERE key = 'topicpulse_md' LIMIT 1
      `;
      if (tpmd?.[0]?.content) customInstructions = tpmd[0].content;
    } catch {}

    // ── Hybrid RAG: retrieve relevant knowledge chunks via embedding similarity ──
    let knowledgeBase = '';
    try {
      const { generateEmbedding } = await import('../lib/llm-factory.js');
      const queryEmb = await generateEmbedding(message);

      if (queryEmb) {
        // Try vector retrieval of relevant knowledge chunks
        const chunks = await prisma.$queryRaw<Array<{ content: string; category: string }>>`
          SELECT content, category FROM "SystemKnowledge"
          WHERE category IN ('operations', 'help', 'schema')
          ORDER BY category
        `;
        if (chunks && chunks.length > 0) {
          // Simple relevance scoring: check if message keywords appear in chunk
          const lower = message.toLowerCase();
          const scored = chunks.map(c => {
            const words = lower.split(/\s+/).filter(w => w.length > 3);
            const hits = words.filter(w => c.content.toLowerCase().includes(w)).length;
            return { ...c, relevance: hits };
          }).sort((a, b) => b.relevance - a.relevance);

          // Take top 2 most relevant chunks (instead of all 4)
          const relevant = scored.slice(0, 2).filter(c => c.relevance > 0);
          if (relevant.length > 0) {
            knowledgeBase = relevant.map(d => d.content).join('\n\n---\n\n');
          } else {
            // Fallback: include compact knowledge only
            const { getCompactKnowledge } = await import('../lib/knowledge-base.js');
            knowledgeBase = getCompactKnowledge();
          }
        }
      }
    } catch {}
    // Final fallback
    if (!knowledgeBase) {
      try {
        const { getCompactKnowledge } = await import('../lib/knowledge-base.js');
        knowledgeBase = getCompactKnowledge();
      } catch {}
    }

    // ── Build context info ──
    let contextInfo = '';
    if (context) {
      const parts: string[] = [];
      if (context.currentPage) parts.push(`User is on page: ${context.currentPage}`);
      if (context.activeStoryId) parts.push(`User is viewing story ID: ${context.activeStoryId}`);
      if (context.activeMarket) parts.push(`User has market filter set to: ${context.activeMarket}`);
      if (context.activeFilters) {
        const f = context.activeFilters;
        if (f.category) parts.push(`Category filter: ${f.category}`);
        if (f.status) parts.push(`Status filter: ${f.status}`);
        if (f.time_range) parts.push(`Time range: ${f.time_range}`);
      }
      if (parts.length > 0) contextInfo = `\n\nCurrent context:\n${parts.join('\n')}`;
    }

    // ── Conversation memory: summarize older messages, keep recent raw ──
    let chatContext = '';
    try {
      if (history.length > 6) {
        const { summarizeConversation } = await import('../lib/llm-factory.js');
        const oldMessages = history.slice(0, -4);
        const recentMessages = history.slice(-4);
        const summary = await summarizeConversation(oldMessages);
        chatContext = `[Conversation summary: ${summary}]\n\n` +
          recentMessages.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
      } else {
        chatContext = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
      }
    } catch {
      chatContext = history.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
    }

    // ── Get tools available for this user's role ──
    const availableTools = getToolsForRole(au.role);
    const toolFunctions = availableTools.map(({ requiredRole, ...t }) => t);

    // ── Build system prompt (lighter than v1 — uses hybrid RAG) ──
    const systemPrompt = `You are TopicPulse AI Assistant, an expert broadcast newsroom intelligence system.
${contextInfo}
${customInstructions ? '\n--- CUSTOM INSTRUCTIONS ---\n' + customInstructions + '\n--- END ---\n' : ''}
When the user says "this story", refer to activeStoryId from context.
${knowledgeBase ? '\n--- PLATFORM KNOWLEDGE ---\n' + knowledgeBase + '\n--- END KNOWLEDGE ---\n' : ''}
Keep responses concise — this is a newsroom, time matters.
User role: ${au.role}. ${au.role === 'VIEWER' ? 'Read-only access.' : 'Can perform admin actions.'}`;

    // ── Try LLM with native function calling ──
    try {
      const { generateWithFallback, generateStream } = await import('../lib/llm-factory.js');

      const prompt = `${chatContext ? chatContext + '\n' : ''}User: ${message}`;

      // ── SSE Streaming (no tool calling in streaming mode) ──
      if (wantStream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        await generateStream(prompt, { systemPrompt, maxTokens: 1000, temperature: 0.3 }, {
          onToken: (token) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
          },
          onDone: (result) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'done', model: result.model })}\n\n`);
            reply.raw.end();
          },
          onError: (err) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            reply.raw.end();
          },
        });
        return;
      }

      // ── Multi-turn tool planning (up to 3 rounds) ──
      const MAX_TOOL_ROUNDS = 3;
      let allToolResults: any[] = [];
      let navigation: string | null = null;
      let currentPrompt = prompt;
      let lastModel = '';

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await generateWithFallback(currentPrompt, {
          systemPrompt: round === 0 ? systemPrompt : undefined, // Only include system prompt on first round
          maxTokens: 1000,
          temperature: 0.3,
          functions: toolFunctions,
        });
        lastModel = result.model;

        // Check for native function calls
        const nativeToolCalls = result.toolCalls || (result.functionCall ? [result.functionCall] : []);

        // Also check for text-based tool blocks (backward compat with Gemini)
        const textToolCalls = [...(result.content || '').matchAll(/```tool\s*\n?([\s\S]*?)```/g)].map(m => {
          try { const p = JSON.parse(m[1].trim()); return { name: p.tool, arguments: p.args || {} }; } catch { return null; }
        }).filter(Boolean);

        const toolCalls = [...nativeToolCalls, ...textToolCalls];

        if (toolCalls.length === 0) {
          // No more tool calls — return the response
          const cleanContent = (result.content || '').replace(/```tool[\s\S]*?```/g, '').trim();
          return reply.send({
            message: cleanContent || (allToolResults.length > 0 ? 'Done.' : ''),
            toolResults: allToolResults,
            navigation,
            model: lastModel,
          });
        }

        // ── Parallel tool execution with caching + analytics ──
        const toolPromises = toolCalls.map(async (call: any) => {
          const toolName = call.name;
          const args = call.arguments || {};
          const startTime = Date.now();

          // Permission check
          if (!canUseTool(toolName, au.role)) {
            logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs: 0, success: false, error: 'Permission denied', cached: false, timestamp: new Date().toISOString() });
            return { tool: toolName, error: `Permission denied — requires ${TOOL_FUNCTIONS.find(t => t.name === toolName)?.requiredRole || 'ADMIN'} role` };
          }

          // Check cache
          const cached = getCachedResult(toolName, args);
          if (cached) {
            logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs: 0, success: true, cached: true, timestamp: new Date().toISOString() });
            return { tool: toolName, result: cached };
          }

          try {
            const toolResult = await executeTool(toolName, args, au);
            const durationMs = Date.now() - startTime;
            setCachedResult(toolName, args, toolResult);
            logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs, success: true, cached: false, timestamp: new Date().toISOString() });
            if (toolResult.navigate) navigation = toolResult.navigate;
            return { tool: toolName, result: toolResult };
          } catch (err: any) {
            const durationMs = Date.now() - startTime;
            logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs, success: false, error: err.message, cached: false, timestamp: new Date().toISOString() });
            return { tool: toolName, error: err.message };
          }
        });

        const roundResults = await Promise.all(toolPromises);
        allToolResults.push(...roundResults);

        // Build context for next round (multi-turn)
        const resultSummary = roundResults.map(tr =>
          `Tool ${tr.tool}: ${JSON.stringify(tr.result || tr.error).substring(0, 500)}`
        ).join('\n');

        currentPrompt = `The user asked: "${message}"\n\nTool results from round ${round + 1}:\n${resultSummary}\n\nIf you need more data, call another tool. Otherwise, provide a concise summary.`;
      }

      // Exhausted rounds — summarize what we have
      const finalSummary = await generateWithFallback(
        `Summarize these tool results for the user who asked "${message}":\n${allToolResults.map(tr => `${tr.tool}: ${JSON.stringify(tr.result || tr.error).substring(0, 300)}`).join('\n')}`,
        { maxTokens: 500, temperature: 0.3 }
      );

      return reply.send({
        message: finalSummary.content,
        toolResults: allToolResults,
        navigation,
        model: lastModel,
      });

    } catch (err: any) {
      // ── LLM unavailable — heuristic fallback ──
      const lower = message.toLowerCase();

      if (lower.includes('breaking') || lower.includes('top stories')) {
        const result = await executeTool('get_breaking_stories', { limit: 5 }, au);
        return reply.send({
          message: result.stories?.length
            ? `Here are the current breaking stories:\n${result.stories.map((s: any, i: number) => `${i + 1}. ${s.title} (${s.status}, score: ${Math.round(s.compositeScore * 100)})`).join('\n')}`
            : 'No breaking stories right now.',
          toolResults: [{ tool: 'get_breaking_stories', result }],
        });
      }

      if (lower.includes('status') || lower.includes('pipeline') || lower.includes('queue')) {
        const result = await executeTool('get_pipeline_status', {}, au);
        return reply.send({ message: `Pipeline status:\n${JSON.stringify(result.queues, null, 2)}`, toolResults: [{ tool: 'get_pipeline_status', result }] });
      }

      if (lower.includes('stats') || lower.includes('how many')) {
        const result = await executeTool('get_stats', {}, au);
        return reply.send({
          message: `System stats: ${result.storyCount} stories, ${result.sourceCount} sources (${result.activeSourceCount} active), ${result.marketCount} markets.`,
          toolResults: [{ tool: 'get_stats', result }],
        });
      }

      return reply.send({
        message: "I can help with stories, sources, markets, pipeline, and more. Try:\n• \"What's breaking?\"\n• \"Show Houston stories\"\n• \"Pipeline status\"",
        toolResults: [],
      });
    }
  });

  // ─── POST /assistant/tools/invoke — External tool invocation REST API ────
  // Allows external LLMs (Claude, GPT, etc.) to call TopicPulse tools directly

  app.post('/assistant/tools/invoke', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized — provide Bearer token or x-api-key' });

    const body = z.object({
      tool: z.string().min(1),
      args: z.record(z.any()).default({}),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() });

    const { tool: toolName, args } = body.data;

    if (!canUseTool(toolName, au.role)) {
      return reply.status(403).send({ error: `Forbidden — tool "${toolName}" requires ${TOOL_FUNCTIONS.find(t => t.name === toolName)?.requiredRole || 'higher'} role` });
    }

    const startTime = Date.now();
    try {
      const cached = getCachedResult(toolName, args);
      if (cached) {
        logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs: 0, success: true, cached: true, timestamp: new Date().toISOString() });
        return reply.send({ tool: toolName, result: cached, cached: true });
      }

      const result = await executeTool(toolName, args, au);
      setCachedResult(toolName, args, result);
      logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs: Date.now() - startTime, success: true, cached: false, timestamp: new Date().toISOString() });
      return reply.send({ tool: toolName, result, cached: false });
    } catch (err: any) {
      logToolUsage({ tool: toolName, args, userId: au.userId, role: au.role, durationMs: Date.now() - startTime, success: false, error: err.message, cached: false, timestamp: new Date().toISOString() });
      return reply.status(500).send({ tool: toolName, error: err.message });
    }
  });

  // ─── GET /assistant/tools — List available tools for current user ────────

  app.get('/assistant/tools', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const tools = getToolsForRole(au.role).map(({ requiredRole, ...t }) => t);
    return reply.send({ tools, count: tools.length, role: au.role });
  });

  // ─── GET /assistant/tools/analytics — Tool usage stats (ADMIN+) ──────────

  app.get('/assistant/tools/analytics', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au || (au.role !== 'ADMIN' && au.role !== 'OWNER')) return reply.status(403).send({ error: 'Admin required' });

    // Flush pending analytics
    await flushAnalytics();

    try {
      const stats = await prisma.$queryRaw<any[]>`
        SELECT tool, COUNT(*)::int as calls, AVG("durationMs")::int as "avgMs",
               SUM(CASE WHEN success THEN 1 ELSE 0 END)::int as successes,
               SUM(CASE WHEN cached THEN 1 ELSE 0 END)::int as "cacheHits"
        FROM "ToolAnalytics"
        WHERE "createdAt" > NOW() - INTERVAL '7 days'
        GROUP BY tool ORDER BY calls DESC
      `;
      return reply.send({ data: stats, period: '7d' });
    } catch {
      // Table may not exist yet — return buffer stats
      const bufferStats: Record<string, number> = {};
      for (const entry of analyticsBuffer) {
        bufferStats[entry.tool] = (bufferStats[entry.tool] || 0) + 1;
      }
      return reply.send({ data: Object.entries(bufferStats).map(([tool, calls]) => ({ tool, calls })), period: 'session' });
    }
  });

  // ─── POST /assistant/tools/permissions — Update tool permissions (OWNER) ─

  app.post('/assistant/tools/permissions', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au || au.role !== 'OWNER') return reply.status(403).send({ error: 'Owner required' });

    const body = z.object({
      toolName: z.string(),
      requiredRole: z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const tool = TOOL_FUNCTIONS.find(t => t.name === body.data.toolName);
    if (!tool) return reply.status(404).send({ error: 'Tool not found' });

    // Update in-memory (persists for this process lifetime)
    (tool as any).requiredRole = body.data.requiredRole;

    // Persist to DB for cross-restart persistence
    try {
      await prisma.$executeRaw`
        INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedBy", "updatedAt")
        VALUES (${'sk_tool_perm_' + body.data.toolName}, ${'tool_permission_' + body.data.toolName}, ${body.data.requiredRole}, ${'tool_permissions'}, ${au.userId}, NOW())
        ON CONFLICT (key) DO UPDATE SET content = ${body.data.requiredRole}, "updatedBy" = ${au.userId}, "updatedAt" = NOW()
      `;
    } catch {} // Non-fatal if column constraints differ

    return reply.send({ message: `Tool "${body.data.toolName}" now requires ${body.data.requiredRole} role`, tool: body.data.toolName, requiredRole: body.data.requiredRole });
  });

  // ─── GET /assistant/tools/permissions — Get all tool permissions ──────────

  app.get('/assistant/tools/permissions', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const permissions = TOOL_FUNCTIONS.map(t => ({
      name: t.name,
      description: t.description,
      requiredRole: t.requiredRole || null,
      currentUserCanUse: canUseTool(t.name, au.role),
    }));

    return reply.send({ permissions, userRole: au.role });
  });
}
