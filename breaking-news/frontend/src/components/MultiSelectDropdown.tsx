"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
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
  /** Show a search box inside the dropdown. Useful for long lists. */
  searchable?: boolean;
  className?: string;
}

/**
 * Shared multi-select dropdown with checkboxes, "Select All" / "Deselect All",
 * and optional search. Used across all pages for consistent filter behaviour.
 */
export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  searchable = false,
  className,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-focus search on open
  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen, searchable]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value]
    );
  };

  const noneSelected = selected.length === 0;

  const selectAll = () => onChange([]);
  const deselectAll = () => onChange(["__none__"]);

  const label = noneSelected
    ? placeholder
    : selected.length === 1 && selected[0] !== "__none__"
    ? options.find((o) => o.value === selected[0])?.label || "1 selected"
    : selected[0] === "__none__"
    ? "None"
    : `${selected.length} selected`;

  const sortedOptions = [...options].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const filteredOptions = search
    ? sortedOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : sortedOptions;

  const isItemSelected = (value: string) => {
    if (selected[0] === "__none__") return false;
    if (selected.length === 0) return true;
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
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[220px] max-h-[360px] flex flex-col animate-in">
          {/* Header: search + select all/none */}
          <div className="sticky top-0 bg-surface-100 border-b border-surface-300/50 px-3 py-2 space-y-2 flex-shrink-0">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-surface-200/50 border border-surface-300/50 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent/50"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {filteredOptions.length} option{filteredOptions.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className={clsx(
                    "text-xs transition-colors",
                    noneSelected ? "text-accent font-medium" : "text-gray-400 hover:text-white"
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
          </div>

          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No matches</div>
            )}
            {filteredOptions.map((opt) => {
              const checked = isItemSelected(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (selected.length === 0) {
                      onChange(options.filter((o) => o.value !== opt.value).map((o) => o.value));
                    } else if (selected[0] === "__none__") {
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
                      checked ? "bg-accent border-accent" : "border-surface-300"
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
        </div>
      )}
    </div>
  );
}

// ─── Single-Select Dropdown ──────────────────────────────────────────────────

interface SingleSelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SingleSelectDropdownProps {
  options: SingleSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Styled single-select dropdown that matches the MultiSelectDropdown look.
 * Used for time range, trend, etc.
 */
export function SingleSelectDropdown({
  options,
  value,
  onChange,
  className,
}: SingleSelectDropdownProps) {
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

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="filter-select flex items-center gap-2 min-w-[100px] text-left"
      >
        <span className="truncate flex-1 text-sm">
          {current?.icon ? `${current.icon} ` : ""}{current?.label || value}
        </span>
        <ChevronDown
          className={clsx(
            "w-3.5 h-3.5 flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[140px] animate-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={clsx(
                "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-200/50 transition-colors text-sm",
                opt.value === value ? "text-accent bg-accent/5" : "text-gray-300"
              )}
            >
              {opt.icon && <span>{opt.icon}</span>}
              <span className="flex-1">{opt.label}</span>
              {opt.value === value && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          ))}
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
