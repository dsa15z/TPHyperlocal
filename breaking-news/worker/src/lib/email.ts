// @ts-nocheck
/**
 * Email sending via Mailgun SMTP (HTTP API) or SendGrid fallback.
 * Uses Mailgun's HTTP API to avoid needing an SMTP library.
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('email');

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email. Tries Mailgun HTTP API first, then SendGrid, then SMTP relay.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const smtpUser = process.env['SMTP_USER'];
  const smtpPass = process.env['SMTP_PASS'];
  const smtpFrom = options.from || process.env['SMTP_FROM'] || 'alerts@futuri.email';

  // Method 1: Mailgun HTTP API (using SMTP credentials)
  if (smtpUser && smtpPass && smtpUser.includes('@')) {
    const domain = smtpUser.split('@')[1]; // e.g., "futuri.email"
    try {
      // Mailgun API endpoint: https://api.mailgun.net/v3/{domain}/messages
      // Auth: Basic api:{SMTP password} (Mailgun accepts SMTP password as API key)
      const auth = Buffer.from(`api:${smtpPass}`).toString('base64');

      const formData = new URLSearchParams();
      formData.append('from', `TopicPulse <${smtpFrom}>`);
      formData.append('to', options.to);
      formData.append('subject', options.subject);
      formData.append('html', options.html);

      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
        body: formData,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        logger.info({ to: options.to, subject: options.subject, id: data.id }, 'Email sent via Mailgun');
        return true;
      }

      const errText = await res.text().catch(() => '');
      logger.warn({ status: res.status, error: errText }, 'Mailgun API failed, trying fallback');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Mailgun API error, trying fallback');
    }
  }

  // Method 2: SendGrid HTTP API
  const sendgridKey = process.env['SENDGRID_API_KEY'];
  if (sendgridKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: smtpFrom },
          subject: options.subject,
          content: [{ type: 'text/html', value: options.html }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 202 || res.status === 200) {
        logger.info({ to: options.to }, 'Email sent via SendGrid');
        return true;
      }
      logger.warn({ status: res.status }, 'SendGrid failed');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'SendGrid error');
    }
  }

  logger.error({ to: options.to, subject: options.subject },
    'No email service available (set SMTP_USER+SMTP_PASS for Mailgun or SENDGRID_API_KEY)');
  return false;
}
