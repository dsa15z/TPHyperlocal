"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2, Tag, Flag, UserCheck } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  NOTE: { icon: <MessageSquare className="w-3 h-3" />, color: "text-blue-400" },
  TAG: { icon: <Tag className="w-3 h-3" />, color: "text-green-400" },
  FLAG: { icon: <Flag className="w-3 h-3" />, color: "text-red-400" },
  ASSIGNMENT: { icon: <UserCheck className="w-3 h-3" />, color: "text-purple-400" },
};

export function AnnotationPanel({ storyId }: { storyId: string }) {
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("NOTE");
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["annotations", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/annotations`),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; content: string }) =>
      apiFetch<any>(`/api/v1/stories/${storyId}/annotations`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", storyId] });
      setNewContent("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (annotationId: string) =>
      apiFetch<void>(`/api/v1/stories/${storyId}/annotations/${annotationId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations", storyId] }),
  });

  const annotations = data?.data || [];
  const loggedIn = isAuthenticated();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-blue-400" />
        Editorial Notes ({annotations.length})
      </h2>

      {/* Add annotation */}
      {loggedIn && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            {(["NOTE", "TAG", "FLAG", "ASSIGNMENT"] as const).map((type) => {
              const config = TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  onClick={() => setNewType(type)}
                  className={clsx(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    newType === type
                      ? "bg-surface-300 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  )}
                >
                  {config.icon}
                  {type}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newContent.trim()) {
                  createMutation.mutate({ type: newType, content: newContent.trim() });
                }
              }}
              placeholder="Add a note, tag, or flag..."
              className="filter-input flex-1"
            />
            <button
              onClick={() => {
                if (newContent.trim()) {
                  createMutation.mutate({ type: newType, content: newContent.trim() });
                }
              }}
              disabled={!newContent.trim() || createMutation.isPending}
              className="px-3 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Annotations list */}
      {annotations.length === 0 ? (
        <div className="text-sm text-gray-500">No editorial notes yet.</div>
      ) : (
        <div className="space-y-2">
          {annotations.map((a: any) => {
            const config = TYPE_CONFIG[a.type] || TYPE_CONFIG.NOTE;
            return (
              <div key={a.id} className="glass-card p-3 flex items-start gap-3">
                <div className={clsx("mt-0.5", config.color)}>{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">{a.content}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600">
                    <span className={config.color}>{a.type}</span>
                    <span>{formatRelativeTime(a.createdAt)}</span>
                  </div>
                </div>
                {loggedIn && (
                  <button
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="text-gray-600 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
