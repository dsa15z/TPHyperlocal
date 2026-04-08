/**
 * PostHog Analytics — Product analytics, feature flags, A/B testing.
 *
 * Setup: Set POSTHOG_API_KEY env var on Railway
 * Get key from: posthog.com → Project Settings → API Key
 *
 * When POSTHOG_API_KEY is not set, this module does nothing (no-op).
 */

const POSTHOG_KEY = process.env['POSTHOG_API_KEY'] || '';
const POSTHOG_HOST = process.env['POSTHOG_HOST'] || 'https://us.i.posthog.com';

export async function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, any>
): Promise<void> {
  if (!POSTHOG_KEY) return;

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'topicpulse-backend' },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal
  }
}

export async function identifyUser(
  distinctId: string,
  properties: Record<string, any>
): Promise<void> {
  if (!POSTHOG_KEY) return;

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: '$identify',
        distinct_id: distinctId,
        $set: properties,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

export async function getFeatureFlag(
  distinctId: string,
  flagKey: string
): Promise<boolean> {
  if (!POSTHOG_KEY) return false;

  try {
    const res = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        distinct_id: distinctId,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.featureFlags?.[flagKey]);
  } catch {
    return false;
  }
}
