"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, Trash2, Save, RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface KnowledgeDoc {
  id: string;
  key: string;
  content: string;
  category: string;
  updatedAt: string;
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  const { data, isLoading } = useQuery({
    queryKey: ["system-knowledge"],
    queryFn: () => apiFetch<any>("/api/v1/admin/knowledge", { headers: getAuthHeaders() }),
  });

  const autoGenMutation = useMutation({
    mutationFn: () => apiFetch("/api/v1/admin/knowledge/generate", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["system-knowledge"] }),
  });

  const saveMutation = useMutation({
    mutationFn: (doc: { key: string; content: string; category: string }) =>
      apiFetch("/api/v1/admin/knowledge", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(doc) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-knowledge"] });
      setNewKey(""); setNewContent(""); setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/admin/knowledge/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["system-knowledge"] }),
  });

  const docs: KnowledgeDoc[] = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Brain className="w-6 h-6 text-purple-400" /> AI Knowledge Base
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Documents injected into AI system prompts. Affects NLP search, chatbot, and content generation.
            </p>
          </div>
          <button
            onClick={() => autoGenMutation.mutate()}
            disabled={autoGenMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 border border-surface-300/50 hover:border-accent/50 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
          >
            {autoGenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {autoGenMutation.isPending ? "Generating..." : "Auto-Generate Schema Docs"}
          </button>
        </div>

        {/* Add new document */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Add Knowledge Document</h3>
          <div className="grid grid-cols-3 gap-3">
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Key (e.g., editorial_guidelines)" className="filter-input" />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="filter-select">
              <option value="general">General</option>
              <option value="schema">Schema</option>
              <option value="editorial">Editorial Guidelines</option>
              <option value="market">Market Context</option>
              <option value="scoring">Scoring Rules</option>
              <option value="custom">Custom</option>
            </select>
            <button
              onClick={() => saveMutation.mutate({ key: newKey, content: newContent, category: newCategory })}
              disabled={!newKey || !newContent || saveMutation.isPending}
              className="px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"
            >
              <Plus className="w-4 h-4 inline mr-1" /> Add
            </button>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Knowledge content... This will be injected into AI system prompts."
            className="filter-input w-full h-24 resize-y"
          />
        </div>

        {/* Existing documents */}
        {isLoading && <p className="text-gray-500">Loading...</p>}
        {docs.length === 0 && !isLoading && (
          <div className="glass-card p-8 text-center text-gray-500">
            <Brain className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p>No knowledge documents yet. Click "Auto-Generate Schema Docs" to populate.</p>
          </div>
        )}
        {docs.map((doc) => (
          <div key={doc.id} className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-surface-200/30">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-white">{doc.key}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 uppercase">{doc.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">{new Date(doc.updatedAt).toLocaleDateString()}</span>
                {editingId === doc.id ? (
                  <button onClick={() => { saveMutation.mutate({ key: doc.key, content: editContent, category: doc.category }); setEditingId(null); }} className="text-green-400 hover:text-green-300 p-1"><Save className="w-4 h-4" /></button>
                ) : (
                  <button onClick={() => { setEditingId(doc.id); setEditContent(doc.content); }} className="text-gray-500 hover:text-white p-1 text-xs">Edit</button>
                )}
                <button onClick={() => { if (confirm(`Delete "${doc.key}"?`)) deleteMutation.mutate(doc.id); }} className="text-gray-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {editingId === doc.id ? (
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-4 bg-transparent text-sm text-gray-300 font-mono h-64 resize-y focus:outline-none" />
            ) : (
              <>
                <pre className="p-4 text-xs text-gray-400 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">{doc.content}</pre>
                <div className="px-4 py-1 text-[10px] text-gray-600 border-t border-surface-300/20">
                  {doc.content.length.toLocaleString()} characters · {doc.content.split('\n').length} lines
                </div>
              </>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
