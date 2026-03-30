"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, X, Trash2, Save } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function PromptsPage() {
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
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText className="w-6 h-6 text-indigo-400" /> Prompt Manager
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage AI prompt templates with versioning. Variables: {"{{title}}, {{content}}, {{market_name}}"}</p>
          </div>
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
              <div key={p.id} className="glass-card p-5 space-y-3 animate-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-mono text-sm">{p.name}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{p.type}</span>
                    <span className="text-xs text-gray-600">v{p.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === p.id ? (
                      <button onClick={() => updateMutation.mutate({ id: p.id, template: editTemplate })} className="filter-btn text-xs flex items-center gap-1 text-green-400"><Save className="w-3 h-3" /> Save</button>
                    ) : (
                      <button onClick={() => { setEditingId(p.id); setEditTemplate(p.template); }} className="filter-btn text-xs">Edit</button>
                    )}
                    <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(p.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {editingId === p.id ? (
                  <textarea value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} className="filter-input w-full h-32 font-mono text-sm resize-y" />
                ) : (
                  <pre className="text-sm text-gray-400 bg-surface-300/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-24">{p.template}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
