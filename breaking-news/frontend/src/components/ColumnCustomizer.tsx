"use client";

import { useState, useCallback, useRef } from "react";
import {
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { ColumnConfig } from "@/lib/views";
import { ALL_COLUMNS } from "@/lib/views";

interface ColumnCustomizerProps {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
  /** All available columns for this table (used by Reset). Defaults to ALL_COLUMNS from views.ts */
  allColumns?: Omit<ColumnConfig, "visible">[];
}

export function ColumnCustomizer({ columns, onChange, allColumns }: ColumnCustomizerProps) {
  const defaults = allColumns || ALL_COLUMNS;
  const [isOpen, setIsOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const visibleCount = columns.filter((c) => c.visible).length;

  const toggleVisibility = (id: string) => {
    onChange(
      columns.map((c) =>
        c.id === id ? { ...c, visible: !c.visible } : c
      )
    );
  };

  const setWidth = (id: string, width: number) => {
    onChange(
      columns.map((c) =>
        c.id === id
          ? { ...c, width: Math.max(c.minWidth, Math.min(600, width)) }
          : c
      )
    );
  };

  const resetAll = () => {
    onChange(
      defaults.map((c) => ({
        ...c,
        visible: true,
      }))
    );
  };

  // ─── Drag & Drop Reorder ──────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...columns];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(targetIndex, 0, moved);
    onChange(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ─── Width Resize via Drag ────────────────────────────────────────────

  const handleResizeStart = (e: React.MouseEvent, col: ColumnConfig) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingId(col.id);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = col.width;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartX.current;
      setWidth(col.id, resizeStartWidth.current + delta);
    };

    const handleMouseUp = () => {
      setResizingId(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "filter-btn flex items-center gap-1.5",
          isOpen && "filter-btn-active"
        )}
        title="Customize columns"
      >
        <Columns3 className="w-4 h-4" />
        <span className="text-xs">
          Columns
          <span className="text-gray-500 ml-1">({visibleCount})</span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl w-[340px] animate-in">
          {/* Header */}
          <div className="px-3 py-2 border-b border-surface-300/50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Columns ({visibleCount}/{columns.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={resetAll}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                title="Reset to defaults"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Column list */}
          <div className="max-h-[400px] overflow-y-auto py-1">
            {columns.map((col, index) => (
              <div
                key={col.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 transition-colors",
                  dragOverIndex === index && "bg-accent/10 border-t border-accent/30",
                  dragIndex === index && "opacity-40",
                  !col.visible && "opacity-60"
                )}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 flex-shrink-0">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                {/* Visibility toggle */}
                <button
                  onClick={() => toggleVisibility(col.id)}
                  className={clsx(
                    "flex-shrink-0 p-0.5 rounded",
                    col.visible
                      ? "text-accent hover:text-accent/80"
                      : "text-gray-600 hover:text-gray-400"
                  )}
                >
                  {col.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Column name */}
                <span
                  className={clsx(
                    "text-sm flex-1 min-w-0 truncate",
                    col.visible ? "text-gray-200" : "text-gray-500"
                  )}
                >
                  {col.label}
                </span>

                {/* Width control */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] text-gray-500 font-mono w-8 text-right">
                    {col.width}px
                  </span>
                  <div
                    className="relative w-16 h-5 flex items-center group"
                  >
                    {/* Width bar background */}
                    <div className="absolute inset-y-1 left-0 right-0 bg-surface-300/40 rounded-sm" />
                    {/* Width bar fill */}
                    <div
                      className={clsx(
                        "absolute inset-y-1 left-0 rounded-sm",
                        col.visible ? "bg-accent/30" : "bg-gray-700/30"
                      )}
                      style={{
                        width: `${Math.min(100, (col.width / 400) * 100)}%`,
                      }}
                    />
                    {/* Resize handle */}
                    <div
                      className={clsx(
                        "absolute top-0 bottom-0 w-2 cursor-col-resize",
                        "hover:bg-accent/40 rounded-sm transition-colors",
                        resizingId === col.id && "bg-accent/50"
                      )}
                      style={{
                        left: `${Math.min(100, (col.width / 400) * 100)}%`,
                        transform: "translateX(-50%)",
                      }}
                      onMouseDown={(e) => handleResizeStart(e, col)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 border-t border-surface-300/50 flex items-center gap-2">
            <button
              onClick={() =>
                onChange(columns.map((c) => ({ ...c, visible: true })))
              }
              className="text-xs text-gray-400 hover:text-white"
            >
              Show all
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={() =>
                onChange(
                  columns.map((c) => ({
                    ...c,
                    visible: ["rank", "title", "status"].includes(c.id),
                  }))
                )
              }
              className="text-xs text-gray-400 hover:text-white"
            >
              Minimal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
