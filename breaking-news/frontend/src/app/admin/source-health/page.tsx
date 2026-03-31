"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Search,
  ArrowUpDown,
  RefreshCw,
  Rss,
  Globe,
  Bot,
  Newspaper,
  Radio,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, SOURCES_TABS } from "@/components/PageTabBar";

// ─── Types ────────────────────────────────────────────────────────────────

interface Source {
  id: string;
  name: string;
  platform: string;
  sourceType: string;
  url: string;
  trustScore: number;
  isActive: boolean;
  lastPolledAt: string | null;
  _count?: { posts: number };
}

type HealthStatus = "healthy" | "warning" | "failing" | "inactive";

type SortField = "status" | "name" | "lastPolledAt";

// ─── Helpers ──────────────────────────────────────────────────────────────

function getHealthStatus(source: Source): HealthStatus {
  if (!source.isActive) return "inactive";
  if (!source.lastPolledAt) return "failing";

  const minutesAgo =
    (Date.now() - new Date(source.lastPolledAt).getTime()) / (1000 * 60);

  if (minutesAgo <= 15) return "healthy";
  if (minutesAgo <= 60) return "warning";
  return "failing";
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { dot: string; bg: string; label: string; sortOrder: number }
> = {
  failing: {
    dot: "bg-red-500",
    bg: "border-red-500/20",
    label: "Failing",
    sortOrder: 0,
  },
  warning: {
    dot: "bg-yellow-500",
    bg: "border-yellow-500/20",
    label: "Warning",
    sortOrder: 1,
  },
  healthy: {
    dot: "bg-green-500",
    bg: "border-green-500/20",
    label: "Healthy",
    sortOrder: 2,
  },
  inactive: {
    dot: "bg-gray-600",
    bg: "border-gray-600/20",
    label: "Inactive",
    sortOrder: 3,
  },
};

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "RSS":
      return <Rss className="w-3 h-3" />;
    case "NEWSAPI":
      return <Newspaper className="w-3 h-3" />;
    case "TWITTER":
    case "FACEBOOK":
    case "GDELT":
      return <Globe className="w-3 h-3" />;
    case "LLM_OPENAI":
    case "LLM_CLAUDE":
    case "LLM_GROK":
      return <Bot className="w-3 h-3" />;
    default:
      return <Radio className="w-3 h-3" />;
  }
}

function getPlatformLabel(platform: string): string {
  const map: Record<string, string> = {
    RSS: "RSS",
    NEWSAPI: "API",
    TWITTER: "X",
    FACEBOOK: "FB",
    GDELT: "GDELT",
    LLM_OPENAI: "OpenAI",
    LLM_CLAUDE: "Claude",
    LLM_GROK: "Grok",
  };
  return map[platform] || platform;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SourceHealthPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("status");

  const { data: rawSources, isLoading } = useQuery({
    queryKey: ["admin-sources-health"],
    queryFn: async () => {
      const res = await apiFetch<any>("/api/v1/admin/sources?limit=500", {
        headers: getAuthHeaders(),
      });
      return (res.data || res || []) as Source[];
    },
    refetchInterval: 30000,
  });

  const sources = useMemo(() => {
    if (!rawSources) return [];

    let filtered = rawSources;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.platform.toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "status") {
        const aStatus = getHealthStatus(a);
        const bStatus = getHealthStatus(b);
        const diff =
          STATUS_CONFIG[aStatus].sortOrder - STATUS_CONFIG[bStatus].sortOrder;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      // lastPolledAt: never-polled first, then oldest first
      if (!a.lastPolledAt && !b.lastPolledAt) return 0;
      if (!a.lastPolledAt) return -1;
      if (!b.lastPolledAt) return 1;
      return (
        new Date(a.lastPolledAt).getTime() -
        new Date(b.lastPolledAt).getTime()
      );
    });
  }, [rawSources, search, sortBy]);

  // Summary counts
  const summary = useMemo(() => {
    if (!rawSources) return { healthy: 0, warning: 0, failing: 0, inactive: 0 };
    const counts = { healthy: 0, warning: 0, failing: 0, inactive: 0 };
    for (const s of rawSources) {
      counts[getHealthStatus(s)]++;
    }
    return counts;
  }, [rawSources]);

  const cycleSortBy = () => {
    const order: SortField[] = ["status", "name", "lastPolledAt"];
    const idx = order.indexOf(sortBy);
    setSortBy(order[(idx + 1) % order.length]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            Source Health
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Real-time health status of all data sources
          </p>
        </div>
        <PageTabBar tabs={SOURCES_TABS} />
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-6 bg-surface-200 border border-surface-300 rounded-lg px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-gray-300">
            <span className="font-semibold text-white">{summary.healthy}</span>{" "}
            healthy
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span className="text-gray-300">
            <span className="font-semibold text-white">{summary.warning}</span>{" "}
            warning
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-gray-300">
            <span className="font-semibold text-white">{summary.failing}</span>{" "}
            failing
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-600" />
          <span className="text-gray-300">
            <span className="font-semibold text-white">{summary.inactive}</span>{" "}
            inactive
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="w-3 h-3" />
          Auto-refresh 30s
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources..."
            className="w-full pl-9 pr-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <button
          onClick={cycleSortBy}
          className="flex items-center gap-2 px-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-surface-300 transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
          Sort: {sortBy === "status" ? "Status" : sortBy === "name" ? "Name" : "Last Polled"}
        </button>
      </div>

      {/* Source grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-surface-200 border border-surface-300 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {search
            ? "No sources match your search."
            : "No sources configured yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sources.map((source) => {
            const status = getHealthStatus(source);
            const config = STATUS_CONFIG[status];

            return (
              <div
                key={source.id}
                className={clsx(
                  "bg-surface-200 border rounded-lg p-4 transition-colors hover:bg-surface-300/50",
                  config.bg
                )}
              >
                {/* Header: name + status dot */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-medium text-white truncate flex-1">
                    {source.name}
                  </h3>
                  <span
                    className={clsx("w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1", config.dot)}
                    title={config.label}
                  />
                </div>

                {/* Platform badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-400/50 rounded text-xs text-gray-300">
                    {getPlatformIcon(source.platform)}
                    {getPlatformLabel(source.platform)}
                  </span>
                </div>

                {/* Last polled */}
                <div className="text-xs text-gray-500 mb-2">
                  Last polled:{" "}
                  <span
                    className={clsx(
                      status === "healthy" && "text-green-400",
                      status === "warning" && "text-yellow-400",
                      status === "failing" && "text-red-400",
                      status === "inactive" && "text-gray-600"
                    )}
                  >
                    {source.lastPolledAt
                      ? formatRelativeTime(source.lastPolledAt)
                      : "Never"}
                  </span>
                </div>

                {/* Trust score bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Trust</span>
                  <div className="flex-1 h-1.5 bg-surface-400 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all",
                        source.trustScore >= 0.7
                          ? "bg-green-500"
                          : source.trustScore >= 0.4
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      )}
                      style={{ width: `${source.trustScore * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">
                    {(source.trustScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
