"use client";

import { useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, GitBranch, Star, BadgeCheck, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import type { Story, SourceSummary } from "@/lib/api";
import type { ColumnConfig } from "@/lib/views";
import { formatRelativeTime, getScoreBarColor } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { ScoreBadge } from "./ScoreBadge";

const PLATFORM_LABELS: Record<string, string> = {
  RSS: "RSS",
  NEWSAPI: "NewsAPI",
  TWITTER: "X/Twitter",
  FACEBOOK: "Facebook",
  GDELT: "GDELT",
  LLM_OPENAI: "AI (OpenAI)",
  LLM_CLAUDE: "AI (Claude)",
  LLM_GROK: "AI (Grok)",
  LLM_GEMINI: "AI (Gemini)",
  MANUAL: "Manual",
};

function SourceTooltip({
  sources,
  totalCount,
}: {
  sources: SourceSummary[];
  totalCount: number;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
      <div className="bg-surface-100 border border-surface-300 rounded-lg shadow-xl p-3 min-w-[240px] max-w-[320px]">
        <div className="text-xs font-semibold text-gray-300 mb-2">
          {totalCount} Source{totalCount !== 1 ? "s" : ""}
        </div>
        <div className="space-y-1.5">
          {sources.map((src, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs"
            >
              <span className="px-1.5 py-0.5 rounded bg-surface-300/60 text-gray-400 font-medium whitespace-nowrap flex-shrink-0">
                {PLATFORM_LABELS[src.platform] || src.platform}
              </span>
              <div className="min-w-0">
                <div className="text-gray-200 truncate">{src.name}</div>
                <div className="text-gray-600 text-[10px]">
                  {formatRelativeTime(src.published_at)}
                </div>
              </div>
            </div>
          ))}
          {totalCount > sources.length && (
            <div className="text-[10px] text-gray-500 pt-1 border-t border-surface-300/30">
              +{totalCount - sources.length} more source
              {totalCount - sources.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StoryTableProps {
  stories: Story[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  /** Optional column configuration from the view system */
  columnConfig?: ColumnConfig[];
  /** Called when a column is resized directly in the grid header */
  onColumnResize?: (columnId: string, newWidth: number) => void;
}

const columnHelper = createColumnHelper<Story>();

/** Registry of all column definitions keyed by id */
function buildColumnDefs(): Record<string, ColumnDef<Story, any>> {
  return {
    rank: columnHelper.display({
      id: "rank",
      header: "#",
      cell: (info) => (
        <span className="text-gray-500 font-mono text-xs">
          {info.row.index + 1}
        </span>
      ),
      size: 40,
    }),
    status: columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => <StatusBadge status={info.getValue()} />,
      size: 120,
    }),
    famous: columnHelper.display({
      id: "famous",
      header: () => <Star className="w-3.5 h-3.5 text-yellow-400 mx-auto" />,
      cell: (info) => {
        const story = info.row.original;
        if (!story.hasFamousPerson || !story.famousPersonNames?.length) return null;
        return (
          <span className="inline-flex items-center group/famous relative justify-center w-full">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/famous:opacity-100 transition-opacity pointer-events-none z-50">
              {story.famousPersonNames.join(', ')}
            </span>
          </span>
        );
      },
      size: 32,
    }),
    verified: columnHelper.display({
      id: "verified",
      header: () => <BadgeCheck className="w-3.5 h-3.5 text-blue-400 mx-auto" />,
      cell: (info) => {
        const story = info.row.original;
        if (story.verificationStatus === 'VERIFIED') {
          return (
            <span className="inline-flex items-center group/verified relative justify-center w-full">
              <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/verified:opacity-100 transition-opacity pointer-events-none z-50">
                Verified ({Math.round((story.verificationScore || 0) * 100)}%)
              </span>
            </span>
          );
        }
        if (story.verificationStatus === 'SINGLE_SOURCE') {
          return (
            <span className="inline-flex items-center group/single relative justify-center w-full">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/single:opacity-100 transition-opacity pointer-events-none z-50">
                Single source
              </span>
            </span>
          );
        }
        return null;
      },
      size: 32,
    }),
    title: columnHelper.accessor("title", {
      header: "Title",
      cell: (info) => {
        const story = info.row.original;
        const hasParent = !!story.parentStory;
        const hasFollowUps = (story.followUps?.length ?? 0) > 0;
        const acct = story.accountStory;
        const displayTitle = acct?.editedTitle || info.getValue();
        return (
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center flex-wrap">
                <Link
                  href={`/stories/${story.id}`}
                  className="text-gray-100 hover:text-accent font-medium transition-colors line-clamp-2"
                >
                  {displayTitle}
                </Link>
              </span>
              {acct && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={clsx(
                    "px-1 py-px rounded text-[9px] font-semibold uppercase",
                    acct.accountStatus === 'PUBLISHED' ? "text-green-400 bg-green-500/10" :
                    acct.accountStatus === 'IN_PROGRESS' ? "text-amber-400 bg-amber-500/10" :
                    acct.accountStatus === 'ASSIGNED' ? "text-blue-400 bg-blue-500/10" :
                    acct.accountStatus === 'DRAFT_READY' ? "text-cyan-400 bg-cyan-500/10" :
                    acct.accountStatus === 'KILLED' ? "text-red-400 bg-red-500/10" :
                    "text-gray-500 bg-gray-500/10"
                  )}>
                    {acct.accountStatus.replace('_', ' ')}
                  </span>
                  {acct.aiDraftCount > 0 && <span className="text-[9px] text-cyan-500">{acct.aiDraftCount}d</span>}
                  {acct.aiScriptCount > 0 && <span className="text-[9px] text-amber-500">{acct.aiScriptCount}s</span>}
                </div>
              )}
            </div>
            {(hasParent || hasFollowUps) && (
              <span
                className="flex-shrink-0 mt-0.5 text-cyan-400"
                title={hasParent
                  ? `Follow-up to: ${story.parentStory?.title}`
                  : `${story.followUps?.length} follow-up${(story.followUps?.length ?? 0) > 1 ? 's' : ''}`
                }
              >
                <GitBranch className="w-3 h-3" />
              </span>
            )}
          </div>
        );
      },
      size: 400,
    }),
    category: columnHelper.accessor("category", {
      header: "Category",
      cell: (info) => (
        <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
          {info.getValue()}
        </span>
      ),
      size: 100,
    }),
    location: columnHelper.accessor("location", {
      header: "Location",
      cell: (info) => (
        <span className="text-gray-400 text-xs">{info.getValue()}</span>
      ),
      size: 120,
    }),
    breaking_score: columnHelper.accessor("breaking_score", {
      header: "Breaking",
      cell: (info) => (
        <ScoreBadge score={info.getValue()} />
      ),
      size: 90,
    }),
    trending_score: columnHelper.accessor("trending_score", {
      header: "Trending",
      cell: (info) => (
        <ScoreBadge score={info.getValue()} />
      ),
      size: 90,
    }),
    trend: columnHelper.display({
      id: "trend",
      header: "Trend",
      cell: (info) => {
        const sparkline = info.row.original.sparkline || [];
        const trend = info.row.original.trend;
        if (sparkline.length < 2) return <span className="text-gray-600 text-xs">-</span>;

        const max = Math.max(...sparkline, 0.01);
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex items-end gap-px h-4 w-14">
              {sparkline.map((val: number, i: number) => (
                <div
                  key={i}
                  className={clsx(
                    "flex-1 rounded-sm min-h-[1px]",
                    trend === "rising" ? "bg-green-500" :
                    trend === "declining" ? "bg-red-500" : "bg-gray-500"
                  )}
                  style={{ height: `${(val / max) * 100}%` }}
                />
              ))}
            </div>
            <span className={clsx(
              "text-[10px] font-bold",
              trend === "rising" ? "text-green-400" :
              trend === "declining" ? "text-red-400" : "text-gray-500"
            )}>
              {trend === "rising" ? "\u2197" : trend === "declining" ? "\u2198" : "\u2192"}
            </span>
          </div>
        );
      },
      size: 90,
    }),
    source_count: columnHelper.accessor("source_count", {
      header: "Sources",
      cell: (info) => {
        const story = info.row.original;
        const summaries = story.source_summaries || [];
        const count = info.getValue();
        return (
          <div className="relative group">
            <span className="text-gray-300 font-mono text-sm cursor-default">
              {count}
            </span>
            {summaries.length > 0 && (
              <div className="hidden group-hover:block">
                <SourceTooltip sources={summaries} totalCount={count} />
              </div>
            )}
          </div>
        );
      },
      size: 70,
    }),
    coverage: columnHelper.display({
      id: "coverage",
      header: "Covered",
      cell: (info) => {
        const coverage = info.row.original.coverage || [];
        if (coverage.length === 0) {
          return <span className="text-gray-600 text-xs">-</span>;
        }
        const anyCovered = coverage.some((c) => c.isCovered);
        return (
          <div className="relative group">
            <span className={clsx(
              "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
              anyCovered
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            )}>
              {anyCovered ? "\u2713" : "\u2717"}
            </span>
            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
              <div className="bg-surface-100 border border-surface-300 rounded-lg shadow-xl p-2 min-w-[160px]">
                {coverage.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                    <span className={c.isCovered ? "text-green-400" : "text-red-400"}>
                      {c.isCovered ? "\u2713" : "\u2717"}
                    </span>
                    <span className="text-gray-300">{c.feedName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
      size: 70,
    }),
    first_seen: columnHelper.accessor("first_seen", {
      header: "First Seen",
      cell: (info) => (
        <span className="text-gray-500 text-xs whitespace-nowrap">
          {formatRelativeTime(info.getValue())}
        </span>
      ),
      size: 100,
    }),
    last_updated: columnHelper.accessor("last_updated", {
      header: "Updated",
      cell: (info) => (
        <span className="text-gray-500 text-xs whitespace-nowrap">
          {formatRelativeTime(info.getValue())}
        </span>
      ),
      size: 100,
    }),
  };
}

export function StoryTable({
  stories,
  sorting,
  onSortingChange,
  columnConfig,
  onColumnResize,
}: StoryTableProps) {
  const columns = useMemo(() => {
    const allDefs = buildColumnDefs();

    if (!columnConfig) {
      // No config — show all columns in default order
      return Object.values(allDefs);
    }

    // Build columns from config: only visible, in config order, with config widths
    return columnConfig
      .filter((cfg) => cfg.visible)
      .map((cfg) => {
        const def = allDefs[cfg.id];
        if (!def) return null;
        return {
          ...def,
          size: cfg.width,
        };
      })
      .filter(Boolean) as ColumnDef<Story, any>[];
  }, [columnConfig]);

  const table = useReactTable({
    data: stories,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // Track whether any column is currently being resized
  const wasResizing = useRef(false);

  // When resizing ends, propagate all column widths to the view system
  const isAnyResizing = table.getState().columnSizingInfo.isResizingColumn;
  useEffect(() => {
    if (isAnyResizing) {
      wasResizing.current = true;
    } else if (wasResizing.current) {
      // Resizing just ended — push all current widths to the view config
      wasResizing.current = false;
      if (onColumnResize) {
        const sizing = table.getState().columnSizing;
        for (const [colId, width] of Object.entries(sizing)) {
          onColumnResize(colId, width);
        }
      }
    }
  }, [isAnyResizing, onColumnResize, table]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full" role="grid">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-surface-300/50">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const isResizing = header.column.getIsResizing();

                return (
                  <th
                    key={header.id}
                    className={clsx("table-header relative group/th", canSort && "cursor-pointer")}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={
                      sorted === "asc" ? "ascending" :
                      sorted === "desc" ? "descending" :
                      canSort ? "none" : undefined
                    }
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {canSort && (
                        <span className="text-gray-600">
                          {sorted === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-accent" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="w-3 h-3 text-accent" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </div>
                    {/* Column resize handle — drag to resize, double-click to reset */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        header.getResizeHandler()(e);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        header.getResizeHandler()(e);
                      }}
                      onDoubleClick={() => header.column.resetSize()}
                      className={clsx(
                        "absolute top-0 right-0 w-1 h-full cursor-col-resize select-none touch-none",
                        "opacity-0 group-hover/th:opacity-100 transition-opacity",
                        isResizing
                          ? "bg-accent opacity-100 w-0.5"
                          : "hover:bg-accent/60"
                      )}
                    />
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-12 text-gray-500"
              >
                No stories found matching your filters.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="table-row animate-in">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="table-cell">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
