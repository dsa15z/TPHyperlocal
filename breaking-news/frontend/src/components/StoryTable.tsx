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
import type { Story } from "@/lib/api";
import { formatRelativeTime, getScoreBarColor } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { ScoreBadge } from "./ScoreBadge";

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
      columnHelper.accessor("source_count", {
        header: "Sources",
        cell: (info) => (
          <span className="text-gray-300 font-mono text-sm">
            {info.getValue()}
          </span>
        ),
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
