"use client";

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  TrendingUp,
  Clock,
  Award,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

interface ReporterStats {
  reporter: {
    id: string;
    name: string;
    beats: string[];
    status: string;
  };
  totalAssignments: number;
  last30Days: number;
  completionRate: number;
  avgTurnaroundMin: number;
  exclusiveCount: number;
  beatDistribution: Record<string, number>;
  onTimeRate: number;
  currentStatus: string;
}

interface ReporterDetail {
  recentAssignments: {
    storyTitle: string;
    status: string;
    assignedAt: string;
    completedAt: string | null;
  }[];
  weeklyTrend: number[];
  priorityBreakdown: Record<string, number>;
}

type SortField =
  | "name"
  | "last30Days"
  | "completionRate"
  | "avgTurnaroundMin"
  | "exclusiveCount"
  | "onTimeRate";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  AVAILABLE: { bg: "bg-green-500/20", text: "text-green-400", label: "Available" },
  ON_ASSIGNMENT: { bg: "bg-blue-500/20", text: "text-blue-400", label: "On Assignment" },
  OFF_DUTY: { bg: "bg-gray-500/20", text: "text-gray-400", label: "Off Duty" },
  ON_BREAK: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "On Break" },
};

export default function ReportersPage() {
  const [sortField, setSortField] = useState<SortField>("last30Days");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: reporterData, isLoading } = useQuery({
    queryKey: ["reporter-performance"],
    queryFn: () =>
      apiFetch<{ data: ReporterStats[] }>("/api/v1/analytics/reporters", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 30_000,
  });

  const { data: detailData } = useQuery({
    queryKey: ["reporter-detail", expandedId],
    queryFn: () =>
      apiFetch<{ data: ReporterDetail }>(
        `/api/v1/analytics/reporters/${expandedId}`,
        { headers: getAuthHeaders() }
      ),
    enabled: !!expandedId,
  });

  const reporters = reporterData?.data || [];
  const detail = detailData?.data;

  const sorted = [...reporters].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sortField) {
      case "name":
        aVal = a.reporter.name.toLowerCase();
        bVal = b.reporter.name.toLowerCase();
        break;
      case "last30Days":
        aVal = a.last30Days;
        bVal = b.last30Days;
        break;
      case "completionRate":
        aVal = a.completionRate;
        bVal = b.completionRate;
        break;
      case "avgTurnaroundMin":
        aVal = a.avgTurnaroundMin;
        bVal = b.avgTurnaroundMin;
        break;
      case "exclusiveCount":
        aVal = a.exclusiveCount;
        bVal = b.exclusiveCount;
        break;
      case "onTimeRate":
        aVal = a.onTimeRate;
        bVal = b.onTimeRate;
        break;
      default:
        aVal = 0;
        bVal = 0;
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1" />
    );
  }

  const avgCompletion =
    reporters.length > 0
      ? reporters.reduce((sum, r) => sum + r.completionRate, 0) / reporters.length
      : 0;
  const total30d = reporters.reduce((sum, r) => sum + r.last30Days, 0);
  const avgTurnaround =
    reporters.length > 0
      ? reporters.reduce((sum, r) => sum + r.avgTurnaroundMin, 0) / reporters.length
      : 0;

  const overviewCards = [
    {
      label: "Total Reporters",
      value: reporters.length,
      icon: <Users className="w-5 h-5" />,
      color: "text-blue-400",
    },
    {
      label: "Avg Completion Rate",
      value: `${avgCompletion.toFixed(1)}%`,
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-green-400",
    },
    {
      label: "Assignments (30d)",
      value: total30d,
      icon: <Award className="w-5 h-5" />,
      color: "text-purple-400",
    },
    {
      label: "Avg Turnaround",
      value: `${avgTurnaround.toFixed(0)}m`,
      icon: <Clock className="w-5 h-5" />,
      color: "text-orange-400",
    },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-400" />
            Reporter Performance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track reporter assignments, turnaround times, and beat coverage
          </p>
        </div>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading reporter data...
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {overviewCards.map((card) => (
                <div key={card.label} className="glass-card p-4 text-center animate-in">
                  <div className={clsx("mx-auto mb-2", card.color)}>
                    {card.icon}
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">
                    {card.value}
                  </div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Leaderboard Table */}
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th
                        className="table-header cursor-pointer select-none"
                        onClick={() => toggleSort("name")}
                      >
                        Name <SortIcon field="name" />
                      </th>
                      <th className="table-header">Status</th>
                      <th
                        className="table-header cursor-pointer select-none text-right"
                        onClick={() => toggleSort("last30Days")}
                      >
                        30d Assignments <SortIcon field="last30Days" />
                      </th>
                      <th
                        className="table-header cursor-pointer select-none text-right"
                        onClick={() => toggleSort("completionRate")}
                      >
                        Completion <SortIcon field="completionRate" />
                      </th>
                      <th
                        className="table-header cursor-pointer select-none text-right"
                        onClick={() => toggleSort("avgTurnaroundMin")}
                      >
                        Avg Turnaround <SortIcon field="avgTurnaroundMin" />
                      </th>
                      <th
                        className="table-header cursor-pointer select-none text-right"
                        onClick={() => toggleSort("exclusiveCount")}
                      >
                        Exclusives <SortIcon field="exclusiveCount" />
                      </th>
                      <th
                        className="table-header cursor-pointer select-none text-right"
                        onClick={() => toggleSort("onTimeRate")}
                      >
                        On-Time <SortIcon field="onTimeRate" />
                      </th>
                      <th className="table-header w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => {
                      const isExpanded = expandedId === r.reporter.id;
                      const status = STATUS_COLORS[r.currentStatus] || STATUS_COLORS.OFF_DUTY;
                      return (
                        <Fragment key={r.reporter.id}>
                          <tr
                            className="table-row cursor-pointer"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : r.reporter.id)
                            }
                          >
                            <td className="table-cell">
                              <div className="text-white font-medium">
                                {r.reporter.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {r.reporter.beats.join(", ") || "No beats"}
                              </div>
                            </td>
                            <td className="table-cell">
                              <span
                                className={clsx(
                                  "px-2 py-0.5 rounded-full text-xs font-medium",
                                  status.bg,
                                  status.text
                                )}
                              >
                                {status.label}
                              </span>
                            </td>
                            <td className="table-cell text-right tabular-nums text-white">
                              {r.last30Days}
                            </td>
                            <td className="table-cell text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="score-bar w-16">
                                  <div
                                    className="score-bar-fill bg-green-500"
                                    style={{ width: `${r.completionRate}%` }}
                                  />
                                </div>
                                <span className="text-white tabular-nums text-sm">
                                  {r.completionRate.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="table-cell text-right tabular-nums text-white">
                              {r.avgTurnaroundMin.toFixed(0)}m
                            </td>
                            <td className="table-cell text-right tabular-nums text-white">
                              {r.exclusiveCount}
                            </td>
                            <td className="table-cell text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="score-bar w-16">
                                  <div
                                    className="score-bar-fill bg-blue-500"
                                    style={{ width: `${r.onTimeRate}%` }}
                                  />
                                </div>
                                <span className="text-white tabular-nums text-sm">
                                  {r.onTimeRate.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="table-cell text-center">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </td>
                          </tr>

                          {/* Expanded Detail Panel */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-0">
                                <div className="bg-surface-200/50 border-t border-b border-surface-300/30 p-5 space-y-5 animate-in">
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Beat Distribution */}
                                    <div className="space-y-3">
                                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-purple-400" />
                                        Beat Distribution
                                      </h3>
                                      {Object.keys(r.beatDistribution).length > 0 ? (
                                        Object.entries(r.beatDistribution)
                                          .sort(([, a], [, b]) => b - a)
                                          .map(([beat, count]) => {
                                            const maxCount = Math.max(
                                              ...Object.values(r.beatDistribution)
                                            );
                                            const pct =
                                              maxCount > 0
                                                ? (count / maxCount) * 100
                                                : 0;
                                            return (
                                              <div
                                                key={beat}
                                                className="flex items-center gap-3"
                                              >
                                                <span className="text-xs text-gray-400 w-24 truncate">
                                                  {beat}
                                                </span>
                                                <div className="flex-1 score-bar">
                                                  <div
                                                    className="score-bar-fill bg-purple-500"
                                                    style={{ width: `${pct}%` }}
                                                  />
                                                </div>
                                                <span className="text-xs text-white tabular-nums w-8 text-right">
                                                  {count}
                                                </span>
                                              </div>
                                            );
                                          })
                                      ) : (
                                        <p className="text-xs text-gray-500">
                                          No beat data available
                                        </p>
                                      )}
                                    </div>

                                    {/* Recent Assignments */}
                                    <div className="space-y-3">
                                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Award className="w-4 h-4 text-orange-400" />
                                        Recent Assignments
                                      </h3>
                                      {detail?.recentAssignments &&
                                      detail.recentAssignments.length > 0 ? (
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {detail.recentAssignments
                                            .slice(0, 10)
                                            .map((a, idx) => (
                                              <div
                                                key={idx}
                                                className="flex items-start justify-between gap-2 text-xs"
                                              >
                                                <div className="flex-1 min-w-0">
                                                  <div className="text-white truncate">
                                                    {a.storyTitle}
                                                  </div>
                                                  <div className="text-gray-500">
                                                    {formatRelativeTime(a.assignedAt)}
                                                  </div>
                                                </div>
                                                <span
                                                  className={clsx(
                                                    "px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
                                                    a.status === "FILED" || a.status === "AIRED"
                                                      ? "bg-green-500/20 text-green-400"
                                                      : a.status === "ON_SCENE"
                                                      ? "bg-purple-500/20 text-purple-400"
                                                      : "bg-yellow-500/20 text-yellow-400"
                                                  )}
                                                >
                                                  {a.status}
                                                </span>
                                              </div>
                                            ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-gray-500">
                                          {detail
                                            ? "No recent assignments"
                                            : "Loading..."}
                                        </p>
                                      )}
                                    </div>

                                    {/* Weekly Trend Mini Chart */}
                                    <div className="space-y-3">
                                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-green-400" />
                                        Weekly Trend (Last 8 Weeks)
                                      </h3>
                                      {detail?.weeklyTrend &&
                                      detail.weeklyTrend.length > 0 ? (
                                        <div className="flex items-end gap-2 h-32">
                                          {detail.weeklyTrend
                                            .slice(0, 8)
                                            .map((value, idx) => {
                                              const maxVal = Math.max(
                                                ...detail.weeklyTrend
                                              );
                                              const heightPct =
                                                maxVal > 0
                                                  ? (value / maxVal) * 100
                                                  : 0;
                                              return (
                                                <div
                                                  key={idx}
                                                  className="flex-1 flex flex-col items-center justify-end gap-1"
                                                >
                                                  <span className="text-[10px] text-gray-400 tabular-nums">
                                                    {value}
                                                  </span>
                                                  <div
                                                    className="w-full bg-blue-500/60 rounded-t transition-all"
                                                    style={{
                                                      height: `${Math.max(heightPct, 4)}%`,
                                                    }}
                                                  />
                                                  <span className="text-[10px] text-gray-600">
                                                    W{idx + 1}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-gray-500">
                                          {detail
                                            ? "No trend data"
                                            : "Loading..."}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {reporters.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  No reporter data available
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

