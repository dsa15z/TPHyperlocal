// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function widgetRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/widgets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const widgets = await prisma.widget.findMany({ where: { accountId: au.accountId }, orderBy: { createdAt: 'desc' } });
    return reply.send({ data: widgets });
  });

  app.post('/widgets', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const data = z.object({
      name: z.string().min(1),
      type: z.enum(['PULSE', 'SMART_PULSE', 'CATEGORY', 'BREAKING', 'TICKER', 'SCOREBOARD']),
      config: z.record(z.unknown()),
    }).parse(request.body);

    const widget = await prisma.widget.create({
      data: {
        ...data,
        accountId: au.accountId,
        embedCode: `<script src="/api/v1/widgets/${Date.now()}/embed.js"></script>`,
      },
    });
    return reply.status(201).send({ data: widget });
  });

  app.delete('/widgets/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    await prisma.widget.deleteMany({ where: { id, accountId: au.accountId } });
    return reply.status(204).send();
  });

  // ─── GET /widgets/:id/render — Render widget as embeddable HTML ───────────
  app.get('/widgets/:id/render', async (request, reply) => {
    const { id } = request.params as { id: string };
    const widget = await prisma.widget.findUnique({ where: { id } });
    if (!widget) return reply.status(404).send({ error: 'Widget not found' });

    const config = (widget.config || {}) as Record<string, any>;
    const theme = config.theme || 'dark';
    const accentColor = config.accentColor || '#ef4444';
    const fontSize = config.fontSize || '14px';
    const refreshInterval = config.refreshInterval || 60;
    const maxStories = config.maxStories || 5;
    const baseUrl = config.baseUrl || '';

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1a1a2e' : '#ffffff';
    const textColor = isDark ? '#e2e8f0' : '#1a202c';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const cardBg = isDark ? '#16213e' : '#f8fafc';
    const borderColor = isDark ? '#334155' : '#e2e8f0';

    let storiesHtml = '';
    let widgetTitle = widget.name;

    if (widget.type === 'BREAKING') {
      const stories = await prisma.story.findMany({
        where: { mergedIntoId: null, status: { in: ['BREAKING', 'ALERT'] } },
        orderBy: { compositeScore: 'desc' },
        take: Math.min(maxStories, 3),
        select: { id: true, title: true, status: true, firstSeenAt: true, compositeScore: true },
      });
      widgetTitle = widgetTitle || 'Breaking News';
      storiesHtml = stories.map((s) => {
        const timeAgo = getTimeAgo(s.firstSeenAt);
        const badge = s.status === 'ALERT'
          ? `<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">ALERT</span>`
          : `<span style="background:${accentColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">BREAKING</span>`;
        return `
          <div style="padding:12px;border-bottom:1px solid ${borderColor};display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;">${badge}<span style="color:${mutedColor};font-size:12px;">${timeAgo}</span></div>
            <a href="${baseUrl}/stories/${s.id}" target="_blank" style="color:${textColor};text-decoration:none;font-weight:600;font-size:${fontSize};line-height:1.3;">${escapeHtml(s.title)}</a>
          </div>`;
      }).join('');
      if (stories.length === 0) {
        storiesHtml = `<div style="padding:24px;text-align:center;color:${mutedColor};">No breaking stories right now.</div>`;
      }
    } else if (widget.type === 'CATEGORY') {
      const category = config.category || null;
      const stories = await prisma.story.findMany({
        where: { mergedIntoId: null, ...(category ? { category } : {}) },
        orderBy: { compositeScore: 'desc' },
        take: maxStories,
        select: { id: true, title: true, status: true, category: true, firstSeenAt: true, compositeScore: true },
      });
      widgetTitle = widgetTitle || `${category || 'All'} Stories`;
      storiesHtml = stories.map((s) => {
        const timeAgo = getTimeAgo(s.firstSeenAt);
        return `
          <div style="padding:10px 12px;border-bottom:1px solid ${borderColor};display:flex;flex-direction:column;gap:4px;">
            <a href="${baseUrl}/stories/${s.id}" target="_blank" style="color:${textColor};text-decoration:none;font-weight:500;font-size:${fontSize};line-height:1.3;">${escapeHtml(s.title)}</a>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="color:${accentColor};font-size:11px;font-weight:600;">${escapeHtml(s.category || 'Unknown')}</span>
              <span style="color:${mutedColor};font-size:11px;">${timeAgo}</span>
            </div>
          </div>`;
      }).join('');
    } else if (widget.type === 'PULSE') {
      const keywords = config.keywords || [];
      const keywordFilter = keywords.length > 0
        ? { OR: keywords.map((kw: string) => ({ title: { contains: kw, mode: 'insensitive' } })) }
        : {};
      const stories = await prisma.story.findMany({
        where: { mergedIntoId: null, ...keywordFilter },
        orderBy: { compositeScore: 'desc' },
        take: maxStories,
        select: { id: true, title: true, status: true, firstSeenAt: true, compositeScore: true },
      });
      widgetTitle = widgetTitle || 'Smart Pulse';
      storiesHtml = stories.map((s) => {
        const timeAgo = getTimeAgo(s.firstSeenAt);
        return `
          <div style="padding:10px 12px;border-bottom:1px solid ${borderColor};display:flex;justify-content:space-between;align-items:center;">
            <a href="${baseUrl}/stories/${s.id}" target="_blank" style="color:${textColor};text-decoration:none;font-weight:500;font-size:${fontSize};flex:1;line-height:1.3;">${escapeHtml(s.title)}</a>
            <span style="color:${mutedColor};font-size:11px;white-space:nowrap;margin-left:12px;">${timeAgo}</span>
          </div>`;
      }).join('');
    } else if (widget.type === 'TICKER') {
      const stories = await prisma.story.findMany({
        where: { mergedIntoId: null, status: { in: ['BREAKING', 'ALERT', 'DEVELOPING', 'TOP_STORY'] } },
        orderBy: { compositeScore: 'desc' },
        take: 15,
        select: { id: true, title: true, status: true },
      });
      const tickerItems = stories.map((s) => {
        const dot = s.status === 'ALERT' || s.status === 'BREAKING' ? '&#9679; ' : '';
        return `<span style="margin-right:48px;white-space:nowrap;">${dot}<a href="${baseUrl}/stories/${s.id}" target="_blank" style="color:${textColor};text-decoration:none;">${escapeHtml(s.title)}</a></span>`;
      }).join('');

      const html = buildWidgetShell({
        title: '',
        theme, bgColor, textColor, mutedColor, accentColor, fontSize, refreshInterval, borderColor,
        bodyContent: `
          <div style="overflow:hidden;white-space:nowrap;padding:12px 0;">
            <div style="display:inline-block;animation:ticker 30s linear infinite;">
              ${tickerItems}${tickerItems}
            </div>
          </div>
          <style>
            @keyframes ticker {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          </style>`,
        baseUrl,
        isTicker: true,
      });
      reply.type('text/html');
      return reply.send(html);
    } else if (widget.type === 'SCOREBOARD') {
      const stories = await prisma.story.findMany({
        where: { mergedIntoId: null },
        orderBy: { compositeScore: 'desc' },
        take: Math.min(maxStories, 10),
        select: { id: true, title: true, compositeScore: true, status: true, sourceCount: true },
      });
      widgetTitle = widgetTitle || 'Story Scoreboard';
      storiesHtml = stories.map((s, i) => {
        const pct = Math.round(s.compositeScore * 100);
        const barColor = pct >= 70 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
        return `
          <div style="padding:8px 12px;border-bottom:1px solid ${borderColor};display:flex;align-items:center;gap:10px;">
            <span style="color:${mutedColor};font-size:12px;width:20px;text-align:right;font-weight:700;">${i + 1}</span>
            <div style="flex:1;min-width:0;">
              <a href="${baseUrl}/stories/${s.id}" target="_blank" style="color:${textColor};text-decoration:none;font-weight:500;font-size:${fontSize};display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.title)}</a>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                <div style="flex:1;height:6px;background:${borderColor};border-radius:3px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;"></div>
                </div>
                <span style="color:${mutedColor};font-size:11px;min-width:32px;text-align:right;">${pct}%</span>
              </div>
            </div>
            <span style="color:${mutedColor};font-size:11px;">${s.sourceCount} src</span>
          </div>`;
      }).join('');
    } else {
      storiesHtml = `<div style="padding:24px;text-align:center;color:${mutedColor};">Unknown widget type: ${widget.type}</div>`;
    }

    const html = buildWidgetShell({
      title: widgetTitle,
      theme, bgColor, textColor, mutedColor, accentColor, fontSize, refreshInterval, borderColor,
      bodyContent: storiesHtml,
      baseUrl,
      isTicker: false,
    });

    reply.type('text/html');
    return reply.send(html);
  });

  // ─── GET /widgets/:id/config — Get widget configuration ───────────────────
  app.get('/widgets/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const widget = await prisma.widget.findUnique({ where: { id } });
    if (!widget) return reply.status(404).send({ error: 'Widget not found' });
    return reply.send({
      data: {
        id: widget.id,
        name: widget.name,
        type: widget.type,
        config: widget.config || {},
      },
    });
  });

  // ─── PATCH /widgets/:id/config — Update widget config ─────────────────────
  app.patch('/widgets/:id/config', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };

    const body = z.object({
      theme: z.enum(['dark', 'light']).optional(),
      accentColor: z.string().optional(),
      fontSize: z.string().optional(),
      refreshInterval: z.number().min(10).max(3600).optional(),
      maxStories: z.number().min(1).max(25).optional(),
      category: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      baseUrl: z.string().optional(),
    }).parse(request.body);

    const existing = await prisma.widget.findFirst({ where: { id, accountId: au.accountId } });
    if (!existing) return reply.status(404).send({ error: 'Widget not found' });

    const currentConfig = (existing.config || {}) as Record<string, any>;
    const newConfig = { ...currentConfig };
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) newConfig[key] = value;
    }

    const updated = await prisma.widget.update({
      where: { id },
      data: { config: newConfig },
    });
    return reply.send({ data: updated });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTimeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildWidgetShell(opts: {
  title: string;
  theme: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  fontSize: string;
  refreshInterval: number;
  borderColor: string;
  bodyContent: string;
  baseUrl: string;
  isTicker: boolean;
}): string {
  const headerHtml = opts.title
    ? `<div style="padding:12px 16px;border-bottom:2px solid ${opts.accentColor};font-weight:700;font-size:16px;color:${opts.textColor};">${escapeHtml(opts.title)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="${opts.refreshInterval}" />
  <title>${escapeHtml(opts.title || 'Breaking News Widget')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: ${opts.fontSize};
      background: ${opts.bgColor};
      color: ${opts.textColor};
      line-height: 1.5;
    }
    a:hover { opacity: 0.8; }
  </style>
</head>
<body>
  <div style="max-width:100%;overflow:hidden;border:1px solid ${opts.borderColor};border-radius:8px;">
    ${headerHtml}
    ${opts.bodyContent}
    <div style="padding:8px 12px;text-align:center;border-top:1px solid ${opts.borderColor};">
      <a href="${opts.baseUrl}/" target="_blank" style="color:${opts.mutedColor};text-decoration:none;font-size:10px;">Powered by Breaking News Intelligence</a>
    </div>
  </div>
</body>
</html>`;
}
