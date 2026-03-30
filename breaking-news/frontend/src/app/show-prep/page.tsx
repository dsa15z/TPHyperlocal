"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic2, Plus, Trash2, X, FileText } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export default function ShowPrepPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["show-prep"],
    queryFn: () => apiFetch<any>("/api/v1/show-prep", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch<any>("/api/v1/show-prep", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-prep"] });
      setShowForm(false);
      setFormName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/v1/show-prep/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show-prep"] }),
  });

  const rundowns = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Mic2 className="w-6 h-6 text-pink-400" />
            Show Prep
          </h1>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Rundown
          </button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Show Rundown</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Show Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Morning News 6AM" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Show Date</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="filter-input w-full" />
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), showDate: formDate })} disabled={!formName.trim() || createMutation.isPending} className={clsx("px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", (!formName.trim() || createMutation.isPending) && "opacity-50 cursor-not-allowed")}>
              {createMutation.isPending ? "Creating..." : "Create Rundown"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : rundowns.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Mic2 className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No show rundowns yet.</p>
            <p className="text-gray-600 text-sm">Create a rundown to organize stories for your next broadcast.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rundowns.map((rd: any) => (
              <div key={rd.id} className="glass-card p-5 space-y-3 animate-in">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold">{rd.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(rd.showDate).toLocaleDateString()} &middot;{" "}
                      <span className={clsx(
                        rd.status === "FINAL" ? "text-green-400" :
                        rd.status === "ARCHIVED" ? "text-gray-500" : "text-yellow-400"
                      )}>{rd.status}</span>
                    </p>
                  </div>
                  <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(rd.id); }} className="text-gray-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FileText className="w-3 h-3" />
                  {(rd.items || []).length} stories in rundown
                </div>
                <p className="text-xs text-gray-600">Created {formatRelativeTime(rd.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
