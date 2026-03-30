"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const DRAFT_TYPES = [
  { value: "summary", label: "Summary", desc: "2-3 sentence overview" },
  { value: "short_summary", label: "Short", desc: "1 sentence, 25 words" },
  { value: "rewrite", label: "Broadcast", desc: "60-sec read script" },
  { value: "tweet", label: "Tweet", desc: "280 chars + hashtags" },
  { value: "bullets", label: "Bullets", desc: "3-5 key facts" },
  { value: "idea_starter", label: "Ideas", desc: "Discussion angles" },
];

export function FirstDraftPanel({ storyId }: { storyId: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["first-drafts", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/first-drafts`),
    refetchInterval: 10_000,
  });

  const generateMutation = useMutation({
    mutationFn: (type: string) =>
      apiFetch<any>(`/api/v1/stories/${storyId}/first-drafts`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["first-drafts", storyId] });
    },
  });

  const drafts = data?.data || [];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          AI First Drafts
        </h2>
      </div>

      {/* Generate buttons */}
      <div className="flex flex-wrap gap-2">
        {DRAFT_TYPES.map((dt) => {
          const existing = drafts.find((d: any) => d.type === dt.value);
          return (
            <button
              key={dt.value}
              onClick={() => generateMutation.mutate(dt.value)}
              disabled={generateMutation.isPending}
              className={clsx(
                "px-3 py-2 rounded-lg border text-left text-xs transition-all",
                existing
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                  : "border-surface-300/50 bg-surface-200/30 text-gray-400 hover:border-surface-300 hover:text-white"
              )}
            >
              <div className="font-medium">{dt.label}</div>
              <div className="text-[10px] text-gray-500">{dt.desc}</div>
            </button>
          );
        })}
      </div>

      {generateMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-accent">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating...
        </div>
      )}

      {/* Generated drafts */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">
          Click a type above to generate AI content for this story.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft: any) => (
            <div key={draft.id} className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-400 font-medium">
                    {draft.type.replace("_", " ")}
                  </span>
                  <span className="text-xs text-gray-600">
                    {draft.model} &middot; {formatRelativeTime(draft.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(draft.content, draft.id)}
                    className="filter-btn text-xs flex items-center gap-1"
                  >
                    {copiedId === draft.id ? (
                      <><Check className="w-3 h-3 text-green-400" /> Copied</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy</>
                    )}
                  </button>
                  <button
                    onClick={() => generateMutation.mutate(draft.type)}
                    className="filter-btn text-xs"
                    title="Regenerate"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {draft.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
