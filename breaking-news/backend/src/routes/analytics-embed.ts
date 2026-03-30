// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';

// ─── In-memory real-time session store ──────────────────────────────────────

interface SessionMetrics {
  storyId: string | null;
  widgetId: string | null;
  url: string;
  referrer: string;
  lastHeartbeat: number;
  timeOnPage: number;
  maxScroll: number;
}

const activeSessions = new Map<string, SessionMetrics>();
const pageviewLog: number[] = []; // timestamps of recent pageviews

// Aggregate counters per story (storyId -> metrics)
const storyCounters = new Map<string, {
  totalPageviews: number;
  scrollDepthSum: number;
  scrollDepthCount: number;
  timeOnPageSum: number;
  timeOnPageCount: number;
}>();

// Referrer counters
const referrerCounts = new Map<string, number>();

// Clean up stale sessions (no heartbeat for >60s)
const STALE_SESSION_MS = 60_000;
const CLEANUP_INTERVAL_MS = 15_000;

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions) {
    if (now - session.lastHeartbeat > STALE_SESSION_MS) {
      activeSessions.delete(sessionId);
    }
  }
  // Trim pageview log to last 5 minutes
  const fiveMinAgo = now - 5 * 60_000;
  while (pageviewLog.length > 0 && pageviewLog[0] < fiveMinAgo) {
    pageviewLog.shift();
  }
}, CLEANUP_INTERVAL_MS);

// Generate a pseudo-session ID from request properties (no cookies/PII)
function deriveSessionId(url: string, widgetId: string | null, timestamp: string): string {
  // Combine url + widgetId + truncated timestamp (to 15s window) for rough session grouping
  const window = Math.floor(new Date(timestamp).getTime() / 15000);
  return `${widgetId || 'anon'}-${Buffer.from(url).toString('base64').slice(0, 16)}-${window}`;
}

// ─── Tracking script template ───────────────────────────────────────────────

function buildTrackingScript(baseUrl: string, widgetId: string): string {
  return `(function(w,d){
var API='${baseUrl}/api/v1/analytics/collect';
var sid=d.querySelector('[data-story-id]')?.getAttribute('data-story-id')
||w.location.pathname.match(/stories\\/([^/]+)/)?.[1]||null;
var wid='${widgetId}';
var startTime=Date.now();
var maxScroll=0;
var scrollMilestones={25:false,50:false,75:false,100:false};
function send(event,data){
try{navigator.sendBeacon(API,JSON.stringify(Object.assign({event:event,storyId:sid,widgetId:wid,
url:w.location.href,referrer:d.referrer,
timestamp:new Date().toISOString()},data)));}catch(e){}
}
send('pageview',{});
var scrollTimer;
w.addEventListener('scroll',function(){
clearTimeout(scrollTimer);
scrollTimer=setTimeout(function(){
var h=d.documentElement.scrollHeight-w.innerHeight;
var pct=h>0?Math.round((w.scrollY/h)*100):100;
if(pct>maxScroll)maxScroll=pct;
[25,50,75,100].forEach(function(m){
if(pct>=m&&!scrollMilestones[m]){scrollMilestones[m]=true;send('scroll',{depth:m});}
});
},150);
});
setInterval(function(){
send('heartbeat',{timeOnPage:Math.round((Date.now()-startTime)/1000),scrollDepth:maxScroll});
},15000);
w.addEventListener('beforeunload',function(){
send('leave',{timeOnPage:Math.round((Date.now()-startTime)/1000),maxScroll:maxScroll});
});
})(window,document);`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function analyticsEmbedRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/analytics/embed.js — Serve the tracking script
  app.get('/analytics/embed.js', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { widgetId?: string };
    const widgetId = query.widgetId || 'default';

    const baseUrl = process.env['PUBLIC_API_URL']
      || process.env['NEXT_PUBLIC_API_URL']
      || `${request.protocol}://${request.hostname}`;

    const script = buildTrackingScript(baseUrl, widgetId);

    return reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
      .header('Access-Control-Allow-Origin', '*')
      .send(script);
  });

  // POST /api/v1/analytics/collect — Receive tracking beacons (public, no auth)
  app.post('/analytics/collect', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      event: string;
      storyId?: string | null;
      widgetId?: string | null;
      url?: string;
      referrer?: string;
      timestamp?: string;
      depth?: number;
      timeOnPage?: number;
      maxScroll?: number;
      scrollDepth?: number;
    };

    if (!body || !body.event) {
      return reply.status(204).send();
    }

    const { event, storyId, widgetId, url, referrer, timestamp } = body;
    const sessionId = deriveSessionId(url || '', widgetId || null, timestamp || new Date().toISOString());

    // Update or create session
    const now = Date.now();

    if (event === 'pageview') {
      activeSessions.set(sessionId, {
        storyId: storyId || null,
        widgetId: widgetId || null,
        url: url || '',
        referrer: referrer || '',
        lastHeartbeat: now,
        timeOnPage: 0,
        maxScroll: 0,
      });

      pageviewLog.push(now);

      // Track referrer
      if (referrer) {
        try {
          const refHost = new URL(referrer).hostname || 'direct';
          referrerCounts.set(refHost, (referrerCounts.get(refHost) || 0) + 1);
        } catch {
          referrerCounts.set('direct', (referrerCounts.get('direct') || 0) + 1);
        }
      } else {
        referrerCounts.set('direct', (referrerCounts.get('direct') || 0) + 1);
      }

      // Increment story pageview counter
      if (storyId) {
        const counter = storyCounters.get(storyId) || {
          totalPageviews: 0, scrollDepthSum: 0, scrollDepthCount: 0,
          timeOnPageSum: 0, timeOnPageCount: 0,
        };
        counter.totalPageviews++;
        storyCounters.set(storyId, counter);

        // Async: update StoryAnalytics record (fire-and-forget)
        prisma.storyAnalytics?.updateMany({
          where: { storyId },
          data: { views: { increment: 1 } },
        }).catch(() => {});
      }
    }

    if (event === 'heartbeat') {
      const session = activeSessions.get(sessionId);
      if (session) {
        session.lastHeartbeat = now;
        session.timeOnPage = body.timeOnPage || session.timeOnPage;
        session.maxScroll = body.scrollDepth || session.maxScroll;
      } else {
        // Create session from heartbeat if we missed the pageview
        activeSessions.set(sessionId, {
          storyId: storyId || null,
          widgetId: widgetId || null,
          url: url || '',
          referrer: referrer || '',
          lastHeartbeat: now,
          timeOnPage: body.timeOnPage || 0,
          maxScroll: body.scrollDepth || 0,
        });
      }
    }

    if (event === 'scroll' && storyId && body.depth) {
      const counter = storyCounters.get(storyId) || {
        totalPageviews: 0, scrollDepthSum: 0, scrollDepthCount: 0,
        timeOnPageSum: 0, timeOnPageCount: 0,
      };
      counter.scrollDepthSum += body.depth;
      counter.scrollDepthCount++;
      storyCounters.set(storyId, counter);
    }

    if (event === 'leave') {
      const session = activeSessions.get(sessionId);
      if (session && storyId) {
        const counter = storyCounters.get(storyId) || {
          totalPageviews: 0, scrollDepthSum: 0, scrollDepthCount: 0,
          timeOnPageSum: 0, timeOnPageCount: 0,
        };
        counter.timeOnPageSum += body.timeOnPage || 0;
        counter.timeOnPageCount++;
        if (body.maxScroll) {
          counter.scrollDepthSum += body.maxScroll;
          counter.scrollDepthCount++;
        }
        storyCounters.set(storyId, counter);
      }
      activeSessions.delete(sessionId);
    }

    return reply.status(204).send();
  });

  // GET /api/v1/analytics/realtime — Real-time audience dashboard data (auth required)
  app.get('/analytics/realtime', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now();
    const activeThreshold = now - 30_000; // heartbeat within last 30s

    // Count concurrent readers (sessions with recent heartbeat)
    let concurrentReaders = 0;
    const storyReaderCounts = new Map<string, number>();
    let totalScrollDepth = 0;
    let scrollDepthCount = 0;
    let totalTimeOnPage = 0;
    let timeOnPageCount = 0;

    for (const [, session] of activeSessions) {
      if (session.lastHeartbeat >= activeThreshold) {
        concurrentReaders++;

        if (session.storyId) {
          storyReaderCounts.set(
            session.storyId,
            (storyReaderCounts.get(session.storyId) || 0) + 1,
          );
        }

        if (session.maxScroll > 0) {
          totalScrollDepth += session.maxScroll;
          scrollDepthCount++;
        }

        if (session.timeOnPage > 0) {
          totalTimeOnPage += session.timeOnPage;
          timeOnPageCount++;
        }
      }
    }

    // Top 10 stories by concurrent readers
    const topStoriesRaw = Array.from(storyReaderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Fetch story titles for the top stories
    const topStoryIds = topStoriesRaw.map(([id]) => id);
    let storyTitles: Record<string, string> = {};
    if (topStoryIds.length > 0) {
      try {
        const stories = await prisma.story.findMany({
          where: { id: { in: topStoryIds } },
          select: { id: true, title: true },
        });
        storyTitles = Object.fromEntries(stories.map((s) => [s.id, s.title]));
      } catch {
        // If DB query fails, proceed without titles
      }
    }

    const topStories = topStoriesRaw.map(([storyId, readers]) => ({
      storyId,
      title: storyTitles[storyId] || null,
      concurrentReaders: readers,
    }));

    // Average scroll depth and time on page
    const avgScrollDepth = scrollDepthCount > 0
      ? Math.round((totalScrollDepth / scrollDepthCount) * 10) / 10
      : 0;
    const avgTimeOnPage = timeOnPageCount > 0
      ? Math.round((totalTimeOnPage / timeOnPageCount) * 10) / 10
      : 0;

    // Referrer breakdown (top 10)
    const referrerBreakdown = Array.from(referrerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referrer, count]) => ({ referrer, count }));

    // Pageviews per minute (rolling 5-minute window)
    const fiveMinAgo = now - 5 * 60_000;
    const recentPageviews = pageviewLog.filter((ts) => ts >= fiveMinAgo).length;
    const pageviewsPerMinute = Math.round((recentPageviews / 5) * 10) / 10;

    return reply.send({
      concurrentReaders,
      topStories,
      avgScrollDepth,
      avgTimeOnPage,
      referrerBreakdown,
      pageviewsPerMinute,
      totalActiveSessions: activeSessions.size,
      timestamp: new Date().toISOString(),
    });
  });
}
