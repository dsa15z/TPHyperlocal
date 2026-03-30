"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Circle, Save, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";

export function CollaborativeEditor({ storyId, initialTitle, initialSummary }: {
  storyId: string;
  initialTitle: string;
  initialSummary: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [joined, setJoined] = useState(false);
  const loggedIn = isAuthenticated();

  // Track who else is editing
  const { data: editorsData } = useQuery({
    queryKey: ["story-editors", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/editors`),
    refetchInterval: joined ? 5_000 : false,
    enabled: loggedIn,
  });

  const editors = editorsData?.data || [];

  // Join editing session
  const joinMutation = useMutation({
    mutationFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/editors/join`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }),
    onSuccess: () => setJoined(true),
  });

  // Send heartbeat
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => {
      apiFetch(`/api/v1/stories/${storyId}/editors/heartbeat`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }).catch(() => {});
    }, 30000);
    return () => {
      clearInterval(interval);
      apiFetch(`/api/v1/stories/${storyId}/editors/leave`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }).catch(() => {});
    };
  }, [joined, storyId]);

  // Save edits
  const saveMutation = useMutation({
    mutationFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/collaborative-edit`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ editedTitle: title, editedSummary: summary }),
    }),
  });

  if (!loggedIn) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" />
          Collaborative Editor
        </h2>
        <div className="flex items-center gap-3">
          {editors.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {editors.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  <Circle className="w-2 h-2 fill-green-400 text-green-400" />
                  <span>{e.userId.substring(0, 6)}</span>
                </div>
              ))}
              <span>editing</span>
            </div>
          )}
          {!joined ? (
            <button onClick={() => joinMutation.mutate()} className="filter-btn text-xs flex items-center gap-1">
              <Users className="w-3 h-3" /> Join Editing
            </button>
          ) : (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded-lg flex items-center gap-1"
            >
              {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          )}
        </div>
      </div>

      {joined && (
        <div className="glass-card p-4 space-y-3 animate-in">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="filter-input w-full text-lg font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="filter-input w-full h-32 resize-y"
            />
          </div>
          {saveMutation.isSuccess && <p className="text-xs text-green-400">Changes saved and broadcast to other editors.</p>}
        </div>
      )}
    </section>
  );
}
