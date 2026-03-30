"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, AlertTriangle, Timer, Plus, Trash2, Radio, Pencil, X, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const DAYS_OF_WEEK = [
  { key: "Mon", label: "M" },
  { key: "Tue", label: "T" },
  { key: "Wed", label: "W" },
  { key: "Thu", label: "Th" },
  { key: "Fri", label: "F" },
  { key: "Sat", label: "Sa" },
  { key: "Sun", label: "Su" },
];

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTimeDisplay(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${display}:${m} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function DeadlinesPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    showName: "",
    airTime: "17:00",
    daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"] as string[],
    scriptDeadlineMin: 60,
  });
  const [tick, setTick] = useState(0);

  // Auto-refresh countdown every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const { data: deadlineData, isLoading } = useQuery({
    queryKey: ["show-deadlines"],
    queryFn: () =>
      apiFetch<any>("/api/v1/show-deadlines", { headers: getAuthHeaders() }),
    refetchInterval: 10_000,
  });

  const { data: statusData } = useQuery({
    queryKey: ["show-deadlines-status", tick],
    queryFn: () =>
      apiFetch<any>("/api/v1/show-deadlines/status", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch<any>("/api/v1/show-deadlines", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["show-deadlines-status"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiFetch<any>(`/api/v1/show-deadlines/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["show-deadlines-status"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<any>(`/api/v1/show-deadlines/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["show-deadlines-status"] });
    },
  });

  const deadlines = deadlineData?.data || [];
  const statuses = statusData?.data || statusData || [];

  function resetForm() {
    setShowAddForm(false);
    setEditingId(null);
    setFormData({
      showName: "",
      airTime: "17:00",
      daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      scriptDeadlineMin: 60,
    });
  }

  function startEdit(show: any) {
    setEditingId(show.id);
    setFormData({
      showName: show.showName,
      airTime: show.airTime,
      daysOfWeek: show.daysOfWeek || [],
      scriptDeadlineMin: show.scriptDeadlineMin || 60,
    });
    setShowAddForm(true);
  }

  function handleSubmit() {
    const payload = {
      showName: formData.showName,
      airTime: formData.airTime,
      daysOfWeek: formData.daysOfWeek,
      scriptDeadlineMin: formData.scriptDeadlineMin,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleDay(day: string) {
    setFormData((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day],
    }));
  }

  // Find today's airing shows from the status endpoint
  const airingToday = Array.isArray(statuses) ? statuses : [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Clock className="w-6 h-6 text-blue-400" /> Deadline Tracker
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {airingToday.length} show{airingToday.length !== 1 ? "s" : ""}{" "}
              airing today &middot; Control room view
            </p>
          </div>
          <button
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"
          >
            {showAddForm ? (
              <>
                <X className="w-4 h-4" /> Cancel
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Add Show
              </>
            )}
          </button>
        </div>

        {/* Countdown Cards */}
        {airingToday.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {airingToday.map((show: any) => {
              const isAirImminent = show.isAirImminent || show.minutesToAir <= 15;
              const isScriptDue = show.isScriptDue || show.minutesToScript <= 0;
              const isPulsing = isAirImminent || isScriptDue;

              return (
                <div
                  key={show.id || show.showName}
                  className={clsx(
                    "glass-card p-5 space-y-3 animate-in transition-all",
                    isPulsing && "border-red-500/60 shadow-red-500/20 shadow-lg"
                  )}
                  style={
                    isPulsing
                      ? { animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }
                      : undefined
                  }
                >
                  {/* Show name and air status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio
                        className={clsx(
                          "w-4 h-4",
                          isAirImminent ? "text-red-400" : "text-blue-400"
                        )}
                      />
                      <span className="text-sm font-semibold text-white">
                        {show.showName}
                      </span>
                    </div>
                    {isAirImminent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">
                        Imminent
                      </span>
                    )}
                  </div>

                  {/* Large countdown */}
                  <div className="text-center">
                    <div
                      className={clsx(
                        "text-4xl font-mono font-bold tracking-wider",
                        isAirImminent
                          ? "text-red-400"
                          : show.minutesToAir <= 60
                            ? "text-yellow-400"
                            : "text-white"
                      )}
                    >
                      {show.minutesToAir <= 0
                        ? "ON AIR"
                        : formatCountdown(show.minutesToAir)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      until air at{" "}
                      {show.nextAirTime
                        ? new Date(show.nextAirTime).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : formatTimeDisplay(show.airTime || "")}
                    </div>
                  </div>

                  {/* Script deadline status */}
                  <div
                    className={clsx(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-xs",
                      isScriptDue
                        ? "bg-red-500/15 text-red-400"
                        : show.minutesToScript <= 15
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-surface-300/30 text-gray-400"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {isScriptDue ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <Timer className="w-3.5 h-3.5" />
                      )}
                      <span>Script deadline</span>
                    </div>
                    <span className="font-mono font-semibold">
                      {isScriptDue
                        ? "OVERDUE"
                        : formatCountdown(show.minutesToScript)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {airingToday.length === 0 && !isLoading && (
          <div className="glass-card p-8 text-center text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No shows airing today</p>
          </div>
        )}

        {/* Add/Edit Show Form */}
        {showAddForm && (
          <div className="glass-card p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit Show" : "Add Show"}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Show Name *
                </label>
                <input
                  type="text"
                  value={formData.showName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      showName: e.target.value,
                    }))
                  }
                  placeholder="e.g. 5PM News"
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Air Time *
                </label>
                <input
                  type="time"
                  value={formData.airTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      airTime: e.target.value,
                    }))
                  }
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Script Lead Time (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={formData.scriptDeadlineMin}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      scriptDeadlineMin: parseInt(e.target.value, 10) || 60,
                    }))
                  }
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Days of Week
                </label>
                <div className="flex gap-1 mt-0.5">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.key}
                      onClick={() => toggleDay(day.key)}
                      className={clsx(
                        "w-8 h-8 rounded text-xs font-semibold transition-colors",
                        formData.daysOfWeek.includes(day.key)
                          ? "bg-accent text-white"
                          : "bg-surface-300/30 text-gray-500 hover:text-white hover:bg-surface-300/50"
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={
                !formData.showName ||
                !formData.airTime ||
                formData.daysOfWeek.length === 0 ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className={clsx(
                "px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg",
                (!formData.showName ||
                  !formData.airTime ||
                  formData.daysOfWeek.length === 0) &&
                  "opacity-50"
              )}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </span>
              ) : editingId ? (
                "Update Show"
              ) : (
                "Add Show"
              )}
            </button>
          </div>
        )}

        {/* Show Management Table */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-300/30">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Timer className="w-4 h-4 text-gray-400" /> All Configured Shows
            </h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-500">
              Loading shows...
            </div>
          ) : deadlines.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No shows configured yet. Add your first show above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Show Name</th>
                    <th className="table-header">Air Time</th>
                    <th className="table-header">Days</th>
                    <th className="table-header">Script Lead Time</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deadlines.map((show: any) => {
                    const statusInfo = airingToday.find(
                      (s: any) =>
                        s.id === show.id || s.showName === show.showName
                    );
                    const isActive = !!statusInfo;

                    return (
                      <tr key={show.id} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <Radio
                              className={clsx(
                                "w-3.5 h-3.5",
                                isActive ? "text-green-400" : "text-gray-600"
                              )}
                            />
                            <span className="text-sm font-medium text-white">
                              {show.showName}
                            </span>
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-gray-300 font-mono">
                            {formatTimeDisplay(show.airTime)}
                          </span>
                        </td>
                        <td className="table-cell">
                          <div className="flex gap-1">
                            {DAYS_OF_WEEK.map((day) => (
                              <span
                                key={day.key}
                                className={clsx(
                                  "w-6 h-5 rounded text-[10px] font-semibold flex items-center justify-center",
                                  (show.daysOfWeek || []).includes(day.key)
                                    ? "bg-blue-500/20 text-blue-400"
                                    : "bg-surface-300/20 text-gray-600"
                                )}
                              >
                                {day.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-gray-300">
                            {show.scriptDeadlineMin || 60} min
                          </span>
                        </td>
                        <td className="table-cell">
                          {isActive ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">
                              AIRING TODAY
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-500">
                              INACTIVE
                            </span>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(show)}
                              className="p-1.5 rounded hover:bg-surface-300/30 text-gray-500 hover:text-white transition-colors"
                              title="Edit show"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete "${show.showName}"? This cannot be undone.`
                                  )
                                ) {
                                  deleteMutation.mutate(show.id);
                                }
                              }}
                              className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                              title="Delete show"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
