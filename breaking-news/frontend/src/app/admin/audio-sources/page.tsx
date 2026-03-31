"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, Plus, Trash2, X, Play, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, SOURCES_TABS } from "@/components/PageTabBar";

export default function AudioSourcesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("URL");
  const [formUrl, setFormUrl] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audio-sources"],
    queryFn: () => apiFetch<any>("/api/v1/admin/audio-sources", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/audio-sources", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["audio-sources"] }); setShowForm(false); setFormName(""); setFormUrl(""); },
  });

  const transcribeMutation = useMutation({
    mutationFn: (id: string) => apiFetch<any>(`/api/v1/admin/audio-sources/${id}/transcribe`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/audio-sources/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audio-sources"] }),
  });

  const { data: transcripts } = useQuery({
    queryKey: ["audio-transcripts", expandedId],
    queryFn: () => apiFetch<any>(`/api/v1/admin/audio-sources/${expandedId}/transcripts`, { headers: getAuthHeaders() }),
    enabled: !!expandedId,
  });

  const sources = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Mic className="w-6 h-6 text-rose-400" /> Audio Sources
            </h1>
            <p className="text-sm text-gray-500 mt-1">Ingest audio from police scanners, press conferences, and broadcasts. Transcribed via OpenAI Whisper.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg">
            <Plus className="w-4 h-4" /> Add Source
          </button>
        </div>
        <PageTabBar tabs={SOURCES_TABS} />

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Audio Source</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Police Scanner Channel 1" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Type</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value)} className="filter-select w-full">
                  <option value="URL">Audio URL</option><option value="STREAM">Live Stream</option><option value="FILE">File Upload</option>
                </select>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">URL</label><input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..." className="filter-input w-full" /></div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), type: formType, url: formUrl.trim() || undefined })} disabled={!formName.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", !formName.trim() && "opacity-50")}>Add Source</button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : sources.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Mic className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No audio sources configured.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map((s: any) => (
              <div key={s.id} className="glass-card overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="cursor-pointer" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                    <h3 className="text-white font-semibold">{s.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{s.type} &middot; {s._count?.transcripts || 0} transcripts {s.lastProcessedAt && `&middot; Last: ${formatRelativeTime(s.lastProcessedAt)}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => transcribeMutation.mutate(s.id)} disabled={transcribeMutation.isPending} className="filter-btn text-xs flex items-center gap-1">
                      {transcribeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Transcribe
                    </button>
                    <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(s.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {expandedId === s.id && (
                  <div className="border-t border-surface-300/30 p-4 space-y-3 animate-in">
                    {(transcripts?.data || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No transcripts yet. Click Transcribe to process audio.</p>
                    ) : (
                      (transcripts?.data || []).map((t: any) => (
                        <div key={t.id} className="bg-surface-200/50 rounded-lg p-3">
                          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                            <span>{t.duration}s</span>
                            <span>{t.language}</span>
                            <span>Confidence: {Math.round((t.confidence || 0) * 100)}%</span>
                            <span>{formatRelativeTime(t.processedAt)}</span>
                            {t.storyId && <span className="text-accent">Matched to story</span>}
                          </div>
                          <p className="text-sm text-gray-300 line-clamp-4">{t.content}</p>
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
