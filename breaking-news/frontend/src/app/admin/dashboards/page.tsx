"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Plus, Trash2, X, Star } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const ROLE_OPTIONS = ["", "VIEWER", "EDITOR", "ADMIN", "OWNER"];

export default function DashboardLayoutsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-layouts"],
    queryFn: () => apiFetch<any>("/api/v1/admin/dashboards", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/dashboards", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dashboard-layouts"] }); setShowForm(false); setFormName(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/dashboards/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-layouts"] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiFetch<any>(`/api/v1/admin/dashboards/${id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isDefault: true }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-layouts"] }),
  });

  const layouts = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <LayoutGrid className="w-6 h-6 text-cyan-400" /> Dashboard Layouts
            </h1>
            <p className="text-sm text-gray-500 mt-1">Create custom dashboard views for different roles. Anchors, producers, and assignment editors each see what matters to them.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> New Layout</button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Dashboard Layout</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Layout Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Anchor View, Producer Dashboard" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Restrict to Role (optional)</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value)} className="filter-select w-full">
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.filter(Boolean).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), role: formRole || undefined, layout: { panels: [] } })} disabled={!formName.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", !formName.trim() && "opacity-50")}>
              {createMutation.isPending ? "Creating..." : "Create Layout"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : layouts.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <LayoutGrid className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No custom dashboard layouts yet.</p>
            <p className="text-gray-600 text-sm">Create layouts to give different roles customized views of the news desk.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {layouts.map((layout: any) => (
              <div key={layout.id} className="glass-card p-5 space-y-3 animate-in">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{layout.name}</h3>
                      {layout.isDefault && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                    </div>
                    {layout.role && <span className="text-xs text-gray-500">Role: {layout.role}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!layout.isDefault && (
                      <button onClick={() => setDefaultMutation.mutate(layout.id)} className="filter-btn text-xs" title="Set as default">
                        <Star className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(layout.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  {(layout.layout?.panels || []).length} panels configured
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
