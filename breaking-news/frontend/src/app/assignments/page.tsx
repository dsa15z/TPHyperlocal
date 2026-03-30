"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, X, UserCheck, MapPin, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_COLUMNS = [
  { key: "ASSIGNED", label: "Assigned", color: "border-yellow-500" },
  { key: "EN_ROUTE", label: "En Route", color: "border-blue-500" },
  { key: "ON_SCENE", label: "On Scene", color: "border-purple-500" },
  { key: "FILED", label: "Filed", color: "border-green-500" },
  { key: "AIRED", label: "Aired", color: "border-gray-500" },
];

const PRIORITIES: Record<string, string> = {
  URGENT: "bg-red-500/20 text-red-400",
  HIGH: "bg-orange-500/20 text-orange-400",
  NORMAL: "bg-blue-500/20 text-blue-400",
  LOW: "bg-gray-500/20 text-gray-400",
};

export default function AssignmentsPage() {
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [selectedReporterId, setSelectedReporterId] = useState("");
  const [priority, setPriority] = useState("NORMAL");

  const { data: assignData, isLoading } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => apiFetch<any>("/api/v1/assignments", { headers: getAuthHeaders() }),
    refetchInterval: 15_000,
  });

  const { data: reporterData } = useQuery({
    queryKey: ["reporters"],
    queryFn: () => apiFetch<any>("/api/v1/reporters", { headers: getAuthHeaders() }),
  });

  const { data: suggestData } = useQuery({
    queryKey: ["assignment-suggest", selectedStoryId],
    queryFn: () => apiFetch<any>(`/api/v1/assignments/suggest/${selectedStoryId}`, { headers: getAuthHeaders() }),
    enabled: !!selectedStoryId,
  });

  const assignMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/assignments", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assignments"] }); setShowAssign(false); },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<any>(`/api/v1/assignments/${id}/status`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const assignments = assignData?.data || [];
  const reporters = reporterData?.data || [];
  const suggestions = suggestData?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-blue-400" /> Assignment Desk
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {reporters.filter((r: any) => r.status === "AVAILABLE").length} reporters available &middot; {assignments.filter((a: any) => a.status === "ASSIGNED" || a.status === "EN_ROUTE" || a.status === "ON_SCENE").length} active assignments
            </p>
          </div>
          <button onClick={() => setShowAssign(!showAssign)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg">
            <Plus className="w-4 h-4" /> New Assignment
          </button>
        </div>

        {/* New assignment form with AI suggestions */}
        {showAssign && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Assign Story</h2>
              <button onClick={() => setShowAssign(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Story ID *</label>
                <input type="text" value={selectedStoryId} onChange={(e) => setSelectedStoryId(e.target.value)} placeholder="Paste story ID" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Reporter</label>
                <select value={selectedReporterId} onChange={(e) => setSelectedReporterId(e.target.value)} className="filter-select w-full">
                  <option value="">Select reporter...</option>
                  {reporters.filter((r: any) => r.status === "AVAILABLE").map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name} ({(r.beats || []).join(", ")})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="filter-select w-full">
                  {Object.keys(PRIORITIES).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* AI suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400">AI Recommended Reporters:</label>
                <div className="flex gap-2">
                  {suggestions.map((s: any) => (
                    <button key={s.id} onClick={() => setSelectedReporterId(s.id)} className={clsx("px-3 py-2 rounded-lg border text-left text-xs transition-all", selectedReporterId === s.id ? "border-accent/50 bg-accent/10 text-white" : "border-surface-300/50 text-gray-400 hover:border-surface-300")}>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-gray-600">{s.reason} ({s.matchScore}pts)</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => assignMutation.mutate({ storyId: selectedStoryId, reporterId: selectedReporterId, priority })} disabled={!selectedStoryId || !selectedReporterId} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", (!selectedStoryId || !selectedReporterId) && "opacity-50")}>
              {assignMutation.isPending ? "Assigning..." : "Assign Reporter"}
            </button>
          </div>
        )}

        {/* Kanban board */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading assignments...</div>
        ) : (
          <div className="grid grid-cols-5 gap-4">
            {STATUS_COLUMNS.map((col) => {
              const colAssignments = assignments.filter((a: any) => a.status === col.key);
              return (
                <div key={col.key} className="space-y-2">
                  <div className={clsx("text-sm font-semibold text-gray-400 pb-2 border-b-2", col.color)}>
                    {col.label} ({colAssignments.length})
                  </div>
                  {colAssignments.map((a: any) => (
                    <div key={a.id} className="glass-card p-3 space-y-2 animate-in">
                      <div className="flex items-center gap-1">
                        <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-bold", PRIORITIES[a.priority])}>
                          {a.priority}
                        </span>
                      </div>
                      <Link href={`/stories/${a.storyId}`} className="text-sm text-white hover:text-accent line-clamp-2 block">
                        {a.story?.title || "Story"}
                      </Link>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <UserCheck className="w-3 h-3" />
                        {a.reporter?.name}
                      </div>
                      <div className="text-[10px] text-gray-600">{formatRelativeTime(a.createdAt)}</div>
                      {/* Advance button */}
                      {col.key !== "AIRED" && (
                        <button
                          onClick={() => {
                            const nextStatus = STATUS_COLUMNS[STATUS_COLUMNS.findIndex((c) => c.key === col.key) + 1]?.key;
                            if (nextStatus) updateStatusMutation.mutate({ id: a.id, status: nextStatus });
                          }}
                          className="w-full text-xs text-gray-500 hover:text-white flex items-center justify-center gap-1 py-1 rounded hover:bg-surface-300/30 transition-colors"
                        >
                          <ArrowRight className="w-3 h-3" /> Advance
                        </button>
                      )}
                    </div>
                  ))}
                  {colAssignments.length === 0 && (
                    <div className="text-xs text-gray-600 text-center py-4">Empty</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
