"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Code, Plus, Trash2, X, Copy, Check } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const WIDGET_TYPES = [
  { value: "BREAKING", label: "Breaking News", desc: "Shows breaking/alert stories" },
  { value: "CATEGORY", label: "Category Feed", desc: "Stories from a specific category" },
  { value: "PULSE", label: "Pulse Feed", desc: "Stories matching a smart pulse" },
];

export default function WidgetsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["widgets"],
    queryFn: () => apiFetch<any>("/api/v1/admin/widgets", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>("/api/v1/admin/widgets", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["widgets"] }); setShowForm(false); setFormName(""); setFormType(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/widgets/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["widgets"] }),
  });

  const widgets = data?.data || [];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Code className="w-6 h-6 text-green-400" /> Embeddable Widgets
            </h1>
            <p className="text-sm text-gray-500 mt-1">Create widgets that can be embedded on external websites to display your news feeds.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Widget
          </button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Widget</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {WIDGET_TYPES.map((wt) => (
                <button key={wt.value} onClick={() => setFormType(wt.value)} className={clsx("p-3 rounded-lg border text-left transition-all", formType === wt.value ? "border-accent/50 bg-accent/10 text-white" : "border-surface-300/50 bg-surface-200/30 text-gray-400 hover:border-surface-300")}>
                  <span className="text-sm font-medium">{wt.label}</span>
                  <span className="block text-xs text-gray-500 mt-1">{wt.desc}</span>
                </button>
              ))}
            </div>
            {formType && (
              <div className="space-y-4 animate-in">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Widget Name *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Homepage Breaking News" className="filter-input w-full" />
                </div>
                <button onClick={() => createMutation.mutate({ name: formName.trim(), type: formType, config: { theme: "dark", maxStories: 10 } })} disabled={!formName.trim() || createMutation.isPending} className={clsx("px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", createMutation.isPending && "opacity-50")}>
                  {createMutation.isPending ? "Creating..." : "Create Widget"}
                </button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : widgets.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Code className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No widgets created yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {widgets.map((w: any) => (
              <div key={w.id} className="glass-card p-5 space-y-3 animate-in">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold">{w.name}</h3>
                    <span className="px-2 py-0.5 rounded text-xs bg-surface-300/50 text-gray-400">{w.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleCopy(w.embedCode || "", w.id)} className="filter-btn text-xs flex items-center gap-1">
                      {copiedId === w.id ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Embed</>}
                    </button>
                    <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(w.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {w.embedCode && (
                  <div className="bg-surface-300/50 rounded-lg px-4 py-2 font-mono text-xs text-gray-400 break-all">{w.embedCode}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
