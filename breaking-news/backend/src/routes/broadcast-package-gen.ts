// @ts-nocheck
/**
 * One-Click Broadcast Package Generator
 * Generates TV script + radio spot + social post + web article + push notification
 * all from a single story, in one API call.
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getAccountUser } from '../lib/route-helpers.js';

export async function broadcastPackageGenRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /broadcast-package/generate — generate all content formats
  app.post('/broadcast-package/generate', async (request, reply) => {
    const au = getAccountUser(request);
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      storyId: z.string(),
      formats: z.array(z.enum(['tv_30s', 'tv_60s', 'radio_30s', 'radio_60s', 'web_article', 'social_post', 'social_thread', 'push_notification'])).default(['tv_30s', 'radio_30s', 'social_post', 'web_article', 'push_notification']),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.issues });

    const story = await prisma.story.findUnique({
      where: { id: body.data.storyId },
      include: {
        storySources: {
          include: { sourcePost: { select: { title: true, content: true, source: { select: { name: true } } } } },
          take: 5,
        },
      },
    });

    if (!story) return reply.status(404).send({ error: 'Story not found' });

    // Load account voice/tone settings
    const voiceTone = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { metadata: true },
    });
    const tone = (voiceTone?.metadata as any)?.voiceTone || 'professional broadcast news';

    // Build context
    const sources = story.storySources.map(ss => `${ss.sourcePost?.source?.name}: ${ss.sourcePost?.title}`).join('\n');
    const storyContext = `Title: ${story.title}\nSummary: ${story.aiSummary || story.summary || ''}\nCategory: ${story.category}\nLocation: ${story.locationName}\nSources:\n${sources}`;

    // Generate all formats in parallel
    const { generateWithFallback } = await import('../lib/llm-factory.js');

    const formatPrompts: Record<string, string> = {
      tv_30s: `Write a 30-second TV anchor read for this story. Tone: ${tone}. Format: just the script text, no stage directions.\n\n${storyContext}`,
      tv_60s: `Write a 60-second TV anchor read for this story. Include a toss to reporter if relevant. Tone: ${tone}.\n\n${storyContext}`,
      radio_30s: `Write a 30-second radio news brief. Conversational tone for ${tone}.\n\n${storyContext}`,
      radio_60s: `Write a 60-second radio news report. Include sound bite suggestions. Tone: ${tone}.\n\n${storyContext}`,
      web_article: `Write a 200-word web news article with a compelling headline. SEO-friendly. Tone: ${tone}.\n\n${storyContext}`,
      social_post: `Write a compelling social media post (max 280 chars) for this story. Include relevant hashtags.\n\n${storyContext}`,
      social_thread: `Write a 4-tweet thread about this story. Each tweet under 280 chars. Numbered 1/4, 2/4, etc.\n\n${storyContext}`,
      push_notification: `Write a push notification title (max 65 chars) and body (max 150 chars) for this breaking story.\n\nFormat:\nTITLE: ...\nBODY: ...\n\n${storyContext}`,
    };

    const results: Record<string, string> = {};
    const errors: Record<string, string> = {};

    await Promise.allSettled(
      body.data.formats.map(async (format) => {
        try {
          const result = await generateWithFallback(formatPrompts[format], {
            maxTokens: format.includes('article') ? 500 : format.includes('thread') ? 400 : 200,
            temperature: 0.4,
            systemPrompt: `You are a ${tone} writer for a broadcast newsroom. Write clean, factual, ready-to-use content.`,
          });
          results[format] = result.content || result.text || '';
        } catch (err: any) {
          errors[format] = err.message;
        }
      })
    );

    // Store the package in the AccountStory
    try {
      await prisma.accountStory.upsert({
        where: { accountId_baseStoryId: { accountId: au.accountId, baseStoryId: story.id } },
        create: {
          accountId: au.accountId,
          baseStoryId: story.id,
          aiDrafts: results,
        },
        update: {
          aiDrafts: results,
        },
      });
    } catch {}

    return reply.send({
      storyId: story.id,
      title: story.title,
      package: results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      formatsGenerated: Object.keys(results).length,
      formatsRequested: body.data.formats.length,
    });
  });
}
