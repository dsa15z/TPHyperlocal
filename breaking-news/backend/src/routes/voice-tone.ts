// @ts-nocheck
/**
 * MyVoice — per-account voice/tone customization for AI-generated content.
 * Each account can define their brand voice, preferred writing style,
 * forbidden words, and tone guidelines. These are injected into all
 * AI generation prompts (first drafts, conversation starters, scripts).
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

function requireAuth(req: any) {
  const au = req.accountUser;
  if (!au) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return au;
}

const VoiceSchema = z.object({
  stationName: z.string().optional(),
  callSign: z.string().optional(),
  brandVoice: z.string().optional(), // "Professional, authoritative, warm"
  writingStyle: z.string().optional(), // "AP Style, short sentences, active voice"
  forbiddenWords: z.array(z.string()).optional(), // Words to never use
  preferredPhrases: z.array(z.string()).optional(), // Phrases to favor
  toneGuidelines: z.string().optional(), // "Never sensationalize. Always attribute."
  targetAudience: z.string().optional(), // "25-54 adults, college-educated"
  locale: z.string().optional(), // "Houston, TX metro area"
  signOff: z.string().optional(), // "Stay informed, stay safe."
});

export async function voiceToneRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /voice-tone — get account's voice settings
  app.get('/voice-tone', async (request, reply) => {
    const au = requireAuth(request);

    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { metadata: true },
    });

    const meta = (account?.metadata || {}) as Record<string, any>;
    return reply.send({ voice: meta.voiceTone || null });
  });

  // PUT /voice-tone — save account's voice settings
  app.put('/voice-tone', async (request, reply) => {
    const au = requireAuth(request);

    const parsed = VoiceSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });

    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { metadata: true },
    });

    const existingMeta = (account?.metadata || {}) as Record<string, any>;

    await prisma.account.update({
      where: { id: au.accountId },
      data: {
        metadata: { ...existingMeta, voiceTone: parsed.data },
      },
    });

    return reply.send({ message: 'Voice settings saved', voice: parsed.data });
  });

  // GET /voice-tone/prompt — get the voice prompt string for AI injection
  app.get('/voice-tone/prompt', async (request, reply) => {
    const au = requireAuth(request);

    const account = await prisma.account.findUnique({
      where: { id: au.accountId },
      select: { metadata: true, name: true },
    });

    const meta = (account?.metadata || {}) as Record<string, any>;
    const voice = meta.voiceTone;

    if (!voice) {
      return reply.send({ prompt: null });
    }

    // Build the AI prompt injection
    const parts: string[] = [];
    if (voice.stationName) parts.push(`You are writing for ${voice.stationName}${voice.callSign ? ` (${voice.callSign})` : ''}.`);
    if (voice.brandVoice) parts.push(`Brand voice: ${voice.brandVoice}.`);
    if (voice.writingStyle) parts.push(`Writing style: ${voice.writingStyle}.`);
    if (voice.toneGuidelines) parts.push(`Tone: ${voice.toneGuidelines}.`);
    if (voice.targetAudience) parts.push(`Target audience: ${voice.targetAudience}.`);
    if (voice.locale) parts.push(`Local market: ${voice.locale}.`);
    if (voice.forbiddenWords?.length) parts.push(`NEVER use these words: ${voice.forbiddenWords.join(', ')}.`);
    if (voice.preferredPhrases?.length) parts.push(`Preferred phrases: ${voice.preferredPhrases.join(', ')}.`);
    if (voice.signOff) parts.push(`Sign-off: "${voice.signOff}".`);

    return reply.send({ prompt: parts.join(' ') });
  });
}
