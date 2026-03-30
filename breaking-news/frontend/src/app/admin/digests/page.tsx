"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const FREQUENCIES = ["HOURLY", "TWICE_DAILY", "DAILY", "WEEKLY"];

export default function DigestsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formFreq, setFormFreq] = useState("DAILY");

  const { data, isLoading } = useQuery({
    queryKey: ["digests"],
    queryFn: () => apiFetch<any>("/api/v1/admin/digests", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/digests", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["digests"] }); setShowForm(false); setFormEmail(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/digests/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["digests"] }),
  });

  const subs = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Mail className="w-6 h-6 text-blue-400" /> Email Digests</h1>
            <p className="text-sm text-gray-500 mt-1">Automated email summaries of top stories delivered on a schedule.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Subscription</button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Digest</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Email *</label><input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="editor@newsroom.com" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Frequency</label>
                <select value={formFreq} onChange={(e) => setFormFreq(e.target.value)} className="filter-select w-full">
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => createMutation.mutate({ email: formEmail.trim(), frequency: formFreq })} disabled={!formEmail.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm rounded-lg", !formEmail.trim() && "opacity-50")}>Subscribe</button>
          </div>
        )}

        {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading...</div>) : subs.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3"><Mail className="w-10 h-10 text-gray-600 mx-auto" /><p className="text-gray-400">No digest subscriptions.</p></div>
        ) : (
          <div className="glass-card divide-y divide-surface-300/30">
            {subs.map((sub: any) => (
              <div key={sub.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-sm text-white">{sub.email}</div>
                  <div className="text-xs text-gray-500">{sub.frequency.replace("_", " ")} &middot; {sub.timezone} {sub.lastSentAt && `&middot; Last: ${formatRelativeTime(sub.lastSentAt)}`}</div>
                </div>
                <button onClick={() => { if (confirm("Remove?")) deleteMutation.mutate(sub.id); }} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
