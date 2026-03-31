// @ts-nocheck
import { createChildLogger } from './logger.js';

const logger = createChildLogger('email');

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via SendGrid's REST API (no SDK required).
 * Requires SENDGRID_API_KEY env var. Falls back gracefully if not configured.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env['SENDGRID_API_KEY'] || process.env['SMTP_API_KEY'];

  if (!apiKey) {
    logger.warn({ to: options.to, subject: options.subject }, 'No SendGrid API key configured (set SENDGRID_API_KEY), skipping email send');
    return false;
  }

  const fromAddr = options.from || process.env['EMAIL_FROM'] || 'noreply@breakingnews.local';

  const body = {
    personalizations: [
      {
        to: [{ email: options.to }],
      },
    ],
    from: { email: fromAddr },
    subject: options.subject,
    content: [
      {
        type: 'text/html',
        value: options.html,
      },
    ],
  };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 202 || res.status === 200) {
      logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully via SendGrid');
      return true;
    }

    // SendGrid returns error details in the response body
    let errorDetail = '';
    try {
      const errorBody = await res.json();
      errorDetail = JSON.stringify(errorBody.errors || errorBody);
    } catch {
      errorDetail = `HTTP ${res.status}`;
    }

    logger.error({ to: options.to, status: res.status, error: errorDetail }, 'SendGrid API returned error');
    return false;
  } catch (err) {
    logger.error({ to: options.to, err: (err as Error).message }, 'Failed to send email via SendGrid');
    return false;
  }
}
