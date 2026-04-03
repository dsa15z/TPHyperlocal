// @ts-nocheck
/**
 * AI Assistant — natural language interface to the entire TopicPulse system.
 * Uses tool-calling LLM to map user requests to internal API calls.
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getAccountUser } from '../lib/route-helpers.js';


// ─── Tool Definitions ──────────────────────────────────────────────────────
// Each tool maps to an internal API call the LLM can invoke

const TOOLS = [
  { name: 'search_stories', description: 'Search for stories by keyword, category, status, market, or time range', params: 'query?, category?, status?, market?, timeRange? (1h/6h/24h/7d), limit? (default 10)' },
  { name: 'get_story', description: 'Get full details of a specific story by ID', params: 'storyId' },
  { name: 'get_breaking_stories', description: 'Get current breaking/top stories', params: 'limit? (default 5)' },
  { name: 'get_trending_stories', description: 'Get trending stories with growth data', params: 'limit? (default 5)' },
  { name: 'list_sources', description: 'List data feed sources with optional filters', params: 'search?, platform?, isActive?, limit? (default 20)' },
  { name: 'get_source', description: 'Get details of a specific source', params: 'sourceId' },
  { name: 'list_markets', description: 'List all configured markets', params: 'none' },
  { name: 'get_market', description: 'Get market details including linked sources', params: 'marketId or marketName' },
  { name: 'get_pipeline_status', description: 'Get current pipeline queue status (jobs waiting, active, failed)', params: 'none' },
  { name: 'get_online_users', description: 'See who is currently online', params: 'none' },
  { name: 'get_stats', description: 'Get system statistics (story count, source count, market count)', params: 'none' },
  { name: 'create_source', description: 'Add a new data feed source', params: 'name, url, platform (RSS/NEWSAPI/TWITTER), marketId?' },
  { name: 'toggle_source', description: 'Activate or deactivate a source', params: 'sourceId, active (true/false)' },
  { name: 'create_market', description: 'Add a new market', params: 'name, state, slug' },
  { name: 'assign_story', description: 'Assign a story to a reporter or change its account status', params: 'storyId, assignedTo?, accountStatus?' },
  { name: 'generate_draft', description: 'Generate an AI draft for a story', params: 'storyId, format (tv_script/radio_script/web_story/social_post)' },
  { name: 'generate_conversation_starters', description: 'Generate discussion prompts for on-air use', params: 'storyId, format? (radio_talk/tv_anchor/podcast)' },
  { name: 'trigger_ingestion', description: 'Force the ingestion pipeline to run now', params: 'lookbackHours? (default 1, max 24)' },
  { name: 'clear_failed_jobs', description: 'Clear failed jobs from a queue', params: 'queue (ingestion/enrichment/clustering/scoring)' },
  { name: 'explain_score', description: 'Explain why a story has its current score and status', params: 'storyId' },
  { name: 'navigate', description: 'Navigate the user to a specific page in the app', params: 'path (e.g. /, /admin/sources, /admin/markets, /stories/{id})' },
  // ── New tools: Pipeline Operations ──
  { name: 'heal_source', description: 'Force self-heal on a failing/inactive source. Tries browser UA, proxy-to-direct, alternate URLs', params: 'sourceId' },
  { name: 'run_queue', description: 'Force-run a specific pipeline queue (re-score stories, re-enrich, etc.)', params: 'queue (ingestion/enrichment/clustering/scoring)' },
  { name: 'fix_source_markets', description: 'Auto-link sources to their correct markets + create missing database tables', params: 'none' },
  { name: 'consolidate_sources', description: 'Merge per-market Bing/Google/Event Registry sources into consolidated multi-market sources', params: 'none' },
  { name: 'backfill_famous', description: 'Scan existing stories for famous person mentions and flag them', params: 'none' },
  // ── New tools: Story Verification & Analysis ──
  { name: 'verify_story', description: 'Send story to 2 LLMs (OpenAI + Grok) for independent fact verification', params: 'storyId' },
  { name: 'get_related_stories', description: 'Find stories sharing 2+ entities (people, orgs, locations) with a given story', params: 'storyId' },
  { name: 'get_news_director_alerts', description: 'Get proactive editorial alerts from the AI News Director (uncovered stories, famous persons, spreading stories)', params: 'none' },
  // ── New tools: Workflow & Publishing ──
  { name: 'workflow_transition', description: 'Move a story to a new workflow stage (lead/assigned/in-progress/draft-ready/editor-review/approved/published/killed)', params: 'accountStoryId, toStage, comment?' },
  { name: 'get_workflow_stages', description: 'List all workflow stages for the current account', params: 'none' },
  { name: 'generate_broadcast_package', description: 'One-click: generate TV script + radio spot + social post + web article + push notification for a story', params: 'storyId, formats? (default: tv_30s,radio_30s,social_post,web_article,push_notification)' },
  { name: 'generate_audio_spot', description: 'Generate a TTS audio spot for a story using OpenAI voices', params: 'accountStoryId, script, voice? (alloy/echo/fable/onyx/nova/shimmer), format? (15s/30s/60s/full)' },
  { name: 'publish_content', description: 'Publish story content to an external platform', params: 'accountStoryId, platform (twitter/facebook/linkedin/wordpress/custom_webhook), title, body' },
  { name: 'get_publish_queue', description: 'List pending/scheduled publish jobs for the current account', params: 'none' },
  // ── Custom Instructions (topicpulse.md) ──
  { name: 'read_topicpulse_md', description: 'Read the topicpulse.md custom instructions file that guides AI behavior', params: 'none' },
  { name: 'append_topicpulse_md', description: 'Add a new instruction to topicpulse.md (SUPERADMIN ONLY). This permanently changes how the AI assistant behaves.', params: 'instruction (text to append)' },
  { name: 'replace_topicpulse_md', description: 'Replace the entire topicpulse.md file (SUPERADMIN ONLY). Use with caution — this overwrites all custom instructions.', params: 'content (full new content)' },
];

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

  app.post('/assistant/chat', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
      // Context from the frontend — what the user is currently looking at
      context: z.object({
        currentPage: z.string().optional(), // e.g., "/", "/stories/abc123", "/admin/sources"
        activeStoryId: z.string().optional(), // if viewing a story detail
        activeFilters: z.any().optional(), // current filter state
        activeMarket: z.string().optional(), // selected market name
      }).optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Message required' });

    const { message, history = [], context } = body.data;

    // Load topicpulse.md custom instructions (managed by superadmin via chatbot)
    let customInstructions = '';
    try {
      const tpmd = await prisma.$queryRaw<Array<{ content: string }>>`
        SELECT content FROM "SystemKnowledge" WHERE key = 'topicpulse_md' LIMIT 1
      `;
      if (tpmd && tpmd.length > 0 && tpmd[0].content) {
        customInstructions = tpmd[0].content;
      }
    } catch {}

    // Load RAG knowledge from SystemKnowledge DB table (populated via /admin/knowledge/generate)
    let knowledgeBase = '';
    try {
      const docs = await prisma.$queryRaw<Array<{ content: string; category: string }>>`
        SELECT content, category FROM "SystemKnowledge" WHERE category IN ('operations', 'help', 'schema') ORDER BY category
      `;
      if (docs && docs.length > 0) {
        knowledgeBase = docs.map(d => d.content).join('\n\n---\n\n');
      }
    } catch {}
    // Fallback to generated knowledge if DB has no docs yet
    if (!knowledgeBase) {
      try {
        const { generateSystemKnowledge } = await import('../lib/knowledge-base.js');
        const { generateChatbotOpsKnowledge } = await import('../lib/knowledge-chatbot-ops.js');
        const { generateUserHelpKnowledge } = await import('../lib/knowledge-user-help.js');
        knowledgeBase = [generateChatbotOpsKnowledge(), generateUserHelpKnowledge(), generateSystemKnowledge()].join('\n\n---\n\n');
      } catch {}
    }

    // Build context-aware prompt
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

    // Build the system prompt with RAG knowledge + tools + context
    const toolList = TOOLS.map(t => `- ${t.name}(${t.params}): ${t.description}`).join('\n');

    const systemPrompt = `You are TopicPulse AI Assistant, an expert on broadcast newsroom intelligence.
You have deep knowledge of the TopicPulse platform and can help with any task.
${contextInfo}

${customInstructions ? '--- CUSTOM INSTRUCTIONS (topicpulse.md — set by admin) ---\n' + customInstructions + '\n--- END CUSTOM INSTRUCTIONS ---\n\n' : ''}When the user says "this story" or "the current story", refer to activeStoryId from context.
When the user says "these results" or "the current view", refer to activeFilters from context.

${knowledgeBase ? '--- PLATFORM KNOWLEDGE ---\n' + knowledgeBase + '\n--- END KNOWLEDGE ---\n' : ''}

Available tools you can call:
You help users find stories, manage sources, analyze trends, and perform admin tasks.

Available tools you can call:
${toolList}

To call a tool, respond with a JSON block like:
\`\`\`tool
{"tool": "search_stories", "args": {"query": "fire", "timeRange": "1h"}}
\`\`\`

You can call multiple tools by including multiple tool blocks.
After tool results come back, provide a natural language summary.
If the user asks to navigate somewhere, use the navigate tool.
If you're unsure what the user wants, ask for clarification.
Keep responses concise — this is a newsroom, time matters.
The user's role is: ${au.role}. ${au.role === 'VIEWER' ? 'They can only query data, not make changes.' : 'They can perform admin actions.'}`;

    // Try LLM-powered response
    try {
      const { generateWithFallback } = await import('../lib/llm-factory.js');

      // First pass: get the LLM to decide what tools to call
      const chatHistory = history.slice(-10).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');

      const prompt = `${chatHistory ? chatHistory + '\n' : ''}User: ${message}`;

      const result = await generateWithFallback(prompt, {
        systemPrompt,
        maxTokens: 1000,
        temperature: 0.3,
      });

      // Parse tool calls from response
      const toolCalls = [...result.content.matchAll(/```tool\s*\n?([\s\S]*?)```/g)].map(m => {
        try { return JSON.parse(m[1].trim()); } catch { return null; }
      }).filter(Boolean);

      let toolResults: any[] = [];
      let navigation: string | null = null;

      if (toolCalls.length > 0) {
        // Execute tools
        for (const call of toolCalls) {
          try {
            const toolResult = await executeTool(call.tool, call.args || {}, au);
            toolResults.push({ tool: call.tool, result: toolResult });
            if (toolResult.navigate) navigation = toolResult.navigate;
          } catch (err: any) {
            toolResults.push({ tool: call.tool, error: err.message });
          }
        }

        // Second pass: summarize tool results
        const resultSummary = toolResults.map(tr => `Tool ${tr.tool}: ${JSON.stringify(tr.result || tr.error).substring(0, 500)}`).join('\n');

        const summaryResult = await generateWithFallback(
          `The user asked: "${message}"\n\nTool results:\n${resultSummary}\n\nProvide a concise, helpful summary of the results. If there are stories, format them as a numbered list with title, status, and score. Keep it brief.`,
          { maxTokens: 500, temperature: 0.3 }
        );

        return reply.send({
          message: summaryResult.content,
          toolResults,
          navigation,
          model: result.model,
        });
      }

      // No tool calls — direct response
      return reply.send({
        message: result.content.replace(/```tool[\s\S]*?```/g, '').trim(),
        toolResults: [],
        navigation,
        model: result.model,
      });

    } catch (err: any) {
      // LLM unavailable — try heuristic response
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

      if (lower.includes('market')) {
        const result = await executeTool('list_markets', {}, au);
        return reply.send({
          message: `${result.count} active markets: ${result.markets.map((m: any) => `${m.name}, ${m.state}`).join(' | ')}`,
          toolResults: [{ tool: 'list_markets', result }],
          navigation: '/admin/markets',
        });
      }

      return reply.send({
        message: "I can help you with stories, sources, markets, pipeline status, and more. Try asking:\n• \"What's breaking right now?\"\n• \"Show me Houston stories\"\n• \"How many sources are active?\"\n• \"Take me to the markets page\"",
        toolResults: [],
      });
    }
  });
}
