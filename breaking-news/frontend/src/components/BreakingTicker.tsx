"use client";

import { useEffect, useState } from "react";
import { Zap, AlertTriangle } from "lucide-react";
import clsx from "clsx";

interface TickerStory {
  id: string;
  title: string;
  status: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Persistent breaking news ticker fixed to the bottom of the screen.
 * Uses raw fetch (not React Query) to avoid any dependency issues.
 * Polls every 15 seconds. Renders nothing when no breaking stories.
 */
export function BreakingTicker() {
  const [stories, setStories] = useState<TickerStory[]>([]);

  useEffect(() => {
    let active = true;

    async function fetchBreaking() {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/stories?status=ALERT,BREAKING&maxAge=24&sort=breakingScore&order=desc&limit=20`,
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
      } catch {
        // Silently fail
      }
    }

    fetchBreaking();
    const interval = setInterval(fetchBreaking, 15_000);
    return () => { active = false; clearInterval(interval); };
  }, []);

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
      {/* Static label */}
      <div
        className={clsx(
          "flex-shrink-0 flex items-center gap-1.5 px-3 h-full font-bold text-xs uppercase tracking-wider",
          hasAlert ? "bg-red-600 text-white" : "bg-orange-600 text-white"
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-scroll flex items-center gap-0 whitespace-nowrap">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-0 flex-shrink-0">
              {stories.map((s) => (
                <a
                  key={`${copy}-${s.id}`}
                  href={`/stories/${s.id}`}
                  className={clsx(
                    "text-sm hover:underline flex-shrink-0 px-4",
                    s.status === "ALERT" ? "text-red-300" : "text-orange-300"
                  )}
                >
                  {s.title}
                </a>
              ))}
              <span
                className={clsx(
                  "flex-shrink-0 px-2 text-xs",
                  hasAlert ? "text-red-600" : "text-orange-600"
                )}
              >
                ●
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
