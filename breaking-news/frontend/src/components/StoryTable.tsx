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
      header: "Sources",
      cell: (info) => {
        const story = info.row.original;
        const count = story.source_count || 0;
        const summaries = story.source_summaries || [];
        const isVerified = story.verificationStatus === 'VERIFIED';
        const isSingle = count <= 1;

        return (
          <div className="relative group/sources inline-flex items-center gap-1 justify-center w-full">
            {isSingle ? (
              <AlertTriangle className="w-3 h-3 text-orange-400" />
            ) : isVerified ? (
              <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />
            ) : null}
            <span className={clsx(
              "text-xs font-bold tabular-nums",
              isVerified ? "text-blue-400" : isSingle ? "text-orange-400" : "text-gray-300"
            )}>
              {count}
            </span>
            {/* Tooltip with source list */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-2 bg-gray-900 rounded shadow-lg opacity-0 group-hover/sources:opacity-100 transition-opacity pointer-events-none z-50 min-w-[200px] max-w-[320px]">
              <div className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">
                {isVerified ? '✓ Verified' : isSingle ? '⚠ Single Source' : `${count} Sources`}
              </div>
              {summaries.length > 0 ? (
                <div className="space-y-0.5">
                  {summaries.slice(0, 8).map((s: any, i: number) => (
                    <div key={i} className="text-xs text-gray-200 truncate">
                      <span className="text-gray-500 mr-1">{s.platform}</span>
                      {s.name}
                    </div>
                  ))}
                  {summaries.length > 8 && (
                    <div className="text-[10px] text-gray-500">+{summaries.length - 8} more</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">{count} source{count !== 1 ? 's' : ''} reporting</div>
              )}
            </div>
          </div>
        );
      },
      size: 60,
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
                  className="text-gray-100 hover:text-accent font-medium transition-colors"
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
    score: columnHelper.accessor("composite_score", {
      id: "score",
      header: "Score",
      cell: (info) => {
        const story = info.row.original;
        const raw = info.getValue(); // 0-1 scale
        const score = Math.round(raw * 100); // Convert to 0-100
        const b = Math.round(story.breaking_score * 100);
        const t = Math.round(story.trending_score * 100);
        const c = Math.round(story.confidence_score * 100);
        const l = Math.round(story.locality_score * 100);
        const barColor = score >= 60 ? "bg-red-500" : score >= 40 ? "bg-orange-500" : score >= 20 ? "bg-yellow-500" : "bg-gray-500";

        const tooltip = `Score: ${score}\n= Breaking (${b}) \u00d7 25% = ${(b * 0.25).toFixed(1)}\n+ Trending (${t}) \u00d7 20% = ${(t * 0.20).toFixed(1)}\n+ Confidence (${c}) \u00d7 15% = ${(c * 0.15).toFixed(1)}\n+ Locality (${l}) \u00d7 15% = ${(l * 0.15).toFixed(1)}`;

        return (
          <div className="group/score relative flex flex-col gap-1 min-w-[60px]">
            <span className={clsx("text-xs font-bold tabular-nums", score >= 60 ? "text-red-400" : score >= 40 ? "text-orange-400" : score >= 20 ? "text-yellow-400" : "text-gray-400")}>
              {score}
            </span>
            <div className="score-bar">
              <div className={clsx("score-bar-fill", barColor)} style={{ width: `${Math.min(score, 100)}%` }} />
            </div>
            <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/score:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
              {tooltip}
            </span>
          </div>
        );
      },
      size: 90,
    }),
    breaking_score: columnHelper.accessor("breaking_score", {
      header: "Breaking",
      cell: (info) => {
        const val = Math.round(info.getValue() * 100);
        return (
          <div className="group/breaking relative">
            <ScoreBadge score={info.getValue()} />
            <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/breaking:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
              {`Breaking: ${val}\nMeasures source velocity \u2014 how fast\nnew sources pick up the story\nSources in 15min window / recency decay`}
            </span>
          </div>
        );
      },
      size: 90,
    }),
    trending_score: columnHelper.accessor("trending_score", {
      header: "Trending",
      cell: (info) => {
        const val = Math.round(info.getValue() * 100);
        return (
          <div className="group/trending relative">
            <ScoreBadge score={info.getValue()} />
            <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/trending:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
              {`Trending: ${val}\nMeasures growth rate \u2014 is the\nstory accelerating?\nCurrent sources vs past sources / growth %`}
            </span>
          </div>
        );
      },
      size: 90,
    }),
    confidence_score: columnHelper.accessor("confidence_score", {
      header: "Confidence",
      cell: (info) => {
        const story = info.row.original;
        const val = Math.round(info.getValue() * 100);
        const srcCount = story.source_count;
        return (
          <div className="group/confidence relative">
            <ScoreBadge score={info.getValue()} />
            <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/confidence:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
              {`Confidence: ${val}\nMeasures source diversity and trust\n${srcCount} source${srcCount !== 1 ? "s" : ""} \u00d7 avg trust score ${srcCount > 0 ? (val / Math.max(srcCount, 1)).toFixed(0) : "0"}`}
            </span>
          </div>
        );
      },
      size: 90,
    }),
    locality_score: columnHelper.accessor("locality_score", {
      header: "Locality",
      cell: (info) => {
        const val = Math.round(info.getValue() * 100);
        return (
          <div className="group/locality relative">
            <ScoreBadge score={info.getValue()} />
            <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/locality:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
              {`Locality: ${val}\nMeasures relevance to local markets\nBased on location specificity\nand market keywords`}
            </span>
          </div>
        );
      },
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
      <table className="w-full min-w-[1200px]" role="grid">
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
