// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { XMLParser } from 'fast-xml-parser';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateContentHash } from '../utils/text.js';
import { searchRecentTweets, type Tweet } from '../lib/twitter-client.js';

const logger = createChildLogger('ingestion');

// Types for job data
interface RSSPollJob {
  type: 'rss_poll';
  sourceId: string;
  feedUrl: string;
}

interface NewsAPIPollJob {
  type: 'newsapi_poll';
  sourceId: string;
  query?: string;
}

interface FacebookPagePollJob {
  type: 'facebook_page_poll';
  sourceId: string;
  pageId: string;
  accessToken: string;
}

interface TwitterPollJob {
  type: 'twitter_poll';
  sourceId: string;
  query: string;
  bearerToken?: string;
}

type IngestionJob = RSSPollJob | NewsAPIPollJob | FacebookPagePollJob | TwitterPollJob;

// RSS item shape after parsing
interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  'dc:date'?: string;
  guid?: string | { '#text': string };
  author?: string;
  'dc:creator'?: string;
  'media:content'?: { '@_url'?: string } | Array<{ '@_url'?: string }>;
  enclosure?: { '@_url'?: string };
  'content:encoded'?: string;
}

interface NewsAPIArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count: number };
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  full_picture?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function getGuid(item: RSSItem, feedUrl: string): string {
  if (item.guid) {
    return typeof item.guid === 'string' ? item.guid : item.guid['#text'];
  }
  if (item.link) return item.link;
  // Fallback: hash of title + pubDate
  const raw = `${feedUrl}::${item.title || ''}::${item.pubDate || ''}`;
  return generateContentHash(raw);
}

function extractMediaUrls(item: RSSItem): string[] {
  const urls: string[] = [];
  if (item['media:content']) {
    const media = Array.isArray(item['media:content'])
      ? item['media:content']
      : [item['media:content']];
    for (const m of media) {
      if (m['@_url']) urls.push(m['@_url']);
    }
  }
  if (item.enclosure?.['@_url']) {
    urls.push(item.enclosure['@_url']);
  }
  return urls;
}

async function handleRSSPoll(job: Job<RSSPollJob>): Promise<void> {
  const { sourceId, feedUrl } = job.data;
  logger.info({ sourceId, feedUrl }, 'Polling RSS feed');

  let response: Response;
  try {
    response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'BreakingNewsBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ sourceId, feedUrl, err }, 'Failed to fetch RSS feed');
    throw err;
  }

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);

  // Support both RSS 2.0 and Atom formats
  let items: RSSItem[] = [];
  if (parsed.rss?.channel?.item) {
    items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];
  } else if (parsed.feed?.entry) {
    items = Array.isArray(parsed.feed.entry)
      ? parsed.feed.entry
      : [parsed.feed.entry];
  }

  logger.info({ sourceId, itemCount: items.length }, 'Parsed RSS items');

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });
  const extractionQueue = new Queue('article-extraction', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const item of items) {
    try {
      const content = item['content:encoded'] || item.description || item.title || '';
      const title = item.title || '';
      const guid = getGuid(item, feedUrl);
      const platformPostId = `rss::${feedUrl}::${guid}`;

      // Check for duplicate by platformPostId
      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(`${title} ${content}`);

      // Check for duplicate by content hash within the same source —
      // prevents the same article from being stored multiple times when
      // the RSS guid changes between polls but the content is identical.
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) {
        logger.debug({ sourceId, title: title.substring(0, 60) }, 'Skipping duplicate content (same source, same hash)');
        continue;
      }

      const publishedAt = item.pubDate || item['dc:date']
        ? new Date(item.pubDate || item['dc:date'] || Date.now())
        : new Date();

      const mediaUrls = extractMediaUrls(item);

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000), // Limit content length
          contentHash,
          title: title.substring(0, 500),
          url: item.link || undefined,
          authorName: item.author || item['dc:creator'] || undefined,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: item as Record<string, unknown>,
          publishedAt,
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      // Queue full article extraction if the post has a URL
      if (item.link) {
        await extractionQueue.add('extract_article', { sourcePostId: post.id }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: 2000, // Small delay to let enrichment start first
        });
      }
    } catch (err) {
      logger.warn({ err, item: item.title }, 'Failed to process RSS item');
    }
  }

  // Update last polled timestamp
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();
  await extractionQueue.close();

  logger.info({ sourceId, ingested, total: items.length }, 'RSS poll complete');
}

async function handleNewsAPIPoll(job: Job<NewsAPIPollJob>): Promise<void> {
  const { sourceId, query } = job.data;
  const apiKey = process.env['NEWSAPI_KEY'];

  if (!apiKey) {
    logger.error('NEWSAPI_KEY environment variable not set');
    throw new Error('NEWSAPI_KEY not configured');
  }

  const searchQuery = query || 'Houston Texas';
  const params = new URLSearchParams({
    q: searchQuery,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '50',
    apiKey,
  });

  logger.info({ sourceId, query: searchQuery }, 'Polling NewsAPI');

  let response: Response;
  try {
    response = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ sourceId, err }, 'Failed to fetch NewsAPI');
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NewsAPI fetch failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { status: string; articles: NewsAPIArticle[] };

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI returned status: ${data.status}`);
  }

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const article of data.articles) {
    try {
      const content = article.content || article.description || article.title;
      const platformPostId = `newsapi::${generateContentHash(article.url)}`;

      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(`${article.title} ${content}`);

      // Content-hash dedup: skip if same content already ingested from this source
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const mediaUrls = article.urlToImage ? [article.urlToImage] : [];

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: `${article.title}\n\n${content}`.substring(0, 50000),
          contentHash,
          title: article.title.substring(0, 500),
          url: article.url,
          authorName: article.author || article.source.name || undefined,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: article as unknown as Record<string, unknown>,
          publishedAt: new Date(article.publishedAt),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      logger.warn({ err, title: article.title }, 'Failed to process NewsAPI article');
    }
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({ sourceId, ingested, total: data.articles.length }, 'NewsAPI poll complete');
}

async function handleTwitterPoll(job: Job<TwitterPollJob>): Promise<void> {
  const { sourceId, query } = job.data;
  const bearerToken = job.data.bearerToken || process.env.TWITTER_BEARER_TOKEN;

  if (!bearerToken) {
    throw new Error('TWITTER_BEARER_TOKEN not configured');
  }

  logger.info({ sourceId, query }, 'Polling Twitter/X');

  const tweets = await searchRecentTweets(query, bearerToken, 25);

  logger.info({ sourceId, tweetCount: tweets.length }, 'Fetched tweets');

  const enrichmentQueue = new Queue('enrichment', { connection: getSharedConnection() });
  let ingested = 0;

  for (const tweet of tweets) {
    try {
      const platformPostId = `twitter::${tweet.id}`;
      const existing = await prisma.sourcePost.findUnique({ where: { platformPostId } });
      if (existing) continue;

      const content = tweet.text;
      const contentHash = generateContentHash(content);

      // Content-hash dedup
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content,
          contentHash,
          title: content.substring(0, 100),
          url: tweet.url,
          authorName: tweet.authorName || tweet.authorUsername || 'Unknown',
          authorId: tweet.authorId,
          engagementLikes: tweet.metrics.likes,
          engagementShares: tweet.metrics.retweets + tweet.metrics.quotes,
          engagementComments: tweet.metrics.replies,
          publishedAt: new Date(tweet.createdAt),
          rawData: tweet,
          entities: tweet.entities ? {
            hashtags: tweet.entities.hashtags,
            urls: tweet.entities.urls,
            mentions: tweet.entities.mentions,
          } : undefined,
        },
      });

      await enrichmentQueue.add('enrich', { sourcePostId: post.id });
      ingested++;
    } catch (err) {
      if ((err as any).code === 'P2002') continue; // Dedup
      logger.error({ sourceId, tweetId: tweet.id, err: (err as Error).message }, 'Failed to ingest tweet');
    }
  }

  await enrichmentQueue.close();

  // Update source last polled
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  logger.info({ sourceId, query, ingested, total: tweets.length }, 'Twitter poll complete');
}

async function handleFacebookPagePoll(job: Job<FacebookPagePollJob>): Promise<void> {
  const { sourceId, pageId, accessToken } = job.data;

  logger.info({ sourceId, pageId }, 'Polling Facebook page');

  const fields = 'id,message,story,created_time,permalink_url,shares,likes.summary(true),comments.summary(true),full_picture';
  const url = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=${fields}&access_token=${accessToken}&limit=25`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ sourceId, pageId, err }, 'Failed to fetch Facebook page');
    throw err;
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
    logger.warn({ sourceId, pageId, delay }, 'Facebook rate limit hit, will retry');
    throw new Error(`Facebook rate limit. Retry after ${delay}ms`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { data: FacebookPost[] };

  const enrichmentQueue = new Queue('enrichment', {
    connection: getSharedConnection(),
  });

  let ingested = 0;

  for (const fbPost of data.data) {
    try {
      const content = fbPost.message || fbPost.story || '';
      if (!content) continue; // Skip posts with no text content

      const platformPostId = `facebook::${fbPost.id}`;

      const existing = await prisma.sourcePost.findUnique({
        where: { platformPostId },
      });
      if (existing) continue;

      const contentHash = generateContentHash(content);

      // Content-hash dedup
      const existingByContent = await prisma.sourcePost.findFirst({
        where: { sourceId, contentHash },
      });
      if (existingByContent) continue;

      const mediaUrls = fbPost.full_picture ? [fbPost.full_picture] : [];

      const post = await prisma.sourcePost.create({
        data: {
          sourceId,
          platformPostId,
          content: content.substring(0, 50000),
          contentHash,
          url: fbPost.permalink_url || undefined,
          engagementLikes: fbPost.likes?.summary?.total_count || 0,
          engagementShares: fbPost.shares?.count || 0,
          engagementComments: fbPost.comments?.summary?.total_count || 0,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          rawData: fbPost as unknown as Record<string, unknown>,
          publishedAt: new Date(fbPost.created_time),
        },
      });

      ingested++;

      await enrichmentQueue.add('enrich', { sourcePostId: post.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } catch (err) {
      logger.warn({ err, postId: fbPost.id }, 'Failed to process Facebook post');
    }
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPolledAt: new Date() },
  });

  await enrichmentQueue.close();

  logger.info({ sourceId, ingested, total: data.data.length }, 'Facebook poll complete');
}

export function createIngestionWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<IngestionJob>(
    'ingestion',
    async (job: Job<IngestionJob>) => {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing ingestion job');

      switch (job.data.type) {
        case 'rss_poll':
          await handleRSSPoll(job as Job<RSSPollJob>);
          break;
        case 'newsapi_poll':
          await handleNewsAPIPoll(job as Job<NewsAPIPollJob>);
          break;
        case 'facebook_page_poll':
          await handleFacebookPagePoll(job as Job<FacebookPagePollJob>);
          break;
        case 'twitter_poll':
          await handleTwitterPoll(job as Job<TwitterPollJob>);
          break;
        default:
          logger.error({ type: (job.data as IngestionJob).type }, 'Unknown ingestion job type');
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Ingestion job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Ingestion job failed');
  });

  return worker;
}
