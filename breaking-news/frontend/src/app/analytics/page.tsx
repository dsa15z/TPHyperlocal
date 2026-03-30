"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  Newspaper,
  Database,
  Zap,
  Clock,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function AnalyticsPage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () =>
      apiFetch<any>("/api/v1/analytics/overview", { headers: getAuthHeaders() }),
    refetchInterval: 30_000,
  });

  const { data: timeline } = useQuery({
    queryKey: ["analytics-timeline"],
    queryFn: () =>
      apiFetch<any>("/api/v1/analytics/timeline", { headers: getAuthHeaders() }),
    refetchInterval: 60_000,
  });

  const { data: domainScores } = useQuery({
    queryKey: ["analytics-domains"],
    queryFn: () =>
      apiFetch<any>("/api/v1/analytics/domain-scores", {
        headers: getAuthHeaders(),
      }),
  });

  const stats = overview?.overview || {};
  const statuses = overview?.statuses || [];
  const categories = overview?.categories || [];
  const topSources = overview?.topSources || [];
  const timelineData = timeline?.data || [];
  const domains = domainScores?.data || [];

  const statCards = [
    { label: "Total Stories", value: stats.totalStories || 0, icon: <Newspaper className="w-5 h-5" />, color: "text-blue-400" },
    { label: "Last 24h", value: stats.last24hStories || 0, icon: <Clock className="w-5 h-5" />, color: "text-green-400" },
    { label: "Last 7 Days", value: stats.lastWeekStories || 0, icon: <TrendingUp className="w-5 h-5" />, color: "text-purple-400" },
    { label: "Breaking Now", value: stats.breakingNow || 0, icon: <Zap className="w-5 h-5" />, color: "text-red-400" },
    { label: "Top Stories", value: stats.topStoriesNow || 0, icon: <BarChart3 className="w-5 h-5" />, color: "text-orange-400" },
    { label: "Active Sources", value: stats.activeSources || 0, icon: <Database className="w-5 h-5" />, color: "text-cyan-400" },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-emerald-400" />
          Analytics Dashboard
        </h1>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading analytics...</div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {statCards.map((card) => (
                <div key={card.label} className="glass-card p-4 text-center">
                  <div className={clsx("mx-auto mb-2", card.color)}>{card.icon}</div>
                  <div className="text-2xl font-bold text-white tabular-nums">{card.value}</div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status breakdown */}
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Story Status Distribution</h2>
                {statuses.map((s: any) => {
                  const max = Math.max(...statuses.map((x: any) => x.count));
                  const pct = max > 0 ? (s.count / max) * 100 : 0;
                  return (
                    <div key={s.status} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-24 text-right">{s.status.replace("_", " ")}</span>
                      <div className="flex-1 h-4 bg-surface-300 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono text-white w-10 text-right">{s.count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Category breakdown */}
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Top Categories</h2>
                {categories.slice(0, 8).map((c: any) => {
                  const max = Math.max(...categories.map((x: any) => x.count));
                  const pct = max > 0 ? (c.count / max) * 100 : 0;
                  return (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-24 text-right truncate">{c.category || "Unknown"}</span>
                      <div className="flex-1 h-4 bg-surface-300 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono text-white w-10 text-right">{c.count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Top sources */}
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Top Sources by Volume</h2>
                <div className="space-y-2">
                  {topSources.map((s: any, i: number) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-surface-300/20 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-6">{i + 1}.</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{s.platform}</span>
                        <span className="text-sm text-gray-200">{s.name}</span>
                      </div>
                      <span className="text-sm font-mono text-gray-400">{s.postCount} posts</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Domain reliability */}
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Source Reliability Scores</h2>
                <div className="space-y-2">
                  {domains.slice(0, 10).map((d: any, i: number) => (
                    <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-surface-300/20 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-6">{i + 1}.</span>
                        <span className="text-sm text-gray-200">{d.domain}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-surface-300 rounded-full overflow-hidden">
                          <div className={clsx("h-full rounded-full", d.score >= 0.7 ? "bg-green-500" : d.score >= 0.4 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${d.score * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono text-gray-400">{Math.round(d.score * 100)}%</span>
                      </div>
                    </div>
                  ))}
                  {domains.length === 0 && <p className="text-sm text-gray-500">No domain scores calculated yet.</p>}
                </div>
              </div>
            </div>

            {/* Timeline */}
            {timelineData.length > 0 && (
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Story Volume Timeline (7 days)</h2>
                <div className="flex items-end gap-1 h-32">
                  {timelineData.slice(-72).map((point: any, i: number) => {
                    const maxTotal = Math.max(...timelineData.map((p: any) => p.total), 1);
                    const height = (point.total / maxTotal) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${point.hour}: ${point.total} stories`}>
                        <div
                          className={clsx("w-full rounded-t transition-all min-h-[2px]", point.breaking > 0 ? "bg-red-500" : "bg-accent")}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>3 days ago</span>
                  <span>Now</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
