"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import type { StoryFilters } from "@/lib/api";

const CATEGORIES = [
  "All Categories",
  "Crime",
  "Traffic",
  "Weather",
  "Politics",
  "Business",
  "Health",
  "Education",
  "Sports",
  "Entertainment",
  "Technology",
  "Environment",
];

const STATUSES = ["All Statuses", "BREAKING", "TRENDING", "ACTIVE", "STALE"];

const TIME_RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

interface FilterBarProps {
  onFiltersChange: (filters: StoryFilters) => void;
}

export function FilterBar({ onFiltersChange }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    searchParams.get("q") || ""
  );
  const [category, setCategory] = useState(
    searchParams.get("category") || ""
  );
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [timeRange, setTimeRange] = useState(
    searchParams.get("time_range") || "24h"
  );
  const [minScore, setMinScore] = useState(
    Number(searchParams.get("min_score") || "0")
  );

  const buildFilters = useCallback((): StoryFilters => {
    return {
      q: searchInput || undefined,
      category: category || undefined,
      status: status || undefined,
      time_range: timeRange || undefined,
      min_score: minScore > 0 ? minScore : undefined,
    };
  }, [searchInput, category, status, timeRange, minScore]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      const filters = buildFilters();
      onFiltersChange(filters);
      updateUrlParams(filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, category, status, timeRange, minScore, buildFilters, onFiltersChange]);

  const updateUrlParams = (filters: StoryFilters) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.time_range) params.set("time_range", filters.time_range);
    if (filters.min_score) params.set("min_score", String(filters.min_score));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  };

  const clearFilters = () => {
    setSearchInput("");
    setCategory("");
    setStatus("");
    setTimeRange("24h");
    setMinScore(0);
  };

  const hasActiveFilters =
    searchInput || category || status || timeRange !== "24h" || minScore > 0;

  return (
    <div className="glass-card p-4 space-y-4">
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

        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="filter-select"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c === "All Categories" ? "" : c}>
              {c}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="filter-select"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s === "All Statuses" ? "" : s}>
              {s}
            </option>
          ))}
        </select>

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
