/**
 * Alert Channels — Push breaking news to external channels.
 *
 * Supports: Slack webhook, Email (SMTP), generic webhook
 * Triggered by the News Director or when a story transitions to BREAKING/ALERT.
 *
 * Configuration via SystemKnowledge table (key: 'alert_channels')
 * Format: JSON array of channel configs
 */

import { prisma } from './prisma.js';

interface AlertChannel {
  type: 'slack' | 'email' | 'webhook';
  name: string;
  enabled: boolean;
  config: {
    // Slack
    webhookUrl?: string;
    channel?: string;
    // Email
    to?: string[];
    // Webhook
    url?: string;
    headers?: Record<string, string>;
  };
  filters?: {
    statuses?: string[];       // Only alert for these statuses
    categories?: string[];     // Only alert for these categories
    minScore?: number;         // Minimum composite score
    marketIds?: string[];      // Only alert for these markets
  };
}

interface StoryAlert {
  id: string;
  title: string;
  status: string;
  category: string;
  location: string;
  compositeScore: number;
  sourceCount: number;
  url: string; // Frontend URL
}

// Cache channels config (refresh every 5 min)
let channelsCache: AlertChannel[] = [];
let channelsCacheExpiry = 0;

async function getChannels(): Promise<AlertChannel[]> {
  if (Date.now() < channelsCacheExpiry && channelsCache.length > 0) return channelsCache;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT content FROM "SystemKnowledge" WHERE key = 'alert_channels' LIMIT 1
    `;
    if (rows[0]?.content) {
      channelsCache = JSON.parse(rows[0].content);
      channelsCacheExpiry = Date.now() + 5 * 60 * 1000;
    }
  } catch {
    // Table may not exist
  }
  return channelsCache;
}

function matchesFilters(alert: StoryAlert, filters?: AlertChannel['filters']): boolean {
  if (!filters) return true;
  if (filters.statuses?.length && !filters.statuses.includes(alert.status)) return false;
  if (filters.categories?.length && !filters.categories.includes(alert.category)) return false;
  if (filters.minScore && alert.compositeScore < filters.minScore) return false;
  return true;
}

async function sendSlack(channel: AlertChannel, alert: StoryAlert): Promise<void> {
  const url = channel.config.webhookUrl;
  if (!url) return;

  const emoji = alert.status === 'ALERT' ? '🚨' : '⚡';
  const scoreBar = '█'.repeat(Math.round(alert.compositeScore * 10));
  const payload = {
    text: `${emoji} *${alert.status}*: ${alert.title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${alert.status}* — ${alert.title}\n` +
            `📍 ${alert.location || 'National'} · 📂 ${alert.category} · ` +
            `📊 Score: ${Math.round(alert.compositeScore * 100)} ${scoreBar}\n` +
            `📰 ${alert.sourceCount} source${alert.sourceCount !== 1 ? 's' : ''} reporting`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Story' },
            url: alert.url,
          },
        ],
      },
    ],
  };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
}

async function sendEmail(channel: AlertChannel, alert: StoryAlert): Promise<void> {
  const to = channel.config.to;
  if (!to?.length) return;

  const smtpHost = process.env['SMTP_HOST'];
  const smtpUser = process.env['SMTP_USER'];
  const smtpPass = process.env['SMTP_PASS'];
  const smtpPort = process.env['SMTP_PORT'] || '587';
  const smtpFrom = process.env['SMTP_FROM'] || 'alerts@topicpulse.ai';

  if (!smtpHost || !smtpUser) return;

  // Use nodemailer-compatible SMTP via fetch to an internal endpoint
  // For now, queue to the notification worker which handles email
  try {
    const { Queue } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    const redis = new IORedis(process.env['REDIS_URL'] || 'redis://localhost:6379', { maxRetriesPerRequest: null });
    const queue = new Queue('notification', { connection: redis });
    await queue.add('email-alert', {
      to,
      subject: `${alert.status === 'ALERT' ? '🚨' : '⚡'} ${alert.status}: ${alert.title}`,
      html: `
        <h2>${alert.status}: ${alert.title}</h2>
        <p>📍 ${alert.location || 'National'} · 📂 ${alert.category}</p>
        <p>📊 Score: ${Math.round(alert.compositeScore * 100)}/100 · ${alert.sourceCount} sources</p>
        <p><a href="${alert.url}">View in TopicPulse →</a></p>
      `,
      from: smtpFrom,
    });
    await queue.close();
    await redis.quit();
  } catch {}
}

async function sendWebhook(channel: AlertChannel, alert: StoryAlert): Promise<void> {
  const url = channel.config.url;
  if (!url) return;

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(channel.config.headers || {}),
    },
    body: JSON.stringify({
      event: 'breaking_story',
      story: alert,
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * Dispatch a story alert to all configured channels.
 * Called when a story transitions to BREAKING or ALERT.
 */
export async function dispatchAlert(alert: StoryAlert): Promise<{ sent: number; errors: string[] }> {
  const channels = await getChannels();
  let sent = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    if (!channel.enabled) continue;
    if (!matchesFilters(alert, channel.filters)) continue;

    try {
      switch (channel.type) {
        case 'slack': await sendSlack(channel, alert); break;
        case 'email': await sendEmail(channel, alert); break;
        case 'webhook': await sendWebhook(channel, alert); break;
      }
      sent++;
    } catch (err: any) {
      errors.push(`${channel.name}: ${err.message}`);
    }
  }

  return { sent, errors };
}

/**
 * Save alert channel configuration.
 */
export async function saveAlertChannels(channels: AlertChannel[]): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "SystemKnowledge" (id, key, content, category, "updatedAt")
    VALUES ('sk_alert_channels', 'alert_channels', ${JSON.stringify(channels)}, 'config', NOW())
    ON CONFLICT (key) DO UPDATE SET content = ${JSON.stringify(channels)}, "updatedAt" = NOW()
  `;
  channelsCache = channels;
  channelsCacheExpiry = Date.now() + 5 * 60 * 1000;
}

/**
 * Get current alert channel configuration.
 */
export async function getAlertChannels(): Promise<AlertChannel[]> {
  return getChannels();
}
