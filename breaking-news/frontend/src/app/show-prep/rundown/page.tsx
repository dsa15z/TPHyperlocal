'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GripVertical,
  Plus,
  Save,
  Send,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Minus,
  Check,
  Tv,
  Radio,
  Mic,
  Video,
  Newspaper,
  Coffee,
  Megaphone,
  CloudSun,
  Trophy,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RundownItem {
  storyId: string;
  title: string;
  type: 'PKG' | 'VO' | 'VOSOT' | 'LIVE' | 'READER' | 'BREAK' | 'TEASE' | 'WEATHER' | 'SPORTS';
  duration: number;
  notes?: string;
  hasScript?: boolean;
  hasPackage?: boolean;
}

interface Rundown {
  id: string;
  name: string;
  showDate: string;
  items: RundownItem[];
  createdAt: string;
  updatedAt: string;
}

interface Story {
  id: string;
  title: string;
  category?: string;
  overallScore?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ITEM_TYPES: RundownItem['type'][] = [
  'PKG', 'VO', 'VOSOT', 'LIVE', 'READER', 'BREAK', 'TEASE', 'WEATHER', 'SPORTS',
];

const TYPE_COLORS: Record<RundownItem['type'], string> = {
  PKG: 'bg-blue-600',
  VO: 'bg-emerald-600',
  VOSOT: 'bg-teal-600',
  LIVE: 'bg-red-600',
  READER: 'bg-amber-600',
  BREAK: 'bg-gray-600',
  TEASE: 'bg-purple-600',
  WEATHER: 'bg-sky-500',
  SPORTS: 'bg-orange-600',
};

const TYPE_ICONS: Record<RundownItem['type'], React.ReactNode> = {
  PKG: <Video className="w-3 h-3" />,
  VO: <Tv className="w-3 h-3" />,
  VOSOT: <Tv className="w-3 h-3" />,
  LIVE: <Radio className="w-3 h-3" />,
  READER: <Newspaper className="w-3 h-3" />,
  BREAK: <Coffee className="w-3 h-3" />,
  TEASE: <Megaphone className="w-3 h-3" />,
  WEATHER: <CloudSun className="w-3 h-3" />,
  SPORTS: <Trophy className="w-3 h-3" />,
};

const DEFAULT_DURATIONS: Record<RundownItem['type'], number> = {
  PKG: 120,
  VO: 30,
  VOSOT: 45,
  LIVE: 180,
  READER: 20,
  BREAK: 120,
  TEASE: 15,
  WEATHER: 180,
  SPORTS: 180,
};

const TARGET_DURATION = 22 * 60; // 22 minutes of content in a 30-min show

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseDuration(str: string): number {
  const parts = str.split(':');
  if (parts.length === 2) {
    return Math.max(0, parseInt(parts[0] || '0', 10) * 60 + parseInt(parts[1] || '0', 10));
  }
  return 0;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function RundownEditorPage() {
  const queryClient = useQueryClient();

  // State
  const [selectedRundownId, setSelectedRundownId] = useState<string | null>(null);
  const [items, setItems] = useState<RundownItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewRundown, setShowNewRundown] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragFromSearch, setDragFromSearch] = useState<Story | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [editingTitle, setEditingTitle] = useState<number | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Queries
  const { data: rundowns = [] } = useQuery<Rundown[]>({
    queryKey: ['rundowns'],
    queryFn: () => apiFetch('/api/v1/show-prep').then((r) => r.data ?? r),
  });

  const { data: searchResults = [] } = useQuery<Story[]>({
    queryKey: ['stories-search', searchQuery],
    queryFn: () =>
      apiFetch(`/api/v1/stories?search=${encodeURIComponent(searchQuery)}&limit=20`).then(
        (r) => r.data ?? r.stories ?? r
      ),
    enabled: searchQuery.length > 0,
  });

  const selectedRundown = rundowns.find((r: Rundown) => r.id === selectedRundownId);

  // Load items when rundown selected
  useEffect(() => {
    if (selectedRundown) {
      const parsed = Array.isArray(selectedRundown.items) ? selectedRundown.items : [];
      setItems(parsed);
      setIsDirty(false);
    }
  }, [selectedRundownId, selectedRundown]);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (isDirtyRef.current && selectedRundownId) {
        saveMutation.mutate();
      }
    }, 30000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRundownId]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; showDate: string; items: RundownItem[] }) =>
      apiFetch('/api/v1/show-prep', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data: Rundown) => {
      queryClient.invalidateQueries({ queryKey: ['rundowns'] });
      setSelectedRundownId(data.id);
      setShowNewRundown(false);
      setNewName('');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/show-prep/${selectedRundownId}`, {
        method: 'PATCH',
        body: JSON.stringify({ items: itemsRef.current }),
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['rundowns'] });
    },
  });

  const pushMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/mos/push-rundown', {
        method: 'POST',
        body: JSON.stringify({ rundownId: selectedRundownId }),
      }),
  });

  // Item manipulation helpers
  const updateItems = useCallback((newItems: RundownItem[]) => {
    setItems(newItems);
    setIsDirty(true);
  }, []);

  const updateItem = useCallback(
    (index: number, patch: Partial<RundownItem>) => {
      const next = [...items];
      next[index] = { ...next[index], ...patch };
      updateItems(next);
    },
    [items, updateItems]
  );

  const removeItem = useCallback(
    (index: number) => {
      updateItems(items.filter((_, i) => i !== index));
    },
    [items, updateItems]
  );

  const addItem = useCallback(
    (type: RundownItem['type']) => {
      updateItems([
        ...items,
        {
          storyId: '',
          title: type === 'BREAK' ? 'Commercial Break' : `New ${type}`,
          type,
          duration: DEFAULT_DURATIONS[type],
        },
      ]);
    },
    [items, updateItems]
  );

  const addStoryAsItem = useCallback(
    (story: Story) => {
      updateItems([
        ...items,
        {
          storyId: story.id,
          title: story.title,
          type: 'PKG',
          duration: DEFAULT_DURATIONS.PKG,
        },
      ]);
    },
    [items, updateItems]
  );

  // Drag and drop handlers — internal reorder
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    setDragFromSearch(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropIndex !== index) setDropIndex(index);
    },
    [dropIndex]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();

      // Check if dragging from search panel
      if (dragFromSearch) {
        const next = [...items];
        const newItem: RundownItem = {
          storyId: dragFromSearch.id,
          title: dragFromSearch.title,
          type: 'PKG',
          duration: DEFAULT_DURATIONS.PKG,
        };
        next.splice(targetIndex, 0, newItem);
        updateItems(next);
        setDragFromSearch(null);
        setDropIndex(null);
        return;
      }

      // Internal reorder
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDropIndex(null);
        return;
      }
      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      updateItems(next);
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex, dragFromSearch, items, updateItems]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
    setDragFromSearch(null);
  }, []);

  // Drag from search panel
  const handleSearchDragStart = useCallback((e: React.DragEvent, story: Story) => {
    setDragFromSearch(story);
    setDragIndex(null);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', story.id);
  }, []);

  const handleRundownDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragFromSearch) {
        addStoryAsItem(dragFromSearch);
        setDragFromSearch(null);
      }
      setDropIndex(null);
    },
    [dragFromSearch, addStoryAsItem]
  );

  // Computed values
  const totalDuration = items.reduce((sum, item) => sum + item.duration, 0);
  const timingRatio = totalDuration / TARGET_DURATION;
  const timingDiff = totalDuration - TARGET_DURATION;
  const timingColor =
    timingRatio > 1 ? 'bg-red-500' : timingRatio >= 0.9 ? 'bg-yellow-500' : 'bg-green-500';
  const timingTextColor =
    timingRatio > 1
      ? 'text-red-400'
      : timingRatio >= 0.9
      ? 'text-yellow-400'
      : 'text-green-400';

  // Running time calculator
  const runningTimes: number[] = [];
  let cumulative = 0;
  for (const item of items) {
    runningTimes.push(cumulative);
    cumulative += item.duration;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Rundown Editor
          </h1>

          {/* Rundown selector */}
          <select
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
            value={selectedRundownId || ''}
            onChange={(e) => setSelectedRundownId(e.target.value || null)}
          >
            <option value="">Select Rundown...</option>
            {rundowns.map((r: Rundown) => (
              <option key={r.id} value={r.id}>
                {r.name} ({new Date(r.showDate).toLocaleDateString()})
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNewRundown(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded font-medium"
          >
            <Plus className="w-4 h-4" /> New Rundown
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-yellow-400 mr-2">Unsaved changes</span>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!selectedRundownId || !isDirty || saveMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed rounded font-medium"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => pushMutation.mutate()}
            disabled={!selectedRundownId || pushMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded font-medium"
          >
            <Send className="w-4 h-4" />
            {pushMutation.isPending ? 'Pushing...' : 'Push to ENPS'}
          </button>
        </div>
      </div>

      {/* New Rundown Modal */}
      {showNewRundown && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">New Rundown</h2>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. 5PM Show"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mb-3"
            />
            <label className="block text-sm text-gray-400 mb-1">Show Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewRundown(false)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createMutation.mutate({ name: newName, showDate: newDate, items: [] })
                }
                disabled={!newName || createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded font-medium"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Search Panel — left side */}
        <div className="w-[300px] border-r border-gray-800 bg-gray-900 flex flex-col">
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stories to add..."
                className="w-full bg-gray-800 border border-gray-700 rounded pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {searchQuery.length === 0 && (
              <p className="text-xs text-gray-500 text-center mt-8 px-4">
                Search for stories, then drag them into the rundown timeline.
              </p>
            )}
            {searchResults.map((story: Story) => (
              <div
                key={story.id}
                draggable
                onDragStart={(e) => handleSearchDragStart(e, story)}
                onDragEnd={handleDragEnd}
                onClick={() => addStoryAsItem(story)}
                className="p-2.5 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded cursor-grab active:cursor-grabbing transition-colors"
              >
                <p className="text-sm font-medium leading-tight line-clamp-2">{story.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {story.category && (
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
                      {story.category}
                    </span>
                  )}
                  {story.overallScore != null && (
                    <span className="text-[10px] text-blue-400">
                      {(story.overallScore * 100).toFixed(0)}%
                    </span>
                  )}
                  {story.status && (
                    <span className="text-[10px] text-gray-400">{story.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rundown Timeline — main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedRundownId ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">Select or create a rundown to begin</p>
              </div>
            </div>
          ) : (
            <>
              {/* Timing bar */}
              <div className="px-6 py-3 border-b border-gray-800 bg-gray-900">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">
                      Show Content: <span className="font-mono font-bold">{formatDuration(totalDuration)}</span>{' '}
                      / {formatDuration(TARGET_DURATION)}
                    </span>
                  </div>
                  <span className={`text-sm font-bold font-mono ${timingTextColor}`}>
                    {timingDiff === 0
                      ? 'ON TIME'
                      : timingDiff > 0
                      ? `${formatDuration(timingDiff)} OVER`
                      : `${formatDuration(Math.abs(timingDiff))} UNDER`}
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${timingColor}`}
                    style={{ width: `${Math.min(timingRatio * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Quick add buttons */}
              <div className="px-6 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 mr-1">Quick Add:</span>
                {(['PKG', 'VO', 'LIVE', 'VOSOT', 'READER', 'BREAK', 'TEASE', 'WEATHER', 'SPORTS'] as RundownItem['type'][]).map(
                  (type) => (
                    <button
                      key={type}
                      onClick={() => addItem(type)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> {type}
                    </button>
                  )
                )}
              </div>

              {/* Items list */}
              <div
                className="flex-1 overflow-y-auto px-6 py-3"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = dragFromSearch ? 'copy' : 'move';
                }}
                onDrop={handleRundownDrop}
              >
                {items.length === 0 && (
                  <div className="flex items-center justify-center h-48 border-2 border-dashed border-gray-700 rounded-lg text-gray-500">
                    <div className="text-center">
                      <p className="text-sm">Drag stories here or use Quick Add buttons</p>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {items.map((item, index) => (
                    <div
                      key={`${item.storyId}-${index}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-start gap-2 rounded-lg border transition-all ${
                        dragIndex === index
                          ? 'opacity-40 border-gray-600 bg-gray-900'
                          : dropIndex === index
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                      }`}
                    >
                      {/* Running time */}
                      <div className="w-14 shrink-0 text-right py-3 pr-0 pl-1">
                        <span className="text-[11px] font-mono text-gray-500">
                          {formatDuration(runningTimes[index])}
                        </span>
                      </div>

                      {/* Grip handle */}
                      <div className="py-3 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Position number */}
                      <div className="w-6 shrink-0 py-3">
                        <span className="text-xs font-mono text-gray-500">{index + 1}</span>
                      </div>

                      {/* Type badge */}
                      <div className="py-2.5 shrink-0">
                        <select
                          value={item.type}
                          onChange={(e) =>
                            updateItem(index, { type: e.target.value as RundownItem['type'] })
                          }
                          className={`text-[11px] font-bold text-white rounded px-2 py-1 border-0 cursor-pointer ${TYPE_COLORS[item.type]}`}
                        >
                          {ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Title — editable */}
                      <div className="flex-1 py-2.5 min-w-0">
                        {editingTitle === index ? (
                          <input
                            autoFocus
                            type="text"
                            value={item.title}
                            onChange={(e) => updateItem(index, { title: e.target.value })}
                            onBlur={() => setEditingTitle(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingTitle(null);
                            }}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm"
                          />
                        ) : (
                          <p
                            onClick={() => setEditingTitle(index)}
                            className="text-sm font-medium truncate cursor-text hover:text-blue-300 transition-colors"
                          >
                            {item.title}
                          </p>
                        )}

                        {/* Expandable notes */}
                        {expandedNotes.has(index) && (
                          <textarea
                            value={item.notes || ''}
                            onChange={(e) => updateItem(index, { notes: e.target.value })}
                            placeholder="Notes..."
                            rows={2}
                            className="mt-1.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 resize-none"
                          />
                        )}
                      </div>

                      {/* Script indicator */}
                      <div className="py-3 shrink-0">
                        {item.hasScript || item.hasPackage ? (
                          <span title="Script ready" className="text-green-400">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span title="No script" className="text-gray-700">
                            <FileText className="w-4 h-4" />
                          </span>
                        )}
                      </div>

                      {/* Duration controls */}
                      <div className="flex items-center gap-1 py-2.5 shrink-0">
                        <button
                          onClick={() =>
                            updateItem(index, { duration: Math.max(0, item.duration - 15) })
                          }
                          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="text"
                          value={formatDuration(item.duration)}
                          onChange={(e) => {
                            const val = parseDuration(e.target.value);
                            updateItem(index, { duration: val });
                          }}
                          className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono text-center"
                        />
                        <button
                          onClick={() => updateItem(index, { duration: item.duration + 15 })}
                          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Notes toggle */}
                      <button
                        onClick={() => {
                          const next = new Set(expandedNotes);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          setExpandedNotes(next);
                        }}
                        className="py-3 shrink-0 text-gray-600 hover:text-gray-400"
                        title="Toggle notes"
                      >
                        {expandedNotes.has(index) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => removeItem(index)}
                        className="py-3 pr-3 shrink-0 text-gray-600 hover:text-red-400"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Total footer */}
                {items.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-sm text-gray-400">
                    <span>
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                    <span className="font-mono font-bold text-gray-200">
                      Total: {formatDuration(totalDuration)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
