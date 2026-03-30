// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

// Reference tickers always shown
const REFERENCE_TICKERS = ['%5EDJI', '%5EIXIC', '%5EGSPC', 'BTC-USD']; // DOW, NASDAQ, S&P500, Bitcoin
const REFERENCE_LABELS: Record<string, string> = {
  '%5EDJI': 'DOW', '%5EIXIC': 'NASDAQ', '%5EGSPC': 'S&P 500', 'BTC-USD': 'Bitcoin',
};

interface QuoteData {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  direction: string;
}

async function fetchYahooQuote(ticker: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: meta.symbol || ticker,
      label: REFERENCE_LABELS[ticker] || meta.shortName || meta.symbol || ticker,
      price,
      change,
      changePercent,
      direction: change >= 0 ? 'UP' : 'DOWN',
    };
  } catch {
    return null;
  }
}

export async function stockRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/v1/stocks/live - live reference prices (cached 60s)
  app.get('/stocks/live', async (_request, reply) => {
    const cacheKey = 'stocks:live';
    const cached = await cacheGet<QuoteData[]>(cacheKey);
    if (cached) return reply.send({ data: cached, cached: true });

    const quotes: QuoteData[] = [];
    for (const ticker of REFERENCE_TICKERS) {
      const q = await fetchYahooQuote(ticker);
      if (q) quotes.push(q);
    }

    if (quotes.length > 0) {
      await cacheSet(cacheKey, quotes, 60);
    }

    return reply.send({ data: quotes, cached: false });
  });

  // GET /api/v1/stocks/alerts - recent major stock moves
  app.get('/stocks/alerts', async (_request, reply) => {
    const alerts = await prisma.stockAlert.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 30,
    });
    return reply.send({ data: alerts });
  });

  // GET /api/v1/stocks/ticker - scrolling ticker data (top 20 movers, cached 5min)
  app.get('/stocks/ticker', async (_request, reply) => {
    const cacheKey = 'stocks:ticker';
    const cached = await cacheGet<QuoteData[]>(cacheKey);
    if (cached) return reply.send({ data: cached, cached: true });

    const TICKER_SYMBOLS = [
      'XOM', 'CVX', 'COP', 'SLB', 'HAL', // Houston energy
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', // Tech
      'JPM', 'BAC', 'GS', // Banks
      'SPY', 'QQQ', 'DIA', // ETFs
      'BTC-USD', 'ETH-USD', // Crypto
    ];

    const quotes: QuoteData[] = [];
    for (const ticker of TICKER_SYMBOLS.slice(0, 15)) {
      const q = await fetchYahooQuote(ticker);
      if (q) quotes.push(q);
    }

    // Sort by absolute change percent (biggest movers first)
    quotes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    if (quotes.length > 0) {
      await cacheSet(cacheKey, quotes, 300);
    }

    return reply.send({ data: quotes, cached: false });
  });

  // POST /api/v1/stocks/check - manual trigger (for worker)
  app.post('/stocks/check', async (request, reply) => {
    const data = z.object({
      ticker: z.string().min(1).max(10),
      companyName: z.string().min(1),
      price: z.number(),
      previousClose: z.number(),
    }).parse(request.body);

    const changePercent = ((data.price - data.previousClose) / data.previousClose) * 100;
    const absChange = Math.abs(changePercent);

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
