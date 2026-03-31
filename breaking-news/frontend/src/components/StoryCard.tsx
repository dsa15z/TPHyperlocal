"use client";

import Link from "next/link";
import clsx from "clsx";
import type { Story } from "@/lib/api";
import { formatRelativeTime, getScoreBarColor } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

// ─── Trend Indicator ──────────────────────────────────────────────────────────

function TrendIndicator({ trend }: { trend?: "rising" | "declining" | "flat" }) {
  if (!trend) return null;

  const config = {
    rising: { icon: "\u2197", color: "text-green-400", label: "Rising" },
    flat: { icon: "\u2192", color: "text-gray-500", label: "Flat" },
    declining: { icon: "\u2198", color: "text-red-400", label: "Declining" },
  };

  const c = config[trend];

  return (
    <span
      className={clsx("text-sm font-bold", c.color)}
      title={c.label}
    >
      {c.icon}
    </span>
  );
}

// ─── Score Bar (inline) ───────────────────────────────────────────────────────

function InlineScoreBar({
  label,
  score,
  barClass,
}: {
  label: string;
  score: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider w-14 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-300/60 overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-500", barClass)}
          style={{ width: `${Math.min(score * 100, 100)}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-gray-400 w-6 text-right">
        {(score * 100).toFixed(0)}
      </span>
    </div>
  );
}

// ─── Story Card ───────────────────────────────────────────────────────────────

interface StoryCardProps {
  story: Story;
}

export function StoryCard({ story }: StoryCardProps) {
  return (
    <div className="glass-card overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 animate-in flex flex-col">
      {/* Header: status + trend */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <StatusBadge status={story.status} />
        <TrendIndicator trend={story.trend} />
      </div>

      {/* Title */}
      <div className="px-4 pb-1">
        <Link
          href={`/stories/${story.id}`}
          className="text-gray-100 hover:text-accent font-semibold text-base leading-snug line-clamp-2 transition-colors"
        >
          {story.title}
        </Link>
      </div>

      {/* Summary */}
      <div className="px-4 pb-3">
        <p className="text-gray-500 text-sm leading-relaxed line-clamp-2">
          {story.summary || story.ai_summary || "No summary available."}
        </p>
      </div>

      {/* Category pill */}
      {story.category && (
        <div className="px-4 pb-3">
          <span className="inline-block px-2 py-0.5 rounded-full bg-surface-300/50 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {story.category}
          </span>
        </div>
      )}

      {/* Spacer to push bottom content down */}
      <div className="flex-1" />

      {/* Score bars */}
      <div className="px-4 pb-3 space-y-1.5">
        <InlineScoreBar
          label="Breaking"
          score={story.breaking_score}
          barClass={getScoreBarColor(story.breaking_score)}
        />
        <InlineScoreBar
          label="Trending"
          score={story.trending_score}
          barClass={getScoreBarColor(story.trending_score)}
        />
      </div>

      {/* Footer: time + source count */}
      <div className="px-4 py-3 border-t border-surface-300/30 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {formatRelativeTime(story.first_seen)}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-300/40 text-xs font-medium text-gray-400">
          {story.source_count}
          <span className="text-[10px] text-gray-600">src</span>
        </span>
      </div>
    </div>
  );
}

// ─── Story Card Grid ──────────────────────────────────────────────────────────

export function StoryCardGrid({ stories }: { stories: Story[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} />
      ))}
    </div>
  );
}
