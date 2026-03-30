"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  Newspaper,
  Database,
  Zap,
  Clock,
  Shield,
  Eye,
  Share2,
  AlertTriangle,
  Activity,
  Layers,
  FileText,
  Globe,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

type Tab = "overview" | "engagement" | "velocity" | "coverage" | "pipeline" | "content";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "engagement", label: "Engagement", icon: TrendingUp },
  { id: "velocity", label: "Velocity", icon: Zap },
  { id: "coverage", label: "Coverage", icon: Shield },
  { id: "pipeline", label: "Pipeline", icon: Layers },
  { id: "content", label: "Content", icon: FileText },
];

function StatCard({
  label,
  value,
  sub,
  color = "text-white",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="glass-card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-gray-600" />}
      </div>
      <div className={clsx("text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function BarChart({
  data,
  labelKey,
  valueKey,
  maxValue,
  color = "bg-accent",
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  maxValue?: number;
  color?: string;
}) {
  const max = maxValue || Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-24 truncate text-right">{item[labelKey]}</span>
          <div className="flex-1 h-5 bg-surface-300/30 rounded-sm overflow-hidden">
            <div
              className={clsx("h-full rounded-sm transition-all", color)}
              style={{ width: `${Math.min(100, ((item[valueKey] || 0) / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-300 font-mono w-12 text-right">
            {typeof item[valueKey] === "number" ? item[valueKey].toLocaleString() : item[valueKey]}
          </span>
        </div>
      ))}
    </div>
  );
}

function TimelineChart({
  data,
  valueKey,
  color = "bg-accent",
}: {
  data: Array<Record<string, any>>;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-px h-24">
      {data.map((item, i) => (
        <div
          key={i}
          className={clsx("flex-1 rounded-t-sm min-h-[2px] transition-all", color)}
          style={{ height: `${Math.max(2, ((item[valueKey] || 0) / max) * 100)}%` }}
          title={`${item.hour || item.date || i}: ${item[valueKey]}`}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState("24h");

  const { data: overview } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/overview"),
    refetchInterval: 30_000,
  });

  const { data: engagement } = useQuery({
    queryKey: ["analytics-engagement"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/engagement"),
    refetchInterval: 30_000,
    enabled: tab === "engagement" || tab === "overview",
  });

  const { data: velocity } = useQuery({
    queryKey: ["analytics-velocity"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/velocity"),
    refetchInterval: 30_000,
    enabled: tab === "velocity" || tab === "overview",
  });

  const { data: coverage } = useQuery({
    queryKey: ["analytics-coverage"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/coverage"),
    refetchInterval: 30_000,
    enabled: tab === "coverage",
  });

  const { data: pipeline } = useQuery({
    queryKey: ["analytics-pipeline"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/pipeline"),
    refetchInterval: 30_000,
    enabled: tab === "pipeline",
  });

  const { data: content } = useQuery({
    queryKey: ["analytics-content"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/content"),
    refetchInterval: 30_000,
    enabled: tab === "content",
  });

  const { data: timeline } = useQuery({
    queryKey: ["analytics-timeline"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/timeline"),
    refetchInterval: 30_000,
  });

  const { data: domainScores } = useQuery({
    queryKey: ["analytics-domains"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/domain-scores"),
  });

  const ov = overview?.overview || {};
  const eng = engagement?.data || {};
  const vel = velocity?.data || {};
  const cov = coverage?.data || {};
  const pip = pipeline?.data || {};
  const con = content?.data || {};
  const tl = timeline?.data || [];
  const domains = domainScores?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            Analytics
          </h1>
          <div className="flex items-center gap-1">
            {["24h", "7d", "30d"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={clsx("filter-btn text-xs", period === p && "filter-btn-active")}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "filter-btn flex items-center gap-1.5 text-sm",
                tab === t.id && "filter-btn-active"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {(tab === "overview") && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Stories (24h)" value={ov.last24hStories ?? "-"} icon={Newspaper} color="text-accent" />
              <StatCard label="Breaking Now" value={ov.breakingNow ?? "-"} icon={Zap} color="text-red-400" />
              <StatCard label="Active Sources" value={ov.activeSources ?? "-"} icon={Database} color="text-green-400" />
              <StatCard
                label="Avg Time to Breaking"
                value={vel.avgTimeToBreaking ? `${Math.round(vel.avgTimeToBreaking)}m` : "-"}
                icon={Clock}
                color="text-yellow-400"
              />
            </div>

            {/* Story timeline */}
            {tl.length > 0 && (
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">Story Volume (7d hourly)</h3>
                <TimelineChart data={tl} valueKey="total" color="bg-accent/70" />
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>{tl[0]?.hour?.slice(5, 13) || ""}</span>
                  <span>{tl[tl.length - 1]?.hour?.slice(5, 13) || ""}</span>
                </div>
              </div>
            )}

            {/* Status + Category breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Status Distribution</h3>
                <BarChart
                  data={(overview?.statuses || []).map((s: any) => ({ name: s.status, count: s.count }))}
                  labelKey="name"
                  valueKey="count"
                  color="bg-accent"
                />
              </div>
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Categories</h3>
                <BarChart
                  data={(overview?.categories || []).map((c: any) => ({ name: c.category, count: c.count }))}
                  labelKey="name"
                  valueKey="count"
                  color="bg-green-500"
                />
              </div>
            </div>
          </>
        )}

        {/* Engagement tab */}
        {tab === "engagement" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Engagement (24h)" value={(eng.totalEngagement24h || 0).toLocaleString()} icon={TrendingUp} color="text-accent" />
              <StatCard label="Total Engagement (7d)" value={(eng.totalEngagement7d || 0).toLocaleString()} icon={TrendingUp} color="text-blue-400" />
              <StatCard label="Avg per Story" value={eng.avgPerStory || "-"} icon={Activity} />
              <StatCard label="Top Platform" value={eng.topPlatform || "-"} icon={Globe} />
            </div>

            {(eng.byPlatform || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Engagement by Platform</h3>
                <BarChart data={eng.byPlatform || []} labelKey="platform" valueKey="engagement" color="bg-orange-500" />
              </div>
            )}

            {(eng.engagementTrend || []).length > 0 && (
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">Hourly Engagement (48h)</h3>
                <TimelineChart data={eng.engagementTrend || []} valueKey="total" color="bg-orange-500/70" />
              </div>
            )}

            {(eng.topEngaged || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Engaged Stories</h3>
                {(eng.topEngaged || []).slice(0, 10).map((s: any, i: number) => (
                  <div key={s.id || i} className="flex items-center justify-between text-sm py-1 border-b border-surface-300/20">
                    <span className="text-gray-300 truncate flex-1">{s.title}</span>
                    <span className="text-orange-400 font-mono text-xs ml-2">{(s.totalEngagement || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Velocity tab */}
        {tab === "velocity" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Avg Time to Breaking" value={vel.avgTimeToBreaking ? `${Math.round(vel.avgTimeToBreaking)} min` : "-"} icon={Clock} color="text-yellow-400" />
              <StatCard label="Avg Sources at Breaking" value={vel.avgSourcesAtBreaking ?? "-"} icon={Database} color="text-green-400" />
              <StatCard label="Breaking Today" value={vel.breakingToday ?? "-"} icon={Zap} color="text-red-400" />
              <StatCard label="Fastest (min)" value={vel.fastestMinutes ?? "-"} icon={TrendingUp} color="text-accent" />
            </div>

            {(vel.fastestBreaking || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Fastest to Breaking</h3>
                {(vel.fastestBreaking || []).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-surface-300/20">
                    <span className="text-gray-300 truncate flex-1">{s.title}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-yellow-400 font-mono">{s.minutes} min</span>
                      <span className="text-gray-500">{s.sources} sources</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(vel.velocityByCategory || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Avg Time-to-Breaking by Category</h3>
                <BarChart data={vel.velocityByCategory || []} labelKey="category" valueKey="avgMinutes" color="bg-yellow-500" />
              </div>
            )}
          </>
        )}

        {/* Coverage tab */}
        {tab === "coverage" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Coverage Gaps (7d)" value={cov.totalGaps ?? "-"} icon={AlertTriangle} color={cov.gapRate > 20 ? "text-red-400" : "text-yellow-400"} />
              <StatCard label="Gap Rate" value={cov.gapRate ? `${cov.gapRate.toFixed(1)}%` : "-"} icon={Shield} color={cov.gapRate > 20 ? "text-red-400" : "text-green-400"} />
              <StatCard label="Covered Rate" value={cov.coveredRate ? `${cov.coveredRate.toFixed(1)}%` : "-"} icon={Eye} color="text-green-400" />
              <StatCard label="Avg Gap Delay" value={cov.avgGapDuration ? `${Math.round(cov.avgGapDuration)} min` : "-"} icon={Clock} />
            </div>

            {(cov.gapsByCategory || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Gaps by Category</h3>
                <BarChart data={cov.gapsByCategory || []} labelKey="category" valueKey="count" color="bg-red-500" />
              </div>
            )}

            {(cov.feedPerformance || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Feed Performance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-300/50">
                        <th className="table-header">Feed</th>
                        <th className="table-header text-right">Matches</th>
                        <th className="table-header text-right">Gaps</th>
                        <th className="table-header text-right">Hit Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cov.feedPerformance || []).map((f: any, i: number) => (
                        <tr key={i} className="table-row">
                          <td className="table-cell text-gray-300">{f.name}</td>
                          <td className="table-cell text-right text-green-400 font-mono">{f.matches}</td>
                          <td className="table-cell text-right text-red-400 font-mono">{f.gaps}</td>
                          <td className="table-cell text-right font-mono">{f.hitRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pipeline tab */}
        {tab === "pipeline" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Ingestion Rate" value={pip.ingestionRate ? `${pip.ingestionRate}/hr` : "-"} icon={Database} color="text-accent" />
              <StatCard label="Enrichment Rate" value={pip.enrichmentRate ? `${pip.enrichmentRate}/hr` : "-"} icon={Layers} color="text-green-400" />
              <StatCard label="Failure Rate" value={pip.failureRate ? `${pip.failureRate.toFixed(1)}%` : "-"} icon={AlertTriangle} color={pip.failureRate > 5 ? "text-red-400" : "text-green-400"} />
              <StatCard label="Avg Processing" value={pip.avgProcessingTime ? `${Math.round(pip.avgProcessingTime)}s` : "-"} icon={Clock} />
            </div>

            {(pip.queueDepths || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Queue Depths</h3>
                <BarChart data={pip.queueDepths || []} labelKey="queue" valueKey="waiting" color="bg-amber-500" />
              </div>
            )}
          </>
        )}

        {/* Content tab */}
        {tab === "content" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="AI Summary Rate" value={con.aiSummaryRate ? `${con.aiSummaryRate.toFixed(0)}%` : "-"} icon={FileText} color="text-purple-400" />
              <StatCard label="Package Rate" value={con.breakingPackageRate ? `${con.breakingPackageRate.toFixed(0)}%` : "-"} icon={Zap} color="text-orange-400" />
              <StatCard label="Avg Drafts/Story" value={con.avgDraftsPerStory?.toFixed(1) ?? "-"} icon={FileText} />
              <StatCard label="Stories (7d)" value={con.totalStories7d ?? "-"} icon={Newspaper} color="text-accent" />
            </div>

            {(con.topCategories7d || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Categories (7d) with Trend</h3>
                {(con.topCategories7d || []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400 w-24 truncate text-right">{c.category}</span>
                    <div className="flex-1 h-5 bg-surface-300/30 rounded-sm overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-sm" style={{ width: `${Math.min(100, c.percentage || 0)}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gray-300 w-8 text-right">{c.count}</span>
                    <span className={clsx("text-xs font-bold", c.trend > 0 ? "text-green-400" : c.trend < 0 ? "text-red-400" : "text-gray-500")}>
                      {c.trend > 0 ? `+${c.trend}%` : c.trend < 0 ? `${c.trend}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {con.sentimentDistribution && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Sentiment Distribution</h3>
                <div className="flex h-6 rounded-lg overflow-hidden">
                  {[
                    { label: "Positive", value: con.sentimentDistribution.positive || 0, color: "bg-green-500" },
                    { label: "Neutral", value: con.sentimentDistribution.neutral || 0, color: "bg-gray-500" },
                    { label: "Negative", value: con.sentimentDistribution.negative || 0, color: "bg-red-500" },
                    { label: "Mixed", value: con.sentimentDistribution.mixed || 0, color: "bg-yellow-500" },
                  ].map((s) => {
                    const total = Object.values(con.sentimentDistribution).reduce((a: number, b: any) => a + (b || 0), 0) as number;
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    return pct > 0 ? (
                      <div key={s.label} className={clsx("h-full", s.color)} style={{ width: `${pct}%` }} title={`${s.label}: ${s.value}`} />
                    ) : null;
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Positive: {con.sentimentDistribution.positive || 0}</span>
                  <span>Neutral: {con.sentimentDistribution.neutral || 0}</span>
                  <span>Negative: {con.sentimentDistribution.negative || 0}</span>
                  <span>Mixed: {con.sentimentDistribution.mixed || 0}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Domain scores (shown on overview) */}
        {tab === "overview" && domains.length > 0 && (
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">Top Source Domains</h3>
            <BarChart
              data={domains.slice(0, 10).map((d: any) => ({ name: d.domain, score: Math.round(d.score * 100) }))}
              labelKey="name"
              valueKey="score"
              color="bg-blue-500"
            />
          </div>
        )}
      </main>
    </div>
  );
}
