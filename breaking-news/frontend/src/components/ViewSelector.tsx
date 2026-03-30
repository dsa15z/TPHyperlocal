"use client";

import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid,
  ChevronDown,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
} from "lucide-react";
import clsx from "clsx";
import type { DashboardView } from "@/lib/views";

interface ViewSelectorProps {
  views: DashboardView[];
  activeViewId: string;
  onSelectView: (viewId: string) => void;
  onSaveView: (view: DashboardView) => void;
  onCreateView: (name: string) => void;
  onDuplicateView: (viewId: string, newName: string) => void;
  onRenameView: (viewId: string, newName: string) => void;
  onDeleteView: (viewId: string) => void;
  /** Whether the current view has unsaved changes */
  hasChanges: boolean;
  onSaveCurrentView: () => void;
}

export function ViewSelector({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onDuplicateView,
  onRenameView,
  onDeleteView,
  hasChanges,
  onSaveCurrentView,
}: ViewSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeView = views.find((v) => v.id === activeViewId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsCreating(false);
        setRenamingId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreateView(trimmed);
      setNewName("");
      setIsCreating(false);
    }
  };

  const handleRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameView(id, trimmed);
      setRenamingId(null);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div className="flex items-center gap-2">
        {/* View switcher button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="filter-btn flex items-center gap-2 min-w-[160px]"
        >
          <LayoutGrid className="w-4 h-4 text-gray-400" />
          <span className="truncate text-sm font-medium">
            {activeView?.name || "Default"}
          </span>
          {hasChanges && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
          )}
          <ChevronDown
            className={clsx(
              "w-3.5 h-3.5 flex-shrink-0 transition-transform text-gray-500",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Save changes button */}
        {hasChanges && (
          <button
            onClick={onSaveCurrentView}
            className="filter-btn flex items-center gap-1.5 text-accent border-accent/30 hover:bg-accent/10"
            title="Save changes to current view"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="text-xs">Save</span>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[280px] animate-in">
          {/* Header */}
          <div className="px-3 py-2 border-b border-surface-300/50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Views
            </span>
            <button
              onClick={() => {
                setIsCreating(true);
                setNewName("");
              }}
              className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>

          {/* View list */}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {views.map((view) => {
              const isActive = view.id === activeViewId;
              const isRenaming = renamingId === view.id;

              return (
                <div
                  key={view.id}
                  className={clsx(
                    "group flex items-center gap-2 px-3 py-2 transition-colors",
                    isActive
                      ? "bg-accent/10 border-l-2 border-accent"
                      : "hover:bg-surface-200/50 border-l-2 border-transparent"
                  )}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(view.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="filter-input text-sm py-1 px-2 flex-1 min-w-0"
                      />
                      <button
                        onClick={() => handleRename(view.id)}
                        className="p-1 text-green-400 hover:text-green-300"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="p-1 text-gray-500 hover:text-gray-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          onSelectView(view.id);
                          setIsOpen(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <span
                          className={clsx(
                            "text-sm truncate block",
                            isActive ? "text-white font-medium" : "text-gray-300"
                          )}
                        >
                          {view.name}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {view.columns.filter((c) => c.visible).length} columns
                        </span>
                      </button>

                      {/* Action buttons (shown on hover) */}
                      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setRenamingId(view.id);
                            setRenameValue(view.name);
                          }}
                          className="p-1 text-gray-500 hover:text-gray-300"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            onDuplicateView(view.id, `${view.name} Copy`);
                          }}
                          className="p-1 text-gray-500 hover:text-gray-300"
                          title="Duplicate"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {view.id !== "default" && (
                          <button
                            onClick={() => onDeleteView(view.id)}
                            className="p-1 text-gray-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create new view input */}
          {isCreating && (
            <div className="px-3 py-2 border-t border-surface-300/50">
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  placeholder="View name..."
                  className="filter-input text-sm py-1 px-2 flex-1 min-w-0"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className={clsx(
                    "p-1",
                    newName.trim()
                      ? "text-green-400 hover:text-green-300"
                      : "text-gray-600"
                  )}
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-1 text-gray-500 hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
