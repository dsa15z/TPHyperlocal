"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Save, Loader2, Check } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const CHANNELS = ["push", "email", "slack"];
const STATES = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP"];

export default function NotificationPrefsPage() {
  const queryClient = useQueryClient();
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [minStates, setMinStates] = useState<string[]>(["ALERT", "BREAKING"]);
  const [minScore, setMinScore] = useState(0.5);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => apiFetch<any>("/api/v1/notifications/preferences", { headers: getAuthHeaders() }),
  });

  useEffect(() => {
    if (data?.data) {
      setChannels(data.data.channels || ["email"]);
      setMinStates(data.data.minStates || ["ALERT", "BREAKING"]);
      setMinScore(data.data.minScore || 0.5);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ channels, minStates, minScore }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const toggleChannel = (ch: string) =>
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  const toggleState = (st: string) =>
    setMinStates((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);

  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Bell className="w-6 h-6 text-yellow-400" /> Notification Preferences
        </h1>

        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Notification Channels</h2>
          <p className="text-sm text-gray-400">How do you want to receive alerts?</p>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((ch) => (
              <button key={ch} onClick={() => toggleChannel(ch)} className={clsx("filter-btn px-4 py-2 text-sm capitalize", channels.includes(ch) && "filter-btn-active")}>
                {ch}
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Alert on Story States</h2>
          <p className="text-sm text-gray-400">Which story states should trigger notifications?</p>
          <div className="flex flex-wrap gap-2">
            {STATES.map((st) => (
              <button key={st} onClick={() => toggleState(st)} className={clsx("filter-btn px-3 py-1.5 text-xs", minStates.includes(st) && "filter-btn-active")}>
                {st.replace("_", " ")}
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Minimum Score Threshold</h2>
          <p className="text-sm text-gray-400">Only alert for stories above this composite score.</p>
          <div className="flex items-center gap-4">
            <input type="range" min="0" max="1" step="0.05" value={minScore} onChange={(e) => setMinScore(parseFloat(e.target.value))} className="flex-1 accent-accent" />
            <span className="text-sm font-mono text-gray-300 w-12 text-right">{(minScore * 100).toFixed(0)}%</span>
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className={clsx("px-6 py-3 rounded-lg font-medium text-sm bg-accent hover:bg-accent-dim text-white", saveMutation.isPending && "opacity-60")}>
            {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Saving...</> : <><Save className="w-4 h-4 inline mr-2" />Save Preferences</>}
          </button>
          {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><Check className="w-4 h-4" /> Saved</span>}
        </div>
      </main>
    </div>
  );
}
