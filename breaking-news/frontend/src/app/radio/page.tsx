"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Play, Loader2, Clock, Calendar } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const FORMATS = ["NEWS", "TALK", "SPORTS", "WEATHER"];

export default function RadioPage() {
  const queryClient = useQueryClient();
  const [showName, setShowName] = useState("");
  const [format, setFormat] = useState("NEWS");
  const [duration, setDuration] = useState(120);
  const [storyCount, setStoryCount] = useState(5);

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["radio-scripts"],
    queryFn: () => apiFetch<any>("/api/v1/radio/scripts", { headers: getAuthHeaders() }),
  });

  const { data: history } = useQuery({
    queryKey: ["history-of-the-day"],
    queryFn: () => apiFetch<any>("/api/v1/radio/history-of-the-day"),
  });

  const generateMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/radio/generate", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["radio-scripts"] }),
  });

  const scriptList = scripts?.data || [];
  const historyEvents = history?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Radio className="w-6 h-6 text-pink-400" /> RadioGPT
        </h1>

        {/* Script generator */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Generate Radio Script</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="block text-xs text-gray-400 mb-1">Show Name *</label><input type="text" value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="Morning Drive News" className="filter-input w-full" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="filter-select w-full">
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">Duration: {duration}s</label><input type="range" min="30" max="300" step="30" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-accent mt-2" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Stories: {storyCount}</label><input type="range" min="1" max="10" value={storyCount} onChange={(e) => setStoryCount(Number(e.target.value))} className="w-full accent-accent mt-2" /></div>
          </div>
          <button onClick={() => generateMutation.mutate({ showName, format, durationSeconds: duration, storyCount })} disabled={!showName.trim() || generateMutation.isPending} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg flex items-center gap-2", (!showName.trim() || generateMutation.isPending) && "opacity-50")}>
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate Script
          </button>
          {generateMutation.isSuccess && <p className="text-xs text-green-400">{generateMutation.data?.message}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generated scripts */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Recent Scripts</h2>
            {isLoading ? (<div className="glass-card p-8 text-center text-gray-500">Loading...</div>) : scriptList.length === 0 ? (
              <div className="glass-card p-8 text-center text-gray-500">No scripts generated yet.</div>
            ) : (
              scriptList.map((s: any) => (
                <div key={s.id} className="glass-card p-4 space-y-2 animate-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{s.showName}</h3>
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{s.format}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />{s.duration}s &middot; {formatRelativeTime(s.createdAt)}
                    </div>
                  </div>
                  <pre className="text-sm text-gray-300 bg-surface-300/30 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{s.script}</pre>
                </div>
              ))
            )}
          </div>

          {/* History of the Day */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" /> History of the Day
            </h2>
            {historyEvents.length === 0 ? (
              <div className="glass-card p-8 text-center text-gray-500">No historical events for today.</div>
            ) : (
              historyEvents.map((ev: any) => (
                <div key={ev.id} className="glass-card p-4 animate-in">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{ev.year ? `${ev.year}: ` : ""}{ev.title}</h3>
                      <p className="text-sm text-gray-400 mt-1">{ev.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ev.category && <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{ev.category}</span>}
                      {ev.isLocal && <span className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400">Local</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
