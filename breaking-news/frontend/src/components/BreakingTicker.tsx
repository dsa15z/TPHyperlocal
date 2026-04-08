"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Zap, AlertTriangle } from "lucide-react";
import clsx from "clsx";

interface TickerStory {
  id: string;
  title: string;
  status: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Breaking news ticker — GPU-accelerated, smooth, dynamic speed.
 * Speed adjusts based on content length so reading pace stays consistent.
 * Polls every 20 seconds. 3 copies for seamless infinite loop.
 */
export function BreakingTicker() {
  const [stories, setStories] = useState<TickerStory[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function fetchBreaking() {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/stories?status=ALERT,BREAKING&maxAge=24&sort=breakingScore&order=desc&limit=25`,
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
  }, []);

  // Dynamic speed: ~80px/sec reading speed (comfortable for news tickers)
  const tickerDuration = useMemo(() => {
    const totalChars = stories.reduce((sum, s) => sum + (s.title?.length || 0), 0);
    // ~8px per char, 80px/sec reading speed, 2 copies = divide by 2
    const estimatedWidth = totalChars * 8;
    const seconds = Math.max(15, Math.min(60, estimatedWidth / 80));
    return `${seconds}s`;
  }, [stories]);

  if (stories.length === 0) return null;

  const hasAlert = stories.some((s) => s.status === "ALERT");
  const label = hasAlert ? "ALERT" : "BREAKING";
  const Icon = hasAlert ? AlertTriangle : Zap;

  return (
    <div
      className={clsx(
        "fixed bottom-0 left-0 right-0 z-[60] h-9 flex items-center overflow-hidden",
        hasAlert
          ? "bg-red-950/95 border-t border-red-500/40"
          : "bg-orange-950/95 border-t border-orange-500/40"
      )}
    >
      <div
        className={clsx(
          "flex-shrink-0 flex items-center gap-1.5 px-3 h-full font-bold text-xs uppercase tracking-wider",
          hasAlert ? "bg-red-600 text-white" : "bg-orange-600 text-white"
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>

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
              <span
                className={clsx(
                  "flex-shrink-0 px-3 text-xs opacity-40",
                  hasAlert ? "text-red-500" : "text-orange-500"
                )}
              >
                ◆
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
