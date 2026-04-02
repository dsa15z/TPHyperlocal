// @ts-nocheck
/**
 * Conversation Starters — AI-generated discussion prompts for on-air talent.
 * Given a story, generates talk-track bullet points, devil's advocate angles,
 * listener call-in questions, and social media engagement hooks.
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { getPayload } from '../lib/route-helpers.js';


const FORMATS = ['radio_talk', 'tv_anchor', 'podcast', 'social_engagement'] as const;

export async function conversationStarterRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /conversation-starters/generate — generate prompts for a story
  app.post('/conversation-starters/generate', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Unauthorized' });

    const body = z.object({
      storyId: z.string(),
      format: z.enum(FORMATS).default('radio_talk'),
      tone: z.string().optional(), // "serious", "casual", "humorous"
      count: z.number().int().min(1).max(10).default(5),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    const story = await prisma.story.findUnique({
      where: { id: body.data.storyId },
      include: { storySources: { include: { sourcePost: true }, take: 5 } },
    });

    if (!story) return reply.status(404).send({ error: 'Story not found' });

    const sourceTexts = story.storySources.map(ss => ss.sourcePost.title || ss.sourcePost.content.substring(0, 200)).join('\n');

    // Build prompt based on format
    const formatInstructions: Record<string, string> = {
      radio_talk: 'Generate discussion prompts for a radio talk show host. Include: talking points, devil\'s advocate positions, caller question prompts, and transition phrases.',
      tv_anchor: 'Generate anchor desk talking points for a TV newscast. Include: lead-in, key facts to emphasize, follow-up questions for reporters, and tease for next segment.',
      podcast: 'Generate podcast discussion starters. Include: opening hook, deep-dive questions, expert interview questions, and listener engagement prompts.',
      social_engagement: 'Generate social media engagement hooks. Include: poll questions, hot-take prompts, thread starters, and call-to-action phrases.',
    };

    const prompt = `Story: "${story.title}"
Summary: ${story.aiSummary || story.summary || sourceTexts}
Category: ${story.category || 'General'}
Location: ${story.locationName || 'National'}
Sources: ${story.sourceCount} sources reporting

${formatInstructions[body.data.format]}
${body.data.tone ? `Tone: ${body.data.tone}` : ''}
Generate exactly ${body.data.count} conversation starters. Return as JSON array of objects with fields: "prompt" (the discussion prompt), "type" (talking_point|devils_advocate|caller_question|transition|hook), "context" (brief context for why this angle works).`;

    // Use the LLM factory to generate
    let starters: any[] = [];
    try {
      const { generateWithFallback } = await import('../lib/llm-factory.js');
      const result = await generateWithFallback(prompt, { maxTokens: 1500, temperature: 0.8 });

      // Parse JSON from response
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        starters = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: split by numbered lines
        starters = result.content.split(/\d+[\.\)]\s+/).filter(Boolean).map((text, i) => ({
          prompt: text.trim(),
          type: i === 0 ? 'talking_point' : 'hook',
          context: '',
        }));
      }
    } catch (err: any) {
      // Generate heuristic starters if LLM fails
      starters = [
        { prompt: `What's your take on: ${story.title}?`, type: 'hook', context: 'Simple open-ended engagement' },
        { prompt: `${story.sourceCount} sources are now reporting on this. What does that tell us about the significance?`, type: 'talking_point', context: 'Source diversity angle' },
        { prompt: `If you were directly affected by this, what would you want to know first?`, type: 'caller_question', context: 'Empathy-driven engagement' },
        { prompt: `Some might argue this isn't as significant as it seems. What's the counterpoint?`, type: 'devils_advocate', context: 'Balance and critical thinking' },
        { prompt: `We'll have more on this story as it develops. Stay with us.`, type: 'transition', context: 'Standard transition' },
      ];
    }

    // Store in AccountStory if derivative exists
    try {
      const derivative = await prisma.accountStory.findUnique({
        where: { accountId_baseStoryId: { accountId: payload.accountId, baseStoryId: story.id } },
      });
      if (derivative) {
        const existing = Array.isArray(derivative.aiDrafts) ? derivative.aiDrafts : [];
        await prisma.accountStory.update({
          where: { id: derivative.id },
          data: {
            aiDrafts: [...existing, {
              id: `conv-${Date.now()}`,
              format: 'conversation_starters',
              subformat: body.data.format,
              content: JSON.stringify(starters),
              createdAt: new Date().toISOString(),
            }],
          },
        });
      }
    } catch { /* non-critical */ }

    return reply.send({
      storyId: story.id,
      format: body.data.format,
      starters,
      generatedAt: new Date().toISOString(),
    });
  });

  // GET /conversation-starters/:storyId — get previously generated starters
  app.get('/conversation-starters/:storyId', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Unauthorized' });
    const { storyId } = request.params as { storyId: string };

    const derivative = await prisma.accountStory.findUnique({
      where: { accountId_baseStoryId: { accountId: payload.accountId, baseStoryId: storyId } },
    });

    if (!derivative) return reply.send({ starters: [] });

    const drafts = Array.isArray(derivative.aiDrafts) ? derivative.aiDrafts : [];
    const convDrafts = drafts.filter((d: any) => d.format === 'conversation_starters');

    return reply.send({
      storyId,
      starters: convDrafts.map((d: any) => ({
        ...d,
        content: typeof d.content === 'string' ? JSON.parse(d.content) : d.content,
      })),
    });
  });
}
