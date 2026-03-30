"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Search, X, ChevronDown, Check } from "lucide-react";
import {
  type StoryFilters,
  type SourceWithCount,
  type FacetItem,
} from "@/lib/api";

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

// ─── Generic Multi-Select Dropdown ──────────────────────────────────────────

interface MultiSelectOption {
  value: string;
  label: string;
  count: number;
  badge?: string;
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value]
    );
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label || "1 selected"
      : `${selected.length} selected`;

  const sortedOptions = [...options].sort((a, b) => b.count - a.count);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "filter-select flex items-center gap-2 min-w-[130px] text-left",
          selected.length > 0 && "border-accent/50 text-accent"
        )}
      >
        <span className="truncate flex-1 text-sm">{label}</span>
        <ChevronDown
          className={clsx(
            "w-3.5 h-3.5 flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[220px] max-h-[320px] overflow-y-auto animate-in">
          {/* Header */}
          <div className="sticky top-0 bg-surface-100 border-b border-surface-300/50 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {options.length} options
            </span>
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {sortedOptions.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={clsx(
                  "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-200/50 transition-colors",
                  isSelected && "bg-accent/5"
                )}
              >
                <div
                  className={clsx(
                    "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                    isSelected
                      ? "bg-accent border-accent"
                      : "border-surface-300"
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                {opt.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-300/60 text-gray-400 flex-shrink-0">
                    {opt.badge}
                  </span>
                )}
                <span
                  className={clsx(
                    "text-sm truncate flex-1",
                    isSelected ? "text-white" : "text-gray-300"
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                  ({opt.count})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [timeRange, setTimeRange] = useState(
    searchParams.get("time_range") || "24h"
  );
  const [minScore, setMinScore] = useState(
    Number(searchParams.get("min_score") || "0")
  );

  const categoryOptions: MultiSelectOption[] = (facets?.categories || []).map(
    (c) => ({ value: c.name, label: c.name, count: c.count })
  );

  const statusOptions: MultiSelectOption[] = (facets?.statuses || []).map(
    (s) => ({ value: s.name, label: s.name, count: s.count })
  );

  const sourceOptions: MultiSelectOption[] = (facets?.sources || [])
    .filter((s) => s.storyCount > 0)
    .map((s) => ({
      value: s.id,
      label: s.name,
      count: s.storyCount,
      badge: PLATFORM_LABELS[s.platform] || s.platform,
    }));

  const buildFilters = useCallback((): StoryFilters => {
    return {
      q: searchInput || undefined,
      category:
        selectedCategories.length > 0
          ? selectedCategories.join(",")
          : undefined,
      status:
        selectedStatuses.length > 0
          ? selectedStatuses.join(",")
          : undefined,
      time_range: timeRange || undefined,
      min_score: minScore > 0 ? minScore : undefined,
      source_ids: selectedSources.length > 0 ? selectedSources : undefined,
    };
  }, [
    searchInput,
    selectedCategories,
    selectedStatuses,
    selectedSources,
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
    setTimeRange("24h");
    setMinScore(0);
  };

  const hasActiveFilters =
    searchInput ||
    selectedCategories.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedSources.length > 0 ||
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
        <MultiSelect
          options={categoryOptions}
          selected={selectedCategories}
          onChange={setSelectedCategories}
          placeholder="All Categories"
        />

        {/* Status multi-select */}
        <MultiSelect
          options={statusOptions}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
          placeholder="All Statuses"
        />

        {/* Source multi-select */}
        <MultiSelect
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
