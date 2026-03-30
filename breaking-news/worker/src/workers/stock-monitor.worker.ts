// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('stock-monitor');

// Major US tickers to monitor for big moves
const WATCHED_TICKERS = [
  // Major indices ETFs
  'SPY', 'QQQ', 'DIA', 'IWM',
  // Houston/Texas companies
  'XOM', 'CVX', 'COP', 'SLB', 'HAL', 'BKR', // Energy
  'LIN', 'APD', // Industrial gases
  'WTRG', 'CenterPoint', // Utilities
  // Tech giants (market movers)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  // Banks
  'JPM', 'BAC', 'GS', 'MS',
];

interface StockQuote {
  ticker: string;
  price: number;
  previousClose: number;
  companyName: string;
}

/**
 * Fetch stock quotes using Yahoo Finance unofficial API (free, no key needed).
 */
async function fetchQuotes(tickers: string[]): Promise<StockQuote[]> {
  const quotes: StockQuote[] = [];

  // Use Yahoo Finance v8 quote endpoint (public, no auth)
  const symbols = tickers.join(',');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols}?range=1d&interval=1d`;

  // Fetch individual quotes (Yahoo v7 is more reliable for multiple)
  for (const ticker of tickers.slice(0, 20)) { // Limit to 20 to avoid rate limits
    try {
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!resp.ok) continue;
      const data = await resp.json();
      const result = data.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta;
      quotes.push({
        ticker: meta.symbol,
        price: meta.regularMarketPrice,
        previousClose: meta.previousClose || meta.chartPreviousClose,
        companyName: meta.shortName || meta.longName || ticker,
      });
    } catch {
      // Skip failed tickers
    }
  }

  return quotes;
}

async function processStockMonitor(): Promise<void> {
  logger.info('Running stock price check');

  const quotes = await fetchQuotes(WATCHED_TICKERS);
  let alertCount = 0;

  for (const quote of quotes) {
    if (!quote.previousClose || quote.previousClose === 0) continue;

    const changePercent = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
    const absChange = Math.abs(changePercent);

    // Only alert for moves > 2%
    if (absChange < 2) continue;

    const direction = changePercent > 0 ? 'UP' : 'DOWN';
    const magnitude = absChange >= 5 ? 'MAJOR' : absChange >= 3 ? 'SIGNIFICANT' : 'NOTABLE';

    // Check if we already alerted this ticker today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await prisma.stockAlert.findFirst({
      where: { ticker: quote.ticker, detectedAt: { gte: today } },
    });
    if (existing) continue;

    const headline = `${quote.companyName} (${quote.ticker}) ${direction === 'UP' ? 'surges' : 'drops'} ${absChange.toFixed(1)}% to $${quote.price.toFixed(2)}`;

    await prisma.stockAlert.create({
      data: {
        ticker: quote.ticker,
        companyName: quote.companyName,
        changePercent,
        price: quote.price,
        previousClose: quote.previousClose,
        direction,
        magnitude,
        headline,
      },
    });

    alertCount++;
    logger.info({ ticker: quote.ticker, change: `${changePercent.toFixed(1)}%`, magnitude }, 'Stock alert created');
  }

  logger.info({ quotesChecked: quotes.length, alerts: alertCount }, 'Stock monitoring complete');
}

export function createStockMonitorWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker('stock-monitor', async () => {
    await processStockMonitor();
  }, { connection, concurrency: 1 });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Stock monitor job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Stock monitor job failed'));
  return worker;
}
