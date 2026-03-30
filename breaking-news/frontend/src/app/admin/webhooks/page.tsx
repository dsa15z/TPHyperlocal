"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const EVENT_OPTIONS = ["ALERT", "BREAKING", "TOP_STORY", "NEW_STORY"];

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["BREAKING"]);

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch<any>("/api/v1/admin/webhooks", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/webhooks", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["webhooks"] }); setShowForm(false); setFormName(""); setFormUrl(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/webhooks/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const webhooks = data?.data || data || [];

  const toggleEvent = (ev: string) => setFormEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Webhook className="w-6 h-6 text-sky-400" /> Webhook Subscriptions
            </h1>
            <p className="text-sm text-gray-500 mt-1">Send real-time story events to external URLs. Payloads are signed with HMAC.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Webhook</button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Webhook</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Slack Integration" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Endpoint URL *</label><input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://hooks.slack.com/..." className="filter-input w-full" /></div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Trigger Events</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((ev) => (
                  <button key={ev} onClick={() => toggleEvent(ev)} className={clsx("filter-btn text-xs px-3 py-1.5", formEvents.includes(ev) && "filter-btn-active")}>{ev.replace("_", " ")}</button>
                ))}
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ name: formName.trim(), url: formUrl.trim(), events: formEvents })} disabled={!formName.trim() || !formUrl.trim() || formEvents.length === 0} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", (!formName.trim() || !formUrl.trim()) && "opacity-50")}>
              {createMutation.isPending ? "Creating..." : "Create Webhook"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : (Array.isArray(webhooks) ? webhooks : []).length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Webhook className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No webhooks configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(Array.isArray(webhooks) ? webhooks : []).map((wh: any) => (
              <div key={wh.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">{wh.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-[400px]">{wh.url}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {(wh.events || []).map((ev: string) => (
                      <span key={ev} className="px-2 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{ev}</span>
                    ))}
                    {wh.lastDeliveredAt && <span className="text-xs text-gray-600">Last: {formatRelativeTime(wh.lastDeliveredAt)}</span>}
                  </div>
                </div>
                <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(wh.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
