"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Shield, ExternalLink, Clock, Users, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime, formatScore } from "@/lib/utils";
import { PageTabBar, COMPETITION_TABS } from "@/components/PageTabBar";

interface ActiveGap {
  id: string;
  title: string;
  category: string;
  status: string;
  compositeScore: number;
  sourceCount: number;
  firstSeenAt: string;
  gapAge: string;
  competitorTitle?: string;
}

interface HistoricalAlert {
  id: string;
  storyId: string;
  storyTitle: string;
  detectedAt: string;
  wasCovered: boolean;
  coveredAt?: string;
}

export default function BeatAlertsPage() {
  const queryClient = useQueryClient();

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ["beat-alerts-active"],
    queryFn: () =>
      apiFetch<{ data: ActiveGap[] }>("/api/v1/beat-alerts/active", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 15_000,
  });

  const { data: historicalData, isLoading: historicalLoading } = useQuery({
    queryKey: ["beat-alerts-historical"],
    queryFn: () =>
      apiFetch<{ data: HistoricalAlert[] }>("/api/v1/beat-alerts", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 15_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (storyId: string) =>
      apiFetch(`/api/v1/beat-alerts/${storyId}/dismiss`, {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beat-alerts-active"] });
      queryClient.invalidateQueries({ queryKey: ["beat-alerts-historical"] });
    },
  });

  const gaps = activeData?.data || [];
  const history = historicalData?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* URGENT HEADER */}
        <div className="glass-card border-red-500/40 border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Shield className="w-7 h-7 text-red-400" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full live-indicator" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-400 flex items-center gap-2">
                  COVERAGE GAPS
                  {gaps.length > 0 && (
                    <span className="px-2.5 py-0.5 text-sm font-bold bg-red-500/20 border border-red-500/40 rounded-full text-red-300 live-indicator">
                      {gaps.length}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-gray-500">
                  High-scoring stories your newsroom has not covered. Auto-refreshes every 15s.
                </p>
              </div>
            </div>
            <PageTabBar tabs={COMPETITION_TABS} />
            <div>
            </div>
            <div className="flex items-center gap-2 text-xs text-red-400/70">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>
          </div>
        </div>

        {/* ACTIVE GAPS */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Active Gaps
          </h2>

          {activeLoading ? (
            <div className="glass-card p-12 text-center text-gray-500">
              Scanning for coverage gaps...
            </div>
          ) : gaps.length === 0 ? (
            <div className="glass-card p-12 text-center space-y-3">
              <Eye className="w-10 h-10 text-green-500 mx-auto" />
              <p className="text-green-400 font-medium">All clear — no coverage gaps detected.</p>
              <p className="text-gray-600 text-sm">
                Your newsroom is covering all high-scoring stories. Keep it up.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {gaps.map((gap) => (
                <div
                  key={gap.id}
                  className="glass-card p-5 border-l-4 border-l-red-500 animate-in"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Category + Score */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                          {gap.category}
                        </span>
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-bold border",
                            gap.compositeScore >= 0.8
                              ? "bg-red-500/20 text-red-300 border-red-500/40"
                              : gap.compositeScore >= 0.6
                              ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                              : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                          )}
                        >
                          Score: {formatScore(gap.compositeScore)}
                        </span>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Users className="w-3 h-3" /> {gap.sourceCount} sources
                        </span>
                      </div>

                      {/* Title */}
                      <Link
                        href={`/stories/${gap.id}`}
                        className="text-white text-lg font-bold hover:text-red-400 transition-colors line-clamp-2"
                      >
                        {gap.title}
                      </Link>

                      {/* Urgency line */}
                      <p className="text-sm text-red-400/80 mt-2 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        First seen {gap.gapAge} ago — YOU HAVE NOT COVERED THIS
                      </p>

                      {/* Competitor coverage */}
                      {gap.competitorTitle && (
                        <p className="text-sm text-yellow-400 mt-1.5 flex items-center gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Competitor coverage: {gap.competitorTitle}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Link
                        href="/assignments"
                        className="filter-btn text-xs px-3 py-1.5 text-center whitespace-nowrap bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors rounded"
                      >
                        Assign Reporter
                      </Link>
                      <button
                        onClick={() => dismissMutation.mutate(gap.id)}
                        disabled={dismissMutation.isPending}
                        className="filter-btn text-xs px-3 py-1.5 text-center whitespace-nowrap hover:bg-surface-300 transition-colors rounded flex items-center justify-center gap-1"
                      >
                        <EyeOff className="w-3 h-3" />
                        Mark Covered
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* HISTORICAL ALERTS */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Past 24h Alert History
          </h2>

          {historicalLoading ? (
            <div className="glass-card p-8 text-center text-gray-500">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="glass-card p-8 text-center text-gray-500">
              No alerts in the last 24 hours.
            </div>
          ) : (
            <div className="glass-card divide-y divide-surface-300">
              {history.map((alert) => (
                <div
                  key={alert.id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  {alert.wasCovered ? (
                    <Eye className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-500 flex-shrink-0 w-20">
                    {formatRelativeTime(alert.detectedAt)}
                  </span>
                  <Link
                    href={`/stories/${alert.storyId}`}
                    className={clsx(
                      "flex-1 text-sm truncate hover:text-accent transition-colors",
                      alert.wasCovered ? "text-gray-400" : "text-white font-medium"
                    )}
                  >
                    {alert.storyTitle}
                  </Link>
                  <span
                    className={clsx(
                      "text-[10px] font-bold px-2 py-0.5 rounded border flex-shrink-0",
                      alert.wasCovered
                        ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    )}
                  >
                    {alert.wasCovered ? "COVERED" : "MISSED"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
