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
  AlertTriangle,
  Activity,
  Layers,
  FileText,
  Globe,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle,
  Target,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

type Tab = "overview" | "engagement" | "velocity" | "coverage" | "pipeline" | "content";
type DateRange = "24h" | "7d" | "30d";

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

function HorizontalBar({
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
          className={clsx("flex-1 rounded-t-sm min-h-[2px] transition-all hover:opacity-80", color)}
          style={{ height: `${Math.max(2, ((item[valueKey] || 0) / max) * 100)}%` }}
          title={`${item.hour || item.date || i}: ${item[valueKey]}`}
        />
      ))}
    </div>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <ArrowUp className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "down") return <ArrowDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-500" />;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<DateRange>("7d");

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
  const tl = timeline?.data || [];
  const domains = domainScores?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            Analytics
          </h1>
          <div className="flex items-center gap-1">
            {(["24h", "7d", "30d"] as DateRange[]).map((p) => (
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

        {/* ─── OVERVIEW TAB ───────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Stories (24h)" value={ov.last24hStories ?? "-"} icon={Newspaper} color="text-accent" />
              <StatCard label="Breaking Now" value={ov.breakingNow ?? "-"} icon={Zap} color="text-red-400" />
              <StatCard label="Active Sources" value={ov.activeSources ?? "-"} icon={Database} color="text-green-400" />
              <StatCard
                label="Avg Time to Breaking"
                value={velocity?.avgTimeToBreaking ? `${Math.round(velocity.avgTimeToBreaking)}m` : "-"}
                icon={Clock}
                color="text-yellow-400"
              />
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Status Distribution</h3>
                <HorizontalBar
                  data={(overview?.statuses || []).map((s: any) => ({ name: s.status, count: s.count }))}
                  labelKey="name"
                  valueKey="count"
                  color="bg-accent"
                />
              </div>
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Categories</h3>
                <HorizontalBar
                  data={(overview?.categories || []).map((c: any) => ({ name: c.category, count: c.count }))}
                  labelKey="name"
                  valueKey="count"
                  color="bg-green-500"
                />
              </div>
            </div>

            {/* Top sources */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Sources by Volume</h3>
                <div className="space-y-1.5">
                  {(overview?.topSources || []).map((s: any, i: number) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-1 border-b border-surface-300/20 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-5">{i + 1}.</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{s.platform}</span>
                        <span className="text-gray-200 truncate">{s.name}</span>
                      </div>
                      <span className="font-mono text-gray-400 text-xs">{s.postCount} posts</span>
                    </div>
                  ))}
                </div>
              </div>

              {domains.length > 0 && (
                <div className="glass-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300">Source Reliability</h3>
                  <HorizontalBar
                    data={domains.slice(0, 10).map((d: any) => ({ name: d.domain, score: Math.round(d.score * 100) }))}
                    labelKey="name"
                    valueKey="score"
                    color="bg-blue-500"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── ENGAGEMENT TAB ─────────────────────────────────────────── */}
        {tab === "engagement" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Engagement (24h)"
                value={formatNum(engagement?.totalEngagement?.last24h || 0)}
                icon={TrendingUp}
                color="text-accent"
              />
              <StatCard
                label="Engagement (7d)"
                value={formatNum(engagement?.totalEngagement?.last7d || 0)}
                icon={TrendingUp}
                color="text-blue-400"
              />
              <StatCard
                label="Top Stories"
                value={(engagement?.topEngaged || []).length}
                icon={Activity}
              />
              <StatCard
                label="Platforms"
                value={(engagement?.byPlatform || []).length}
                icon={Globe}
              />
            </div>

            {(engagement?.byPlatform || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Engagement by Platform</h3>
                <HorizontalBar
                  data={[...(engagement?.byPlatform || [])].sort((a: any, b: any) => b.engagement - a.engagement)}
                  labelKey="platform"
                  valueKey="engagement"
                  color="bg-orange-500"
                />
                <div className="flex gap-3 flex-wrap mt-2">
                  {(engagement?.byPlatform || []).map((p: any) => (
                    <span key={p.platform} className="text-[10px] text-gray-500">
                      {p.platform}: {p.posts} posts
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(engagement?.engagementTrend || []).length > 0 && (
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">Hourly Engagement (48h)</h3>
                <TimelineChart data={engagement.engagementTrend} valueKey="total" color="bg-orange-500/70" />
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>48h ago</span>
                  <span>Now</span>
                </div>
              </div>
            )}

            {(engagement?.topEngaged || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Engaged Stories</h3>
                {(engagement.topEngaged || []).slice(0, 10).map((s: any, i: number) => (
                  <div key={s.id || i} className="flex items-center gap-3 text-sm py-1.5 border-b border-surface-300/20 last:border-0">
                    <span className="text-xs text-gray-600 w-5 font-bold">{i + 1}</span>
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold",
                      s.status === "BREAKING" || s.status === "ALERT" ? "bg-red-600 text-white" : "bg-surface-300/60 text-gray-400"
                    )}>
                      {s.status}
                    </span>
                    <span className="text-gray-300 truncate flex-1">{s.title}</span>
                    <span className="text-orange-400 font-mono text-xs ml-2">{formatNum(s.totalEngagement)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── VELOCITY TAB ───────────────────────────────────────────── */}
        {tab === "velocity" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Avg Time to Breaking"
                value={velocity?.avgTimeToBreaking ? `${velocity.avgTimeToBreaking} min` : "-"}
                icon={Clock}
                color="text-yellow-400"
              />
              <StatCard
                label="Avg Sources at Breaking"
                value={velocity?.avgSourcesAtBreaking ?? "-"}
                icon={Database}
                color="text-green-400"
              />
              <StatCard
                label="Fastest (min)"
                value={velocity?.fastestBreaking?.[0]?.timeMinutes ?? "-"}
                icon={Zap}
                color="text-accent"
              />
              <StatCard
                label="Categories Tracked"
                value={(velocity?.velocityByCategory || []).length}
                icon={Target}
              />
            </div>

            {(velocity?.fastestBreaking || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  Fastest to Breaking
                </h3>
                {velocity.fastestBreaking.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-surface-300/20 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-yellow-400 w-6 text-center">{i + 1}</span>
                      <span className="text-gray-300 truncate">{s.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-yellow-400 font-mono">{s.timeMinutes}m</span>
                      <span className="text-gray-500">{s.sources} sources</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(velocity?.velocityByCategory || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Avg Time-to-Breaking by Category</h3>
                <HorizontalBar
                  data={[...(velocity.velocityByCategory || [])].sort((a: any, b: any) => a.avgMinutes - b.avgMinutes)}
                  labelKey="category"
                  valueKey="avgMinutes"
                  color="bg-yellow-500"
                />
              </div>
            )}

            {(velocity?.velocityByHour || []).length > 0 && (
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">Breaking Stories by Hour of Day (UTC)</h3>
                <TimelineChart data={velocity.velocityByHour} valueKey="count" color="bg-purple-500/70" />
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>0:00</span>
                  <span>6:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── COVERAGE TAB ───────────────────────────────────────────── */}
        {tab === "coverage" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Coverage Gaps (7d)"
                value={coverage?.totalGaps ?? "-"}
                icon={AlertTriangle}
                color={(coverage?.gapRate || 0) > 20 ? "text-red-400" : "text-yellow-400"}
              />
              <StatCard
                label="Gap Rate"
                value={coverage?.gapRate != null ? `${coverage.gapRate}%` : "-"}
                icon={Shield}
                color={(coverage?.gapRate || 0) > 20 ? "text-red-400" : "text-green-400"}
              />
              <StatCard
                label="Covered Rate"
                value={coverage?.coveredRate != null ? `${coverage.coveredRate}%` : "-"}
                icon={Eye}
                color="text-green-400"
              />
              <StatCard
                label="Avg Gap Delay"
                value={coverage?.avgGapDuration ? `${Math.round(coverage.avgGapDuration)} min` : "-"}
                icon={Clock}
              />
            </div>

            {/* Total gaps banner */}
            <div className="glass-card p-5 flex items-center gap-4">
              <AlertTriangle className={clsx("w-8 h-8", (coverage?.totalGaps || 0) > 0 ? "text-red-400" : "text-green-400")} />
              <div>
                <div className="text-2xl font-bold text-white">{coverage?.totalGaps ?? 0} uncovered stories</div>
                <div className="text-sm text-gray-500">In the last 7 days</div>
              </div>
            </div>

            {(coverage?.gapsByCategory || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Gaps by Category</h3>
                <HorizontalBar
                  data={[...(coverage.gapsByCategory || [])].sort((a: any, b: any) => b.count - a.count)}
                  labelKey="category"
                  valueKey="count"
                  color="bg-red-500"
                />
              </div>
            )}

            {(coverage?.feedPerformance || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Feed Performance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-300/50 text-gray-500">
                        <th className="text-left py-2 px-3">Feed</th>
                        <th className="text-right py-2 px-3">Covered</th>
                        <th className="text-right py-2 px-3">Gaps</th>
                        <th className="text-right py-2 px-3">Total</th>
                        <th className="text-right py-2 px-3">Coverage %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverage.feedPerformance.map((f: any) => {
                        const pct = f.total > 0 ? Math.round((f.covered / f.total) * 100) : 0;
                        return (
                          <tr key={f.id} className="border-b border-surface-300/10">
                            <td className="py-2 px-3 text-gray-300">{f.name}</td>
                            <td className="py-2 px-3 text-right font-mono text-green-400">{f.covered}</td>
                            <td className="py-2 px-3 text-right font-mono text-red-400">{f.gaps}</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-400">{f.total}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={clsx("font-mono", pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400")}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!coverage?.feedPerformance || coverage.feedPerformance.length === 0) &&
              (!coverage?.gapsByCategory || coverage.gapsByCategory.length === 0) && (
              <div className="glass-card p-8 text-center text-gray-500">
                No coverage feeds configured. Add coverage feeds in Settings to track gaps.
              </div>
            )}
          </>
        )}

        {/* ─── PIPELINE TAB ───────────────────────────────────────────── */}
        {tab === "pipeline" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Ingestion Rate"
                value={pipeline?.ingestionRate ? `${pipeline.ingestionRate}/hr` : "-"}
                icon={Database}
                color="text-accent"
              />
              <StatCard
                label="Enrichment Rate"
                value={pipeline?.enrichmentRate ? `${pipeline.enrichmentRate}/hr` : "-"}
                icon={Layers}
                color="text-green-400"
              />
              <StatCard
                label="Failure Rate"
                value={pipeline?.failureRate != null ? `${pipeline.failureRate}%` : "-"}
                icon={AlertTriangle}
                color={(pipeline?.failureRate || 0) > 5 ? "text-red-400" : "text-green-400"}
              />
              <StatCard
                label="Avg Processing"
                value={pipeline?.avgProcessingTime ? `${pipeline.avgProcessingTime}m` : "-"}
                icon={Clock}
              />
            </div>

            {/* 24h summary */}
            <div className="glass-card p-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <div className="text-xl font-bold text-white">{pipeline?.postsIngested24h ?? 0}</div>
                  <div className="text-xs text-gray-500">Posts ingested (24h)</div>
                </div>
              </div>
              <div className="w-px h-10 bg-surface-300/30" />
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="text-xl font-bold text-white">{pipeline?.storiesProcessed24h ?? 0}</div>
                  <div className="text-xs text-gray-500">Stories processed (24h)</div>
                </div>
              </div>
            </div>

            {(pipeline?.queueDepths || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Queue Depths</h3>
                {pipeline.queueDepths.map((q: any) => {
                  const maxWait = Math.max(...pipeline.queueDepths.map((x: any) => x.waiting), 1);
                  const pct = (q.waiting / maxWait) * 100;
                  return (
                    <div key={q.queue} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-24 text-right font-mono">{q.queue}</span>
                      <div className="flex-1 h-5 bg-surface-300/30 rounded-sm overflow-hidden">
                        <div
                          className={clsx(
                            "h-full rounded-sm transition-all",
                            q.waiting > 50 ? "bg-red-500" : q.waiting > 10 ? "bg-yellow-500" : "bg-green-500"
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-300 w-16 text-right">{q.waiting} wait</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── CONTENT TAB ────────────────────────────────────────────── */}
        {tab === "content" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="AI Summary Rate"
                value={content?.aiSummaryRate != null ? `${content.aiSummaryRate}%` : "-"}
                icon={FileText}
                color="text-purple-400"
              />
              <StatCard
                label="Breaking Package Rate"
                value={content?.breakingPackageRate != null ? `${content.breakingPackageRate}%` : "-"}
                icon={Zap}
                color="text-orange-400"
              />
              <StatCard
                label="Avg Drafts/Story"
                value={content?.avgDraftsPerStory ?? "-"}
                icon={FileText}
              />
            </div>

            {(content?.topCategories7d || []).length > 0 && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Categories (7d) with Trend vs Prior Week</h3>
                {content.topCategories7d.map((c: any, i: number) => {
                  const maxCount = Math.max(...content.topCategories7d.map((x: any) => x.count), 1);
                  const pct = (c.count / maxCount) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400 w-24 truncate text-right text-xs">{c.category}</span>
                      <div className="flex-1 h-5 bg-surface-300/30 rounded-sm overflow-hidden">
                        <div className="h-full bg-accent/60 rounded-sm" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-gray-300 w-8 text-right">{c.count}</span>
                      <TrendIcon trend={c.trend} />
                      <span className="text-[10px] text-gray-500 w-12">
                        was {c.previousCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {content?.sentimentDistribution && (
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Sentiment Distribution</h3>
                <SentimentBar distribution={content.sentimentDistribution} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sentiment CSS-only pie/bar ──────────────────────────────────────────────

function SentimentBar({ distribution }: { distribution: Record<string, number> }) {
  const segments = [
    { label: "Positive", value: distribution.POSITIVE || 0, color: "bg-green-500", textColor: "text-green-400" },
    { label: "Neutral", value: distribution.NEUTRAL || 0, color: "bg-gray-500", textColor: "text-gray-400" },
    { label: "Negative", value: distribution.NEGATIVE || 0, color: "bg-red-500", textColor: "text-red-400" },
    { label: "Mixed", value: distribution.MIXED || 0, color: "bg-yellow-500", textColor: "text-yellow-400" },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className="text-sm text-gray-500 text-center">No sentiment data available.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden">
        {segments.map((s) => {
          const pct = (s.value / total) * 100;
          return pct > 0 ? (
            <div
              key={s.label}
              className={clsx("h-full transition-all", s.color)}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${s.value} (${Math.round(pct)}%)`}
            />
          ) : null;
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        {segments.filter(s => s.value > 0).map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={clsx("w-3 h-3 rounded-full", s.color)} />
            <span className={clsx("text-xs font-medium", s.textColor)}>{s.label}</span>
            <span className="text-xs text-gray-500">{s.value} ({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>

      {/* CSS-only pie chart */}
      <div className="flex justify-center mt-4">
        <div
          className="w-32 h-32 rounded-full"
          style={{
            background: `conic-gradient(${segments
              .filter(s => s.value > 0)
              .reduce((acc: string[], s, i, arr) => {
                const before = arr.slice(0, i).reduce((sum, x) => sum + x.value, 0);
                const startPct = (before / total) * 100;
                const endPct = ((before + s.value) / total) * 100;
                const colorMap: Record<string, string> = { "bg-green-500": "#22c55e", "bg-gray-500": "#6b7280", "bg-red-500": "#ef4444", "bg-yellow-500": "#eab308" };
                acc.push(`${colorMap[s.color] || "#666"} ${startPct}% ${endPct}%`);
                return acc;
              }, [])
              .join(", ")})`,
          }}
        />
      </div>
    </div>
  );
}
