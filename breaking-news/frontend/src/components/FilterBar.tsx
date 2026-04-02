"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
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

const FILTER_STORAGE_KEY = "tp-filter-prefs";

function loadSavedFilters(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function FilterBar({ onFiltersChange, facets }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saved = useRef(loadSavedFilters());

  const [searchInput, setSearchInput] = useState(
    searchParams.get("q") || ""
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(saved.current.categories || []);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(saved.current.statuses || []);
  const [selectedSources, setSelectedSources] = useState<string[]>(saved.current.sources || []);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(saved.current.markets || []);
  const [uncoveredOnly, setUncoveredOnly] = useState(saved.current.uncoveredOnly || false);
  const [trend, setTrend] = useState(saved.current.trend || "all");
  const [timeRange, setTimeRange] = useState(
    searchParams.get("time_range") || saved.current.timeRange || "1h"
  );
  const [minScore, setMinScore] = useState(
    Number(searchParams.get("min_score") || saved.current.minScore || "0")
  );

  // Persist filter state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        categories: selectedCategories,
        statuses: selectedStatuses,
        sources: selectedSources,
        markets: selectedMarkets,
        uncoveredOnly,
        trend,
        timeRange,
        minScore,
      }));
    } catch { /* storage full */ }
  }, [selectedCategories, selectedStatuses, selectedSources, selectedMarkets, uncoveredOnly, trend, timeRange, minScore]);

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

  // Detect if search input is NLP (natural language) vs exact text search
  // NLP: 3+ words, contains filter-like words, or is a question
  const isNlpQuery = useCallback((input: string): boolean => {
    if (!input || input.length < 8) return false;
    const words = input.trim().split(/\s+/);
    if (words.length < 3) return false;
    // Contains filter intent words
    const nlpSignals = /\b(show|find|get|list|search|stories|news|breaking|trending|about|from|in|with|last|hour|today|week|high|top|recent|crime|politics|weather|sports|important|viral)\b/i;
    return nlpSignals.test(input);
  }, []);

  const buildFilters = useCallback((): StoryFilters => {
    const effectiveCats = getEffectiveSelection(selectedCategories);
    const effectiveStatuses = getEffectiveSelection(selectedStatuses);
    const effectiveSources = getEffectiveSelection(selectedSources);
    const effectiveMarkets = getEffectiveSelection(selectedMarkets);

    // Smart routing: NLP query goes to server-side parsing, exact text goes to q param
    const useNlp = isNlpQuery(searchInput);

    return {
      q: !useNlp ? (searchInput || undefined) : undefined,
      nlp: useNlp ? searchInput : undefined,
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
    isNlpQuery,
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
    try { localStorage.removeItem(FILTER_STORAGE_KEY); } catch {}
    // Clear URL params so NLP filters don't persist
    router.replace("/", { scroll: false });
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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Count how many advanced filters are active (to show badge)
  const advancedFilterCount =
    (selectedSources.length > 0 ? 1 : 0) +
    (selectedMarkets.length > 0 ? 1 : 0) +
    (trend !== "all" ? 1 : 0) +
    (minScore > 0 ? 1 : 0) +
    (uncoveredOnly ? 1 : 0);

  // Count total active filter count for mobile badge
  const totalFilterCount =
    (selectedCategories.length > 0 ? 1 : 0) +
    (selectedStatuses.length > 0 ? 1 : 0) +
    (timeRange !== "24h" ? 1 : 0) +
    advancedFilterCount;

  return (
    <div className="glass-card p-4 space-y-3 relative z-30 overflow-visible">
      {/* Search row: always visible */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input — supports both text search and NLP queries */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder='Search or ask: "breaking crime in Houston last hour"'
            aria-label="Search stories"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={clsx("filter-input w-full pl-9 pr-12", isNlpQuery(searchInput) && "border-accent/40")}
          />
          {searchInput && isNlpQuery(searchInput) && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-accent font-semibold bg-accent/10 px-1.5 py-0.5 rounded">
              AI
            </span>
          )}
        </div>

        {/* Mobile filter toggle button */}
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className={clsx(
            "md:hidden filter-btn flex items-center gap-1.5 text-sm",
            (showMobileFilters || totalFilterCount > 0) && "filter-btn-active"
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {totalFilterCount > 0 && (
            <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {totalFilterCount}
            </span>
          )}
          {showMobileFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Desktop: essential filters always visible inline */}
        <div className="hidden md:flex md:flex-row md:flex-wrap md:items-center gap-3">
          {/* Status multi-select */}
          <MultiSelectDropdown
            options={statusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            placeholder="All Statuses"
          />

          {/* Category multi-select */}
          <MultiSelectDropdown
            options={categoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            placeholder="All Categories"
          />

          {/* Time range */}
          <SingleSelectDropdown
            options={TIME_RANGE_OPTIONS}
            value={timeRange}
            onChange={setTimeRange}
          />

          {/* More filters toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={clsx(
              "filter-btn flex items-center gap-1.5 text-sm",
              (showAdvanced || advancedFilterCount > 0) && "filter-btn-active"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">More</span>
            {advancedFilterCount > 0 && (
              <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {advancedFilterCount}
              </span>
            )}
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            aria-label="Clear all filters"
            className="filter-btn text-gray-400 hover:text-red-400 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Mobile expanded filters: stacked vertically */}
      {showMobileFilters && (
        <div className="md:hidden flex flex-col gap-3 pt-2 border-t border-surface-300/20 animate-in">
          {/* Status multi-select */}
          <MultiSelectDropdown
            options={statusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            placeholder="All Statuses"
          />

          {/* Category multi-select */}
          <MultiSelectDropdown
            options={categoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            placeholder="All Categories"
          />

          {/* Time range */}
          <SingleSelectDropdown
            options={TIME_RANGE_OPTIONS}
            value={timeRange}
            onChange={setTimeRange}
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

          {/* Trend dropdown */}
          <SingleSelectDropdown
            options={TREND_OPTIONS}
            value={trend}
            onChange={setTrend}
          />

          {/* Min score */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <label htmlFor="min-score-mobile" className="whitespace-nowrap">
              Min Score:
            </label>
            <input
              id="min-score-mobile"
              type="range"
              min="0"
              max="100"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-xs font-mono text-gray-300 w-8 text-right">
              {minScore}
            </span>
          </div>

          {/* Uncovered only toggle */}
          <button
            onClick={() => setUncoveredOnly(!uncoveredOnly)}
            aria-label="Toggle gaps only filter"
            aria-pressed={uncoveredOnly}
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
        </div>
      )}

      {/* Desktop advanced row: sources, markets, trend, score, gaps */}
      {showAdvanced && (
        <div className="hidden md:flex flex-wrap items-center gap-3 pt-2 border-t border-surface-300/20 animate-in">
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
            aria-label="Toggle gaps only filter"
            aria-pressed={uncoveredOnly}
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
        </div>
      )}
    </div>
  );
}
