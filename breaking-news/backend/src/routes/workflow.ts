// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPayload, requireAccountUser } from '../lib/route-helpers.js';

const DEFAULT_WORKFLOW_STAGES = [
  { name: 'Lead', slug: 'lead', order: 0, color: '#6B7280', requiredRole: 'VIEWER', isInitial: true, isFinal: false, icon: 'inbox' },
  { name: 'Assigned', slug: 'assigned', order: 1, color: '#3B82F6', requiredRole: 'EDITOR', isInitial: false, isFinal: false, icon: 'user-check' },
  { name: 'In Progress', slug: 'in-progress', order: 2, color: '#F59E0B', requiredRole: 'EDITOR', isInitial: false, isFinal: false, icon: 'pen-tool' },
  { name: 'Draft Ready', slug: 'draft-ready', order: 3, color: '#8B5CF6', requiredRole: 'EDITOR', isInitial: false, isFinal: false, icon: 'file-text' },
  { name: 'Editor Review', slug: 'editor-review', order: 4, color: '#EC4899', requiredRole: 'ADMIN', isInitial: false, isFinal: false, icon: 'eye' },
  { name: 'Approved', slug: 'approved', order: 5, color: '#10B981', requiredRole: 'ADMIN', isInitial: false, isFinal: false, icon: 'check-circle' },
  { name: 'Published', slug: 'published', order: 6, color: '#059669', requiredRole: 'ADMIN', isInitial: false, isFinal: true, icon: 'send' },
  { name: 'Killed', slug: 'killed', order: 7, color: '#EF4444', requiredRole: 'ADMIN', isInitial: false, isFinal: true, icon: 'x-circle' },
];

export async function workflowRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /workflow/stages — list workflow stages for current account
  app.get('/stages', async (request, reply) => {
    const au = requireAccountUser(request);

    let stages = await prisma.workflowStage.findMany({
      where: { accountId: au.accountId },
      orderBy: { order: 'asc' },
    });

    // Auto-seed default stages if none exist
    if (stages.length === 0) {
      for (const stage of DEFAULT_WORKFLOW_STAGES) {
        await prisma.workflowStage.create({
          data: { ...stage, accountId: au.accountId },
        });
      }
      stages = await prisma.workflowStage.findMany({
        where: { accountId: au.accountId },
        orderBy: { order: 'asc' },
      });
    }

    return reply.send({ data: stages });
  });

  // PUT /workflow/stages — replace all stages (for workflow builder)
  app.put('/stages', async (request, reply) => {
    const au = requireAccountUser(request);
    if (!['OWNER', 'ADMIN'].includes(au.role)) {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const body = z.object({
      stages: z.array(z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        order: z.number().int(),
        color: z.string().default('#6B7280'),
        icon: z.string().optional(),
        requiredRole: z.string().default('VIEWER'),
        isInitial: z.boolean().default(false),
        isFinal: z.boolean().default(false),
        autoActions: z.any().optional(),
      })),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    // Replace all stages in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.workflowStage.deleteMany({ where: { accountId: au.accountId } });
      for (const stage of body.data.stages) {
        await tx.workflowStage.create({
          data: { ...stage, accountId: au.accountId },
        });
      }
    });

    return reply.send({ message: 'Workflow updated', count: body.data.stages.length });
  });

  // POST /workflow/transition — move a story to a new stage
  app.post('/transition', async (request, reply) => {
    const au = requireAccountUser(request);

    const body = z.object({
      accountStoryId: z.string(),
      toStage: z.string(), // slug of target stage
      comment: z.string().optional(),
      assignTo: z.string().optional(), // userId to assign to
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const { accountStoryId, toStage, comment, assignTo } = body.data;

    // Verify account story belongs to this account
    const accountStory = await prisma.accountStory.findFirst({
      where: { id: accountStoryId, accountId: au.accountId },
    });
    if (!accountStory) return reply.status(404).send({ error: 'Story not found' });

    // Verify target stage exists
    const stage = await prisma.workflowStage.findFirst({
      where: { accountId: au.accountId, slug: toStage },
    });
    if (!stage) return reply.status(400).send({ error: `Stage "${toStage}" not found` });

    // Check role permission
    const roleOrder: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };
    if ((roleOrder[au.role] || 0) < (roleOrder[stage.requiredRole] || 0)) {
      return reply.status(403).send({ error: `Requires ${stage.requiredRole} role to move to "${stage.name}"` });
    }

    const fromStage = accountStory.accountStatus;

    // Update story status
    const updateData: any = { accountStatus: toStage };
    if (assignTo) {
      updateData.assignedTo = assignTo;
      updateData.assignedAt = new Date();
    }
    if (stage.isFinal && toStage === 'published') {
      updateData.coveredAt = new Date();
    }

    await prisma.accountStory.update({
      where: { id: accountStoryId },
      data: updateData,
    });

    // Add editorial comment
    if (comment) {
      await prisma.editorialComment.create({
        data: {
          accountStoryId,
          userId: au.userId,
          content: comment,
          action: toStage === fromStage ? 'comment' : 'transition',
          fromStage,
          toStage,
        },
      });
    }

    // TODO: Execute auto-actions (notify_slack, send_email, generate_draft, trigger_webhook)

    return reply.send({
      message: `Story moved to "${stage.name}"`,
      fromStage,
      toStage,
      stage,
    });
  });

  // GET /workflow/comments/:accountStoryId — editorial comment thread
  app.get('/comments/:accountStoryId', async (request, reply) => {
    const au = requireAccountUser(request);
    const { accountStoryId } = request.params as { accountStoryId: string };

    const comments = await prisma.editorialComment.findMany({
      where: { accountStoryId },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ data: comments });
  });

  // POST /workflow/comments — add a comment
  app.post('/comments', async (request, reply) => {
    const au = requireAccountUser(request);

    const body = z.object({
      accountStoryId: z.string(),
      content: z.string().min(1),
      action: z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const accountStory = await prisma.accountStory.findFirst({
      where: { id: body.data.accountStoryId, accountId: au.accountId },
    });
    if (!accountStory) return reply.status(404).send({ error: 'Story not found' });

    const comment = await prisma.editorialComment.create({
      data: {
        accountStoryId: body.data.accountStoryId,
        userId: au.userId,
        content: body.data.content,
        action: body.data.action || 'comment',
        fromStage: accountStory.accountStatus,
      },
    });

    return reply.send({ data: comment });
  });

  // ── Audio Spot Generation ─────────────────────────────────────────────────

  // POST /workflow/audio — generate an audio spot via OpenAI TTS
  app.post('/audio', async (request, reply) => {
    const au = requireAccountUser(request);

    const body = z.object({
      accountStoryId: z.string(),
      script: z.string().min(10),
      voice: z.string().default('alloy'), // alloy, echo, fable, onyx, nova, shimmer
      format: z.string().default('30s'), // 15s, 30s, 60s, full
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const accountStory = await prisma.accountStory.findFirst({
      where: { id: body.data.accountStoryId, accountId: au.accountId },
    });
    if (!accountStory) return reply.status(404).send({ error: 'Story not found' });

    // Create the audio spot record
    const audioSpot = await prisma.audioSpot.create({
      data: {
        accountId: au.accountId,
        accountStoryId: body.data.accountStoryId,
        title: `Audio spot - ${body.data.format}`,
        script: body.data.script,
        voiceId: body.data.voice,
        format: body.data.format,
        status: 'GENERATING',
      },
    });

    // Generate audio via OpenAI TTS (fire-and-forget)
    (async () => {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not set');

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: body.data.script,
            voice: body.data.voice,
            response_format: 'mp3',
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI TTS error: ${response.status} ${err}`);
        }

        // Convert to base64
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        await prisma.audioSpot.update({
          where: { id: audioSpot.id },
          data: {
            audioBase64: base64,
            status: 'READY',
            durationMs: Math.round(body.data.script.length * 60), // rough estimate
          },
        });
      } catch (err: any) {
        await prisma.audioSpot.update({
          where: { id: audioSpot.id },
          data: { status: 'FAILED', error: err.message },
        });
      }
    })();

    return reply.send({ data: audioSpot });
  });

  // GET /workflow/audio/:accountStoryId — list audio spots for a story
  app.get('/audio/:accountStoryId', async (request, reply) => {
    const au = requireAccountUser(request);
    const { accountStoryId } = request.params as { accountStoryId: string };

    const spots = await prisma.audioSpot.findMany({
      where: { accountStoryId, accountId: au.accountId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: spots });
  });

  // ── Multi-Platform Publishing ─────────────────────────────────────────────

  // POST /workflow/publish — publish content to an external platform
  app.post('/publish', async (request, reply) => {
    const au = requireAccountUser(request);
    if (!['ADMIN', 'OWNER'].includes(au.role)) {
      return reply.status(403).send({ error: 'Admin required to publish' });
    }

    const body = z.object({
      accountStoryId: z.string(),
      platform: z.enum(['wordpress', 'rss', 'twitter', 'facebook', 'linkedin', 'tiktok', 'youtube', 'instagram', 'custom_webhook']),
      content: z.object({
        title: z.string(),
        body: z.string(),
        mediaUrls: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }),
      scheduledFor: z.string().datetime().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    const accountStory = await prisma.accountStory.findFirst({
      where: { id: body.data.accountStoryId, accountId: au.accountId },
    });
    if (!accountStory) return reply.status(404).send({ error: 'Story not found' });

    // Create the publish record
    const published = await prisma.publishedContent.create({
      data: {
        accountId: au.accountId,
        accountStoryId: body.data.accountStoryId,
        platform: body.data.platform,
        contentType: 'article',
        content: body.data.content,
        status: body.data.scheduledFor ? 'SCHEDULED' : 'PENDING',
        scheduledFor: body.data.scheduledFor ? new Date(body.data.scheduledFor) : undefined,
      },
    });

    // If not scheduled, publish immediately (fire-and-forget)
    if (!body.data.scheduledFor) {
      (async () => {
        try {
          const result = await publishToPlatform(au.accountId, body.data.platform, body.data.content);
          await prisma.publishedContent.update({
            where: { id: published.id },
            data: {
              status: 'PUBLISHED',
              externalId: result.externalId,
              externalUrl: result.externalUrl,
              publishedAt: new Date(),
            },
          });
        } catch (err: any) {
          await prisma.publishedContent.update({
            where: { id: published.id },
            data: { status: 'FAILED', error: err.message },
          });
        }
      })();
    }

    return reply.send({ data: published });
  });

  // GET /workflow/published/:accountStoryId — list published content for a story
  app.get('/published/:accountStoryId', async (request, reply) => {
    const au = requireAccountUser(request);
    const { accountStoryId } = request.params as { accountStoryId: string };

    const items = await prisma.publishedContent.findMany({
      where: { accountStoryId, accountId: au.accountId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: items });
  });

  // GET /workflow/publish-queue — list all pending/scheduled publish jobs
  app.get('/publish-queue', async (request, reply) => {
    const au = requireAccountUser(request);

    const items = await prisma.publishedContent.findMany({
      where: {
        accountId: au.accountId,
        status: { in: ['PENDING', 'SCHEDULED'] },
      },
      include: {
        accountStory: {
          include: { baseStory: { select: { title: true, category: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: items });
  });

  // ── RSS Feed Output ───────────────────────────────────────────────────────

  // GET /workflow/feed/:accountSlug/published.xml — public RSS feed of published stories
  app.get('/feed/:accountSlug/published.xml', async (request, reply) => {
    const { accountSlug } = request.params as { accountSlug: string };

    const account = await prisma.account.findUnique({
      where: { slug: accountSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!account) return reply.status(404).send('Feed not found');

    const published = await prisma.publishedContent.findMany({
      where: {
        accountId: account.id,
        status: 'PUBLISHED',
      },
      include: {
        accountStory: {
          include: { baseStory: { select: { title: true, summary: true, aiSummary: true, category: true, locationName: true, firstSeenAt: true } } },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    const items = published.map(p => {
      const story = p.accountStory?.baseStory;
      const content = p.content as any;
      return `<item>
        <title><![CDATA[${content?.title || story?.title || 'Untitled'}]]></title>
        <description><![CDATA[${content?.body || story?.aiSummary || story?.summary || ''}]]></description>
        <link>${p.externalUrl || ''}</link>
        <guid>${p.id}</guid>
        <pubDate>${p.publishedAt ? new Date(p.publishedAt).toUTCString() : ''}</pubDate>
        <category>${story?.category || ''}</category>
      </item>`;
    }).join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${account.name} — Published Stories</title>
    <link>https://tp-hyperlocal.vercel.app</link>
    <description>Published stories from ${account.name}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    reply.header('Content-Type', 'application/rss+xml');
    return reply.send(rss);
  });
}

// ── Platform Publishing Helpers ────────────────────────────────────────────

async function publishToPlatform(
  accountId: string,
  platform: string,
  content: { title: string; body: string; mediaUrls?: string[]; tags?: string[] }
): Promise<{ externalId?: string; externalUrl?: string }> {
  // Load account credentials for this platform from extraConfig
  // AccountCredential uses Platform enum — we search by name containing the platform string
  const credentials = await prisma.accountCredential.findMany({
    where: { accountId, isActive: true },
  });
  // Find the best matching credential by checking name or extraConfig for the platform
  const credential = credentials.find(c => {
    const name = c.name.toLowerCase();
    return name.includes(platform.toLowerCase());
  });

  switch (platform) {
    case 'twitter': {
      const token = credential?.accessToken || process.env.TWITTER_BEARER_TOKEN;
      if (!token) throw new Error('Twitter credentials not configured');
      // Twitter API v2 post
      const resp = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${content.title}\n\n${content.body.substring(0, 200)}` }),
      });
      if (!resp.ok) throw new Error(`Twitter API ${resp.status}`);
      const data = await resp.json();
      return { externalId: data.data?.id, externalUrl: `https://x.com/i/status/${data.data?.id}` };
    }

    case 'wordpress': {
      const config = credential?.extraConfig as any;
      if (!config?.url) throw new Error('WordPress credentials not configured');
      const resp = await fetch(`${config.url}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: content.title,
          content: content.body,
          status: 'publish',
          tags: content.tags,
        }),
      });
      if (!resp.ok) throw new Error(`WordPress API ${resp.status}`);
      const data = await resp.json();
      return { externalId: String(data.id), externalUrl: data.link };
    }

    case 'linkedin': {
      const token = credential?.accessToken;
      if (!token) throw new Error('LinkedIn credentials not configured');
      // LinkedIn requires organization ID + proper OAuth — simplified here
      return { externalId: undefined, externalUrl: undefined };
    }

    case 'facebook': {
      const config = credential?.extraConfig as any;
      const token = config?.pageAccessToken || credential?.accessToken;
      const pageId = config?.pageId;
      if (!token || !pageId) throw new Error('Facebook credentials not configured');
      const resp = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${content.title}\n\n${content.body.substring(0, 500)}`,
          access_token: token,
        }),
      });
      if (!resp.ok) throw new Error(`Facebook API ${resp.status}`);
      const data = await resp.json();
      return { externalId: data.id, externalUrl: `https://facebook.com/${data.id}` };
    }

    case 'custom_webhook': {
      const config = credential?.extraConfig as any;
      const url = config?.webhookUrl;
      if (!url) throw new Error('Webhook URL not configured');
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      if (!resp.ok) throw new Error(`Webhook ${resp.status}`);
      return {};
    }

    default:
      return {};
  }
}
