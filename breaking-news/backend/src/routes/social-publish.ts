// @ts-nocheck
/**
 * Social Direct Publishing Routes
 *
 * Post directly to X (Twitter), Facebook, and Instagram from the platform.
 * Cross-post from BreakingPackage records to multiple social platforms.
 *
 * Auth: Bearer JWT (all endpoints)
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


// ─── Platform Publishing Helpers ───────────────────────────────────────────

interface PublishResult {
  success: boolean;
  platform: string;
  postId?: string;
  url?: string;
  error?: string;
}

async function publishToTwitter(text: string): Promise<PublishResult> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return { success: false, platform: 'twitter', error: 'TWITTER_BEARER_TOKEN not configured' };
  }

  try {
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, platform: 'twitter', error: `Twitter API ${response.status}: ${body.substring(0, 200)}` };
    }

    const data = await response.json();
    const tweetId = data.data?.id;

    return {
      success: true,
      platform: 'twitter',
      postId: tweetId,
      url: tweetId ? `https://x.com/i/status/${tweetId}` : undefined,
    };
  } catch (err) {
    return { success: false, platform: 'twitter', error: (err as Error).message };
  }
}

async function publishToFacebook(message: string, pageId: string, accessToken: string, link?: string): Promise<PublishResult> {
  try {
    const body: Record<string, string> = {
      message,
      access_token: accessToken,
    };
    if (link) body.link = link;

    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const respBody = await response.text();
      return { success: false, platform: 'facebook', error: `Facebook API ${response.status}: ${respBody.substring(0, 200)}` };
    }

    const data = await response.json();
    const postId = data.id;

    return {
      success: true,
      platform: 'facebook',
      postId,
      url: postId ? `https://www.facebook.com/${postId}` : undefined,
    };
  } catch (err) {
    return { success: false, platform: 'facebook', error: (err as Error).message };
  }
}

async function publishToInstagram(caption: string, imageUrl: string, igUserId: string, accessToken: string): Promise<PublishResult> {
  try {
    // Step 1: Create media container
    const containerResponse = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!containerResponse.ok) {
      const respBody = await containerResponse.text();
      return { success: false, platform: 'instagram', error: `Instagram container creation failed ${containerResponse.status}: ${respBody.substring(0, 200)}` };
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    if (!containerId) {
      return { success: false, platform: 'instagram', error: 'No container ID returned from Instagram' };
    }

    // Step 2: Publish the container
    const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
      signal: AbortSignal.timeout(30000), // Instagram publishing can be slow
    });

    if (!publishResponse.ok) {
      const respBody = await publishResponse.text();
      return { success: false, platform: 'instagram', error: `Instagram publish failed ${publishResponse.status}: ${respBody.substring(0, 200)}` };
    }

    const publishData = await publishResponse.json();
    const postId = publishData.id;

    return {
      success: true,
      platform: 'instagram',
      postId,
      url: postId ? `https://www.instagram.com/p/${postId}/` : undefined,
    };
  } catch (err) {
    return { success: false, platform: 'instagram', error: (err as Error).message };
  }
}

// ─── Credential Helpers ────────────────────────────────────────────────────

async function getCredential(accountId: string, platform: string) {
  return prisma.accountCredential.findFirst({
    where: { accountId, platform },
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────

export async function socialPublishRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /api/v1/social/publish/twitter — Post to X/Twitter
  app.post('/social/publish/twitter', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      text: z.string().min(1).max(280),
      storyId: z.string().optional(),
    }).parse(request.body);

    const result = await publishToTwitter(body.text);

    // Log the publish attempt
    if (body.storyId && result.success) {
      try {
        await prisma.notification.create({
          data: {
            storyId: body.storyId,
            type: 'SOCIAL_PUBLISH',
            channel: 'SOCIAL',
            recipient: 'twitter',
            payload: { platform: 'twitter', postId: result.postId, url: result.url },
            status: 'SENT',
          },
        });
      } catch {
        // Non-fatal: logging failure shouldn't block the response
      }
    }

    const statusCode = result.success ? 200 : 502;
    return reply.status(statusCode).send({ data: result });
  });

  // POST /api/v1/social/publish/facebook — Post to Facebook Page
  app.post('/social/publish/facebook', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      message: z.string().min(1),
      link: z.string().url().optional(),
      pageId: z.string().min(1),
      storyId: z.string().optional(),
    }).parse(request.body);

    // Get Facebook credentials for this account
    const credential = await getCredential(payload.accountId, 'FACEBOOK');
    if (!credential?.credentials || !(credential.credentials as any).accessToken) {
      return reply.status(400).send({ error: 'No Facebook credentials configured. Add a Facebook account credential with an accessToken.' });
    }

    const accessToken = (credential.credentials as any).accessToken;
    const result = await publishToFacebook(body.message, body.pageId, accessToken, body.link);

    if (body.storyId && result.success) {
      try {
        await prisma.notification.create({
          data: {
            storyId: body.storyId,
            type: 'SOCIAL_PUBLISH',
            channel: 'SOCIAL',
            recipient: 'facebook',
            payload: { platform: 'facebook', postId: result.postId, url: result.url },
            status: 'SENT',
          },
        });
      } catch {
        // Non-fatal
      }
    }

    const statusCode = result.success ? 200 : 502;
    return reply.status(statusCode).send({ data: result });
  });

  // POST /api/v1/social/publish/instagram — Post to Instagram (via Facebook API)
  app.post('/social/publish/instagram', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      caption: z.string().min(1).max(2200),
      imageUrl: z.string().url(),
      storyId: z.string().optional(),
    }).parse(request.body);

    // Get Instagram credentials (stored under INSTAGRAM platform, uses Facebook Graph API)
    const credential = await getCredential(payload.accountId, 'INSTAGRAM');
    if (!credential?.credentials || !(credential.credentials as any).accessToken || !(credential.credentials as any).igUserId) {
      return reply.status(400).send({
        error: 'No Instagram credentials configured. Add an Instagram account credential with accessToken and igUserId.',
      });
    }

    const { accessToken, igUserId } = credential.credentials as any;
    const result = await publishToInstagram(body.caption, body.imageUrl, igUserId, accessToken);

    if (body.storyId && result.success) {
      try {
        await prisma.notification.create({
          data: {
            storyId: body.storyId,
            type: 'SOCIAL_PUBLISH',
            channel: 'SOCIAL',
            recipient: 'instagram',
            payload: { platform: 'instagram', postId: result.postId, url: result.url },
            status: 'SENT',
          },
        });
      } catch {
        // Non-fatal
      }
    }

    const statusCode = result.success ? 200 : 502;
    return reply.status(statusCode).send({ data: result });
  });

  // POST /api/v1/social/publish/all — Cross-post to multiple platforms
  app.post('/social/publish/all', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      packageId: z.string().min(1),
      platforms: z.array(z.enum(['twitter', 'facebook', 'instagram'])).min(1),
    }).parse(request.body);

    // Fetch the BreakingPackage
    const pkg = await prisma.breakingPackage.findUnique({
      where: { id: body.packageId },
      include: {
        story: { select: { id: true, title: true } },
      },
    });

    if (!pkg) return reply.status(404).send({ error: 'Package not found' });
    if (pkg.accountId !== payload.accountId) return reply.status(403).send({ error: 'Forbidden' });

    const socialText = pkg.socialPost || `Breaking: ${pkg.story.title}`;
    const results: PublishResult[] = [];

    for (const platform of body.platforms) {
      try {
        if (platform === 'twitter') {
          // Truncate to 280 chars for Twitter
          const tweetText = socialText.length > 280 ? socialText.substring(0, 277) + '...' : socialText;
          results.push(await publishToTwitter(tweetText));

        } else if (platform === 'facebook') {
          const credential = await getCredential(payload.accountId, 'FACEBOOK');
          if (!credential?.credentials || !(credential.credentials as any).accessToken) {
            results.push({ success: false, platform: 'facebook', error: 'No Facebook credentials configured' });
            continue;
          }
          const { accessToken, pageId: defaultPageId } = credential.credentials as any;
          const pageId = defaultPageId || (credential.credentials as any).page_id;
          if (!pageId) {
            results.push({ success: false, platform: 'facebook', error: 'No pageId in Facebook credentials' });
            continue;
          }
          results.push(await publishToFacebook(socialText, pageId, accessToken));

        } else if (platform === 'instagram') {
          const credential = await getCredential(payload.accountId, 'INSTAGRAM');
          if (!credential?.credentials || !(credential.credentials as any).accessToken || !(credential.credentials as any).igUserId) {
            results.push({ success: false, platform: 'instagram', error: 'No Instagram credentials configured' });
            continue;
          }
          // Instagram requires an image. Use story thumbnail or skip.
          const imageUrl = (pkg as any).thumbnailUrl || (pkg as any).imageUrl;
          if (!imageUrl) {
            results.push({ success: false, platform: 'instagram', error: 'Instagram requires an imageUrl but none available on the package' });
            continue;
          }
          const { accessToken, igUserId } = credential.credentials as any;
          results.push(await publishToInstagram(socialText, imageUrl, igUserId, accessToken));
        }
      } catch (err) {
        results.push({ success: false, platform, error: (err as Error).message });
      }
    }

    // Track successful publishes on the package
    const successfulPlatforms = results.filter((r) => r.success).map((r) => r.platform);
    if (successfulPlatforms.length > 0) {
      const previouslyPublished = (pkg.publishedTo as string[]) || [];
      const allPublished = [...new Set([...previouslyPublished, ...successfulPlatforms])];

      await prisma.breakingPackage.update({
        where: { id: body.packageId },
        data: {
          publishedTo: allPublished,
          status: 'PUBLISHED',
        },
      });
    }

    // Log publish results
    for (const result of results) {
      if (result.success) {
        try {
          await prisma.notification.create({
            data: {
              storyId: pkg.storyId,
              type: 'SOCIAL_PUBLISH',
              channel: 'SOCIAL',
              recipient: result.platform,
              payload: { platform: result.platform, postId: result.postId, url: result.url, packageId: body.packageId },
              status: 'SENT',
            },
          });
        } catch {
          // Non-fatal
        }
      }
    }

    const allSucceeded = results.every((r) => r.success);
    const anySucceeded = results.some((r) => r.success);
    const statusCode = allSucceeded ? 200 : anySucceeded ? 207 : 502;

    return reply.status(statusCode).send({ data: results, summary: { total: results.length, succeeded: successfulPlatforms.length, failed: results.length - successfulPlatforms.length } });
  });

  // GET /api/v1/social/accounts — List connected social accounts
  app.get('/social/accounts', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const credentials = await prisma.accountCredential.findMany({
      where: {
        accountId: payload.accountId,
        platform: { in: ['TWITTER', 'FACEBOOK', 'INSTAGRAM'] },
      },
      select: {
        id: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
        // Never expose the actual credentials/tokens
      },
    });

    // Also check for env-based Twitter config
    const accounts = credentials.map((c) => ({
      id: c.id,
      platform: c.platform.toLowerCase(),
      connected: true,
      connectedAt: c.createdAt,
    }));

    // If TWITTER_BEARER_TOKEN is set in env, add it as a system-level account
    if (process.env.TWITTER_BEARER_TOKEN) {
      const hasTwitterCred = accounts.some((a) => a.platform === 'twitter');
      if (!hasTwitterCred) {
        accounts.push({
          id: 'env-twitter',
          platform: 'twitter',
          connected: true,
          connectedAt: null,
        });
      }
    }

    return reply.send({ data: accounts });
  });
}
