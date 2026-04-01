// @ts-nocheck
/**
 * Yahoo News RSS + Survey System + Merge Phrase Management
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

function requireAuth(req: any) {
  const au = req.accountUser;
  if (!au) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return au;
}

export async function extrasRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // ═══════════════════════════════════════════════════════════════════════
  // YAHOO NEWS RSS
  // ═══════════════════════════════════════════════════════════════════════

  // POST /extras/seed-yahoo — create Yahoo News RSS sources per market
  app.post('/extras/seed-yahoo', async (request, reply) => {
    const au = requireAuth(request);
    if (au.role !== 'OWNER' && au.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const markets = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true, state: true },
    });

    let created = 0;
    // Yahoo News RSS feeds by category
    const yahooFeeds = [
      { suffix: '', label: 'Top Stories', url: 'https://www.yahoo.com/news/rss' },
      { suffix: ' us', label: 'US News', url: 'https://www.yahoo.com/news/us/rss' },
      { suffix: ' politics', label: 'Politics', url: 'https://www.yahoo.com/news/politics/rss' },
      { suffix: ' science', label: 'Science', url: 'https://www.yahoo.com/news/science/rss' },
      { suffix: ' world', label: 'World', url: 'https://www.yahoo.com/news/world/rss' },
    ];

    // Create national Yahoo feeds linked to National market
    const nationalMarket = await prisma.market.findFirst({ where: { slug: 'national' } });
    if (nationalMarket) {
      for (const yf of yahooFeeds) {
        const name = `Yahoo News - ${yf.label}`;
        const exists = await prisma.source.findFirst({ where: { name } });
        if (!exists) {
          try {
            const src = await prisma.source.create({
              data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name, url: yf.url, trustScore: 0.70, isGlobal: false, metadata: { type: 'yahoo-news', subtype: yf.label.toLowerCase() } },
            });
            await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } }).catch(() => {});
            created++;
          } catch { /* dedup */ }
        }
      }
    }

    // Per-market Yahoo local search
    for (const market of markets) {
      if (market.name === 'National') continue;
      const name = `Yahoo News Local - ${market.name}`;
      const exists = await prisma.source.findFirst({ where: { name } });
      if (!exists) {
        try {
          const url = `https://news.search.yahoo.com/rss?p=${encodeURIComponent(market.name + ' ' + (market.state || ''))}&ei=UTF-8`;
          const src = await prisma.source.create({
            data: { platform: 'RSS' as any, sourceType: 'NEWS_ORG' as any, name, url, marketId: market.id, trustScore: 0.65, isGlobal: false, metadata: { type: 'yahoo-news-local', market: market.name } },
          });
          await prisma.accountSource.create({ data: { accountId: au.accountId, sourceId: src.id, isEnabled: true } }).catch(() => {});
          created++;
        } catch { /* dedup */ }
      }
    }

    return reply.send({ message: `Created ${created} Yahoo News sources`, created });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SURVEY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  // GET /surveys — list surveys for account
  app.get('/surveys', async (request, reply) => {
    const au = requireAuth(request);

    try {
      const surveys = await prisma.$queryRaw<any[]>`
        SELECT * FROM "Survey" WHERE "accountId" = ${au.accountId} ORDER BY "createdAt" DESC
      `;
      return reply.send({ data: surveys });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // POST /surveys — create a survey
  app.post('/surveys', async (request, reply) => {
    const au = requireAuth(request);

    const body = z.object({
      title: z.string().min(1).max(255),
      questions: z.array(z.object({
        text: z.string(),
        type: z.enum(['text', 'rating', 'multiple_choice', 'yes_no']),
        options: z.array(z.string()).optional(),
      })).min(1).max(20),
      targetGroup: z.string().optional(), // 'all', specific group ID
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error', details: body.error.flatten() });

    try {
      await prisma.$executeRaw`
        INSERT INTO "Survey" (id, "accountId", title, questions, "targetGroup", "isActive", "createdAt")
        VALUES (${`survey_${Date.now()}`}, ${au.accountId}, ${body.data.title}, ${JSON.stringify(body.data.questions)}::jsonb, ${body.data.targetGroup || 'all'}, true, NOW())
      `;
      return reply.status(201).send({ message: 'Survey created' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /surveys/:id/respond — submit survey response
  app.post('/surveys/:id/respond', async (request, reply) => {
    const au = requireAuth(request);
    const { id: surveyId } = request.params as { id: string };

    const body = z.object({
      answers: z.array(z.object({
        questionIndex: z.number(),
        answer: z.union([z.string(), z.number()]),
      })),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      await prisma.$executeRaw`
        INSERT INTO "SurveyResponse" (id, "surveyId", "userId", answers, "createdAt")
        VALUES (${`resp_${Date.now()}`}, ${surveyId}, ${au.userId}, ${JSON.stringify(body.data.answers)}::jsonb, NOW())
      `;
      return reply.status(201).send({ message: 'Response recorded' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /surveys/:id/results — get survey results
  app.get('/surveys/:id/results', async (request, reply) => {
    requireAuth(request);
    const { id: surveyId } = request.params as { id: string };

    try {
      const responses = await prisma.$queryRaw<any[]>`
        SELECT * FROM "SurveyResponse" WHERE "surveyId" = ${surveyId} ORDER BY "createdAt" DESC
      `;
      return reply.send({ surveyId, responses, total: responses.length });
    } catch {
      return reply.send({ surveyId, responses: [], total: 0 });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MERGE PHRASE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  // GET /merge-phrases — list custom merge phrases
  app.get('/merge-phrases', async (request, reply) => {
    requireAuth(request);

    try {
      const phrases = await prisma.$queryRaw<any[]>`
        SELECT * FROM "MergePhrase" ORDER BY phrase
      `;
      return reply.send({ data: phrases });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // POST /merge-phrases — add a merge phrase
  app.post('/merge-phrases', async (request, reply) => {
    requireAuth(request);

    const body = z.object({
      phrase: z.string().min(2).max(200),
      action: z.enum(['merge', 'link', 'ignore']).default('merge'),
      notes: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation error' });

    try {
      await prisma.$executeRaw`
        INSERT INTO "MergePhrase" (id, phrase, action, notes, "createdAt")
        VALUES (${`mp_${Date.now()}`}, ${body.data.phrase.toLowerCase()}, ${body.data.action}, ${body.data.notes || null}, NOW())
        ON CONFLICT (phrase) DO UPDATE SET action = ${body.data.action}, notes = ${body.data.notes || null}
      `;
      return reply.status(201).send({ message: `Merge phrase added: "${body.data.phrase}"` });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /merge-phrases/:id — remove a merge phrase
  app.delete('/merge-phrases/:id', async (request, reply) => {
    requireAuth(request);
    const { id } = request.params as { id: string };

    try {
      await prisma.$executeRaw`DELETE FROM "MergePhrase" WHERE id = ${id}`;
      return reply.send({ message: 'Merge phrase removed' });
    } catch {
      return reply.status(404).send({ error: 'Phrase not found' });
    }
  });
}
