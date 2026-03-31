"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import clsx from "clsx";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  badge?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  /** When true, empty selection means "all selected" (no filtering). Default true. */
  allByDefault?: boolean;
  className?: string;
}

/**
 * Shared multi-select dropdown with checkboxes, "Select All" / "Deselect All".
 * Used across all pages for consistent filter behaviour.
 */
export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  allByDefault = true,
  className,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value]
    );
  };

  const allSelected = selected.length === 0 || selected.length === options.length;
  const noneSelected = selected.length === 0;

  const selectAll = () => onChange([]);
  const deselectAll = () => onChange(["__none__"]); // special sentinel — nothing selected

  const label = noneSelected
    ? placeholder
    : selected.length === 1 && selected[0] !== "__none__"
    ? options.find((o) => o.value === selected[0])?.label || "1 selected"
    : selected[0] === "__none__"
    ? "None"
    : `${selected.length} selected`;

  const sortedOptions = [...options].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const isItemSelected = (value: string) => {
    if (selected[0] === "__none__") return false;
    if (selected.length === 0) return true; // all selected by default
    return selected.includes(value);
  };

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "filter-select flex items-center gap-2 min-w-[130px] text-left",
          selected.length > 0 && selected[0] !== "__none__" && "border-accent/50 text-accent"
        )}
      >
        <span className="truncate flex-1 text-sm">{label}</span>
        <ChevronDown
          className={clsx(
            "w-3.5 h-3.5 flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[220px] max-h-[320px] overflow-y-auto animate-in">
          {/* Header with Select All / Deselect All */}
          <div className="sticky top-0 bg-surface-100 border-b border-surface-300/50 px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              {options.length} options
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className={clsx(
                  "text-xs transition-colors",
                  allSelected && noneSelected
                    ? "text-accent font-medium"
                    : "text-gray-400 hover:text-white"
                )}
              >
                All
              </button>
              <span className="text-gray-600 text-xs">|</span>
              <button
                onClick={deselectAll}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                None
              </button>
            </div>
          </div>

          {sortedOptions.map((opt) => {
            const checked = isItemSelected(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => {
                  // If currently "all selected" (empty array), switch to explicit selection minus this one
                  if (selected.length === 0) {
                    onChange(options.filter((o) => o.value !== opt.value).map((o) => o.value));
                  } else if (selected[0] === "__none__") {
                    // Nothing selected, add this one
                    onChange([opt.value]);
                  } else {
                    toggle(opt.value);
                  }
                }}
                className={clsx(
                  "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-200/50 transition-colors",
                  checked && "bg-accent/5"
                )}
              >
                <div
                  className={clsx(
                    "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                    checked
                      ? "bg-accent border-accent"
                      : "border-surface-300"
                  )}
                >
                  {checked && <Check className="w-3 h-3 text-white" />}
                </div>
                {opt.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-300/60 text-gray-400 flex-shrink-0">
                    {opt.badge}
                  </span>
                )}
                <span
                  className={clsx(
                    "text-sm truncate flex-1",
                    checked ? "text-white" : "text-gray-300"
                  )}
                >
                  {opt.label}
                </span>
                {opt.count !== undefined && (
                  <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                    ({opt.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Helper: given the selected array from MultiSelectDropdown, return the
 * effective filter values to send to the API.
 * - [] means "all" → returns undefined (no filter)
 * - ["__none__"] means nothing selected → returns empty array
 * - [...ids] → returns the ids
 */
export function getEffectiveSelection(selected: string[]): string[] | undefined {
  if (selected.length === 0) return undefined; // all
  if (selected[0] === "__none__") return [];
  return selected;
}
