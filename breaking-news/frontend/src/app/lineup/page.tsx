"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ListOrdered, Zap, TrendingUp, Target, Star, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const SCORE_FACTORS = [
  { key: "compositeScore", label: "Composite", color: "bg-blue-500", icon: Star },
  { key: "sourceVelocity", label: "Velocity", color: "bg-orange-500", icon: Zap },
  { key: "coverageGap", label: "Coverage Gap", color: "bg-purple-500", icon: Target },
  { key: "trendBoost", label: "Trend", color: "bg-green-500", icon: TrendingUp },
  { key: "recencyBoost", label: "Recency", color: "bg-cyan-500", icon: Zap },
] as const;

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-20 text-right truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-300/30 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-400 w-8 text-right font-mono">
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

function StackedBar({ scores }: { scores: Record<string, number> }) {
  const total =
    (scores.compositeScore || 0) +
    (scores.sourceVelocity || 0) +
    (scores.coverageGap || 0) +
    (scores.trendBoost || 0) +
    (scores.recencyBoost || 0);

  if (total === 0) return null;

  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-surface-300/20">
      {SCORE_FACTORS.map((factor) => {
        const val = scores[factor.key] || 0;
        const pct = (val / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={factor.key}
            className={clsx("h-full", factor.color)}
            style={{ width: `${pct}%` }}
            title={`${factor.label}: ${(val * 100).toFixed(0)}`}
          />
        );
      })}
    </div>
  );
}

export default function LineupPage() {
  const [showName, setShowName] = useState("");
  const [showTime, setShowTime] = useState("17:00");
  const [slotCount, setSlotCount] = useState(6);

  const recommendMutation = useMutation({
    mutationFn: (params: {
      showName: string;
      showTime: string;
      slotCount: number;
    }) =>
      apiFetch<any>("/api/v1/lineup/recommend", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      }),
  });

  const result = recommendMutation.data?.data;
  const stories = result?.stories || [];
  const leadRec = result?.leadRecommendation;

  function handleGenerate() {
    if (!showName) return;
    recommendMutation.mutate({ showName, showTime, slotCount });
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ListOrdered className="w-6 h-6 text-blue-400" /> A-Block Lineup
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-recommended story lineup for your next broadcast
          </p>
        </div>

        {/* Show Selector */}
        <div className="glass-card p-5 animate-in">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1">
                Show Name *
              </label>
              <input
                type="text"
                value={showName}
                onChange={(e) => setShowName(e.target.value)}
                placeholder="e.g. 5PM News"
                className="filter-input w-full"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs text-gray-400 mb-1">
                Show Time
              </label>
              <input
                type="time"
                value={showTime}
                onChange={(e) => setShowTime(e.target.value)}
                className="filter-input w-full"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-400 mb-1">Slots</label>
              <input
                type="number"
                min={1}
                max={12}
                value={slotCount}
                onChange={(e) =>
                  setSlotCount(
                    Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 6))
                  )
                }
                className="filter-input w-full"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={!showName || recommendMutation.isPending}
              className={clsx(
                "inline-flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg",
                !showName && "opacity-50"
              )}
            >
              {recommendMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Generate Lineup
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error state */}
        {recommendMutation.isError && (
          <div className="glass-card p-5 border-red-500/30 text-red-400 text-sm">
            Failed to generate lineup. Please try again.
          </div>
        )}

        {/* Empty state */}
        {!recommendMutation.data && !recommendMutation.isPending && (
          <div className="glass-card p-12 text-center text-gray-500">
            <ListOrdered className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>
              Enter a show name and click Generate Lineup to get AI-recommended
              stories
            </p>
          </div>
        )}

        {/* Recommended Lineup */}
        {stories.length > 0 && (
          <div className="space-y-4">
            {/* Stacked bar legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="font-medium text-gray-400">Score factors:</span>
              {SCORE_FACTORS.map((f) => (
                <div key={f.key} className="flex items-center gap-1">
                  <div className={clsx("w-2.5 h-2.5 rounded-sm", f.color)} />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            {stories.map((story: any, idx: number) => {
              const isLead = idx === 0;
              const scores = {
                compositeScore: story.compositeScore ?? story.composite_score ?? 0,
                sourceVelocity: story.sourceVelocity ?? 0,
                coverageGap: story.coverageGap ?? 0,
                trendBoost: story.trendBoost ?? 0,
                recencyBoost: story.recencyBoost ?? 0,
              };
              const totalLineupScore =
                story.lineupScore ??
                story.totalScore ??
                Object.values(scores).reduce((a: number, b: number) => a + b, 0);

              return (
                <div
                  key={story.id || idx}
                  className={clsx(
                    "glass-card animate-in overflow-hidden",
                    isLead && "border-yellow-500/40 shadow-yellow-500/10 shadow-lg"
                  )}
                >
                  {/* Lead banner */}
                  {isLead && leadRec && (
                    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-5 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                          Lead Story
                        </span>
                      </div>
                      <p className="text-sm text-yellow-200/80">
                        {typeof leadRec === "string"
                          ? leadRec
                          : leadRec.rationale || leadRec.reason || "Top recommended lead for this broadcast."}
                      </p>
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex gap-4">
                      {/* Position number */}
                      <div className="flex-shrink-0 flex items-start">
                        <div
                          className={clsx(
                            "w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold",
                            isLead
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-surface-300/30 text-gray-400"
                          )}
                        >
                          {idx + 1}
                        </div>
                      </div>

                      {/* Story content */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/stories/${story.id || story.storyId}`}
                              className="text-white font-medium hover:text-accent transition-colors line-clamp-2 block"
                            >
                              {story.title}
                              <ChevronRight className="w-3.5 h-3.5 inline ml-1 opacity-50" />
                            </Link>
                            <div className="flex items-center gap-2 mt-1.5">
                              {story.category && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                                  {story.category}
                                </span>
                              )}
                              {story.status && (
                                <span
                                  className={clsx(
                                    "px-2 py-0.5 rounded text-[10px] font-semibold",
                                    story.status === "BREAKING" || story.status === "ALERT"
                                      ? "bg-red-500/15 text-red-400"
                                      : story.status === "DEVELOPING"
                                        ? "bg-amber-500/15 text-amber-400"
                                        : "bg-gray-500/15 text-gray-400"
                                  )}
                                >
                                  {story.status}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Total lineup score */}
                          <div className="flex-shrink-0 text-right">
                            <div
                              className={clsx(
                                "text-2xl font-bold font-mono",
                                totalLineupScore >= 0.8
                                  ? "text-red-400"
                                  : totalLineupScore >= 0.6
                                    ? "text-yellow-400"
                                    : totalLineupScore >= 0.3
                                      ? "text-green-400"
                                      : "text-gray-400"
                              )}
                            >
                              {(totalLineupScore * 100).toFixed(0)}
                            </div>
                            <div className="text-[10px] text-gray-500 uppercase">
                              Score
                            </div>
                          </div>
                        </div>

                        {/* Stacked bar visualization */}
                        <StackedBar scores={scores} />

                        {/* Score breakdown bars */}
                        <div className="grid grid-cols-1 gap-1">
                          {SCORE_FACTORS.map((factor) => (
                            <ScoreBar
                              key={factor.key}
                              label={factor.label}
                              value={scores[factor.key] || 0}
                              color={factor.color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
