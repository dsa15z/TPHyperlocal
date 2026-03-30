"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareMore, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const STATE_OPTIONS = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING"];

export default function SlackPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formChannel, setFormChannel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formStates, setFormStates] = useState<string[]>(["ALERT", "BREAKING"]);

  const { data, isLoading } = useQuery({
    queryKey: ["slack-integrations"],
    queryFn: () => apiFetch<any>("/api/v1/admin/slack", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/slack", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["slack-integrations"] }); setShowForm(false); setFormChannel(""); setFormUrl(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/slack/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["slack-integrations"] }),
  });

  const integrations = data?.data || [];
  const toggleState = (st: string) => setFormStates((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><MessageSquareMore className="w-6 h-6 text-purple-400" /> Slack Integrations</h1>
            <p className="text-sm text-gray-500 mt-1">Send breaking news alerts to Slack channels automatically.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Channel</button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Connect Slack Channel</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Channel Name *</label><input type="text" value={formChannel} onChange={(e) => setFormChannel(e.target.value)} placeholder="#breaking-news" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Webhook URL *</label><input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="filter-input w-full" /></div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Trigger on States</label>
              <div className="flex flex-wrap gap-2">
                {STATE_OPTIONS.map((st) => (<button key={st} onClick={() => toggleState(st)} className={clsx("filter-btn text-xs px-3 py-1.5", formStates.includes(st) && "filter-btn-active")}>{st.replace("_", " ")}</button>))}
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ channelId: formChannel.replace("#", ""), channelName: formChannel, webhookUrl: formUrl.trim(), states: formStates })} disabled={!formChannel.trim() || !formUrl.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm rounded-lg", (!formChannel.trim() || !formUrl.trim()) && "opacity-50")}>Connect</button>
          </div>
        )}

        {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading...</div>) : integrations.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3"><MessageSquareMore className="w-10 h-10 text-gray-600 mx-auto" /><p className="text-gray-400">No Slack channels connected.</p></div>
        ) : (
          <div className="space-y-3">
            {integrations.map((intg: any) => (
              <div key={intg.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">{intg.channelName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {(intg.states || []).map((st: string) => (<span key={st} className="px-2 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{st}</span>))}
                    <span className={clsx("text-xs", intg.isActive ? "text-green-400" : "text-gray-500")}>{intg.isActive ? "Active" : "Inactive"}</span>
                  </div>
                </div>
                <button onClick={() => { if (confirm("Remove?")) deleteMutation.mutate(intg.id); }} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
