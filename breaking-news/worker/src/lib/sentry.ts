// @ts-nocheck
/**
 * Sentry Error Tracking stub.
 * Set SENTRY_DSN + install @sentry/node to enable. No-op without it.
 */
let sentry: any = null;

export async function initSentry(): Promise<void> {
  if (!process.env['SENTRY_DSN']) return;
  try { sentry = require('@sentry/node'); sentry.init({ dsn: process.env['SENTRY_DSN'], tracesSampleRate: 0.1 }); } catch {}
}

export function captureException(error: Error, ctx?: any): void {
  if (!sentry) return;
  try { if (ctx) sentry.setContext('custom', ctx); sentry.captureException(error); } catch {}
}

export function captureMessage(msg: string, level: string = 'info'): void {
  if (!sentry) return;
  try { sentry.captureMessage(msg, level); } catch {}
}
