"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, Plus, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => apiFetch<any>("/api/v1/admin/feature-flags", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>("/api/v1/admin/feature-flags", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["feature-flags"] }); setShowForm(false); setFormName(""); setFormDesc(""); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      apiFetch<any>(`/api/v1/admin/feature-flags/${id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ defaultValue: value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-flags"] }),
  });

  const flags = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Flag className="w-6 h-6 text-orange-400" /> Feature Flags
            </h1>
            <p className="text-sm text-gray-500 mt-1">Toggle features on/off for your platform. Changes take effect immediately.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Flag
          </button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Flag</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Flag Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. enable_first_draft" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What this flag controls" className="filter-input w-full" />
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), description: formDesc.trim() || undefined, defaultValue: false })} disabled={!formName.trim() || createMutation.isPending} className={clsx("px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", createMutation.isPending && "opacity-50")}>
              {createMutation.isPending ? "Creating..." : "Create Flag"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : flags.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Flag className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No feature flags configured.</p>
          </div>
        ) : (
          <div className="glass-card divide-y divide-surface-300/30">
            {flags.map((flag: any) => (
              <div key={flag.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-sm">{flag.name}</span>
                    <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold", flag.defaultValue ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-500")}>
                      {flag.defaultValue ? "ON" : "OFF"}
                    </span>
                  </div>
                  {flag.description && <p className="text-xs text-gray-500 mt-0.5">{flag.description}</p>}
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ id: flag.id, value: !flag.defaultValue })}
                  className={clsx("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", flag.defaultValue ? "bg-green-500" : "bg-gray-600")}
                >
                  <span className={clsx("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", flag.defaultValue ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
