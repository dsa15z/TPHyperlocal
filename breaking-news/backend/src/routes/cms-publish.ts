// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CMSConfig {
  type: 'WORDPRESS' | 'ARC' | 'CUSTOM_REST';
  baseUrl: string;
  authType: 'BASIC' | 'BEARER' | 'API_KEY';
  credentials: string;
  defaultCategory?: string;
  defaultAuthor?: string;
  publishEndpoint?: string;
}

interface PublishRecord {
  storyId: string;
  cmsPostId: string;
  cmsUrl: string;
  publishedAt: string;
  cmsType: string;
  title: string;
}

// ─── In-Memory Publish Tracking ─────────────────────────────────────────────

const publishedRecords: PublishRecord[] = [];

// ─── Auth Helper ────────────────────────────────────────────────────────────


function requireAdmin(payload: any, reply: any): boolean {
  if (!payload?.accountId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }
  if (payload.role !== 'ADMIN' && payload.role !== 'admin') {
    reply.status(403).send({ error: 'Admin access required' });
    return false;
  }
  return true;
}

// ─── CMS Config Helpers ─────────────────────────────────────────────────────

async function getCmsConfig(accountId: string): Promise<CMSConfig | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { metadata: true },
  });
  const meta = account?.metadata as any;
  if (!meta?.cms) return null;
  return meta.cms as CMSConfig;
}

async function saveCmsConfig(accountId: string, cmsConfig: CMSConfig): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { metadata: true },
  });
  const existingMeta = (account?.metadata as any) || {};
  await prisma.account.update({
    where: { id: accountId },
    data: {
      metadata: {
        ...existingMeta,
        cms: cmsConfig,
      },
    },
  });
}

// ─── CMS Auth Header Builder ────────────────────────────────────────────────

function buildAuthHeaders(config: CMSConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  switch (config.authType) {
    case 'BASIC':
      headers['Authorization'] = `Basic ${config.credentials}`;
      break;
    case 'BEARER':
      headers['Authorization'] = `Bearer ${config.credentials}`;
      break;
    case 'API_KEY':
      headers['X-API-Key'] = config.credentials;
      break;
  }
  return headers;
}

// ─── CMS Publishers ─────────────────────────────────────────────────────────

async function publishToWordPress(
  config: CMSConfig,
  data: { title: string; content: string; status: string; categories?: string[] },
): Promise<{ postId: string; url: string }> {
  const endpoint = `${config.baseUrl}/wp/v2/posts`;
  const body: any = {
    title: data.title,
    content: data.content,
    status: data.status,
  };
  if (data.categories?.length) {
    body.categories = data.categories;
  }
  if (config.defaultAuthor) {
    body.author = config.defaultAuthor;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WordPress API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return {
    postId: String(result.id),
    url: result.link || `${config.baseUrl.replace('/wp-json', '')}/?p=${result.id}`,
  };
}

async function publishToArc(
  config: CMSConfig,
  data: { title: string; content: string; status: string; categories?: string[] },
): Promise<{ postId: string; url: string }> {
  const endpoint = `${config.baseUrl}/story/v2/story`;
  // Build ANS (Arc Native Specification) document
  const ansDoc: any = {
    type: 'story',
    version: '0.10.9',
    headlines: {
      basic: data.title,
    },
    subheadlines: {},
    content_elements: [
      {
        _id: `text_${Date.now()}`,
        type: 'text',
        content: data.content,
      },
    ],
    workflow: {
      status_code: data.status === 'publish' ? 1 : 0,
    },
  };

  if (data.categories?.length) {
    ansDoc.taxonomy = {
      tags: data.categories.map((cat) => ({ text: cat })),
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify(ansDoc),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Arc API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return {
    postId: result.id || result._id || String(Date.now()),
    url: result.canonical_url || result.website_url || `${config.baseUrl}/story/${result.id || result._id}`,
  };
}

async function publishToCustomRest(
  config: CMSConfig,
  data: { title: string; content: string; status: string; categories?: string[] },
): Promise<{ postId: string; url: string }> {
  const endpoint = config.publishEndpoint
    ? `${config.baseUrl}${config.publishEndpoint}`
    : `${config.baseUrl}/posts`;

  const body = {
    title: data.title,
    content: data.content,
    status: data.status,
    categories: data.categories || [],
    author: config.defaultAuthor || undefined,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CMS API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return {
    postId: String(result.id || result.postId || result._id || Date.now()),
    url: result.url || result.link || result.permalink || '',
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function cmsPublishRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // POST /cms/configure — Set CMS config for account
  app.post('/cms/configure', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      type: z.enum(['WORDPRESS', 'ARC', 'CUSTOM_REST']),
      baseUrl: z.string().url(),
      authType: z.enum(['BASIC', 'BEARER', 'API_KEY']),
      credentials: z.string().min(1),
      defaultCategory: z.string().optional(),
      defaultAuthor: z.string().optional(),
      publishEndpoint: z.string().optional(),
    }).parse(request.body);

    await saveCmsConfig(payload.accountId, body);

    return reply.send({
      message: 'CMS configuration saved',
      config: {
        type: body.type,
        baseUrl: body.baseUrl,
        authType: body.authType,
        defaultCategory: body.defaultCategory,
        defaultAuthor: body.defaultAuthor,
        publishEndpoint: body.publishEndpoint,
        // credentials intentionally omitted from response
      },
    });
  });

  // GET /cms/config — Get CMS config
  app.get('/cms/config', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const cmsConfig = await getCmsConfig(payload.accountId);
    if (!cmsConfig) {
      return reply.send({ configured: false, config: null });
    }

    return reply.send({
      configured: true,
      config: {
        type: cmsConfig.type,
        baseUrl: cmsConfig.baseUrl,
        authType: cmsConfig.authType,
        defaultCategory: cmsConfig.defaultCategory,
        defaultAuthor: cmsConfig.defaultAuthor,
        publishEndpoint: cmsConfig.publishEndpoint,
        // credentials intentionally omitted
      },
    });
  });

  // POST /cms/test — Test CMS connection
  app.post('/cms/test', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const cmsConfig = await getCmsConfig(payload.accountId);
    if (!cmsConfig) {
      return reply.status(400).send({ error: 'CMS not configured. Call POST /cms/configure first.' });
    }

    try {
      let testEndpoint: string;
      switch (cmsConfig.type) {
        case 'WORDPRESS':
          testEndpoint = `${cmsConfig.baseUrl}/wp/v2/categories?per_page=1`;
          break;
        case 'ARC':
          testEndpoint = `${cmsConfig.baseUrl}/story/v2/story?size=1`;
          break;
        case 'CUSTOM_REST':
          testEndpoint = cmsConfig.publishEndpoint
            ? `${cmsConfig.baseUrl}${cmsConfig.publishEndpoint}`
            : `${cmsConfig.baseUrl}/health`;
          break;
        default:
          testEndpoint = `${cmsConfig.baseUrl}/health`;
      }

      const startTime = Date.now();
      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: buildAuthHeaders(cmsConfig),
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - startTime;

      return reply.send({
        connected: response.ok,
        statusCode: response.status,
        latencyMs,
        cmsType: cmsConfig.type,
        baseUrl: cmsConfig.baseUrl,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      });
    } catch (err: any) {
      return reply.send({
        connected: false,
        statusCode: 0,
        latencyMs: 0,
        cmsType: cmsConfig.type,
        baseUrl: cmsConfig.baseUrl,
        error: err.message || 'Connection failed',
      });
    }
  });

  // POST /cms/publish — Publish a story to CMS
  app.post('/cms/publish', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      storyId: z.string().min(1),
      title: z.string().optional(),
      content: z.string().optional(),
      categories: z.array(z.string()).optional(),
      status: z.enum(['draft', 'publish']).default('draft'),
    }).parse(request.body);

    const cmsConfig = await getCmsConfig(payload.accountId);
    if (!cmsConfig) {
      return reply.status(400).send({ error: 'CMS not configured. Call POST /cms/configure first.' });
    }

    // Fetch story
    const story = await prisma.story.findUnique({
      where: { id: body.storyId },
      select: {
        id: true,
        title: true,
        editedTitle: true,
        summary: true,
        aiSummary: true,
        editedSummary: true,
        category: true,
      },
    });
    if (!story) {
      return reply.status(404).send({ error: 'Story not found' });
    }

    // Try to get web summary from breaking package
    let webSummary: string | undefined;
    const breakingPkg = await prisma.breakingPackage.findFirst({
      where: { storyId: body.storyId },
      orderBy: { createdAt: 'desc' },
    });
    if (breakingPkg) {
      const pkgContent = breakingPkg.content as any;
      webSummary = pkgContent?.webSummary || pkgContent?.web_summary || undefined;
    }

    // Build publish data
    const title = body.title || story.editedTitle || story.title;
    const content = body.content || webSummary || story.editedSummary || story.aiSummary || story.summary || '';
    const categories = body.categories || (cmsConfig.defaultCategory ? [cmsConfig.defaultCategory] : []);

    try {
      let result: { postId: string; url: string };

      switch (cmsConfig.type) {
        case 'WORDPRESS':
          result = await publishToWordPress(cmsConfig, { title, content, status: body.status, categories });
          break;
        case 'ARC':
          result = await publishToArc(cmsConfig, { title, content, status: body.status, categories });
          break;
        case 'CUSTOM_REST':
          result = await publishToCustomRest(cmsConfig, { title, content, status: body.status, categories });
          break;
        default:
          return reply.status(400).send({ error: `Unsupported CMS type: ${cmsConfig.type}` });
      }

      // Track published record
      publishedRecords.unshift({
        storyId: body.storyId,
        cmsPostId: result.postId,
        cmsUrl: result.url,
        publishedAt: new Date().toISOString(),
        cmsType: cmsConfig.type,
        title,
      });
      // Keep only last 500 records
      if (publishedRecords.length > 500) publishedRecords.length = 500;

      return reply.send({
        success: true,
        storyId: body.storyId,
        cmsPostId: result.postId,
        cmsUrl: result.url,
        cmsType: cmsConfig.type,
        status: body.status,
        title,
      });
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: err.message || 'Failed to publish to CMS',
        storyId: body.storyId,
        cmsType: cmsConfig.type,
      });
    }
  });

  // POST /cms/publish-batch — Publish multiple stories
  app.post('/cms/publish-batch', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const body = z.object({
      storyIds: z.array(z.string().min(1)).min(1).max(50),
      status: z.enum(['draft', 'publish']).default('draft'),
    }).parse(request.body);

    const cmsConfig = await getCmsConfig(payload.accountId);
    if (!cmsConfig) {
      return reply.status(400).send({ error: 'CMS not configured. Call POST /cms/configure first.' });
    }

    const results: Array<{
      storyId: string;
      success: boolean;
      cmsPostId?: string;
      cmsUrl?: string;
      error?: string;
    }> = [];

    for (const storyId of body.storyIds) {
      try {
        // Fetch story
        const story = await prisma.story.findUnique({
          where: { id: storyId },
          select: {
            id: true,
            title: true,
            editedTitle: true,
            summary: true,
            aiSummary: true,
            editedSummary: true,
          },
        });
        if (!story) {
          results.push({ storyId, success: false, error: 'Story not found' });
          continue;
        }

        // Try to get web summary from breaking package
        let webSummary: string | undefined;
        const breakingPkg = await prisma.breakingPackage.findFirst({
          where: { storyId },
          orderBy: { createdAt: 'desc' },
        });
        if (breakingPkg) {
          const pkgContent = breakingPkg.content as any;
          webSummary = pkgContent?.webSummary || pkgContent?.web_summary || undefined;
        }

        const title = story.editedTitle || story.title;
        const content = webSummary || story.editedSummary || story.aiSummary || story.summary || '';
        const categories = cmsConfig.defaultCategory ? [cmsConfig.defaultCategory] : [];

        let result: { postId: string; url: string };
        switch (cmsConfig.type) {
          case 'WORDPRESS':
            result = await publishToWordPress(cmsConfig, { title, content, status: body.status, categories });
            break;
          case 'ARC':
            result = await publishToArc(cmsConfig, { title, content, status: body.status, categories });
            break;
          case 'CUSTOM_REST':
            result = await publishToCustomRest(cmsConfig, { title, content, status: body.status, categories });
            break;
          default:
            results.push({ storyId, success: false, error: `Unsupported CMS type` });
            continue;
        }

        // Track
        publishedRecords.unshift({
          storyId,
          cmsPostId: result.postId,
          cmsUrl: result.url,
          publishedAt: new Date().toISOString(),
          cmsType: cmsConfig.type,
          title,
        });

        results.push({
          storyId,
          success: true,
          cmsPostId: result.postId,
          cmsUrl: result.url,
        });
      } catch (err: any) {
        results.push({
          storyId,
          success: false,
          error: err.message || 'Publish failed',
        });
      }
    }

    // Trim publish history
    if (publishedRecords.length > 500) publishedRecords.length = 500;

    const successCount = results.filter((r) => r.success).length;
    return reply.send({
      total: body.storyIds.length,
      succeeded: successCount,
      failed: body.storyIds.length - successCount,
      results,
    });
  });

  // GET /cms/published — List stories published to CMS
  app.get('/cms/published', async (request, reply) => {
    const payload = getPayload(request);
    if (!requireAdmin(payload, reply)) return;

    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);

    const slice = publishedRecords.slice(query.offset, query.offset + query.limit);

    return reply.send({
      total: publishedRecords.length,
      limit: query.limit,
      offset: query.offset,
      data: slice,
    });
  });
}
