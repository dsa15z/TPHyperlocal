"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";
import type { Story, SourceSummary } from "@/lib/api";
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
}

const columnHelper = createColumnHelper<Story>();

export function StoryTable({
  stories,
  sorting,
  onSortingChange,
}: StoryTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "rank",
        header: "#",
        cell: (info) => (
          <span className="text-gray-500 font-mono text-xs">
            {info.row.index + 1}
          </span>
        ),
        size: 40,
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
        size: 120,
      }),
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => (
          <Link
            href={`/stories/${info.row.original.id}`}
            className="text-gray-100 hover:text-accent font-medium transition-colors line-clamp-2"
          >
            {info.getValue()}
          </Link>
        ),
        size: 320,
      }),
      columnHelper.accessor("category", {
        header: "Category",
        cell: (info) => (
          <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
            {info.getValue()}
          </span>
        ),
        size: 100,
      }),
      columnHelper.accessor("location", {
        header: "Location",
        cell: (info) => (
          <span className="text-gray-400 text-xs">{info.getValue()}</span>
        ),
        size: 120,
      }),
      columnHelper.accessor("breaking_score", {
        header: "Breaking",
        cell: (info) => (
          <ScoreBadge score={info.getValue()} />
        ),
        size: 90,
      }),
      columnHelper.accessor("trending_score", {
        header: "Trending",
        cell: (info) => (
          <ScoreBadge score={info.getValue()} />
        ),
        size: 90,
      }),
      columnHelper.display({
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
      columnHelper.accessor("source_count", {
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
      columnHelper.display({
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
      columnHelper.accessor("first_seen", {
        header: "First Seen",
        cell: (info) => (
          <span className="text-gray-500 text-xs whitespace-nowrap">
            {formatRelativeTime(info.getValue())}
          </span>
        ),
        size: 100,
      }),
      columnHelper.accessor("last_updated", {
        header: "Updated",
        cell: (info) => (
          <span className="text-gray-500 text-xs whitespace-nowrap">
            {formatRelativeTime(info.getValue())}
          </span>
        ),
        size: 100,
      }),
    ],
    []
  );

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
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-surface-300/50">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    className={clsx("table-header", canSort && "cursor-pointer")}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
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
