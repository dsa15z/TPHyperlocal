"use client";

import { useState, useCallback, useEffect } from "react";
import type { ColumnConfig } from "@/lib/views";

const STORAGE_PREFIX = "tp-table-columns-";

/**
 * Hook for managing table column configs with localStorage persistence.
 * Each table page gets its own storage key based on `tableId`.
 *
 * @param tableId - Unique identifier for this table (e.g. "sources", "audit-logs")
 * @param defaultColumns - All available columns with their defaults
 */
export function useTableColumns(
  tableId: string,
  defaultColumns: Omit<ColumnConfig, "visible">[]
) {
  const storageKey = STORAGE_PREFIX + tableId;

  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    if (typeof window === "undefined") {
      return defaultColumns.map((c) => ({ ...c, visible: true }));
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ColumnConfig[] = JSON.parse(saved);
        // Merge: keep saved order/visibility but ensure all columns exist
        const savedMap = new Map(parsed.map((c) => [c.id, c]));
        const merged: ColumnConfig[] = [];

        // First add saved columns in saved order
        for (const sc of parsed) {
          const def = defaultColumns.find((d) => d.id === sc.id);
          if (def) {
            merged.push({
              ...def,
              visible: sc.visible,
              width: sc.width || def.width,
            });
          }
        }

        // Then add any new columns that weren't in saved state
        for (const def of defaultColumns) {
          if (!savedMap.has(def.id)) {
            merged.push({ ...def, visible: true });
          }
        }

        return merged;
      }
    } catch {
      // Invalid JSON — fall through to defaults
    }

    return defaultColumns.map((c) => ({ ...c, visible: true }));
  });

  // Persist to localStorage on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch {
      // Storage full or unavailable
    }
  }, [columns, storageKey]);

  const updateColumns = useCallback((newColumns: ColumnConfig[]) => {
    setColumns(newColumns);
  }, []);

  const visibleColumns = columns.filter((c) => c.visible);

  return { columns, updateColumns, visibleColumns, defaultColumns };
}
