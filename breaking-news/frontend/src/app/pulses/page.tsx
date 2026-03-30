"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";

export default function PulsesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [expandedPulse, setExpandedPulse] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pulses"],
    queryFn: () => apiFetch<any>("/api/v1/pulses", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch<any>("/api/v1/pulses", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      setShowForm(false);
      setFormName("");
      setFormKeywords("");
      setFormCategory("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/v1/pulses/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pulses"] }),
  });

  const { data: pulseStories } = useQuery({
    queryKey: ["pulse-stories", expandedPulse],
    queryFn: () => apiFetch<any>(`/api/v1/pulses/${expandedPulse}/stories`, { headers: getAuthHeaders() }),
    enabled: !!expandedPulse,
  });

  const pulses = data?.data || [];

  const handleCreate = () => {
    if (!formName.trim()) return;
    const keywords = formKeywords.split(",").map((k: string) => k.trim()).filter(Boolean);
    createMutation.mutate({
      name: formName.trim(),
      topics: { keywords },
      filters: formCategory ? { category: formCategory } : undefined,
    });
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-purple-400" />
            Smart Pulses
          </h1>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Pulse
          </button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Smart Pulse</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Pulse Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Houston Crime Watch" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Keywords (comma-separated)</label>
                <input type="text" value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="shooting, robbery, arrest" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Category Filter</label>
                <input type="text" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder="CRIME" className="filter-input w-full" />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!formName.trim() || createMutation.isPending} className={clsx("px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", (!formName.trim() || createMutation.isPending) && "opacity-50 cursor-not-allowed")}>
              {createMutation.isPending ? "Creating..." : "Create Pulse"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : pulses.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Zap className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No pulses configured.</p>
            <p className="text-gray-600 text-sm">Create a pulse to get AI-curated story feeds based on your interests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pulses.map((pulse: any) => (
              <div key={pulse.id} className="glass-card overflow-hidden">
                <button onClick={() => setExpandedPulse(expandedPulse === pulse.id ? null : pulse.id)} className="w-full p-4 flex items-center justify-between hover:bg-surface-200/30 transition-colors">
                  <div className="text-left">
                    <h3 className="text-white font-semibold">{pulse.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Keywords: {(pulse.topics?.keywords || []).join(", ") || "None"}
                      {pulse.filters?.category && ` | Category: ${pulse.filters.category}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) deleteMutation.mutate(pulse.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </button>
                {expandedPulse === pulse.id && (
                  <div className="border-t border-surface-300/30 p-4 space-y-2 animate-in">
                    {(pulseStories?.data || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No matching stories found.</p>
                    ) : (
                      (pulseStories?.data || []).slice(0, 10).map((story: any) => (
                        <div key={story.id} className="flex items-center gap-3 py-2 border-b border-surface-300/20 last:border-0">
                          <StatusBadge status={story.status} />
                          <Link href={`/stories/${story.id}`} className="text-sm text-gray-200 hover:text-accent truncate">{story.title}</Link>
                          <span className="text-xs text-gray-500 ml-auto tabular-nums">{Math.round(story.compositeScore * 100)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
