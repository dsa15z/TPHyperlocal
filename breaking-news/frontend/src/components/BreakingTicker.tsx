"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Zap, AlertTriangle, Settings, X } from "lucide-react";
import clsx from "clsx";
import { type DashboardView, loadViews } from "@/lib/views";

interface TickerStory {
  id: string;
  title: string;
  status: string;
}

interface TickerSettings {
  speed: number; // 1-5 scale (1=slow, 3=default, 5=fast)
  viewId: string | null; // null = default ALERT+BREAKING, or a view ID for custom filters
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const SETTINGS_KEY = "tp-ticker-settings";

function loadTickerSettings(): TickerSettings {
  if (typeof window === "undefined") return { speed: 3, viewId: null };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { speed: 3, viewId: null };
}

function saveTickerSettings(s: TickerSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// Convert view filters to API query params
function viewToQuery(view: DashboardView | null): string {
  if (!view) return "status=ALERT,BREAKING&maxAge=24&sort=breakingScore&order=desc&limit=25";

  const params = new URLSearchParams();
  const f = view.filters;
  if (f.statuses?.length) params.set("status", f.statuses.join(","));
  else params.set("status", "ALERT,BREAKING"); // default
  if (f.categories?.length) params.set("category", f.categories.join(","));
  if (f.marketIds?.length) params.set("marketIds", f.marketIds.join(","));
  if (f.sourceIds?.length) params.set("sourceIds", f.sourceIds.join(","));
  if (f.minScore) params.set("minScore", String(f.minScore));
  if (f.timeRange) {
    const hours = { "1h": 1, "6h": 6, "12h": 12, "24h": 24, "7d": 168 }[f.timeRange] || 24;
    params.set("maxAge", String(hours));
  } else {
    params.set("maxAge", "24");
  }
  params.set("sort", "breakingScore");
  params.set("order", "desc");
  params.set("limit", "25");
  return params.toString();
}

// Speed multipliers: 1=60px/s, 2=90, 3=120, 4=160, 5=220
const SPEED_PX_PER_SEC = [60, 90, 120, 160, 220];

export function BreakingTicker() {
  const [stories, setStories] = useState<TickerStory[]>([]);
  const [settings, setSettings] = useState<TickerSettings>(loadTickerSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [views, setViews] = useState<DashboardView[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load views for the settings panel
  useEffect(() => {
    setViews(loadViews());
  }, [showSettings]);

  const updateSettings = useCallback((patch: Partial<TickerSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveTickerSettings(next);
      return next;
    });
  }, []);

  // Build the selected view object
  const selectedView = useMemo(() => {
    if (!settings.viewId) return null;
    return views.find(v => v.id === settings.viewId) || null;
  }, [settings.viewId, views]);

  useEffect(() => {
    let active = true;

    async function fetchBreaking() {
      try {
        const query = viewToQuery(selectedView);
        const res = await fetch(
          `${API_BASE}/api/v1/stories?${query}`,
          { headers: { "Content-Type": "application/json" } }
        );
        if (!res.ok) return;
        const json = await res.json();
        const items = (json.data || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          status: s.status,
        }));
        if (active) setStories(items);
      } catch {}
    }

    fetchBreaking();
    const interval = setInterval(fetchBreaking, 20_000);
    return () => { active = false; clearInterval(interval); };
  }, [selectedView]);

  // Dynamic duration based on content + user speed
  const tickerDuration = useMemo(() => {
    const totalChars = stories.reduce((sum, s) => sum + (s.title?.length || 0), 0);
    const estimatedWidth = totalChars * 8;
    const pxPerSec = SPEED_PX_PER_SEC[Math.max(0, Math.min(4, settings.speed - 1))];
    const seconds = Math.max(8, estimatedWidth / pxPerSec);
    return `${seconds}s`;
  }, [stories, settings.speed]);

  if (stories.length === 0) return null;

  const hasAlert = stories.some((s) => s.status === "ALERT");
  const label = hasAlert ? "ALERT" : "BREAKING";
  const Icon = hasAlert ? AlertTriangle : Zap;

  return (
    <>
      <div
        className={clsx(
          "fixed bottom-0 left-0 right-0 z-[60] h-9 flex items-center overflow-hidden",
          hasAlert
            ? "bg-red-950/95 border-t border-red-500/40"
            : "bg-orange-950/95 border-t border-orange-500/40"
        )}
      >
        {/* Label */}
        <div
          className={clsx(
            "flex-shrink-0 flex items-center gap-1.5 px-3 h-full font-bold text-xs uppercase tracking-wider",
            hasAlert ? "bg-red-600 text-white" : "bg-orange-600 text-white"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>

        {/* Scrolling content */}
        <div className="flex-1 overflow-hidden relative">
          <div
            ref={scrollRef}
            className="ticker-scroll flex items-center whitespace-nowrap"
            style={{ "--ticker-duration": tickerDuration } as React.CSSProperties}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center flex-shrink-0">
                {stories.map((s) => (
                  <a
                    key={`${copy}-${s.id}`}
                    href={`/stories/${s.id}`}
                    className={clsx(
                      "text-sm hover:underline flex-shrink-0 px-5",
                      s.status === "ALERT" ? "text-red-300" : "text-orange-300"
                    )}
                  >
                    {s.title}
                  </a>
                ))}
                <span className={clsx("flex-shrink-0 px-3 text-xs opacity-40", hasAlert ? "text-red-500" : "text-orange-500")}>
                  ◆
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={clsx(
            "flex-shrink-0 px-2 h-full flex items-center hover:bg-white/5 transition-colors",
            hasAlert ? "text-red-400" : "text-orange-400"
          )}
          title="Ticker settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Settings popup */}
      {showSettings && (
        <div className="fixed bottom-10 right-2 z-[70] w-72 bg-surface-100 border border-surface-300 rounded-lg shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-200">Ticker Settings</span>
            <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Speed */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Speed: {["Slow", "Moderate", "Default", "Fast", "Very Fast"][settings.speed - 1]}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.speed}
              onChange={(e) => updateSettings({ speed: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>

          {/* View filter */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Filter by View</label>
            <select
              value={settings.viewId || ""}
              onChange={(e) => updateSettings({ viewId: e.target.value || null })}
              className="w-full px-2 py-1.5 bg-surface-200 border border-surface-300 rounded text-sm text-gray-200"
            >
              <option value="">Default (ALERT + BREAKING)</option>
              {views.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mt-1">
              {selectedView
                ? `Using filters from "${selectedView.name}" view`
                : "Showing all ALERT and BREAKING stories"
              }
            </p>
          </div>
        </div>
      )}
    </>
  );
}
