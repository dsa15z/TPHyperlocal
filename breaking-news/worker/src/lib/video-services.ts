// @ts-nocheck
/**
 * Video service integrations: Wibbitz (rendering), Vimeo (hosting), Stringr/InstantVideo (stock footage).
 * Keys from TopicPulse production config.
 */
import { createChildLogger } from './logger.js';

const logger = createChildLogger('video-services');

// ─── Wibbitz: AI Video Rendering ───────────────────────────────────────────

interface WibbitzVideoRequest {
  title: string;
  scenes: Array<{
    text: string;
    duration: number;
    imagePrompt?: string;
  }>;
  music?: string;
  format?: 'landscape' | 'portrait' | 'square';
}

interface WibbitzVideoResponse {
  videoId: string;
  status: 'processing' | 'ready' | 'failed';
  url?: string;
  thumbnailUrl?: string;
}

/**
 * Get Wibbitz Auth0 token for API access
 */
async function getWibbitzToken(): Promise<string | null> {
  const clientId = process.env.WIBBITZ_AUTH0_CLIENT_ID;
  const clientSecret = process.env.WIBBITZ_AUTH0_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://login.wibbitz.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience: 'wibbitz-api',
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Wibbitz auth ${res.status}`);
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Wibbitz auth failed');
    return null;
  }
}

/**
 * Create a video via Wibbitz API
 */
export async function createWibbitzVideo(request: WibbitzVideoRequest): Promise<WibbitzVideoResponse | null> {
  const token = await getWibbitzToken();
  if (!token) {
    logger.warn('No Wibbitz token available');
    return null;
  }

  try {
    const res = await fetch('https://api.wibbitz.com/v2/videos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: request.title,
        scenes: request.scenes.map((s, i) => ({
          order: i + 1,
          text: s.text,
          duration: s.duration * 1000, // ms
          media: s.imagePrompt ? { search: s.imagePrompt } : undefined,
        })),
        music: request.music ? { search: request.music } : undefined,
        format: request.format || 'landscape',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Wibbitz API ${res.status}`);
    const data = await res.json();

    return {
      videoId: data.id || data.videoId,
      status: 'processing',
      url: data.url,
      thumbnailUrl: data.thumbnail,
    };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Wibbitz video creation failed');
    return null;
  }
}

/**
 * Check video rendering status
 */
export async function checkWibbitzStatus(videoId: string): Promise<WibbitzVideoResponse | null> {
  const token = await getWibbitzToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.wibbitz.com/v2/videos/${videoId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    return {
      videoId,
      status: data.status === 'done' ? 'ready' : data.status === 'error' ? 'failed' : 'processing',
      url: data.output?.url || data.url,
      thumbnailUrl: data.thumbnail,
    };
  } catch {
    return null;
  }
}

// ─── Vimeo: Video Hosting ──────────────────────────────────────────────────

/**
 * Upload a video URL to Vimeo for hosting
 */
export async function uploadToVimeo(videoUrl: string, title: string): Promise<{ vimeoId: string; vimeoUrl: string } | null> {
  const token = process.env.VIMEO_USER_TOKEN;
  if (!token) {
    logger.warn('No Vimeo token available');
    return null;
  }

  try {
    // Create a pull-based upload (Vimeo fetches the video from URL)
    const res = await fetch('https://api.vimeo.com/me/videos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.vimeo.*+json;version=3.4',
      },
      body: JSON.stringify({
        upload: { approach: 'pull', link: videoUrl },
        name: title,
        privacy: { view: 'unlisted' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Vimeo API ${res.status}`);
    const data = await res.json();

    return {
      vimeoId: data.uri?.replace('/videos/', '') || '',
      vimeoUrl: data.link || `https://vimeo.com/${data.uri?.replace('/videos/', '')}`,
    };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Vimeo upload failed');
    return null;
  }
}

// ─── InstantVideo/Stringr: Stock Footage Search ────────────────────────────

/**
 * Search for stock video footage via Stringr/InstantVideo
 */
export async function searchStockFootage(query: string, limit: number = 5): Promise<Array<{ url: string; title: string; thumbnail: string }>> {
  const apiKey = process.env.INSTANT_VIDEO_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://www.stringr.com/api/v2/videos/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((v: any) => ({
      url: v.url || v.video_url,
      title: v.title || query,
      thumbnail: v.thumbnail || v.thumb_url,
    }));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Stock footage search failed');
    return [];
  }
}

/**
 * Check if video services are configured
 */
export function getVideoServiceStatus(): Record<string, boolean> {
  return {
    wibbitz: !!(process.env.WIBBITZ_AUTH0_CLIENT_ID && process.env.WIBBITZ_AUTH0_CLIENT_SECRET),
    vimeo: !!process.env.VIMEO_USER_TOKEN,
    instantVideo: !!process.env.INSTANT_VIDEO_KEY,
    scrapfly: !!process.env.SCRAPFLY_KEY,
  };
}
