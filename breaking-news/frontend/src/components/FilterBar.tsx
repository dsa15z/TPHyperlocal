"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import {
  type StoryFilters,
  type SourceWithCount,
  type FacetItem,
} from "@/lib/api";
import { MultiSelectDropdown, getEffectiveSelection } from "./MultiSelectDropdown";

const TIME_RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

const PLATFORM_LABELS: Record<string, string> = {
  RSS: "RSS",
  NEWSAPI: "API",
  TWITTER: "X",
  FACEBOOK: "FB",
  GDELT: "GDELT",
  LLM_OPENAI: "AI",
  LLM_CLAUDE: "AI",
  MANUAL: "Man",
};

// ─── FilterBar ──────────────────────────────────────────────────────────────

interface FilterBarProps {
  onFiltersChange: (filters: StoryFilters) => void;
  facets?: {
    categories: FacetItem[];
    statuses: FacetItem[];
    sources: SourceWithCount[];
  };
}

export function FilterBar({ onFiltersChange, facets }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    searchParams.get("q") || ""
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [uncoveredOnly, setUncoveredOnly] = useState(false);
  const [trend, setTrend] = useState<"all" | "rising" | "declining">("all");
  const [timeRange, setTimeRange] = useState(
    searchParams.get("time_range") || "24h"
  );
  const [minScore, setMinScore] = useState(
    Number(searchParams.get("min_score") || "0")
  );

  const categoryOptions = (facets?.categories || []).map(
    (c) => ({ value: c.name, label: c.name, count: c.count })
  );

  const statusOptions = (facets?.statuses || []).map(
    (s) => ({ value: s.name, label: s.name, count: s.count })
  );

  const sourceOptions = (facets?.sources || [])
    .filter((s) => s.storyCount > 0)
    .map((s) => ({
      value: s.id,
      label: s.name,
      count: s.storyCount,
      badge: PLATFORM_LABELS[s.platform] || s.platform,
    }));

  const buildFilters = useCallback((): StoryFilters => {
    const effectiveCats = getEffectiveSelection(selectedCategories);
    const effectiveStatuses = getEffectiveSelection(selectedStatuses);
    const effectiveSources = getEffectiveSelection(selectedSources);

    return {
      q: searchInput || undefined,
      category: effectiveCats ? effectiveCats.join(",") : undefined,
      status: effectiveStatuses ? effectiveStatuses.join(",") : undefined,
      time_range: timeRange || undefined,
      min_score: minScore > 0 ? minScore : undefined,
      source_ids: effectiveSources || undefined,
      uncovered_only: uncoveredOnly || undefined,
      trend: trend !== "all" ? trend : undefined,
    };
  }, [
    searchInput,
    selectedCategories,
    selectedStatuses,
    selectedSources,
    uncoveredOnly,
    trend,
    timeRange,
    minScore,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const filters = buildFilters();
      onFiltersChange(filters);
      updateUrlParams(filters);
    }, 300);
    return () => clearTimeout(timer);
  }, [
    searchInput,
    selectedCategories,
    selectedStatuses,
    selectedSources,
    uncoveredOnly,
    trend,
    timeRange,
    minScore,
    buildFilters,
    onFiltersChange,
  ]);

  const updateUrlParams = (filters: StoryFilters) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.time_range) params.set("time_range", filters.time_range);
    if (filters.min_score) params.set("min_score", String(filters.min_score));
    if (filters.source_ids) params.set("sources", filters.source_ids.join(","));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  };

  const clearFilters = () => {
    setSearchInput("");
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSelectedSources([]);
    setUncoveredOnly(false);
    setTrend("all");
    setTimeRange("24h");
    setMinScore(0);
  };

  const hasActiveFilters =
    searchInput ||
    selectedCategories.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedSources.length > 0 ||
    uncoveredOnly ||
    trend !== "all" ||
    timeRange !== "24h" ||
    minScore > 0;

  return (
    <div className="glass-card p-4 space-y-4 relative z-30 overflow-visible">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search stories..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="filter-input w-full pl-9"
          />
        </div>

        {/* Category multi-select */}
        <MultiSelectDropdown
          options={categoryOptions}
          selected={selectedCategories}
          onChange={setSelectedCategories}
          placeholder="All Categories"
        />

        {/* Status multi-select */}
        <MultiSelectDropdown
          options={statusOptions}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
          placeholder="All Statuses"
        />

        {/* Source multi-select */}
        <MultiSelectDropdown
          options={sourceOptions}
          selected={selectedSources}
          onChange={setSelectedSources}
          placeholder="All Sources"
        />

        {/* Time range */}
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={clsx(
                "filter-btn",
                timeRange === tr.value && "filter-btn-active"
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>

        {/* Trend filter */}
        <div className="flex items-center gap-1">
          {(["all", "rising", "declining"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTrend(t)}
              className={clsx(
                "filter-btn text-xs capitalize",
                trend === t && "filter-btn-active"
              )}
            >
              {t === "rising" ? "\u2197 Rising" : t === "declining" ? "\u2198 Declining" : "All Trends"}
            </button>
          ))}
        </div>

        {/* Min score */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <label htmlFor="min-score" className="whitespace-nowrap">
            Min Score:
          </label>
          <input
            id="min-score"
            type="range"
            min="0"
            max="100"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24 accent-accent"
          />
          <span className="text-xs font-mono text-gray-300 w-8 text-right">
            {minScore}
          </span>
        </div>

        {/* Uncovered only toggle */}
        <button
          onClick={() => setUncoveredOnly(!uncoveredOnly)}
          className={clsx(
            "filter-btn flex items-center gap-1.5 text-sm",
            uncoveredOnly && "filter-btn-active border-red-500/50 text-red-400"
          )}
        >
          <span className={clsx(
            "w-3 h-3 rounded-full border",
            uncoveredOnly ? "bg-red-500 border-red-500" : "border-gray-500"
          )} />
          Gaps Only
        </button>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="filter-btn text-gray-400 hover:text-red-400 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
