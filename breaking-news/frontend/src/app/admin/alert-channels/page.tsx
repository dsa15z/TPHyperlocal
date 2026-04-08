"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

interface AlertChannel {
  type: "slack" | "email" | "webhook";
  name: string;
  enabled: boolean;
  config: { webhookUrl?: string; to?: string[]; url?: string };
  filters?: { statuses?: string[]; minScore?: number };
}

export default function AlertChannelsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AlertChannel | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["alert-channels"],
    queryFn: () => apiFetch<any>("/api/v1/pipeline/alert-channels"),
  });
  const channels: AlertChannel[] = (data as any)?.channels || [];

  const saveMutation = useMutation({
    mutationFn: (chs: AlertChannel[]) => apiFetch("/api/v1/pipeline/alert-channels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: chs }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alert-channels"] }); setEditing(null); },
  });

  const testMutation = useMutation({
    mutationFn: () => apiFetch("/api/v1/pipeline/test-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  });

  const addChannel = () => { setEditing({ type: "slack", name: "", enabled: true, config: {}, filters: {} }); setIsNew(true); };
  const saveChannel = () => { if (!editing?.name) return; saveMutation.mutate(isNew ? [...channels, editing] : channels.map(c => c.name === editing.name ? editing : c)); };
  const deleteChannel = (name: string) => { if (confirm("Delete?" )) saveMutation.mutate(channels.filter(c => c.name !== name)); };
  const toggleChannel = (name: string) => { saveMutation.mutate(channels.map(c => c.name === name ? { ...c, enabled: !c.enabled } : c)); };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Bell className="w-6 h-6 text-yellow-400" />Alert Channels</h1>
          <div className="flex gap-2">
            <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="flex items-center gap-1.5 px-3 py-2 border border-cyan-500/40 text-cyan-300 text-sm rounded-lg hover:bg-cyan-500/10">{testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test All"}</button>
            <button onClick={addChannel} className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Channel</button>
          </div>
        </div>
        {testMutation.isSuccess && <div className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Test alert sent</div>}
        {channels.length === 0 && !isLoading && <div className="glass-card p-12 text-center"><Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">No alert channels. Add Slack, email, or webhook.</p></div>}
        <div className="space-y-3">{channels.map((ch, i) => (
          <div key={i} className={clsx("glass-card p-4 flex items-center justify-between", !ch.enabled && "opacity-50")}>
            <div><div className="text-sm font-medium text-white">{ch.name}</div><div className="text-xs text-gray-500">{ch.type} {ch.type === "slack" ? (ch.config.webhookUrl ? "configured" : "no URL") : ch.type === "email" ? (ch.config.to?.join(", ") || "no emails") : (ch.config.url || "no URL")}</div></div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleChannel(ch.name)} className={clsx("px-2 py-1 rounded text-xs", ch.enabled ? "text-green-400 bg-green-500/10" : "text-gray-500")}>{ch.enabled ? "On" : "Off"}</button>
              <button onClick={() => { setEditing({...ch}); setIsNew(false); }} className="text-gray-400 hover:text-white text-sm">Edit</button>
              <button onClick={() => deleteChannel(ch.name)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}</div>
        {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(null)}><div className="bg-surface-100 border border-surface-300 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-white">{isNew ? "Add" : "Edit"} Channel</h2>
          <div className="grid grid-cols-3 gap-2">{(["slack","email","webhook"] as const).map(t => <button key={t} onClick={() => setEditing({...editing, type: t})} className={clsx("px-3 py-2 rounded-lg border text-sm capitalize", editing.type === t ? "border-accent text-accent" : "border-surface-300 text-gray-400")}>{t}</button>)}</div>
          <div><label className="block text-xs text-gray-400 mb-1">Name</label><input value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} className="w-full px-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-200" /></div>
          {editing.type === "slack" && <div><label className="block text-xs text-gray-400 mb-1">Slack Webhook URL</label><input value={editing.config.webhookUrl || ""} onChange={e => setEditing({...editing, config: {...editing.config, webhookUrl: e.target.value}})} placeholder="https://hooks.slack.com/..." className="w-full px-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-200" /></div>}
          {editing.type === "email" && <div><label className="block text-xs text-gray-400 mb-1">Emails (comma-sep)</label><input value={(editing.config.to||[]).join(", ")} onChange={e => setEditing({...editing, config: {...editing.config, to: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})} className="w-full px-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-200" /></div>}
          {editing.type === "webhook" && <div><label className="block text-xs text-gray-400 mb-1">Webhook URL</label><input value={editing.config.url || ""} onChange={e => setEditing({...editing, config: {...editing.config, url: e.target.value}})} className="w-full px-3 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-200" /></div>}
          <div className="flex gap-2 pt-2"><button onClick={saveChannel} disabled={saveMutation.isPending} className="px-4 py-2 bg-accent text-white text-sm rounded-lg">{saveMutation.isPending ? "Saving..." : "Save"}</button><button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-400 text-sm">Cancel</button></div>
        </div></div>}
      </main>
    </div>
  );
}
