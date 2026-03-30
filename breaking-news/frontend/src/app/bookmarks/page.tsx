"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

export default function BookmarksPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: () =>
      apiFetch<any>("/api/v1/bookmarks", { headers: getAuthHeaders() }),
  });

  const deleteMutation = useMutation({
    mutationFn: (storyId: string) =>
      apiFetch<void>(`/api/v1/bookmarks/${storyId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const bookmarks = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Bookmark className="w-6 h-6 text-yellow-400" />
          Bookmarks
        </h1>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
        ) : bookmarks.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Bookmark className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No bookmarks yet.</p>
            <p className="text-gray-600 text-sm">
              Click the bookmark icon on any story to save it here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((bm: any) => (
              <div key={bm.id} className="glass-card p-4 flex items-center justify-between animate-in">
                <div className="flex items-center gap-4 min-w-0">
                  <StatusBadge status={bm.story?.status || "STALE"} />
                  <div className="min-w-0">
                    <Link
                      href={`/stories/${bm.storyId}`}
                      className="text-white font-medium hover:text-accent truncate block"
                    >
                      {bm.story?.title || "Untitled"}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span>{bm.story?.category || "Unknown"}</span>
                      <span>Score: {Math.round((bm.story?.compositeScore || 0) * 100)}%</span>
                      <span>Saved {formatRelativeTime(bm.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/stories/${bm.storyId}`}
                    className="filter-btn text-xs flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> View
                  </Link>
                  <button
                    onClick={() => deleteMutation.mutate(bm.storyId)}
                    className="filter-btn text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
