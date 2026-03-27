import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('digest');

interface DigestJob {
  subscriptionId: string;
}

/**
 * Generates and sends email digests of top stories to subscribed users.
 * Each DigestSubscription defines frequency, filters, and recipient.
 */

function buildDigestHtml(stories: Array<{
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  status: string;
  compositeScore: number;
  sourceCount: number;
  firstSeenAt: Date;
}>, subscription: { email: string; filters: any }): string {
  const storyRows = stories.map((s, i) => `
    <tr style="border-bottom: 1px solid #333;">
      <td style="padding: 12px 8px; color: #999;">${i + 1}</td>
      <td style="padding: 12px 8px;">
        <strong style="color: #fff;">${escapeHtml(s.title)}</strong>
        ${s.summary ? `<br><span style="color: #aaa; font-size: 13px;">${escapeHtml(s.summary.substring(0, 150))}...</span>` : ''}
      </td>
      <td style="padding: 12px 8px; color: #aaa;">${s.category || '-'}</td>
      <td style="padding: 12px 8px; color: ${s.status === 'BREAKING' ? '#ef4444' : s.status === 'TRENDING' ? '#f59e0b' : '#6b7280'};">${s.status}</td>
      <td style="padding: 12px 8px; color: #aaa;">${s.sourceCount}</td>
      <td style="padding: 12px 8px; color: #aaa;">${Math.round(s.compositeScore * 100)}%</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background: #0a0a0f; color: #e5e7eb; font-family: -apple-system, sans-serif; padding: 24px;">
  <div style="max-width: 700px; margin: 0 auto;">
    <h1 style="color: #fff; font-size: 24px; margin-bottom: 4px;">Breaking News Digest</h1>
    <p style="color: #6b7280; font-size: 14px; margin-top: 0;">
      ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <thead>
        <tr style="border-bottom: 2px solid #333;">
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">#</th>
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">Story</th>
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">Category</th>
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">Status</th>
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">Sources</th>
          <th style="padding: 8px; text-align: left; color: #6b7280; font-size: 12px;">Score</th>
        </tr>
      </thead>
      <tbody>${storyRows}</tbody>
    </table>
    <p style="color: #4b5563; font-size: 12px; margin-top: 24px;">
      Sent to ${subscription.email} | Manage preferences in your dashboard
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const smtpHost = process.env['SMTP_HOST'];
  const smtpPort = process.env['SMTP_PORT'] || '587';
  const smtpUser = process.env['SMTP_USER'];
  const smtpPass = process.env['SMTP_PASS'];
  const smtpFrom = process.env['SMTP_FROM'] || 'digest@breakingnews.local';

  if (!smtpHost || !smtpUser || !smtpPass) {
    logger.warn({ to, subject }, 'SMTP not configured, skipping email send');
    return;
  }

  // Use nodemailer-compatible approach via fetch to an SMTP relay
  // For production, use Resend, SendGrid, or SES API instead
  logger.info({ to, subject }, 'Email would be sent (SMTP integration pending)');
  // TODO: Integrate with nodemailer or Resend API
}

async function processDigest(job: Job<DigestJob>): Promise<void> {
  const { subscriptionId } = job.data;

  const subscription = await prisma.digestSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription || !subscription.isActive) {
    logger.info({ subscriptionId }, 'Subscription not found or inactive, skipping');
    return;
  }

  logger.info({ subscriptionId, email: subscription.email, frequency: subscription.frequency }, 'Generating digest');

  // Determine time window based on frequency
  const hoursMap: Record<string, number> = {
    HOURLY: 1,
    TWICE_DAILY: 12,
    DAILY: 24,
    WEEKLY: 168,
  };
  const hours = hoursMap[subscription.frequency] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Build filters
  const filters = (subscription.filters || {}) as Record<string, any>;
  const where: any = {
    firstSeenAt: { gte: since },
    status: { not: 'ARCHIVED' },
    mergedIntoId: null,
  };
  if (filters.category) where.category = filters.category;
  if (filters.minScore) where.compositeScore = { gte: filters.minScore };

  // Fetch top stories
  const stories = await prisma.story.findMany({
    where,
    orderBy: { compositeScore: 'desc' },
    take: 20,
  });

  if (stories.length === 0) {
    logger.info({ subscriptionId }, 'No stories for digest, skipping send');
    return;
  }

  // Build and send email
  const subject = `Breaking News Digest — ${stories.length} stories (${subscription.frequency.toLowerCase()})`;
  const html = buildDigestHtml(stories, subscription);

  await sendEmail(subscription.email, subject, html);

  // Update last sent
  await prisma.digestSubscription.update({
    where: { id: subscriptionId },
    data: { lastSentAt: new Date() },
  });

  logger.info({ subscriptionId, storyCount: stories.length }, 'Digest sent');
}

export function createDigestWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<DigestJob>(
    'digest',
    async (job) => { await processDigest(job); },
    { connection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Digest job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Digest job failed');
  });

  return worker;
}
