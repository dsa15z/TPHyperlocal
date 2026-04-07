"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, LayoutGrid, Table2, Search, Download, X } from "lucide-react";
import clsx from "clsx";
import { fetchStories, fetchTeaserStories, fetchServerViews, createServerView, updateServerView, deleteServerView, type StoryFilters, type TeaserResponse } from "@/lib/api";
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
  const [serverViewsLoaded, setServerViewsLoaded] = useState(false);

  // Load views from server on mount (server is source of truth when authenticated)
  useEffect(() => {
    let cancelled = false;
    fetchServerViews()
      .then((serverViews) => {
        if (cancelled || !serverViews || serverViews.length === 0) return;
        const mapped: DashboardView[] = serverViews.map((sv) => ({
          id: sv.id,
          name: sv.name,
          columns: (sv.columns || []) as ColumnConfig[],
          filters: (sv.filters || {}) as SavedFilters,
          createdAt: sv.createdAt,
          updatedAt: sv.updatedAt,
        }));
        setViews(mapped);
        saveViews(mapped); // Cache locally
        setServerViewsLoaded(true);
      })
      .catch(() => {
        // Not authenticated or API error — use localStorage views (already loaded)
        setServerViewsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Multiselect + CSV export ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when page/filters change
  useEffect(() => { setSelectedIds(new Set()); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── View CRUD (syncs to backend + localStorage cache) ─────────────────
  const persistViews = useCallback(
    (updated: DashboardView[]) => {
      setViews(updated);
      saveViews(updated); // localStorage cache
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
    const savedColumns = columnConfig.map((c) => ({ ...c }));
    const savedFilters = storyFiltersToSaved(filters);
    const updated = views.map((v) =>
      v.id === activeViewId
        ? { ...v, columns: savedColumns, filters: savedFilters, updatedAt: now }
        : v
    );
    persistViews(updated);
    setHasViewChanges(false);
    // Sync to server
    updateServerView(activeViewId, { columns: savedColumns, filters: savedFilters }).catch(() => {});
  }, [views, activeViewId, columnConfig, filters, persistViews]);

  const handleCreateView = useCallback(
    (name: string) => {
      const now = new Date().toISOString();
      const cols = columnConfig.map((c) => ({ ...c }));
      const filts = storyFiltersToSaved(filters);
      const tempId = generateViewId();
      const newView: DashboardView = {
        id: tempId,
        name,
        columns: cols,
        filters: filts,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...views, newView];
      persistViews(updated);
      handleSelectView(newView.id);
      // Sync to server — replace temp ID with server-assigned ID
      createServerView({ name, columns: cols, filters: filts })
        .then((res) => {
          if (res?.id && res.id !== tempId) {
            setViews((prev) => prev.map((v) => v.id === tempId ? { ...v, id: res.id } : v));
            saveViews(views.map((v) => v.id === tempId ? { ...v, id: res.id } : v));
            setActiveViewId(res.id);
            saveActiveViewId(res.id);
          }
        })
        .catch(() => {});
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
      // Sync to server
      createServerView({ name: newName, columns: dup.columns, filters: dup.filters })
        .then((res) => {
          if (res?.id && res.id !== dup.id) {
            setViews((prev) => prev.map((v) => v.id === dup.id ? { ...v, id: res.id } : v));
            setActiveViewId(res.id);
            saveActiveViewId(res.id);
          }
        })
        .catch(() => {});
    },
    [views, persistViews, handleSelectView]
  );

  const handleRenameView = useCallback(
    (viewId: string, newName: string) => {
      const updated = views.map((v) =>
        v.id === viewId ? { ...v, name: newName, updatedAt: new Date().toISOString() } : v
      );
      persistViews(updated);
      // Sync to server
      updateServerView(viewId, { name: newName }).catch(() => {});
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
      // Sync to server
      deleteServerView(viewId).catch(() => {});
    },
    [views, activeViewId, persistViews, handleSelectView]
  );

  // ── Derived data ────────────────────────────────────────────────────────
  const stories = data?.stories || [];
  const totalPages = data?.total_pages || 1;
  const currentPage = data?.page || 1;
  const total = data?.total || 0;
  const facets = data?.facets;

  // ── CSV Export (uses current view columns) ─────────────────────────────
  const exportToCSV = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selected = stories.filter((s: any) => selectedIds.has(s.id));
    if (selected.length === 0) return;

    // Map column IDs to CSV header + value extractor
    const columnExporters: Record<string, { header: string; value: (s: any, idx?: number) => string }> = {
      rank: { header: "#", value: (_s, i) => String((i ?? 0) + 1) },
      famous: { header: "Famous Person", value: (s) => s.hasFamousPerson ? (s.famousPersonNames?.join("; ") || "Yes") : "" },
      verified: { header: "Verified", value: (s) => s.verificationStatus === "VERIFIED" ? "Yes" : s.source_count >= 3 ? "Multi-source" : s.source_count === 1 ? "Single source" : "" },
      status: { header: "Status", value: (s) => s.status || "" },
      title: { header: "Title", value: (s) => s.title || "" },
      category: { header: "Category", value: (s) => s.category || "" },
      location: { header: "Location", value: (s) => s.location || "" },
      score: { header: "Score", value: (s) => String(Math.round((s.composite_score || 0) * 100)) },
      trend: { header: "Trend", value: (s) => s.trend || "" },
      coverage: { header: "Covered", value: (s) => s.coverage?.some((c: any) => c.isCovered) ? "Yes" : "" },
      first_seen: { header: "First Seen", value: (s) => s.first_seen ? new Date(s.first_seen).toISOString() : "" },
      last_updated: { header: "Updated", value: (s) => s.last_updated ? new Date(s.last_updated).toISOString() : "" },
      breaking_score: { header: "Breaking", value: (s) => String(Math.round((s.breaking_score || 0) * 100)) },
      trending_score: { header: "Trending", value: (s) => String(Math.round((s.trending_score || 0) * 100)) },
      confidence_score: { header: "Confidence", value: (s) => String(Math.round((s.confidence_score || 0) * 100)) },
      locality_score: { header: "Locality", value: (s) => String(Math.round((s.locality_score || 0) * 100)) },
    };

    // Use visible columns from current view, in view order
    const visibleCols = columnConfig.filter(c => c.visible && columnExporters[c.id]);
    // Always include ID at the end + summary
    const headers = [...visibleCols.map(c => columnExporters[c.id].header), "Summary", "ID"];
    const rows = selected.map((s: any, i: number) => {
      const cells = visibleCols.map(c => {
        const raw = columnExporters[c.id].value(s, i);
        // Escape CSV: wrap in quotes if contains comma, quote, or newline
        if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
          return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
      });
      // Append summary + ID
      const summary = (s.ai_summary || s.summary || "").replace(/"/g, '""').replace(/\n/g, " ");
      cells.push(`"${summary}"`, s.id);
      return cells.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topicpulse-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedIds, stories, columnConfig]);

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

        {/* Results count + export bar */}
        {!isLoading && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{total} leads found</span>
            <div className="flex items-center gap-3">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
                  <span>{selectedIds.size} selected</span>
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/30 transition-colors"
                    title="Export selected to CSV"
                  >
                    <Download className="w-3 h-3" />
                    Export CSV
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="p-0.5 rounded hover:bg-accent/20 transition-colors"
                    title="Clear selection"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {total > 0 && (
                <span>
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>
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
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
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
