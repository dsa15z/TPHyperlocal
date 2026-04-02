// @ts-nocheck
import { Queue } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('scheduler');

const ACTIVITY_KEY = 'tp:last_ui_activity';
const IDLE_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes — stops ~1 min after browser closes

/**
 * Check if the UI has been active recently.
 * Workers skip polling when no users are watching to save API costs.
 * Returns true if UI is active or if Redis is unavailable (fail-open).
 */
async function isUIActive(): Promise<boolean> {
  try {
    const connection = getSharedConnection();
    const lastActivity = await connection.get(ACTIVITY_KEY);
    if (!lastActivity) return false; // No heartbeat ever recorded
    const idleMs = Date.now() - parseInt(lastActivity, 10);
    return idleMs < IDLE_THRESHOLD_MS;
  } catch {
    return true; // Fail-open: if Redis is down, assume active
  }
}

let ingestionQueue: Queue;
let scoringQueue: Queue;
let llmIngestionQueue: Queue;
let articleExtractionQueue: Queue;
let geocodingQueue: Queue;
let embeddingsQueue: Queue;
let summarizationQueue: Queue;
let sentimentQueue: Queue;
let credibilityQueue: Queue;
let digestQueue: Queue;
let newscatcherQueue: Queue;
let hyperLocalIntelQueue: Queue;

/**
 * Initialize BullMQ queues used by the scheduler
 */
function getQueues() {
  const connection = getSharedConnection();

  if (!ingestionQueue) {
    ingestionQueue = new Queue('ingestion', { connection });
  }
  if (!scoringQueue) {
    scoringQueue = new Queue('scoring', { connection });
  }
  if (!llmIngestionQueue) {
    llmIngestionQueue = new Queue('llm-ingestion', { connection });
  }
  if (!articleExtractionQueue) {
    articleExtractionQueue = new Queue('article-extraction', { connection });
  }
  if (!geocodingQueue) {
    geocodingQueue = new Queue('geocoding', { connection });
  }
  if (!embeddingsQueue) {
    embeddingsQueue = new Queue('embeddings', { connection });
  }
  if (!summarizationQueue) {
    summarizationQueue = new Queue('summarization', { connection });
  }
  if (!sentimentQueue) {
    sentimentQueue = new Queue('sentiment', { connection });
  }
  if (!credibilityQueue) {
    credibilityQueue = new Queue('credibility', { connection });
  }
  if (!digestQueue) {
    digestQueue = new Queue('digest', { connection });
  }
  if (!newscatcherQueue) {
    newscatcherQueue = new Queue('newscatcher', { connection });
  }

  return {
    ingestionQueue,
    scoringQueue,
    llmIngestionQueue,
    articleExtractionQueue,
    geocodingQueue,
    embeddingsQueue,
    summarizationQueue,
    sentimentQueue,
    credibilityQueue,
    digestQueue,
    newscatcherQueue,
  };
}

/**
 * Schedule RSS feed polling jobs for active RSS sources.
 * National/global RSS sources poll ALWAYS (even when UI is idle) so free teaser
 * users always have fresh content. Local-market sources only poll when UI is active.
 */
async function scheduleRSSPolls(): Promise<void> {
  const uiActive = await isUIActive();

  const { ingestionQueue } = getQueues();

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find the National market ID
    const nationalMarket = await prisma.market.findFirst({
      where: { name: { contains: 'National', mode: 'insensitive' } },
      select: { id: true },
    });
    const nationalMarketId = nationalMarket?.id;

    // Find markets that have at least one active account
    const activeMarketIds = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true },
    }).then(markets => markets.map(m => m.id));

    // Build source filter — always include national/global, only include local when UI active
    const sourceConditions: any[] = [
      // Global sources (legacy flag) — always poll
      { isGlobal: true },
      // Sources with no market link (unlinked/legacy) — always poll
      { marketId: null },
    ];

    // National market sources — always poll (keeps teaser fresh)
    if (nationalMarketId) {
      sourceConditions.push({
        sourceMarkets: { some: { marketId: nationalMarketId } },
      });
    }

    // Local market sources — only when UI is active
    if (uiActive) {
      sourceConditions.push({
        marketId: { in: activeMarketIds },
      });
    } else {
      logger.debug('UI idle — polling national RSS only (local sources paused)');
    }

    const rssSources = await prisma.source.findMany({
      where: {
        platform: 'RSS',
        isActive: true,
        OR: sourceConditions,
        AND: [
          {
            OR: [
              { lastPolledAt: null },
              { lastPolledAt: { lt: fiveMinAgo } },
            ],
          },
        ],
      },
      orderBy: { lastPolledAt: 'asc' },
      take: 50,
    });

    if (rssSources.length === 0) return;

    logger.info({ count: rssSources.length }, 'Scheduling RSS poll jobs (staggered)');

    let queued = 0;
    for (const source of rssSources) {
      if (!source.url) continue;

      const jobId = `rss-poll-${source.id}`;
      try {
        await ingestionQueue.add(
          'rss_poll',
          {
            type: 'rss_poll',
            sourceId: source.id,
            feedUrl: source.url,
          },
          {
            jobId,
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 1800 },
            removeOnFail: { age: 3600 },
          }
        );
        queued++;
      } catch {
        // Job already exists
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule RSS polls');
  }
}

/**
 * Schedule NewsAPI polling jobs for all active NewsAPI sources
 */
async function scheduleNewsAPIPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleNewsAPIPolls'); return; }
  const { ingestionQueue } = getQueues();

  try {
    const newsapiSources = await prisma.source.findMany({
      where: {
        platform: 'NEWSAPI',
        isActive: true,
      },
    });

    logger.info({ count: newsapiSources.length }, 'Scheduling NewsAPI poll jobs');

    for (const source of newsapiSources) {
      const metadata = source.metadata as Record<string, unknown> | null;

      await ingestionQueue.add(
        'newsapi_poll',
        {
          type: 'newsapi_poll',
          sourceId: source.id,
          query: (metadata?.['query'] as string) || 'Houston Texas',
        },
        {
          jobId: `newsapi-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule NewsAPI polls');
  }
}

/**
 * Schedule Facebook Page polling jobs for all active Facebook sources
 */
async function scheduleFacebookPagePolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleFacebookPagePolls'); return; }
  const { ingestionQueue } = getQueues();

  try {
    const fbSources = await prisma.source.findMany({
      where: {
        platform: 'FACEBOOK',
        isActive: true,
      },
    });

    logger.info({ count: fbSources.length }, 'Scheduling Facebook page poll jobs');

    for (const source of fbSources) {
      if (!source.platformId) {
        logger.warn({ sourceId: source.id, name: source.name }, 'Facebook source has no platformId, skipping');
        continue;
      }

      const metadata = source.metadata as Record<string, unknown> | null;
      const accessToken = (metadata?.['accessToken'] as string) || process.env['FACEBOOK_ACCESS_TOKEN'];

      if (!accessToken) {
        logger.warn({ sourceId: source.id }, 'No access token available for Facebook source');
        continue;
      }

      await ingestionQueue.add(
        'facebook_page_poll',
        {
          type: 'facebook_page_poll',
          sourceId: source.id,
          pageId: source.platformId,
          accessToken,
        },
        {
          jobId: `fb-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Facebook page polls');
  }
}

/**
 * Schedule Twitter/X polling jobs for all active Twitter sources
 */
async function scheduleTwitterPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleTwitterPolls'); return; }
  const { ingestionQueue } = getQueues();

  try {
    const twitterSources = await prisma.source.findMany({
      where: { platform: 'TWITTER', isActive: true },
    });

    logger.info({ count: twitterSources.length }, 'Scheduling Twitter poll jobs');

    for (const source of twitterSources) {
      const metadata = source.metadata as Record<string, unknown> | null;
      const query = (metadata?.['query'] as string) || source.url || '';
      if (!query) continue;

      await ingestionQueue.add(
        `twitter-poll-${source.id}-${Date.now()}`,
        { type: 'twitter_poll', sourceId: source.id, query },
        {
          jobId: `twitter-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Twitter polls');
  }
}

/**
 * Schedule Newscatcher API polling jobs for all active Newscatcher sources.
 * If no NEWSCATCHER sources exist but the API key is set, looks for sources
 * with platform='API' whose URL contains 'newscatcher'.
 * Runs every 10 minutes.
 */
async function scheduleNewscatcherPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleNewscatcherPolls'); return; }
  const { newscatcherQueue } = getQueues();

  const apiKey = process.env['NEWSCATCHER_API_KEY'];
  if (!apiKey) {
    return; // No API key, skip silently
  }

  try {
    // First try platform = 'NEWSCATCHER'
    let sources = await prisma.source.findMany({
      where: {
        platform: 'NEWSCATCHER',
        isActive: true,
      },
      include: { market: true },
    });

    // Fallback: look for API sources with 'newscatcher' in the URL
    if (sources.length === 0) {
      sources = await prisma.source.findMany({
        where: {
          platform: 'API',
          isActive: true,
          url: { contains: 'newscatcher' },
        },
        include: { market: true },
      });
    }

    if (sources.length === 0) {
      logger.debug('No Newscatcher sources found, skipping poll');
      return;
    }

    logger.info({ count: sources.length }, 'Scheduling Newscatcher poll jobs');

    for (const source of sources) {
      const metadata = source.metadata as Record<string, unknown> | null;
      const marketKeywords = source.market?.keywords as string[] | null;
      const query = (metadata?.['query'] as string) || (marketKeywords ? marketKeywords.slice(0, 5).join(' ') : 'Houston Texas');
      const market = source.market?.name || (metadata?.['market'] as string) || undefined;

      await newscatcherQueue.add(
        'newscatcher_poll',
        {
          sourceId: source.id,
          query,
          market,
        },
        {
          jobId: `newscatcher-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Newscatcher polls');
  }
}

/**
 * Schedule stock price monitoring (runs during market hours)
 */
async function scheduleStockMonitor(): Promise<void> {
  try {
    const connection = getSharedConnection();
    const stockQueue = new Queue('stock-monitor', { connection });
    await stockQueue.add('stock-check', {}, {
      jobId: `stock-check-${Date.now()}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });
    await stockQueue.close();
    logger.info('Scheduled stock monitor check');
  } catch (err) {
    logger.error({ err }, 'Failed to schedule stock monitor');
  }
}

/**
 * Schedule LLM polling jobs for all active LLM sources
 */
async function scheduleLLMPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleLLMPolls'); return; }
  const { llmIngestionQueue } = getQueues();

  try {
    const llmSources = await prisma.source.findMany({
      where: {
        platform: { in: ['LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI'] },
        isActive: true,
      },
      include: {
        market: true,
      },
    });

    logger.info({ count: llmSources.length }, 'Scheduling LLM poll jobs');

    for (const source of llmSources) {
      // Find the matching AccountCredential for this platform
      const credential = await prisma.accountCredential.findFirst({
        where: {
          platform: source.platform,
          isActive: true,
        },
      });

      // Fall back to env vars if no credential found
      const envKeyMap: Record<string, string> = {
        'LLM_OPENAI': 'OPENAI_API_KEY',
        'LLM_CLAUDE': 'ANTHROPIC_API_KEY',
        'LLM_GROK': 'XAI_API_KEY',
        'LLM_GEMINI': 'GOOGLE_AI_KEY',
      };
      const apiKey = credential?.apiKey || process.env[envKeyMap[source.platform] || ''];

      if (!apiKey) {
        logger.warn({ sourceId: source.id, platform: source.platform }, 'No API key found for LLM source, skipping');
        continue;
      }

      const marketKeywords = source.market?.keywords as string[] | null;

      await llmIngestionQueue.add(
        'llm_poll',
        {
          type: 'llm_poll',
          sourceId: source.id,
          platform: source.platform,
          marketName: source.market?.name || null,
          marketKeywords: marketKeywords || [],
          apiKey,
        },
        {
          jobId: `llm-poll-${source.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule LLM polls');
  }
}

/**
 * Schedule article extraction jobs for posts with URLs but no extracted text
 */
async function scheduleArticleExtractions(): Promise<void> {
  const { articleExtractionQueue } = getQueues();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const posts = await prisma.sourcePost.findMany({
      where: {
        url: { not: null },
        fullArticleText: null,
        createdAt: { gte: oneHourAgo },
      },
      select: { id: true, url: true },
    });

    logger.info({ count: posts.length }, 'Scheduling article extraction jobs');

    for (const post of posts) {
      await articleExtractionQueue.add(
        'extract_article',
        {
          type: 'extract_article',
          sourcePostId: post.id,
          url: post.url,
        },
        {
          jobId: `article-extract-${post.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule article extractions');
  }
}

/**
 * Schedule geocoding jobs for stories with location names but no coordinates
 */
async function scheduleGeocodingJobs(): Promise<void> {
  const { geocodingQueue } = getQueues();

  try {
    const stories = await prisma.story.findMany({
      where: {
        OR: [
          { locationName: { not: null } },
          { neighborhood: { not: null } },
        ],
        latitude: null,
        geocodedAt: null,
      },
      select: { id: true, locationName: true, neighborhood: true },
    });

    logger.info({ count: stories.length }, 'Scheduling geocoding jobs');

    for (const story of stories) {
      await geocodingQueue.add(
        'geocode_story',
        {
          type: 'geocode_story',
          storyId: story.id,
          locationName: story.locationName,
          neighborhood: story.neighborhood,
        },
        {
          jobId: `geocode-${story.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule geocoding jobs');
  }
}

/**
 * Schedule embedding generation jobs for recent posts and stories
 */
async function scheduleEmbeddingJobs(): Promise<void> {
  const { embeddingsQueue } = getQueues();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find source posts from the last hour that don't have embeddings yet
    const posts = await prisma.sourcePost.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        content: { not: '' },
        embeddingJson: null,
      },
      select: { id: true },
    });

    logger.info({ count: posts.length }, 'Scheduling source post embedding jobs');

    for (const post of posts) {
      await embeddingsQueue.add(
        'embed_post',
        {
          type: 'embed_post',
          sourcePostId: post.id,
        },
        {
          jobId: `embed-post-${post.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }

    // Find stories updated in the last hour
    const stories = await prisma.story.findMany({
      where: {
        updatedAt: { gte: oneHourAgo },
      },
      select: { id: true },
    });

    logger.info({ count: stories.length }, 'Scheduling story embedding jobs');

    for (const story of stories) {
      await embeddingsQueue.add(
        'embed_story',
        {
          type: 'embed_story',
          storyId: story.id,
        },
        {
          jobId: `embed-story-${story.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule embedding jobs');
  }
}

/**
 * Schedule summarization jobs for stories with enough sources but no summary
 */
async function scheduleSummarizationJobs(): Promise<void> {
  const { summarizationQueue } = getQueues();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const stories = await prisma.story.findMany({
      where: {
        sourceCount: { gte: 3 },
        OR: [
          { aiSummary: null },
          { aiSummaryAt: { lt: oneHourAgo } },
        ],
      },
      select: { id: true, sourceCount: true },
    });

    logger.info({ count: stories.length }, 'Scheduling summarization jobs');

    for (const story of stories) {
      await summarizationQueue.add(
        'summarize_story',
        {
          type: 'summarize_story',
          storyId: story.id,
        },
        {
          jobId: `summarize-${story.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule summarization jobs');
  }
}

/**
 * Schedule sentiment analysis jobs for recent posts without sentiment scores
 */
async function scheduleSentimentJobs(): Promise<void> {
  const { sentimentQueue } = getQueues();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const posts = await prisma.sourcePost.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        sentimentScore: null,
      },
      select: { id: true },
    });

    logger.info({ count: posts.length }, 'Scheduling sentiment analysis jobs');

    for (const post of posts) {
      await sentimentQueue.add(
        'analyze_sentiment',
        {
          type: 'analyze_sentiment',
          sourcePostId: post.id,
        },
        {
          jobId: `sentiment-${post.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule sentiment jobs');
  }
}

/**
 * Schedule credibility score updates for all active sources (daily)
 */
async function scheduleCredibilityUpdates(): Promise<void> {
  const { credibilityQueue } = getQueues();

  try {
    const sources = await prisma.source.findMany({
      where: {
        isActive: true,
      },
      select: { id: true, name: true },
    });

    logger.info({ count: sources.length }, 'Scheduling credibility update jobs');

    for (const source of sources) {
      await credibilityQueue.add(
        'update_credibility',
        {
          type: 'update_credibility',
          sourceId: source.id,
        },
        {
          jobId: `credibility-${source.id}-${Date.now()}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule credibility updates');
  }
}

/**
 * Schedule digest email jobs for subscriptions that are due
 */
async function scheduleDigests(): Promise<void> {
  const { digestQueue } = getQueues();

  try {
    const now = new Date();

    const subscriptions = await prisma.digestSubscription.findMany({
      where: {
        isActive: true,
      },
    });

    // Filter to only subscriptions that are due based on frequency and lastSentAt
    const dueSubscriptions = subscriptions.filter((sub) => {
      if (!sub.lastSentAt) return true; // Never sent, so it's due

      const lastSent = sub.lastSentAt.getTime();
      const elapsed = now.getTime() - lastSent;

      switch (sub.frequency) {
        case 'HOURLY':
          return elapsed >= 60 * 60 * 1000; // 1 hour
        case 'TWICE_DAILY':
          return elapsed >= 12 * 60 * 60 * 1000; // 12 hours
        case 'DAILY':
          return elapsed >= 24 * 60 * 60 * 1000; // 24 hours
        case 'WEEKLY':
          return elapsed >= 7 * 24 * 60 * 60 * 1000; // 7 days
        default:
          return false;
      }
    });

    logger.info({ count: dueSubscriptions.length, total: subscriptions.length }, 'Scheduling digest jobs');

    for (const sub of dueSubscriptions) {
      await digestQueue.add(
        'send_digest',
        {
          type: 'send_digest',
          subscriptionId: sub.id,
          accountId: sub.accountId,
          userId: sub.userId,
          email: sub.email,
          frequency: sub.frequency,
          timezone: sub.timezone,
          filters: sub.filters,
        },
        {
          jobId: `digest-${sub.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule digests');
  }
}

/**
 * Re-score all non-archived stories to apply score decay
 */
async function runScoreDecay(): Promise<void> {
  const { scoringQueue } = getQueues();

  try {
    const activeStories = await prisma.story.findMany({
      where: {
        status: { notIn: ['ARCHIVED', 'STALE'] },
      },
      select: { id: true },
    });

    logger.info({ count: activeStories.length }, 'Scheduling score decay re-scoring');

    for (const story of activeStories) {
      await scoringQueue.add(
        'score',
        { storyId: story.id },
        {
          jobId: `decay-score-${story.id}-${Date.now()}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 1800 },
          removeOnFail: { age: 3600 },
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to run score decay');
  }
}

/**
 * Archive stories older than 72 hours with no recent activity
 */
async function runCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago

    const result = await prisma.story.updateMany({
      where: {
        status: { notIn: ['ARCHIVED'] },
        lastUpdatedAt: { lt: cutoff },
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    logger.info({ archivedCount: result.count }, 'Cleanup complete: archived old stories');
  } catch (err) {
    logger.error({ err }, 'Failed to run cleanup');
  }
}

/**
 * Fast-poll Grok specifically for real-time X/Twitter intelligence.
 * Grok has live access to X data, making it uniquely valuable for breaking news.
 * Runs every 5 minutes (vs 10 min for other LLMs).
 */
async function scheduleGrokFastPoll(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleGrokFastPoll'); return; }
  const { llmIngestionQueue } = getQueues();

  try {
    // Find all active Grok sources with their linked markets (via SourceMarket join table)
    const grokSources = await prisma.source.findMany({
      where: {
        platform: 'LLM_GROK',
        isActive: true,
      },
      include: {
        market: true,
        sourceMarkets: {
          include: { market: { select: { id: true, name: true, state: true, keywords: true } } },
        },
      },
    });

    if (grokSources.length === 0) return;

    const apiKey = process.env['XAI_API_KEY'];
    if (!apiKey) return;

    // Consolidate: gather all unique markets across all Grok sources
    const marketMap = new Map<string, { name: string; state: string | null; keywords: string[] }>();
    const sourceIds: string[] = [];

    for (const source of grokSources) {
      sourceIds.push(source.id);
      // Markets from SourceMarket join table
      for (const sm of (source as any).sourceMarkets || []) {
        if (sm.market && !marketMap.has(sm.market.id)) {
          marketMap.set(sm.market.id, {
            name: sm.market.name,
            state: sm.market.state,
            keywords: (sm.market.keywords as string[]) || [],
          });
        }
      }
      // Legacy direct market link
      if (source.market && !marketMap.has(source.market.id)) {
        marketMap.set(source.market.id, {
          name: source.market.name,
          state: (source.market as any).state,
          keywords: (source.market.keywords as string[]) || [],
        });
      }
    }

    // Build a combined market list for the prompt
    const markets = Array.from(marketMap.values());
    const marketNames = markets.map(m => m.state ? `${m.name}, ${m.state}` : m.name);
    const allKeywords = [...new Set(markets.flatMap(m => m.keywords))].slice(0, 30);

    // Single consolidated API call covering all markets
    await llmIngestionQueue.add(
      'llm_poll',
      {
        type: 'llm_poll',
        sourceId: sourceIds[0], // Primary source ID for tracking
        platform: 'LLM_GROK',
        marketName: marketNames.length <= 3
          ? marketNames.join(', ')
          : `${marketNames.length} US markets: ${marketNames.slice(0, 5).join(', ')} and ${marketNames.length - 5} more`,
        marketKeywords: allKeywords.length > 0 ? allKeywords : [
          'crime', 'shooting', 'accident', 'fire', 'weather', 'flood',
          'traffic', 'police', 'breaking news',
        ],
        // Pass all market names so the LLM prompt can reference them
        allMarkets: marketNames,
        apiKey,
      },
      {
        jobId: `grok-consolidated-${Date.now()}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 1800 },
        removeOnFail: { age: 3600 },
      }
    );

    logger.info({ marketCount: marketNames.length, sourceCount: grokSources.length }, 'Scheduled consolidated Grok poll');
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Grok fast poll');
  }
}

/**
 * Schedule dynamic Bing/Google News polls for multi-market sources.
 * A single "Bing News" or "Google News Local" source linked to multiple markets
 * gets expanded into per-market RSS polls using dynamically generated URLs.
 *
 * URL patterns:
 *   Bing:   https://www.bing.com/news/search?q={city}+{state}+news&format=rss
 *   Google: https://news.google.com/rss/search?q={city}+{state}+local+news&hl=en-US
 */
async function scheduleDynamicNewsPoll(): Promise<void> {
  const { ingestionQueue } = getQueues();

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find sources that look like multi-market news aggregators
    // These have "Bing" or "Google News" in their name and are linked to multiple markets
    const dynamicSources = await prisma.source.findMany({
      where: {
        platform: 'RSS',
        isActive: true,
        name: {
          contains: 'Bing',
          mode: 'insensitive',
        },
        OR: [
          { lastPolledAt: null },
          { lastPolledAt: { lt: fiveMinAgo } },
        ],
      },
      include: {
        sourceMarkets: {
          include: { market: { select: { id: true, name: true, state: true, isActive: true } } },
        },
      },
    });

    // Also find Google News sources
    const googleSources = await prisma.source.findMany({
      where: {
        platform: 'RSS',
        isActive: true,
        name: {
          contains: 'Google News',
          mode: 'insensitive',
        },
        OR: [
          { lastPolledAt: null },
          { lastPolledAt: { lt: fiveMinAgo } },
        ],
      },
      include: {
        sourceMarkets: {
          include: { market: { select: { id: true, name: true, state: true, isActive: true } } },
        },
      },
    });

    const allSources = [...dynamicSources, ...googleSources];

    let queued = 0;
    for (const source of allSources) {
      // Get all active markets this source is linked to
      const markets = ((source as any).sourceMarkets || [])
        .map((sm: any) => sm.market)
        .filter((m: any) => m && m.isActive);

      if (markets.length === 0) {
        // No markets linked — poll the URL as-is (legacy behavior)
        if (source.url) {
          const jobId = `rss-poll-${source.id}`;
          try {
            await ingestionQueue.add('rss_poll', {
              type: 'rss_poll',
              sourceId: source.id,
              feedUrl: source.url,
            }, {
              jobId,
              attempts: 2,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: { age: 1800 },
              removeOnFail: { age: 3600 },
            });
            queued++;
          } catch { /* job exists */ }
        }
        continue;
      }

      // Generate a per-market URL for each linked market
      const isBing = source.name.toLowerCase().includes('bing');
      for (const market of markets) {
        const cityState = market.state
          ? `${market.name}+${market.state}`
          : market.name;
        const encoded = encodeURIComponent(cityState.replace(/\s+/g, '+'));

        const feedUrl = isBing
          ? `https://www.bing.com/news/search?q=${encoded}+news&format=rss`
          : `https://news.google.com/rss/search?q=${encoded}+local+news&hl=en-US&gl=US&ceid=US:en`;

        const jobId = `dynamic-rss-${source.id}-${market.id}`;
        try {
          await ingestionQueue.add('rss_poll', {
            type: 'rss_poll',
            sourceId: source.id,
            feedUrl,
            marketHint: market.name, // Tell enrichment which market this came from
          }, {
            jobId,
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 1800 },
            removeOnFail: { age: 3600 },
          });
          queued++;
        } catch { /* job exists */ }
      }

      // Update lastPolledAt
      await prisma.source.update({
        where: { id: source.id },
        data: { lastPolledAt: new Date() },
      });
    }

    if (queued > 0) {
      logger.info({ sourceCount: allSources.length, queued }, 'Scheduled dynamic Bing/Google News polls');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to schedule dynamic news polls');
  }
}

/**
 * Schedule HyperLocal Intel batch lookup for all active markets.
 * Runs every 15 minutes — fetches curated news from 12 sources per market.
 */
async function scheduleHyperLocalIntelPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleHyperLocalIntelPolls'); return; }
  try {
    if (!hyperLocalIntelQueue) {
      hyperLocalIntelQueue = new Queue('hyperlocal-intel', { connection: getSharedConnection() });
    }

    // Get all active markets across all accounts
    const markets = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true, latitude: true, longitude: true, accountId: true },
    });

    if (markets.length === 0) return;

    // Group by account and queue batch jobs
    const accountIds = [...new Set(markets.map((m) => m.accountId))];

    for (const accountId of accountIds) {
      await hyperLocalIntelQueue.add('batch', {
        type: 'batch_markets',
        accountId,
      }, {
        jobId: `hyperlocal-batch-${accountId}-${Date.now()}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 15000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      });
    }

    logger.info({ accounts: accountIds.length, markets: markets.length }, 'Scheduled HyperLocal Intel batch polls');
  } catch (err) {
    logger.error({ err }, 'Failed to schedule HyperLocal Intel polls');
  }
}

/**
 * Schedule web scraper jobs for sources with sourceType containing 'SCRAPE'.
 * Scrapes websites that don't have RSS feeds for article links.
 * Runs every 30 minutes (be polite to scraped sites).
 */
async function scheduleWebScrapePolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleWebScrapePolls'); return; }
  try {
    const connection = getSharedConnection();
    const scraperQueue = new Queue('web-scraper', { connection });

    // Find sources marked for scraping via metadata
    const allSources = await prisma.source.findMany({
      where: { isActive: true },
    });

    // Filter to sources with scrapeSource: true in metadata
    const scrapeSources = allSources.filter((s) => {
      const meta = s.metadata as Record<string, unknown> | null;
      return meta?.scrapeSource === true || meta?.originalSourceType === 'SCRAPE';
    });

    if (scrapeSources.length === 0) {
      await scraperQueue.close();
      return;
    }

    for (const source of scrapeSources) {
      if (!source.url) continue;

      const metadata = (source.metadata || {}) as Record<string, unknown>;

      await scraperQueue.add('scrape', {
        sourceId: source.id,
        url: source.url,
        name: source.name,
        selector: metadata.cssSelector as string | undefined,
        baseUrl: metadata.baseUrl as string | undefined,
      }, {
        jobId: `scrape-${source.id}-${Date.now()}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      });
    }

    await scraperQueue.close();
    logger.info({ count: scrapeSources.length }, 'Scheduled web scrape jobs');
  } catch (err) {
    logger.error({ err }, 'Failed to schedule web scrape polls');
  }
}

/**
 * Schedule Event Registry polls for all active markets.
 * Runs every 15 minutes — searches for articles by market keywords.
 */
async function scheduleEventRegistryPolls(): Promise<void> {
  if (!(await isUIActive())) { logger.debug('UI idle — skipping scheduleEventRegistryPolls'); return; }
  const apiKey = process.env['EVENT_REGISTRY_KEY'] || process.env['EVENT_REGISTRY_API_KEY'];
  if (!apiKey) return; // No key, skip silently

  try {
    const connection = getSharedConnection();
    const erQueue = new Queue('event-registry', { connection });

    // Find sources with metadata.type = 'event-registry' or with platform containing event
    const markets = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true, state: true, keywords: true },
    });

    if (markets.length === 0) {
      await erQueue.close();
      return;
    }

    for (const market of markets) {
      const keywords = (market.keywords || []) as string[];
      const query = keywords.slice(0, 5).join(' ') || market.name;

      // Find an Event Registry source for this market (exact name match to prevent duplicates)
      const exactName = `Event Registry - ${market.name}`;
      let source = await prisma.source.findFirst({
        where: { name: exactName },
      });

      if (!source) {
        source = await prisma.source.create({
          data: {
            platform: 'NEWSAPI' as any,
            sourceType: 'API_PROVIDER' as any,
            name: exactName,
            url: 'https://eventregistry.org',
            marketId: market.id,
            trustScore: 0.85,
            isGlobal: false,
            metadata: { type: 'event-registry', query },
          },
        });
      }

      await erQueue.add('event-registry-poll', {
        sourceId: source.id,
        query,
        market: market.name,
      }, {
        jobId: `er-poll-${market.id}-${Date.now()}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: { age: 86400 },
      });
    }

    await erQueue.close();
    logger.info({ markets: markets.length }, 'Scheduled Event Registry polls');
  } catch (err) {
    logger.error({ err }, 'Failed to schedule Event Registry polls');
  }
}

// Interval handles for cleanup on shutdown
const intervals: NodeJS.Timeout[] = [];

/**
 * Set up all recurring scheduled jobs
 */
export function startSchedulers(): void {
  logger.info('Starting poll schedulers');

  // RSS feeds: every 5 minutes (was 2 — increased to prevent queue backlog)
  const rssInterval = setInterval(scheduleRSSPolls, 5 * 60 * 1000);
  intervals.push(rssInterval);

  // NewsAPI: every 3 minutes
  const newsapiInterval = setInterval(scheduleNewsAPIPolls, 3 * 60 * 1000);
  intervals.push(newsapiInterval);

  // Facebook Pages: every 5 minutes
  const fbInterval = setInterval(scheduleFacebookPagePolls, 5 * 60 * 1000);
  intervals.push(fbInterval);

  // Twitter/X: every 3 minutes
  const twitterInterval = setInterval(scheduleTwitterPolls, 3 * 60 * 1000);
  intervals.push(twitterInterval);

  // Stock monitor: every 30 minutes (during market hours)
  const stockInterval = setInterval(scheduleStockMonitor, 30 * 60 * 1000);
  intervals.push(stockInterval);

  // Score decay: every 10 minutes
  const decayInterval = setInterval(runScoreDecay, 10 * 60 * 1000);
  intervals.push(decayInterval);

  // Cleanup: every hour
  const cleanupInterval = setInterval(runCleanup, 60 * 60 * 1000);
  intervals.push(cleanupInterval);

  // LLM polls: every 10 minutes (Grok runs more frequently — see scheduleLLMPolls)
  const llmInterval = setInterval(scheduleLLMPolls, 10 * 60 * 1000);
  intervals.push(llmInterval);

  // Grok-specific fast poll: every 5 minutes (real-time X data is its advantage)
  const grokFastInterval = setInterval(scheduleGrokFastPoll, 5 * 60 * 1000);
  intervals.push(grokFastInterval);

  // Dynamic Bing/Google News: every 5 minutes (expands one source → N market polls)
  const dynamicNewsInterval = setInterval(scheduleDynamicNewsPoll, 5 * 60 * 1000);
  intervals.push(dynamicNewsInterval);

  // Article extraction: every 5 minutes
  const articleExtractionInterval = setInterval(scheduleArticleExtractions, 5 * 60 * 1000);
  intervals.push(articleExtractionInterval);

  // Geocoding: every 15 minutes
  const geocodingInterval = setInterval(scheduleGeocodingJobs, 15 * 60 * 1000);
  intervals.push(geocodingInterval);

  // Embeddings: every 10 minutes
  const embeddingsInterval = setInterval(scheduleEmbeddingJobs, 10 * 60 * 1000);
  intervals.push(embeddingsInterval);

  // Summarization: every 15 minutes
  const summarizationInterval = setInterval(scheduleSummarizationJobs, 15 * 60 * 1000);
  intervals.push(summarizationInterval);

  // Sentiment: every 5 minutes
  const sentimentInterval = setInterval(scheduleSentimentJobs, 5 * 60 * 1000);
  intervals.push(sentimentInterval);

  // Credibility: every 24 hours
  const credibilityInterval = setInterval(scheduleCredibilityUpdates, 24 * 60 * 60 * 1000);
  intervals.push(credibilityInterval);

  // Digests: every 5 minutes (checks if any are due)
  const digestInterval = setInterval(scheduleDigests, 5 * 60 * 1000);
  intervals.push(digestInterval);

  // Newscatcher: every 10 minutes
  const newscatcherInterval = setInterval(scheduleNewscatcherPolls, 10 * 60 * 1000);
  intervals.push(newscatcherInterval);

  // HyperLocal Intel: every 15 minutes (12-source geo-scored aggregation per market)
  const hyperLocalInterval = setInterval(scheduleHyperLocalIntelPolls, 15 * 60 * 1000);
  intervals.push(hyperLocalInterval);

  // Web scraper: every 30 minutes (for sites without RSS)
  const scraperInterval = setInterval(scheduleWebScrapePolls, 30 * 60 * 1000);
  intervals.push(scraperInterval);

  // Event Registry: every 15 minutes
  const erInterval = setInterval(scheduleEventRegistryPolls, 15 * 60 * 1000);
  intervals.push(erInterval);

  // Account story derivative sync: every 5 minutes
  const syncInterval = setInterval(scheduleAccountStorySync, 5 * 60 * 1000);
  intervals.push(syncInterval);

  // Run initial polls immediately on startup
  void scheduleRSSPolls();
  void scheduleNewsAPIPolls();
  void scheduleFacebookPagePolls();
  void scheduleTwitterPolls();
  void scheduleLLMPolls();
  void scheduleStockMonitor();
  void scheduleArticleExtractions();
  void scheduleGeocodingJobs();
  void scheduleNewscatcherPolls();
  void scheduleHyperLocalIntelPolls();
  void scheduleWebScrapePolls();
  void scheduleEventRegistryPolls();
  void scheduleDynamicNewsPoll();
  void scheduleAccountStorySync();

  logger.info('All schedulers started');
}

/**
 * Sync account story derivatives with base story updates.
 * Runs every 5 minutes.
 */
async function scheduleAccountStorySync(): Promise<void> {
  try {
    const connection = getSharedConnection();
    const syncQueue = new Queue('account-story-sync', { connection });
    await syncQueue.add('sync_all', { type: 'sync_all' }, {
      jobId: `account-story-sync-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    });
    await syncQueue.close();
  } catch (err) {
    logger.error({ err }, 'Failed to schedule account story sync');
  }
}

/**
 * Stop all scheduled jobs and close queues
 */
export async function stopSchedulers(): Promise<void> {
  logger.info('Stopping schedulers');

  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;

  if (ingestionQueue) await ingestionQueue.close();
  if (scoringQueue) await scoringQueue.close();
  if (llmIngestionQueue) await llmIngestionQueue.close();
  if (articleExtractionQueue) await articleExtractionQueue.close();
  if (geocodingQueue) await geocodingQueue.close();
  if (embeddingsQueue) await embeddingsQueue.close();
  if (summarizationQueue) await summarizationQueue.close();
  if (sentimentQueue) await sentimentQueue.close();
  if (credibilityQueue) await credibilityQueue.close();
  if (digestQueue) await digestQueue.close();

  logger.info('Schedulers stopped');
}
