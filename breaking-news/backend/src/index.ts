import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';

import { storiesRoutes } from './routes/stories.js';
import { searchRoutes } from './routes/search.js';
import { feedsRoutes } from './routes/feeds.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin/index.js';
import { pipelineRoutes } from './routes/pipeline.js';
import { userRoutes } from './routes/user.js';
import { firstDraftRoutes } from './routes/first-draft.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { showPrepRoutes } from './routes/show-prep.js';
import { pulseRoutes } from './routes/pulses.js';
import { annotationRoutes } from './routes/annotations.js';
import { analyticsRoutes } from './routes/analytics.js';
import { notificationRoutes } from './routes/notifications.js';
import { registerSSERoutes } from './lib/sse.js';
import { predictionRoutes } from './routes/predictions.js';
import { topicClusterRoutes } from './routes/topic-clusters.js';
import { stateTransitionRoutes } from './routes/state-transitions.js';
import { radioGPTRoutes } from './routes/radio-gpt.js';
import { stockRoutes } from './routes/stocks.js';
import { collaborativeRoutes } from './routes/collaborative.js';
import { factCheckRoutes } from './routes/fact-check.js';
import { translationRoutes } from './routes/translations.js';
import { assignmentDeskRoutes } from './routes/assignment-desk.js';
import { breakingPackageRoutes } from './routes/breaking-package.js';
import { reporterAnalyticsRoutes } from './routes/reporter-analytics.js';
import { lineupRoutes } from './routes/lineup.js';
import { showDeadlineRoutes } from './routes/show-deadlines.js';
import { publishQueueRoutes } from './routes/publish-queue.js';
import { beatAlertRoutes } from './routes/beat-alerts.js';
import { ssoRoutes } from './routes/sso.js';
import { videoRoutes } from './routes/video.js';
import { storyAnalyticsRoutes } from './routes/story-analytics.js';
import { mosIntegrationRoutes } from './routes/mos-integration.js';
import { cmsPublishRoutes } from './routes/cms-publish.js';
import { headlineTestingRoutes } from './routes/headline-testing.js';
import { sourceExpansionRoutes } from './routes/source-expansion.js';
import { broadcastMonitorRoutes } from './routes/broadcast-monitor.js';
import { hyperLocalIntelRoutes } from './routes/hyperlocal-intel.js';
import { socialPublishRoutes } from './routes/social-publish.js';
import { analyticsEmbedRoutes } from './routes/analytics-embed.js';
import { dbHealthRoutes } from './routes/db-health.js';
import { storyResearchRoutes } from './routes/story-research.js';
import { billingRoutes } from './routes/billing.js';
import { accountStoryRoutes } from './routes/account-stories.js';
import { conversationStarterRoutes } from './routes/conversation-starters.js';
import { moderationRoutes } from './routes/moderation.js';
import { voiceToneRoutes } from './routes/voice-tone.js';
import { mediaModerationRoutes } from './routes/media-moderation.js';
import { extrasRoutes } from './routes/extras.js';
import { assistantRoutes } from './routes/assistant.js';
import { broadcastPackageGenRoutes } from './routes/broadcast-package-gen.js';
import { userSettingsRoutes } from './routes/user-settings.js';
import { workflowRoutes } from './routes/workflow.js';
import { authMiddleware } from './middleware/auth.js';
import { jwtAuthMiddleware } from './middleware/jwt-auth.js';
import { prisma } from './lib/prisma.js';

dotenv.config();

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: {
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
  });

  // CORS
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN']?.split(',') ?? ['*'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });

  // Rate limiting — 60 requests per minute per IP (global default)
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return (
        (request.headers['x-api-key'] as string) ??
        request.ip
      );
    },
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Breaking News Intelligence API',
        description: 'API for the Breaking News Intelligence Platform',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${PORT}`,
          description: 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Global error handler — sanitize 500 errors in production (SEC-002)
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
      app.log.error({ err: error }, 'Internal server error');
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    }
    // In dev or for 4xx errors, return the full error
    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message: error.message,
    });
  });

  // Auth middleware — supports both API key (x-api-key) and JWT (Bearer token)
  // API key auth for third-party API consumers
  app.addHook('onRequest', authMiddleware);
  // JWT auth for frontend users
  app.addHook('onRequest', jwtAuthMiddleware);

  // Register routes
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(storiesRoutes, { prefix: '/api/v1' });
  await app.register(searchRoutes, { prefix: '/api/v1' });
  await app.register(feedsRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(pipelineRoutes, { prefix: '/api/v1' });
  await app.register(userRoutes, { prefix: '/api/v1' });
  await app.register(firstDraftRoutes, { prefix: '/api/v1' });
  await app.register(bookmarkRoutes, { prefix: '/api/v1' });
  await app.register(showPrepRoutes, { prefix: '/api/v1' });
  await app.register(pulseRoutes, { prefix: '/api/v1' });
  await app.register(annotationRoutes, { prefix: '/api/v1' });
  await app.register(analyticsRoutes, { prefix: '/api/v1' });
  await app.register(notificationRoutes, { prefix: '/api/v1' });
  await app.register(predictionRoutes, { prefix: '/api/v1' });
  await app.register(topicClusterRoutes, { prefix: '/api/v1' });
  await app.register(stateTransitionRoutes, { prefix: '/api/v1' });
  await app.register(radioGPTRoutes, { prefix: '/api/v1' });
  await app.register(stockRoutes, { prefix: '/api/v1' });
  await app.register(collaborativeRoutes, { prefix: '/api/v1' });
  await app.register(factCheckRoutes, { prefix: '/api/v1' });
  await app.register(translationRoutes, { prefix: '/api/v1' });
  await app.register(assignmentDeskRoutes, { prefix: '/api/v1' });
  await app.register(breakingPackageRoutes, { prefix: '/api/v1' });
  await app.register(reporterAnalyticsRoutes, { prefix: '/api/v1' });
  await app.register(lineupRoutes, { prefix: '/api/v1' });
  await app.register(showDeadlineRoutes, { prefix: '/api/v1' });
  await app.register(publishQueueRoutes, { prefix: '/api/v1' });
  await app.register(beatAlertRoutes, { prefix: '/api/v1' });
  await app.register(ssoRoutes, { prefix: '/api/v1' });
  await app.register(videoRoutes, { prefix: '/api/v1' });
  await app.register(storyAnalyticsRoutes, { prefix: '/api/v1' });
  await app.register(mosIntegrationRoutes, { prefix: '/api/v1' });
  await app.register(cmsPublishRoutes, { prefix: '/api/v1' });
  await app.register(headlineTestingRoutes, { prefix: '/api/v1' });
  await app.register(sourceExpansionRoutes, { prefix: '/api/v1' });
  await app.register(broadcastMonitorRoutes, { prefix: '/api/v1' });
  await app.register(hyperLocalIntelRoutes, { prefix: '/api/v1' });
  await app.register(socialPublishRoutes, { prefix: '/api/v1' });
  await app.register(analyticsEmbedRoutes, { prefix: '/api/v1' });
  await app.register(dbHealthRoutes, { prefix: '/api/v1' });
  await app.register(storyResearchRoutes, { prefix: '/api/v1' });
  await app.register(billingRoutes, { prefix: '/api/v1' });
  await app.register(accountStoryRoutes, { prefix: '/api/v1' });
  await app.register(conversationStarterRoutes, { prefix: '/api/v1' });
  await app.register(moderationRoutes, { prefix: '/api/v1' });
  await app.register(voiceToneRoutes, { prefix: '/api/v1' });
  await app.register(mediaModerationRoutes, { prefix: '/api/v1' });
  await app.register(extrasRoutes, { prefix: '/api/v1' });
  await app.register(assistantRoutes, { prefix: '/api/v1' });
  await app.register(broadcastPackageGenRoutes, { prefix: '/api/v1' });
  await app.register(userSettingsRoutes, { prefix: '/api/v1' });
  await app.register(workflowRoutes, { prefix: '/api/v1/workflow' });
  registerSSERoutes(app);

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  return app;
}

/**
 * Ensure all tables exist by running CREATE TABLE IF NOT EXISTS.
 * This bypasses prisma db push (which doesn't work in Docker CMD)
 * and directly creates any missing tables.
 */
async function ensureTables() {
  try {
    // Check if a known newer table exists
    await prisma.$queryRawUnsafe('SELECT 1 FROM "PublicDataAlert" LIMIT 1');
    console.log('[db-sync] Tables already exist');
    return;
  } catch {
    console.log('[db-sync] Missing tables detected, creating...');
  }

  // Run prisma db push programmatically via exec
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(
      'npx prisma db push --skip-generate --accept-data-loss 2>&1',
      { timeout: 30000, cwd: process.cwd() }
    );
    console.log('[db-sync] prisma db push output:', stdout.substring(0, 500));
    if (stderr) console.log('[db-sync] stderr:', stderr.substring(0, 200));
  } catch (err: any) {
    console.error('[db-sync] prisma db push failed:', err.message?.substring(0, 200));
    // Try alternative: generate schema via Prisma client
    console.log('[db-sync] Attempting alternative table creation...');

    // Alternative: use $executeRaw to create critical tables
    const createStatements = [
      `CREATE TABLE IF NOT EXISTS "PublicDataFeed" (id TEXT PRIMARY KEY, "accountId" TEXT, name TEXT NOT NULL, type TEXT NOT NULL, url TEXT NOT NULL, "apiConfig" JSONB, "isActive" BOOLEAN DEFAULT true, "pollIntervalMin" INTEGER DEFAULT 15, "lastPolledAt" TIMESTAMPTZ, "lastError" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "PublicDataAlert" (id TEXT PRIMARY KEY, "feedId" TEXT NOT NULL, "externalId" TEXT UNIQUE, type TEXT NOT NULL, severity TEXT DEFAULT 'INFO', title TEXT NOT NULL, description TEXT, location TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, "rawData" JSONB, "storyId" TEXT, "detectedAt" TIMESTAMPTZ DEFAULT NOW(), "expiresAt" TIMESTAMPTZ)`,
      `CREATE TABLE IF NOT EXISTS "Reporter" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "userId" TEXT, name TEXT NOT NULL, email TEXT, phone TEXT, beats JSONB, status TEXT DEFAULT 'AVAILABLE', "currentLat" DOUBLE PRECISION, "currentLon" DOUBLE PRECISION, metadata JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "Assignment" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "storyId" TEXT NOT NULL, "reporterId" TEXT NOT NULL, status TEXT DEFAULT 'ASSIGNED', priority TEXT DEFAULT 'NORMAL', notes TEXT, deadline TIMESTAMPTZ, "filedAt" TIMESTAMPTZ, "airedAt" TIMESTAMPTZ, "assignedBy" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "ShiftBriefing" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "shiftName" TEXT NOT NULL, content TEXT NOT NULL, "storyCount" INTEGER DEFAULT 0, "gapCount" INTEGER DEFAULT 0, model TEXT NOT NULL, "generatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "BreakingPackage" (id TEXT PRIMARY KEY, "storyId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "broadcastScript" TEXT, "socialPost" TEXT, "pushTitle" TEXT, "pushBody" TEXT, "webSummary" TEXT, "bulletPoints" TEXT, "graphicPrompt" TEXT, status TEXT DEFAULT 'GENERATED', "publishedTo" JSONB, "generatedBy" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "ShowDeadline" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "showName" TEXT NOT NULL, "airTime" TEXT NOT NULL, timezone TEXT DEFAULT 'America/Chicago', "daysOfWeek" JSONB NOT NULL, "scriptDeadlineMin" INTEGER DEFAULT 30, "isActive" BOOLEAN DEFAULT true, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "StoryPrediction" (id TEXT PRIMARY KEY, "storyId" TEXT NOT NULL, "viralProbability" DOUBLE PRECISION NOT NULL, "peakScorePrediction" DOUBLE PRECISION, "predictedStatus" TEXT, factors JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "FactCheck" (id TEXT PRIMARY KEY, "storyId" TEXT NOT NULL, claim TEXT NOT NULL, verdict TEXT NOT NULL, confidence DOUBLE PRECISION, evidence TEXT, sources JSONB, model TEXT DEFAULT 'heuristic', "checkedBy" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "TranslatedContent" (id TEXT PRIMARY KEY, "storyId" TEXT NOT NULL, "sourceLanguage" TEXT DEFAULT 'en', "targetLanguage" TEXT NOT NULL, "translatedTitle" TEXT NOT NULL, "translatedSummary" TEXT, model TEXT NOT NULL, confidence DOUBLE PRECISION, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "AudioSource" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, type TEXT DEFAULT 'SCANNER', "isActive" BOOLEAN DEFAULT true, "lastTranscribedAt" TIMESTAMPTZ, metadata JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "AudioTranscript" (id TEXT PRIMARY KEY, "audioSourceId" TEXT NOT NULL, transcript TEXT NOT NULL, "durationSec" INTEGER, model TEXT, "storyId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "RadioScript" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "voiceId" TEXT, "showName" TEXT NOT NULL, format TEXT DEFAULT 'NEWS', "storyIds" JSONB NOT NULL, script TEXT NOT NULL, duration INTEGER, model TEXT NOT NULL, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "HistoryEvent" (id TEXT PRIMARY KEY, month INTEGER NOT NULL, day INTEGER NOT NULL, year INTEGER, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT, significance INTEGER DEFAULT 5, source TEXT, "isLocal" BOOLEAN DEFAULT false, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "StockAlert" (id TEXT PRIMARY KEY, ticker TEXT NOT NULL, "companyName" TEXT NOT NULL, "changePercent" DOUBLE PRECISION NOT NULL, price DOUBLE PRECISION NOT NULL, "previousClose" DOUBLE PRECISION NOT NULL, direction TEXT NOT NULL, magnitude TEXT NOT NULL, headline TEXT, "storyId" TEXT, "detectedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "StoryEditSession" (id TEXT PRIMARY KEY, "storyId" TEXT NOT NULL, "userId" TEXT NOT NULL, "isActive" BOOLEAN DEFAULT true, "lastHeartbeat" TIMESTAMPTZ DEFAULT NOW(), cursor JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "AccountStory" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "baseStoryId" TEXT NOT NULL, "editedTitle" TEXT, "editedSummary" TEXT, notes TEXT, "editedBy" TEXT, "editedAt" TIMESTAMPTZ, "accountStatus" TEXT DEFAULT 'INBOX', "assignedTo" TEXT, "assignedAt" TIMESTAMPTZ, "coveredAt" TIMESTAMPTZ, "coverageFeedId" TEXT, "aiDrafts" JSONB, "aiScripts" JSONB, "aiVideos" JSONB, research JSONB, tags JSONB, "lastSyncedAt" TIMESTAMPTZ DEFAULT NOW(), "baseSnapshotAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE("accountId", "baseStoryId"))`,
      `CREATE INDEX IF NOT EXISTS "AccountStory_accountId_accountStatus_idx" ON "AccountStory"("accountId", "accountStatus")`,
      `CREATE INDEX IF NOT EXISTS "AccountStory_baseStoryId_idx" ON "AccountStory"("baseStoryId")`,
      `CREATE INDEX IF NOT EXISTS "AccountStory_assignedTo_idx" ON "AccountStory"("assignedTo")`,
      `CREATE TABLE IF NOT EXISTS "SourceMarket" (id TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL, "marketId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE("sourceId", "marketId"))`,
      `CREATE INDEX IF NOT EXISTS "SourceMarket_sourceId_idx" ON "SourceMarket"("sourceId")`,
      `CREATE INDEX IF NOT EXISTS "SourceMarket_marketId_idx" ON "SourceMarket"("marketId")`,
      // Moderation words (blacklist + flag)
      `CREATE TABLE IF NOT EXISTS "ModerationWord" (id TEXT PRIMARY KEY, word TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'flag', "createdAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE(word, type))`,
      // Merge phrases
      `CREATE TABLE IF NOT EXISTS "MergePhrase" (id TEXT PRIMARY KEY, phrase TEXT NOT NULL UNIQUE, action TEXT DEFAULT 'merge', notes TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      // Surveys
      `CREATE TABLE IF NOT EXISTS "Survey" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, title TEXT NOT NULL, questions JSONB NOT NULL, "targetGroup" TEXT DEFAULT 'all', "isActive" BOOLEAN DEFAULT true, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS "SurveyResponse" (id TEXT PRIMARY KEY, "surveyId" TEXT NOT NULL, "userId" TEXT, answers JSONB NOT NULL, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      // User Views (server-side persisted, per user)
      `CREATE TABLE IF NOT EXISTS "UserView" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, name TEXT NOT NULL, columns JSONB, filters JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "UserView_userId_idx" ON "UserView"("userId")`,
      // View Email Subscriptions
      `CREATE TABLE IF NOT EXISTS "ViewSubscription" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "viewId" TEXT NOT NULL, email TEXT NOT NULL, frequency TEXT NOT NULL DEFAULT 'DAILY', "maxStories" INTEGER DEFAULT 20, timezone TEXT DEFAULT 'America/Chicago', "isActive" BOOLEAN DEFAULT true, "lastSentAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE("userId", "viewId"))`,
      `CREATE INDEX IF NOT EXISTS "ViewSubscription_userId_idx" ON "ViewSubscription"("userId")`,
      // System Knowledge (RAG for AI)
      `CREATE TABLE IF NOT EXISTS "SystemKnowledge" (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, content TEXT NOT NULL, category TEXT DEFAULT 'general', "updatedBy" TEXT, "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      // Editorial Workflow
      `CREATE TABLE IF NOT EXISTS "WorkflowStage" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, "order" INTEGER NOT NULL, color TEXT DEFAULT '#6B7280', icon TEXT, "requiredRole" TEXT DEFAULT 'VIEWER', "isInitial" BOOLEAN DEFAULT false, "isFinal" BOOLEAN DEFAULT false, "autoActions" JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE("accountId", slug))`,
      `CREATE INDEX IF NOT EXISTS "WorkflowStage_accountId_order_idx" ON "WorkflowStage"("accountId", "order")`,
      `CREATE TABLE IF NOT EXISTS "PublishedContent" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "accountStoryId" TEXT NOT NULL, platform TEXT NOT NULL, "externalId" TEXT, "externalUrl" TEXT, "contentType" TEXT DEFAULT 'article', content JSONB, status TEXT DEFAULT 'PENDING', "scheduledFor" TIMESTAMPTZ, "publishedAt" TIMESTAMPTZ, error TEXT, metadata JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "PublishedContent_accountId_status_idx" ON "PublishedContent"("accountId", status)`,
      `CREATE INDEX IF NOT EXISTS "PublishedContent_accountStoryId_idx" ON "PublishedContent"("accountStoryId")`,
      `CREATE INDEX IF NOT EXISTS "PublishedContent_platform_idx" ON "PublishedContent"(platform)`,
      `CREATE TABLE IF NOT EXISTS "AudioSpot" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "accountStoryId" TEXT NOT NULL, title TEXT NOT NULL, script TEXT NOT NULL, "voiceId" TEXT DEFAULT 'alloy', format TEXT DEFAULT '30s', "audioUrl" TEXT, "audioBase64" TEXT, "durationMs" INTEGER, model TEXT DEFAULT 'tts-1', status TEXT DEFAULT 'PENDING', error TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "AudioSpot_accountStoryId_idx" ON "AudioSpot"("accountStoryId")`,
      `CREATE INDEX IF NOT EXISTS "AudioSpot_accountId_idx" ON "AudioSpot"("accountId")`,
      `CREATE TABLE IF NOT EXISTS "EditorialComment" (id TEXT PRIMARY KEY, "accountStoryId" TEXT NOT NULL, "userId" TEXT NOT NULL, content TEXT NOT NULL, action TEXT, "fromStage" TEXT, "toStage" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "EditorialComment_accountStoryId_createdAt_idx" ON "EditorialComment"("accountStoryId", "createdAt")`,
    ];

    let created = 0;
    for (const sql of createStatements) {
      try {
        await prisma.$executeRawUnsafe(sql);
        created++;
      } catch (e: any) {
        console.error(`[db-sync] Failed: ${sql.substring(0, 60)}... — ${e.message?.substring(0, 80)}`);
      }
    }
    console.log(`[db-sync] Created ${created}/${createStatements.length} tables`);
  }

  // Try to enable pgvector extension (non-fatal if not available)
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[db-sync] pgvector extension enabled');

    // Add vector columns if they don't exist
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SourcePost' AND column_name = 'embedding') THEN
          ALTER TABLE "SourcePost" ADD COLUMN "embedding" vector(1536);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Story' AND column_name = 'embedding') THEN
          ALTER TABLE "Story" ADD COLUMN "embedding" vector(1536);
        END IF;
      END $$;
    `);
    console.log('[db-sync] Vector columns ensured');
  } catch (err: any) {
    console.log(`[db-sync] pgvector not available (OK): ${err.message?.substring(0, 80)}`);
  }
}

// ─── Backend-side auto-poll scheduler ───────────────────────────────────────
// Ensures ingestion jobs are always enqueued even if the worker is restarting.
// The worker processes jobs; we just make sure the queues have work.

async function startBackendScheduler() {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.log('[scheduler] No REDIS_URL — skipping auto-poll');
    return;
  }

  let connection: InstanceType<typeof IORedis>;
  try {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    await connection.ping();
    console.log('[scheduler] Redis connected for auto-poll');
  } catch (err: any) {
    console.error(`[scheduler] Redis connect failed: ${err.message}`);
    return;
  }

  // ── Enqueue RSS/API source polls ─────────────────────────────────────
  async function enqueueSourcePolls() {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const sources = await prisma.source.findMany({
        where: {
          isActive: true,
          platform: { in: ['RSS', 'NEWSAPI', 'TWITTER', 'FACEBOOK'] as any[] },
          OR: [
            { lastPolledAt: null },
            { lastPolledAt: { lt: fiveMinAgo } },
          ],
        },
        orderBy: { lastPolledAt: 'asc' },
        take: 50,
        include: { market: true },
      });

      if (sources.length === 0) {
        console.log('[scheduler] No overdue sources to poll');
        return;
      }

      console.log(`[scheduler] Found ${sources.length} overdue sources, enqueuing...`);
      const queue = new Queue('ingestion', { connection });
      let queued = 0;
      for (const source of sources) {
        const platform = source.platform as string;
        let jobName = 'rss_poll';
        let jobData: Record<string, any> = { type: 'rss_poll', sourceId: source.id, feedUrl: source.url };

        if (platform === 'NEWSAPI') {
          jobName = 'newsapi_poll';
          const meta = source.metadata as Record<string, any> | null;
          jobData = { type: 'newsapi_poll', sourceId: source.id, query: meta?.query || 'Houston Texas' };
        } else if (platform === 'TWITTER') {
          jobName = 'twitter_poll';
          const meta = source.metadata as Record<string, any> | null;
          jobData = { type: 'twitter_poll', sourceId: source.id, query: meta?.query || source.url || '' };
        } else if (platform === 'FACEBOOK') {
          jobName = 'facebook_page_poll';
          const meta = source.metadata as Record<string, any> | null;
          const token = (meta?.accessToken as string) || process.env['FACEBOOK_ACCESS_TOKEN'] || '';
          if (!source.platformId || !token) continue;
          jobData = { type: 'facebook_page_poll', sourceId: source.id, pageId: source.platformId, accessToken: token };
        } else if (!source.url) {
          continue;
        }

        try {
          await queue.add(jobName, jobData, {
            jobId: `auto-${platform.toLowerCase()}-${source.id}-${Date.now()}`,
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: { age: 3600 },
          });
          queued++;
        } catch (e: any) {
          // Log but don't crash
          if (!e.message?.includes('exists')) {
            console.error(`[scheduler] Failed to enqueue ${jobName} for ${source.id}: ${e.message}`);
          }
        }
      }
      await queue.close();
      if (queued > 0) console.log(`[scheduler] Enqueued ${queued} source poll jobs`);
    } catch (err: any) {
      console.error(`[scheduler] Source poll error: ${err.message}`);
    }
  }

  // ── Enqueue LLM polls ────────────────────────────────────────────────
  async function enqueueLLMPolls() {
    try {
      const llmSources = await prisma.source.findMany({
        where: {
          platform: { in: ['LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI'] as any[] },
          isActive: true,
        },
        include: { market: true },
      });
      if (llmSources.length === 0) return;

      const envKeyMap: Record<string, string> = {
        LLM_OPENAI: 'OPENAI_API_KEY',
        LLM_CLAUDE: 'ANTHROPIC_API_KEY',
        LLM_GROK: 'XAI_API_KEY',
        LLM_GEMINI: 'GOOGLE_AI_KEY',
      };

      const queue = new Queue('llm-ingestion', { connection });
      let queued = 0;
      for (const source of llmSources) {
        const apiKey = process.env[envKeyMap[source.platform as string] || ''];
        if (!apiKey) continue;
        const marketKeywords = source.market?.keywords as string[] | null;

        try {
          await queue.add('llm_poll', {
            type: 'llm_poll',
            sourceId: source.id,
            platform: source.platform,
            marketName: source.market?.name || null,
            marketKeywords: marketKeywords || [],
            apiKey,
          }, {
            jobId: `auto-llm-${source.id}-${Date.now()}`,
            attempts: 2,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: true,
            removeOnFail: { age: 3600 },
          });
          queued++;
        } catch (e: any) {
          if (!e.message?.includes('exists')) {
            console.error(`[scheduler] Failed to enqueue LLM poll for ${source.id}: ${e.message}`);
          }
        }
      }
      await queue.close();
      if (queued > 0) console.log(`[scheduler] Enqueued ${queued} LLM poll jobs`);
    } catch (err: any) {
      console.error(`[scheduler] LLM poll error: ${err.message}`);
    }
  }

  // ── Enqueue score decay ──────────────────────────────────────────────
  async function enqueueScoreDecay() {
    try {
      const stories = await prisma.story.findMany({
        where: { status: { notIn: ['ARCHIVED', 'STALE'] as any[] } },
        select: { id: true },
      });
      if (stories.length === 0) return;

      const queue = new Queue('scoring', { connection });
      for (const story of stories) {
        try {
          await queue.add('score', { storyId: story.id }, {
            jobId: `decay-${story.id}-${Date.now()}`,
            attempts: 2,
            removeOnComplete: true,
            removeOnFail: { age: 3600 },
          });
        } catch { /* dedup */ }
      }
      await queue.close();
    } catch (err: any) {
      console.error(`[scheduler] Score decay error: ${err.message}`);
    }
  }

  // ── Schedule ─────────────────────────────────────────────────────────
  console.log('[scheduler] Starting backend auto-poll (RSS/API/LLM every 5m, scoring every 10m)');

  // Run all immediately on startup (staggered to avoid thundering herd)
  setTimeout(() => void enqueueSourcePolls(), 3_000);
  setTimeout(() => void enqueueLLMPolls(), 8_000);
  setTimeout(() => void enqueueScoreDecay(), 15_000);

  // Then repeat on intervals
  setInterval(() => void enqueueSourcePolls(), 5 * 60 * 1000);
  setInterval(() => void enqueueLLMPolls(), 10 * 60 * 1000);
  setInterval(() => void enqueueScoreDecay(), 10 * 60 * 1000);
}

async function main() {
  const app = await buildServer();

  // Ensure all database tables exist before starting
  await ensureTables();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);
    app.log.info(`Swagger docs available at http://${HOST}:${PORT}/docs`);

    // Start backend-side auto-poll after server is ready
    startBackendScheduler().catch((err) => {
      console.error('[scheduler] FATAL: startBackendScheduler crashed:', err);
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
