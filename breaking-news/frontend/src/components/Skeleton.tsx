"use client";

import clsx from "clsx";

// ─── Base Skeleton ────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded bg-gradient-to-r from-surface-300/30 via-surface-300/50 to-surface-300/30 bg-[length:200%_100%]",
        className
      )}
      style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
    />
  );
}

// ─── Story Card Skeleton ──────────────────────────────────────────────────────

export function StoryCardSkeleton() {
  return (
    <div className="glass-card overflow-hidden animate-in">
      {/* Image placeholder (16:9) */}
      <Skeleton className="w-full aspect-video" />

      <div className="p-4 space-y-3">
        {/* Status badge */}
        <Skeleton className="h-5 w-20 rounded-full" />

        {/* Title — two lines */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>

        {/* Summary — two lines */}
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>

        {/* Category pill */}
        <Skeleton className="h-5 w-16 rounded-full" />

        {/* Score bars */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
          </div>
        </div>

        {/* Bottom row: time + source count */}
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Story Table Row Skeleton ─────────────────────────────────────────────────

export function StoryTableRowSkeleton() {
  return (
    <tr className="border-b border-surface-300/30">
      {/* Rank */}
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-5" />
      </td>
      {/* Status */}
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-20 rounded-full" />
      </td>
      {/* Title */}
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full max-w-[280px]" />
          <Skeleton className="h-4 w-2/3 max-w-[200px]" />
        </div>
      </td>
      {/* Category */}
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-16" />
      </td>
      {/* Breaking */}
      <td className="px-4 py-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-2 w-14 rounded-full" />
        </div>
      </td>
      {/* Trending */}
      <td className="px-4 py-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-2 w-14 rounded-full" />
        </div>
      </td>
      {/* Sources */}
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-6" />
      </td>
      {/* First seen */}
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-16" />
      </td>
    </tr>
  );
}

// ─── Story Detail Skeleton ────────────────────────────────────────────────────

export function StoryDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 animate-in">
      {/* Back link */}
      <Skeleton className="h-4 w-24" />

      {/* Status + Category */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="glass-card p-6 space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      {/* Sources list */}
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-5 w-16" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-3 border-b border-surface-300/30 last:border-0">
            <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
            <Skeleton className="h-3.5 w-14 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard Skeleton ───────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-in">
      {/* Filter bar skeleton */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      {/* Results count skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Story card grid — 6 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <StoryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
