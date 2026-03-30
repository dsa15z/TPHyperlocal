"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Check, X, Edit3 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/utils";

export default function EditorPage() {
  const queryClient = useQueryClient();

  // Fetch stories that need review (UNREVIEWED status)
  const { data, isLoading } = useQuery({
    queryKey: ["editor-queue"],
    queryFn: () => apiFetch<any>("/api/v1/stories?limit=50&sort=compositeScore&order=desc"),
    refetchInterval: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ storyId, action }: { storyId: string; action: string }) =>
      apiFetch<any>(`/api/v1/admin/editor/${storyId}/${action}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["editor-queue"] }),
  });

  const stories = data?.data || [];

  // Split into review groups
  const unreviewed = stories.filter((s: any) => s.reviewStatus === "UNREVIEWED" || !s.reviewStatus);
  const approved = stories.filter((s: any) => s.reviewStatus === "APPROVED");
  const rejected = stories.filter((s: any) => s.reviewStatus === "REJECTED");

  const storyRow = (story: any) => (
    <div key={story.id} className="flex items-center justify-between py-3 px-4 border-b border-surface-300/20 last:border-0 hover:bg-surface-200/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <StatusBadge status={story.status} />
        <div className="min-w-0">
          <Link href={`/stories/${story.id}`} className="text-sm text-white hover:text-accent truncate block">{story.title}</Link>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <span>{story.category || "Unknown"}</span>
            <span>{Math.round((story.compositeScore || 0) * 100)}%</span>
            <span>{formatRelativeTime(story.firstSeenAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={clsx("px-2 py-0.5 rounded text-[10px] font-medium",
          story.reviewStatus === "APPROVED" ? "bg-green-500/15 text-green-400" :
          story.reviewStatus === "REJECTED" ? "bg-red-500/15 text-red-400" :
          "bg-gray-500/15 text-gray-400"
        )}>
          {story.reviewStatus || "UNREVIEWED"}
        </span>
        {(!story.reviewStatus || story.reviewStatus === "UNREVIEWED") && (
          <>
            <button onClick={() => reviewMutation.mutate({ storyId: story.id, action: "approve" })} className="p-1.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors" title="Approve">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => reviewMutation.mutate({ storyId: story.id, action: "reject" })} className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Reject">
              <X className="w-4 h-4" />
            </button>
          </>
        )}
        <Link href={`/stories/${story.id}`} className="p-1.5 rounded bg-surface-300/30 text-gray-400 hover:text-white transition-colors" title="Edit">
          <Edit3 className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-green-400" /> Editor Review Queue
        </h1>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading stories...</div>
        ) : (
          <div className="space-y-6">
            {/* Needs review */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Needs Review ({unreviewed.length})</h2>
              {unreviewed.length === 0 ? (
                <div className="glass-card p-6 text-center text-sm text-gray-500">All caught up — no stories need review.</div>
              ) : (
                <div className="glass-card divide-y divide-surface-300/20">{unreviewed.slice(0, 20).map(storyRow)}</div>
              )}
            </div>

            {/* Recently approved */}
            {approved.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-green-400/60 uppercase tracking-wider mb-2">Approved ({approved.length})</h2>
                <div className="glass-card divide-y divide-surface-300/20">{approved.slice(0, 10).map(storyRow)}</div>
              </div>
            )}

            {/* Recently rejected */}
            {rejected.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-red-400/60 uppercase tracking-wider mb-2">Rejected ({rejected.length})</h2>
                <div className="glass-card divide-y divide-surface-300/20">{rejected.slice(0, 10).map(storyRow)}</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
