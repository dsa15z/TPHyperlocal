"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  Zap,
  Target,
  BarChart3,
  RefreshCw,
  ArrowRight,
  Activity,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime, formatScore } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

interface RisingStory {
  id: string;
  title: string;
  category: string;
  status: string;
  compositeScore: number;
  viralProbability: number;
  predictedStatus: string;
  factors: Record<string, number>;
}

interface Accuracy {
  totalPredictions: number;
  correctPredictions: number;
  hitRate: number;
}

interface TimelinePoint {
  hour: string;
  avgProbability: number;
  count: number;
}

interface DashboardData {
  risingStories: RisingStory[];
  accuracy: Accuracy;
  escalationAlerts: RisingStory[];
  timeline: TimelinePoint[];
}

const FACTOR_COLORS: Record<string, string> = {
  velocity: "bg-red-500",
  diversity: "bg-blue-500",
  engagement: "bg-amber-500",
  category: "bg-purple-500",
  earlyVelocity: "bg-orange-500",
  early_velocity: "bg-orange-500",
  trust: "bg-green-500",
};

const FACTOR_LABELS: Record<string, string> = {
  velocity: "Velocity",
  diversity: "Diversity",
  engagement: "Engagement",
  category: "Category",
  earlyVelocity: "Early Vel.",
  early_velocity: "Early Vel.",
  trust: "Trust",
};

// ─── Rising Stories Tab ─────────────────────────────────────────────────────

function RisingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["rising-stories"],
    queryFn: () => apiFetch<any>("/api/v1/stories/rising"),
    refetchInterval: 30_000,
  });
  const stories = data?.data || [];

  if (isLoading) return <div className="glass-card p-12 text-center text-gray-500">Analyzing story trajectories...</div>;
  if (stories.length === 0) return (
    <div className="glass-card p-12 text-center space-y-3">
      <TrendingUp className="w-10 h-10 text-gray-600 mx-auto" />
      <p className="text-gray-400">No rising stories detected.</p>
      <p className="text-gray-600 text-sm">Predictions are generated as stories develop.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {stories.map((story: any, i: number) => {
        const prob = Math.round((story.viralProbability || 0) * 100);
        return (
          <div key={story.id} className="glass-card p-4 flex items-center gap-4 animate-in">
            <div className="text-center w-10 flex-shrink-0">
              <span className="text-2xl font-bold text-gray-600">#{i + 1}</span>
            </div>
            <div className="w-16 flex-shrink-0 text-center">
              <div className={clsx("text-xl font-bold tabular-nums", prob >= 70 ? "text-red-400" : prob >= 50 ? "text-orange-400" : prob >= 30 ? "text-yellow-400" : "text-gray-400")}>{prob}%</div>
              <div className="text-[10px] text-gray-600">viral</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={story.status} />
                {story.predictedStatus && story.predictedStatus !== story.status && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400"><Zap className="w-3 h-3" />predicted: {story.predictedStatus.replace("_", " ")}</span>
                )}
              </div>
              <Link href={`/stories/${story.id}`} className="text-white font-medium hover:text-accent transition-colors line-clamp-1">{story.title}</Link>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{story.category || "Unknown"}</span>
                <span>Score: {Math.round((story.compositeScore || 0) * 100)}%</span>
                <span>{story.sourceCount} sources</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [tab, setTab] = useState<"dashboard" | "rising">("dashboard");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["predictions-dashboard"],
    queryFn: () =>
      apiFetch<DashboardData>("/api/v1/predictions/dashboard", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: (storyId: string) =>
      apiFetch(`/api/v1/stories/${storyId}/predictions/trigger`, {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["predictions-dashboard"] });
    },
  });

  const accuracy = data?.accuracy || { totalPredictions: 0, correctPredictions: 0, hitRate: 0 };
  const escalationAlerts = data?.escalationAlerts || [];
  const risingStories = data?.risingStories || [];
  const timeline = data?.timeline || [];

  const hitRatePercent = Math.round(accuracy.hitRate * 100);
  const maxTimelineProb = Math.max(...timeline.map((t) => t.avgProbability), 0.01);

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-6 h-6 text-purple-400" />
            Predictions Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered story escalation predictions. Auto-refreshes every 30s.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setTab("dashboard")} className={clsx("filter-btn text-sm", tab === "dashboard" && "filter-btn-active")}>Dashboard</button>
          <button onClick={() => setTab("rising")} className={clsx("filter-btn text-sm", tab === "rising" && "filter-btn-active")}>Rising Stories</button>
        </div>

        {tab === "rising" && <RisingTab />}

        {tab === "dashboard" && (isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading prediction models...
          </div>
        ) : (
          <>
            {/* Top row: Accuracy + Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Accuracy Card */}
              <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
                <Target className="w-8 h-8 text-purple-400 mb-3" />
                <div
                  className={clsx(
                    "text-5xl font-bold tabular-nums",
                    hitRatePercent >= 70
                      ? "text-green-400"
                      : hitRatePercent >= 50
                      ? "text-yellow-400"
                      : "text-red-400"
                  )}
                >
                  {hitRatePercent}%
                </div>
                <p className="text-sm text-gray-400 mt-1">Prediction Hit Rate</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span>
                    <span className="text-white font-medium">{accuracy.correctPredictions}</span>{" "}
                    correct
                  </span>
                  <span>
                    <span className="text-white font-medium">{accuracy.totalPredictions}</span>{" "}
                    total
                  </span>
                </div>
              </div>

              {/* Timeline Chart */}
              <div className="glass-card p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-medium text-gray-300">
                    Avg Prediction Probability (Last 24h)
                  </h3>
                </div>
                {timeline.length === 0 ? (
                  <div className="text-center text-gray-600 py-8 text-sm">
                    No timeline data yet.
                  </div>
                ) : (
                  <div className="flex items-end gap-1 h-32">
                    {timeline.map((point, i) => {
                      const heightPct = (point.avgProbability / maxTimelineProb) * 100;
                      const probPct = Math.round(point.avgProbability * 100);
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center justify-end h-full group relative"
                        >
                          {/* Tooltip */}
                          <div className="absolute -top-6 hidden group-hover:block text-[10px] text-gray-300 bg-surface-300 px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                            {probPct}% ({point.count})
                          </div>
                          {/* Bar */}
                          <div
                            className={clsx(
                              "w-full rounded-t transition-all",
                              probPct >= 60
                                ? "bg-red-500/70"
                                : probPct >= 40
                                ? "bg-amber-500/70"
                                : "bg-purple-500/50"
                            )}
                            style={{ height: `${Math.max(heightPct, 2)}%` }}
                          />
                          {/* Hour label */}
                          {i % 3 === 0 && (
                            <span className="text-[9px] text-gray-600 mt-1">
                              {point.hour}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Escalation Alerts */}
            {escalationAlerts.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Escalation Alerts
                  <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                    {escalationAlerts.length}
                  </span>
                </h2>
                <p className="text-xs text-gray-500">
                  Stories predicted to escalate within the next 2 hours.
                </p>

                <div className="space-y-3">
                  {escalationAlerts.map((story) => {
                    const prob = Math.round(story.viralProbability * 100);
                    return (
                      <div
                        key={story.id}
                        className="glass-card p-5 border-l-4 border-l-amber-500 animate-in"
                      >
                        <div className="flex items-start gap-4">
                          {/* Probability */}
                          <div className="flex-shrink-0 text-center w-16">
                            <div
                              className={clsx(
                                "text-3xl font-bold tabular-nums",
                                prob >= 70
                                  ? "text-red-400"
                                  : prob >= 50
                                  ? "text-amber-400"
                                  : "text-yellow-400"
                              )}
                            >
                              {prob}%
                            </div>
                            <div className="text-[10px] text-gray-600">viral</div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <StatusBadge status={story.status} />
                              <ArrowRight className="w-3 h-3 text-amber-400" />
                              <StatusBadge status={story.predictedStatus} />
                            </div>
                            <Link
                              href={`/stories/${story.id}`}
                              className="text-white font-bold hover:text-amber-400 transition-colors line-clamp-2"
                            >
                              {story.title}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{story.category}</span>
                              <span>Score: {formatScore(story.compositeScore)}</span>
                            </div>

                            {/* Factor bars */}
                            {story.factors && (
                              <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-3">
                                {Object.entries(story.factors).map(([key, val]) => (
                                  <div key={key} className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-gray-500 w-14 text-right truncate">
                                      {FACTOR_LABELS[key] || key}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                                      <div
                                        className={clsx(
                                          "h-full rounded-full",
                                          FACTOR_COLORS[key] || "bg-gray-500"
                                        )}
                                        style={{ width: `${val * 100}%` }}
                                      />
                                    </div>
                                    <span className="text-[9px] text-gray-600 w-6 tabular-nums">
                                      {Math.round(val * 100)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Rising Stories Grid */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                Rising Stories
              </h2>

              {risingStories.length === 0 ? (
                <div className="glass-card p-12 text-center space-y-3">
                  <TrendingUp className="w-10 h-10 text-gray-600 mx-auto" />
                  <p className="text-gray-400">No rising stories detected.</p>
                  <p className="text-gray-600 text-sm">
                    Predictions are generated as stories develop. Check back soon.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {risingStories.map((story) => {
                    const prob = Math.round(story.viralProbability * 100);
                    return (
                      <div key={story.id} className="glass-card p-5 animate-in">
                        <div className="flex items-start gap-4">
                          {/* Circular-ish probability display */}
                          <div className="flex-shrink-0 w-16 h-16 rounded-full border-2 border-surface-300 flex flex-col items-center justify-center relative">
                            <svg
                              className="absolute inset-0 w-full h-full -rotate-90"
                              viewBox="0 0 64 64"
                            >
                              <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="text-surface-300"
                              />
                              <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                strokeWidth="3"
                                strokeDasharray={`${prob * 1.76} 176`}
                                strokeLinecap="round"
                                className={clsx(
                                  prob >= 70
                                    ? "text-red-500"
                                    : prob >= 50
                                    ? "text-amber-500"
                                    : prob >= 30
                                    ? "text-yellow-500"
                                    : "text-gray-500"
                                )}
                                stroke="currentColor"
                              />
                            </svg>
                            <span
                              className={clsx(
                                "text-sm font-bold tabular-nums relative z-10",
                                prob >= 70
                                  ? "text-red-400"
                                  : prob >= 50
                                  ? "text-amber-400"
                                  : "text-gray-400"
                              )}
                            >
                              {prob}%
                            </span>
                          </div>

                          {/* Story details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <StatusBadge status={story.status} />
                              {story.predictedStatus &&
                                story.predictedStatus !== story.status && (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-400">
                                    <ArrowRight className="w-3 h-3" />
                                    <StatusBadge status={story.predictedStatus} />
                                  </span>
                                )}
                            </div>
                            <Link
                              href={`/stories/${story.id}`}
                              className="text-white font-medium hover:text-accent transition-colors line-clamp-2 text-sm"
                            >
                              {story.title}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{story.category}</span>
                              <span>Score: {formatScore(story.compositeScore)}</span>
                            </div>

                            {/* Factor breakdown */}
                            {story.factors && (
                              <div className="mt-2 space-y-1">
                                {Object.entries(story.factors).map(([key, val]) => (
                                  <div key={key} className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-gray-500 w-14 text-right truncate">
                                      {FACTOR_LABELS[key] || key}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                                      <div
                                        className={clsx(
                                          "h-full rounded-full",
                                          FACTOR_COLORS[key] || "bg-gray-500"
                                        )}
                                        style={{ width: `${val * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Refresh button */}
                            <button
                              onClick={() => triggerMutation.mutate(story.id)}
                              disabled={triggerMutation.isPending}
                              className="mt-2 text-[11px] text-gray-500 hover:text-purple-400 transition-colors flex items-center gap-1"
                            >
                              <RefreshCw
                                className={clsx(
                                  "w-3 h-3",
                                  triggerMutation.isPending && "animate-spin"
                                )}
                              />
                              Refresh Prediction
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ))}

      </main>
    </div>
  );
}
