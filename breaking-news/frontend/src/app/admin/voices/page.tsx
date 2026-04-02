"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, FileText, Plus, Trash2, X, Save } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type Tab = "voices" | "prompts";

export default function AIConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>("voices");

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-violet-400" /> AI Configuration
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage writing voices and prompt templates for AI-generated content.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-300/30">
          <button
            onClick={() => setActiveTab("voices")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "voices"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5" />
            Voices
          </button>
          <button
            onClick={() => setActiveTab("prompts")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "prompts"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <FileText className="w-4 h-4 inline mr-1.5" />
            Prompts
          </button>
        </div>

        {activeTab === "voices" && <VoicesTab />}
        {activeTab === "prompts" && <PromptsTab />}
      </main>
    </div>
  );
}

/* ─── Voices Tab ─────────────────────────────────────────────────────────── */

function VoicesTab() {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Custom writing styles for AI-generated content. Each voice defines a personality and tone.</p>
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
    </div>
  );
}

/* ─── Prompts Tab ────────────────────────────────────────────────────────── */

function PromptsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("first_draft");
  const [formTemplate, setFormTemplate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["prompts"],
    queryFn: () => apiFetch<any>("/api/v1/admin/prompts", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>("/api/v1/admin/prompts", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prompts"] }); setShowForm(false); setFormName(""); setFormTemplate(""); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, template }: { id: string; template: string }) => apiFetch<any>(`/api/v1/admin/prompts/${id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ template }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prompts"] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/prompts/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const prompts = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Manage AI prompt templates with versioning. Variables: {"{{title}}, {{content}}, {{market_name}}"}</p>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> New Prompt
        </button>
      </div>

      {showForm && (
        <div className="glass-card-strong p-6 space-y-4 animate-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Create Prompt</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. breaking_summary" className="filter-input w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className="filter-select w-full">
                <option value="first_draft">First Draft</option>
                <option value="idea_starter">Idea Starter</option>
                <option value="notification">Notification</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Template *</label>
            <textarea value={formTemplate} onChange={(e) => setFormTemplate(e.target.value)} placeholder={"Write a summary of this story:\n\nTitle: {{title}}\nContent: {{content}}"} className="filter-input w-full h-32 font-mono text-sm resize-y" />
          </div>
          <button onClick={() => createMutation.mutate({ name: formName.trim(), type: formType, template: formTemplate.trim(), variables: ["title", "content"] })} disabled={!formName.trim() || !formTemplate.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", (!formName.trim() || !formTemplate.trim()) && "opacity-50")}>
            Create Prompt
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
      ) : prompts.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <FileText className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-gray-400">No prompts configured.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map((p: any) => (
            <div key={p.id} className="glass-card p-5 space-y-3 animate-in cursor-pointer" onClick={() => { if (editingId !== p.id) { setEditingId(p.id); setEditTemplate(p.template); } }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-white font-mono text-sm">{p.name}</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{p.type}</span>
                  <span className="text-xs text-gray-600">v{p.version}</span>
                </div>
                <div className="flex items-center gap-2">
                  {editingId === p.id && (
                    <button onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: p.id, template: editTemplate }); }} className="filter-btn text-xs flex items-center gap-1 text-green-400"><Save className="w-3 h-3" /> Save</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) deleteMutation.mutate(p.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {editingId === p.id ? (
                <textarea value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} onClick={(e) => e.stopPropagation()} className="filter-input w-full h-32 font-mono text-sm resize-y" />
              ) : (
                <pre className="text-sm text-gray-400 bg-surface-300/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-24">{p.template}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
