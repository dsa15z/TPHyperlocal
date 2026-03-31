"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface TablePaginationProps {
  /** Number of items visible after client-side filtering */
  shown: number;
  /** Total items from the server */
  total: number;
  /** Current page (1-based) */
  page: number;
  /** Total pages */
  totalPages: number;
  /** Called when page changes */
  onPageChange: (page: number) => void;
  /** Extra stats to show, e.g. "82 active" */
  extra?: string;
}

/**
 * Shared pagination footer for all table/list pages.
 * Always visible — shows counts even on single-page results.
 */
export function TablePagination({
  shown,
  total,
  page,
  totalPages,
  onPageChange,
  extra,
}: TablePaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-300/30">
      <span className="text-sm text-gray-500">
        {shown} shown &middot; {total} total
        {extra && <> &middot; {extra}</>}
        {totalPages > 1 && (
          <> &middot; Page {page} of {totalPages}</>
        )}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={clsx(
              "filter-btn flex items-center gap-1",
              page <= 1 && "opacity-40 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={clsx(
              "filter-btn flex items-center gap-1",
              page >= totalPages && "opacity-40 cursor-not-allowed"
            )}
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
