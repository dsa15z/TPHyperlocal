// @ts-nocheck
/**
 * Firebase Cloud Messaging client library.
 * Uses the FCM legacy HTTP API (no SDK dependency — just fetch).
 * Endpoint: https://fcm.googleapis.com/fcm/send
 * Auth: FIREBASE_SERVER_KEY env var
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('fcm');

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const BATCH_SIZE = 500;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FCMMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

interface FCMResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getServerKey(): string {
  const key = process.env['FIREBASE_SERVER_KEY'];
  if (!key) {
    throw new Error('FIREBASE_SERVER_KEY environment variable is not set');
  }
  return key;
}

/**
 * Build platform-specific FCM payload.
 */
function buildPayload(
  token: string,
  message: FCMMessage,
  platform: 'web' | 'ios' | 'android',
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    to: token,
    notification: {
      title: message.title,
      body: message.body,
    },
    data: message.data ?? {},
  };

  if (message.imageUrl) {
    (base.notification as Record<string, unknown>).image = message.imageUrl;
  }

  switch (platform) {
    case 'web': {
      const notif = base.notification as Record<string, unknown>;
      notif.icon = '/icons/breaking-news-192.png';
      notif.click_action = message.data?.url
        ? `${process.env['FRONTEND_URL'] || 'https://app.tphyperlocal.com'}${message.data.url}`
        : process.env['FRONTEND_URL'] || 'https://app.tphyperlocal.com';
      break;
    }
    case 'ios': {
      base.apns = {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'mutable-content': 1,
          },
        },
      };
      break;
    }
    case 'android': {
      base.android = {
        priority: 'HIGH',
        notification: {
          channel_id: 'breaking_news',
          sound: 'default',
          priority: 'high',
        },
      };
      break;
    }
  }

  return base;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a push notification to a single device token.
 */
export async function sendPushNotification(
  token: string,
  message: FCMMessage,
  platform: 'web' | 'ios' | 'android',
): Promise<FCMResponse> {
  const serverKey = getServerKey();
  const payload = buildPayload(token, message, platform);

  try {
    const response = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ token: token.slice(0, 12) + '...', status: response.status, errorText }, 'FCM request failed');
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();

    // FCM legacy API returns { success: 1, failure: 0, results: [{ message_id }] }
    if (result.success === 1 && result.results?.[0]?.message_id) {
      const messageId = result.results[0].message_id;
      logger.debug({ token: token.slice(0, 12) + '...', messageId }, 'FCM push sent');
      return { success: true, messageId };
    }

    // Check for specific errors
    const fcmError = result.results?.[0]?.error;
    logger.warn({ token: token.slice(0, 12) + '...', fcmError, result }, 'FCM push failed');
    return { success: false, error: fcmError || 'Unknown FCM error' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ token: token.slice(0, 12) + '...', err: errorMsg }, 'FCM request exception');
    return { success: false, error: errorMsg };
  }
}

/**
 * Send push notifications to multiple device tokens in batches.
 * Processes up to BATCH_SIZE (500) tokens in parallel per batch.
 */
export async function sendBatchNotifications(
  tokens: Array<{ token: string; platform: string }>,
  message: FCMMessage,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(({ token, platform }) =>
        sendPushNotification(token, message, platform as 'web' | 'ios' | 'android'),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          sent++;
        } else {
          failed++;
          if (result.value.error) {
            errors.push(result.value.error);
          }
        }
      } else {
        failed++;
        errors.push(result.reason?.message || 'Promise rejected');
      }
    }
  }

  logger.info(
    { total: tokens.length, sent, failed, errorCount: errors.length },
    'Batch notification send complete',
  );

  return { sent, failed, errors };
}
