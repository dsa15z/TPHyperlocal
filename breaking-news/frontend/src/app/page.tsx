"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, LayoutGrid, Table2, Search } from "lucide-react";
import clsx from "clsx";
import { fetchStories, fetchTeaserStories, type StoryFilters, type TeaserResponse } from "@/lib/api";
import { useUser } from "@/components/UserProvider";
import {
  type DashboardView,
  type ColumnConfig,
  type SavedFilters,
  loadViews,
  saveViews,
  loadActiveViewId,
  saveActiveViewId,
  createDefaultView,
  duplicateView,
  generateViewId,
} from "@/lib/views";
import { StoryTable } from "@/components/StoryTable";
import { StoryCardGrid } from "@/components/StoryCard";
import { DashboardSkeleton } from "@/components/Skeleton";
import { FilterBar } from "@/components/FilterBar";
import { NewsProgressPanel } from "@/components/NewsProgressPanel";
import { ViewSelector } from "@/components/ViewSelector";
import { ColumnCustomizer } from "@/components/ColumnCustomizer";

// ─── View ↔ Filter bridging ───────────────────────────────────────────────

/** Convert a SavedFilters snapshot to the filter state the FilterBar understands */
function savedFiltersToStoryFilters(saved: SavedFilters): StoryFilters {
  return {
    q: saved.nlpPrompt || saved.q, // NLP prompt goes into the search bar
    nlp: saved.nlpPrompt, // Also passed as the NLP param
    category: saved.categories?.join(","),
    status: saved.statuses?.join(","),
    source_ids: saved.sourceIds,
    market_ids: saved.marketIds,
    time_range: saved.timeRange,
    min_score: saved.minScore,
    uncovered_only: saved.uncoveredOnly,
    trend: saved.trend,
  };
}

/** Extract the filter-related fields from StoryFilters into SavedFilters */
function storyFiltersToSaved(filters: StoryFilters): SavedFilters {
  return {
    q: filters.nlp ? undefined : filters.q, // Don't save text search if NLP is active
    nlpPrompt: filters.nlp, // Save the NLP prompt with the view
    categories: filters.category ? filters.category.split(",") : undefined,
    statuses: filters.status ? filters.status.split(",") : undefined,
    sourceIds: filters.source_ids,
    marketIds: filters.market_ids,
    timeRange: filters.time_range,
    minScore: filters.min_score,
    uncoveredOnly: filters.uncovered_only,
    trend: filters.trend,
  };
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

function DashboardContent() {
  // ── View state ──────────────────────────────────────────────────────────
  const [views, setViews] = useState<DashboardView[]>(() => loadViews());
  const [activeViewId, setActiveViewId] = useState(() => loadActiveViewId());
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);
  const [hasViewChanges, setHasViewChanges] = useState(false);

  // Resolve active view (fall back to default if not found)
  const activeView =
    views.find((v) => v.id === activeViewId) || views[0] || createDefaultView();

  // Initialise column config from the active view
  useEffect(() => {
    setColumnConfig(activeView.columns.map((c) => ({ ...c })));
    setHasViewChanges(false);
  }, [activeViewId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter state ────────────────────────────────────────────────────────
  // Single source of truth: the active view's saved filters
  const [filters, setFilters] = useState<StoryFilters>(() => ({
    ...savedFiltersToStoryFilters(activeView.filters),
    page: 1,
    page_size: 25,
  }));

  // Re-apply saved filters when the active view changes
  useEffect(() => {
    setFilters((prev) => ({
      ...savedFiltersToStoryFilters(activeView.filters),
      page: 1,
      page_size: prev.page_size || 25,
    }));
  }, [activeViewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sorting, setSorting] = useState<SortingState>([
    { id: "breaking_score", desc: true },
  ]);

  // ── View mode (table vs cards) ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // ── Data fetching ───────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useQuery({
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
    setHasViewChanges(true);
  }, []);

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  // ── Column config changes ───────────────────────────────────────────────
  const handleColumnsChange = useCallback((cols: ColumnConfig[]) => {
    setColumnConfig(cols);
    setHasViewChanges(true);
  }, []);

  /** Called when a column is resized directly in the table grid header */
  const handleColumnResize = useCallback((columnId: string, newWidth: number) => {
    setColumnConfig((prev) =>
      prev.map((c) =>
        c.id === columnId
          ? { ...c, width: Math.max(c.minWidth, Math.round(newWidth)) }
          : c
      )
    );
    setHasViewChanges(true);
  }, []);

  /** Reorder columns by dragging headers in the table grid */
  const handleColumnReorder = useCallback((fromId: string, toId: string) => {
    setColumnConfig((prev) => {
      const updated = [...prev];
      const fromIdx = updated.findIndex((c) => c.id === fromId);
      const toIdx = updated.findIndex((c) => c.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return updated;
    });
    setHasViewChanges(true);
  }, []);

  // ── View CRUD ───────────────────────────────────────────────────────────
  const persistViews = useCallback(
    (updated: DashboardView[]) => {
      setViews(updated);
      saveViews(updated);
    },
    []
  );

  const handleSelectView = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      saveActiveViewId(viewId);
    },
    []
  );

  const handleSaveCurrentView = useCallback(() => {
    const now = new Date().toISOString();
    const updated = views.map((v) =>
      v.id === activeViewId
        ? {
            ...v,
            columns: columnConfig.map((c) => ({ ...c })),
            filters: storyFiltersToSaved(filters),
            updatedAt: now,
          }
        : v
    );
    persistViews(updated);
    setHasViewChanges(false);
  }, [views, activeViewId, columnConfig, filters, persistViews]);

  const handleCreateView = useCallback(
    (name: string) => {
      const now = new Date().toISOString();
      const newView: DashboardView = {
        id: generateViewId(),
        name,
        columns: columnConfig.map((c) => ({ ...c })),
        filters: storyFiltersToSaved(filters),
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...views, newView];
      persistViews(updated);
      handleSelectView(newView.id);
    },
    [views, columnConfig, filters, persistViews, handleSelectView]
  );

  const handleDuplicateView = useCallback(
    (viewId: string, newName: string) => {
      const source = views.find((v) => v.id === viewId);
      if (!source) return;
      const dup = duplicateView(source, newName);
      const updated = [...views, dup];
      persistViews(updated);
      handleSelectView(dup.id);
    },
    [views, persistViews, handleSelectView]
  );

  const handleRenameView = useCallback(
    (viewId: string, newName: string) => {
      const updated = views.map((v) =>
        v.id === viewId ? { ...v, name: newName, updatedAt: new Date().toISOString() } : v
      );
      persistViews(updated);
    },
    [views, persistViews]
  );

  const handleDeleteView = useCallback(
    (viewId: string) => {
      const updated = views.filter((v) => v.id !== viewId);
      persistViews(updated.length > 0 ? updated : [createDefaultView()]);
      if (activeViewId === viewId) {
        handleSelectView(updated[0]?.id || "default");
      }
    },
    [views, activeViewId, persistViews, handleSelectView]
  );

  // ── Derived data ────────────────────────────────────────────────────────
  const stories = data?.stories || [];
  const totalPages = data?.total_pages || 1;
  const currentPage = data?.page || 1;
  const total = data?.total || 0;
  const facets = data?.facets;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6 space-y-4">
        {/* Pipeline progress */}
        <NewsProgressPanel />

        {/* View toolbar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 flex-wrap">
          <ViewSelector
            views={views}
            activeViewId={activeViewId}
            onSelectView={handleSelectView}
            onSaveView={handleSaveCurrentView as any}
            onCreateView={handleCreateView}
            onDuplicateView={handleDuplicateView}
            onRenameView={handleRenameView}
            onDeleteView={handleDeleteView}
            hasChanges={hasViewChanges}
            onSaveCurrentView={handleSaveCurrentView}
          />
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-surface-300 overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                className={clsx(
                  "p-2 transition-colors",
                  viewMode === "table"
                    ? "bg-accent/20 text-accent"
                    : "text-gray-400 hover:text-white hover:bg-surface-300"
                )}
                title="Table view"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={clsx(
                  "p-2 transition-colors",
                  viewMode === "cards"
                    ? "bg-accent/20 text-accent"
                    : "text-gray-400 hover:text-white hover:bg-surface-300"
                )}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <ColumnCustomizer
              columns={columnConfig}
              onChange={handleColumnsChange}
            />
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar onFiltersChange={handleFiltersChange} facets={facets} />

        {/* Results count */}
        {!isLoading && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{total} leads found</span>
            {total > 0 && (
              <span>
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>
        )}

        {/* Error state — show as empty results for search/filter errors */}
        {isError && (
          <div className="glass-card p-16 text-center animate-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-300/30 mb-4">
              <Search className="w-7 h-7 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No leads found</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Try a different search term, adjust filters, or expand the time range.
            </p>
          </div>
        )}

        {/* Loading state — skeleton */}
        {isLoading && <DashboardSkeleton />}

        {/* Empty state */}
        {!isLoading && !isError && stories.length === 0 && (
          <div className="glass-card p-16 text-center animate-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-300/30 mb-4">
              <Search className="w-7 h-7 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No leads found</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              No leads found matching your filters. Try adjusting the time range or clearing filters.
            </p>
          </div>
        )}

        {/* Stories — table or card view */}
        {!isLoading && !isError && stories.length > 0 && (
          viewMode === "cards" ? (
            <StoryCardGrid stories={stories} />
          ) : (
            <div className="glass-card overflow-hidden">
              <StoryTable
                stories={stories}
                sorting={sorting}
                onSortingChange={setSorting}
                columnConfig={columnConfig}
                onColumnResize={handleColumnResize}
                onColumnReorder={handleColumnReorder}
              />
            </div>
          )
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

// ─── Teaser Dashboard (unauthenticated users) ───────────────────────────────

function TeaserDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["teaser-stories"],
    queryFn: fetchTeaserStories,
    refetchInterval: 60_000, // slower refresh for teaser
  });

  const stories = data?.stories || [];
  const market = data?.market;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Teaser header */}
        <div className="glass-card p-6 text-center space-y-3">
          <h1 className="text-xl md:text-2xl font-bold text-white">
            {market ? `${market.name} News Intelligence` : "News Intelligence"}
          </h1>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">
            Real-time breaking news from {market ? market.name : "your area"} — powered by 700+ sources.
            Sign in to unlock filters, saved views, AI assistant, and full coverage.
          </p>
          <a
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-dim text-white font-medium rounded-lg transition-colors w-full md:w-auto"
          >
            Sign In for Full Access
          </a>
        </div>

        {/* Story list — simple table, no customization */}
        {isLoading && (
          <div className="glass-card p-12 text-center text-gray-500">Loading latest leads...</div>
        )}

        {!isLoading && stories.length === 0 && (
          <div className="glass-card p-12 text-center">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No leads available</h3>
            <p className="text-gray-500 text-sm">Check back shortly — stories update continuously.</p>
          </div>
        )}

        {!isLoading && stories.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block glass-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-300/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Story</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-28">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-28">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Sources</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {stories.map((story) => (
                    <tr
                      key={story.id}
                      className="border-b border-surface-300/10 hover:bg-surface-200/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white line-clamp-2">{story.title}</div>
                        {story.location && (
                          <div className="text-xs text-gray-500 mt-0.5">{story.location}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                          story.status === "BREAKING" && "bg-orange-500/10 text-orange-400",
                          story.status === "ALERT" && "bg-red-500/10 text-red-400",
                          story.status === "DEVELOPING" && "bg-blue-500/10 text-blue-400",
                          story.status === "TOP_STORY" && "bg-purple-500/10 text-purple-400",
                          story.status === "ONGOING" && "bg-gray-500/10 text-gray-400",
                        )}>
                          {story.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{story.category || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{story.source_count}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(story.last_updated).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {stories.map((story) => (
                <div
                  key={story.id}
                  className="glass-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-white line-clamp-2 flex-1">{story.title}</div>
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0",
                      story.status === "BREAKING" && "bg-orange-500/10 text-orange-400",
                      story.status === "ALERT" && "bg-red-500/10 text-red-400",
                      story.status === "DEVELOPING" && "bg-blue-500/10 text-blue-400",
                      story.status === "TOP_STORY" && "bg-purple-500/10 text-purple-400",
                      story.status === "ONGOING" && "bg-gray-500/10 text-gray-400",
                    )}>
                      {story.status?.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{story.category || "Uncategorized"}</span>
                    <span className="text-gray-600">|</span>
                    <span className="tabular-nums">{story.source_count} source{story.source_count !== 1 ? "s" : ""}</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500">
                      {new Date(story.last_updated).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {story.location && (
                    <div className="text-xs text-gray-500">{story.location}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Teaser footer */}
        <div className="text-center text-xs text-gray-600">
          Showing {stories.length} most recent leads{market ? ` for ${market.name}` : ""}.
          Sign in for unlimited access with filters, AI analysis, and real-time alerts.
        </div>
      </main>
    </div>
  );
}

// ─── Page Router ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isLoggedIn, isLoading: authLoading } = useUser();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading...
        </div>
      }
    >
      {authLoading ? (
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading...
        </div>
      ) : isLoggedIn ? (
        <DashboardContent />
      ) : (
        <TeaserDashboard />
      )}
    </Suspense>
  );
}
