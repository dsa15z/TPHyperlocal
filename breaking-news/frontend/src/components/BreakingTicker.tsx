"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { fetchStories, type Story } from "@/lib/api";

/**
 * Persistent breaking news ticker fixed to the bottom of the screen.
 * Fetches BREAKING/ALERT stories independently on a 15s interval.
 * Visible on every page — renders nothing when no breaking stories exist.
 */
export function BreakingTicker() {
  const { data } = useQuery({
    queryKey: ["breaking-ticker"],
    queryFn: () =>
      fetchStories({
        status: "ALERT,BREAKING",
        page_size: 20,
        sort_by: "breakingScore",
        sort_order: "desc",
      }),
    refetchInterval: 15_000,
    retry: false,
  });

  const stories: Story[] = data?.stories || [];
  if (stories.length === 0) return null;

  const hasAlert = stories.some((s) => s.status === "ALERT");
  const label = hasAlert ? "ALERT" : "BREAKING";
  const Icon = hasAlert ? AlertTriangle : Zap;

  // Build ticker text: "TITLE • TITLE • TITLE • ..." duplicated for seamless loop
  const items = stories.map((s) => ({ id: s.id, title: s.title, status: s.status }));

  return (
    <div
      className={clsx(
        "fixed bottom-0 left-0 right-0 z-50 h-9 flex items-center overflow-hidden",
        hasAlert
          ? "bg-red-950/95 border-t border-red-500/40"
          : "bg-orange-950/95 border-t border-orange-500/40"
      )}
    >
      {/* Static label */}
      <div
        className={clsx(
          "flex-shrink-0 flex items-center gap-1.5 px-3 h-full font-bold text-xs uppercase tracking-wider",
          hasAlert
            ? "bg-red-600 text-white"
            : "bg-orange-600 text-white"
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-scroll flex items-center gap-0 whitespace-nowrap">
          {/* Duplicate the items so the loop is seamless */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-0 flex-shrink-0">
              {items.map((s) => (
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
