"use client";

import { useState, useCallback, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { Radio, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { fetchStories, type StoryFilters } from "@/lib/api";
import { StoryTable } from "@/components/StoryTable";
import { FilterBar } from "@/components/FilterBar";
import { NewsProgressPanel } from "@/components/NewsProgressPanel";
import { useUser } from "@/components/UserProvider";

function DashboardContent() {
  const { dashboardTitle, isLoggedIn } = useUser();

  const [filters, setFilters] = useState<StoryFilters>({
    time_range: "24h",
    page: 1,
    page_size: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "breaking_score", desc: true },
  ]);

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["stories", filters],
    queryFn: () =>
      fetchStories({
        ...filters,
        sort_by: sorting[0]?.id,
        sort_order: sorting[0]?.desc ? "desc" : "asc",
      }),
    refetchInterval: 30_000,
  });

  const handleFiltersChange = useCallback((newFilters: StoryFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const stories = data?.stories || [];
  const totalPages = data?.total_pages || 1;
  const currentPage = data?.page || 1;
  const total = data?.total || 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-surface-300/50 bg-surface-50/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {dashboardTitle}
              </h1>
              <div className="live-indicator">
                <span className="live-dot" />
                LIVE
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isLoggedIn && (
                <Link
                  href="/settings"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  News Profile
                </Link>
              )}
              <Link
                href="/feeds"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                RSS Feeds
              </Link>
              {dataUpdatedAt > 0 && (
                <span className="text-xs text-gray-600">
                  Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        {/* Pipeline progress */}
        <NewsProgressPanel />

        {/* Filter bar */}
        <FilterBar onFiltersChange={handleFiltersChange} />

        {/* Results count */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {isLoading
              ? "Loading stories..."
              : `${total} stories found`}
          </span>
          {total > 0 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* Error state */}
        {isError && (
          <div className="glass-card p-6 text-center">
            <p className="text-red-400 mb-2">Failed to load stories</p>
            <p className="text-gray-500 text-sm">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="glass-card p-12 text-center">
            <div className="inline-flex items-center gap-3 text-gray-400">
              <Radio className="w-5 h-5 animate-pulse" />
              <span>Scanning for breaking news...</span>
            </div>
          </div>
        )}

        {/* Stories table */}
        {!isLoading && !isError && (
          <div className="glass-card overflow-hidden">
            <StoryTable
              stories={stories}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className={clsx(
                "filter-btn flex items-center gap-1",
                currentPage <= 1 && "opacity-40 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page: number;
              if (totalPages <= 7) {
                page = i + 1;
              } else if (currentPage <= 4) {
                page = i + 1;
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i;
              } else {
                page = currentPage - 3 + i;
              }

              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={clsx(
                    "filter-btn w-9 h-9 flex items-center justify-center",
                    page === currentPage && "filter-btn-active"
                  )}
                >
                  {page}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className={clsx(
                "filter-btn flex items-center gap-1",
                currentPage >= totalPages && "opacity-40 cursor-not-allowed"
              )}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
