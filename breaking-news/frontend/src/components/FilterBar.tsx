"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import {
  type StoryFilters,
  type SourceWithCount,
  type FacetItem,
  fetchMarkets,
  fetchUserProfile,
} from "@/lib/api";
import { MultiSelectDropdown, SingleSelectDropdown, getEffectiveSelection } from "./MultiSelectDropdown";

const TIME_RANGE_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const TREND_OPTIONS = [
  { value: "all", label: "All Trends" },
  { value: "rising", label: "Rising", icon: "\u2197" },
  { value: "declining", label: "Declining", icon: "\u2198" },
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
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [uncoveredOnly, setUncoveredOnly] = useState(false);
  const [trend, setTrend] = useState("all");
  const [timeRange, setTimeRange] = useState(
    searchParams.get("time_range") || "24h"
  );
  const [minScore, setMinScore] = useState(
    Number(searchParams.get("min_score") || "0")
  );

  // Fetch user profile to determine accessible markets + superadmin status
  const { data: profileData } = useQuery({
    queryKey: ["user-profile-markets"],
    queryFn: fetchUserProfile,
    staleTime: 60_000,
    retry: false,
  });

  // Fetch all markets (superadmin gets all, regular users get their own)
  const { data: allMarketsData } = useQuery({
    queryKey: ["all-markets"],
    queryFn: fetchMarkets,
    staleTime: 60_000,
    retry: false,
  });

  const isSuperAdmin = (profileData as any)?.isSuperAdmin === true;
  const userMarkets = (profileData as any)?.markets || [];
  const allMarkets = ((allMarketsData as any)?.data || allMarketsData || []) as Array<{
    id: string;
    name: string;
    slug: string;
    state: string | null;
    isActive: boolean;
  }>;

  // Superadmin sees all markets; regular users see only their account's markets
  const availableMarkets = isSuperAdmin
    ? allMarkets.filter((m) => m.isActive)
    : userMarkets.filter((m: any) => m.isActive);

  const marketOptions = [
    { value: "__national__", label: "National" },
    ...availableMarkets.map((m: any) => ({
      value: m.id,
      label: m.name + (m.state ? `, ${m.state}` : ""),
    })),
  ];

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
    const effectiveMarkets = getEffectiveSelection(selectedMarkets);

    return {
      q: searchInput || undefined,
      category: effectiveCats ? effectiveCats.join(",") : undefined,
      status: effectiveStatuses ? effectiveStatuses.join(",") : undefined,
      time_range: timeRange || undefined,
      min_score: minScore > 0 ? minScore : undefined,
      source_ids: effectiveSources || undefined,
      market_ids: effectiveMarkets || undefined,
      uncovered_only: uncoveredOnly || undefined,
      trend: trend !== "all" ? (trend as "rising" | "declining") : undefined,
    };
  }, [
    searchInput,
    selectedCategories,
    selectedStatuses,
    selectedSources,
    selectedMarkets,
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
    selectedMarkets,
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
    if (filters.market_ids) params.set("markets", filters.market_ids.join(","));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  };

  const clearFilters = () => {
    setSearchInput("");
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSelectedSources([]);
    setSelectedMarkets([]);
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
    selectedMarkets.length > 0 ||
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

        {/* Source multi-select with search */}
        <MultiSelectDropdown
          options={sourceOptions}
          selected={selectedSources}
          onChange={setSelectedSources}
          placeholder="All Sources"
          searchable
        />

        {/* Market multi-select with search */}
        {marketOptions.length > 0 && (
          <MultiSelectDropdown
            options={marketOptions}
            selected={selectedMarkets}
            onChange={setSelectedMarkets}
            placeholder="All Markets"
            searchable
          />
        )}

        {/* Time range dropdown */}
        <SingleSelectDropdown
          options={TIME_RANGE_OPTIONS}
          value={timeRange}
          onChange={setTimeRange}
        />

        {/* Trend dropdown */}
        <SingleSelectDropdown
          options={TREND_OPTIONS}
          value={trend}
          onChange={setTrend}
        />

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
