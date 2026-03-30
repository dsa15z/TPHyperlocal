"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function VoicesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formTone, setFormTone] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["voices"],
    queryFn: () => apiFetch<any>("/api/v1/admin/voices", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>("/api/v1/admin/voices", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["voices"] }); setShowForm(false); setFormName(""); setFormPrompt(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/voices/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["voices"] }),
  });

  const voices = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-violet-400" /> Writing Voices
            </h1>
            <p className="text-sm text-gray-500 mt-1">Custom writing styles for AI-generated content. Each voice defines a personality and tone.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add Voice
          </button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Voice</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Voice Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Morning Anchor, Sports Reporter" className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">System Prompt *</label>
                <textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} placeholder="You are a warm, conversational morning news anchor. Write in a friendly, approachable tone..." className="filter-input w-full h-24 resize-y" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tone Tags (comma-separated)</label>
                <input type="text" value={formTone} onChange={(e) => setFormTone(e.target.value)} placeholder="professional, warm, conversational" className="filter-input w-full" />
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), systemPrompt: formPrompt.trim(), tone: formTone.split(",").map((t: string) => t.trim()).filter(Boolean) })} disabled={!formName.trim() || !formPrompt.trim() || createMutation.isPending} className={clsx("px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", createMutation.isPending && "opacity-50 cursor-not-allowed")}>
              {createMutation.isPending ? "Creating..." : "Create Voice"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : voices.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No voices configured.</p>
            <p className="text-gray-600 text-sm">Create a voice to customize how AI writes content for your newsroom.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {voices.map((voice: any) => (
              <div key={voice.id} className="glass-card p-5 space-y-3 animate-in">
                <div className="flex items-start justify-between">
                  <h3 className="text-white font-semibold">{voice.name}</h3>
                  <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(voice.id); }} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
                <p className="text-sm text-gray-400 line-clamp-3">{voice.systemPrompt}</p>
                {voice.tone && (
                  <div className="flex flex-wrap gap-1">
                    {(voice.tone || []).map((t: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-surface-300/50 text-gray-400">{t}</span>
                    ))}
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
