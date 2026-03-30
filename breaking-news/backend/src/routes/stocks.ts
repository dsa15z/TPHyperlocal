// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function stockRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stocks/alerts - recent major stock moves
  app.get('/stocks/alerts', async (_request, reply) => {
    const alerts = await prisma.stockAlert.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 30,
    });
    return reply.send({ data: alerts });
  });

  // POST /api/v1/stocks/check - trigger a stock price check (called by worker/cron)
  app.post('/stocks/check', async (request, reply) => {
    // This would normally be called by a scheduled worker
    // For now, accept manual input of stock data
    const data = z.object({
      ticker: z.string().min(1).max(10),
      companyName: z.string().min(1),
      price: z.number(),
      previousClose: z.number(),
    }).parse(request.body);

    const changePercent = ((data.price - data.previousClose) / data.previousClose) * 100;
    const absChange = Math.abs(changePercent);

    // Only create alert for significant moves
    if (absChange < 2) {
      return reply.send({ message: 'Change not significant enough', changePercent });
    }

    const direction = changePercent > 0 ? 'UP' : 'DOWN';
    const magnitude = absChange >= 5 ? 'MAJOR' : absChange >= 3 ? 'SIGNIFICANT' : 'NOTABLE';
    const headline = `${data.companyName} (${data.ticker}) ${direction === 'UP' ? 'surges' : 'drops'} ${absChange.toFixed(1)}% to $${data.price.toFixed(2)}`;

    const alert = await prisma.stockAlert.create({
      data: {
        ticker: data.ticker.toUpperCase(),
        companyName: data.companyName,
        changePercent,
        price: data.price,
        previousClose: data.previousClose,
        direction,
        magnitude,
        headline,
      },
    });

    return reply.status(201).send({ data: alert });
  });
}
