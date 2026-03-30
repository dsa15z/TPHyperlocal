"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network, ChevronRight } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

export default function TopicClustersPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["topic-clusters"],
    queryFn: () => apiFetch<any>("/api/v1/topic-clusters"),
    refetchInterval: 60_000,
  });

  const { data: clusterStories } = useQuery({
    queryKey: ["topic-cluster-stories", expandedId],
    queryFn: () => apiFetch<any>(`/api/v1/topic-clusters/${expandedId}/stories`),
    enabled: expandedId !== null,
  });

  const clusters = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Network className="w-6 h-6 text-violet-400" /> Topic Clusters
          </h1>
          <p className="text-sm text-gray-500 mt-1">Stories grouped by AI-detected topics. Click a cluster to see its stories.</p>
        </div>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading clusters...</div>
        ) : clusters.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Network className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No topic clusters detected yet.</p>
            <p className="text-gray-600 text-sm">Clusters form automatically as stories are processed by the pipeline.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clusters.map((cluster: any) => (
              <div key={cluster.id} className="glass-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === cluster.id ? null : cluster.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-200/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronRight className={clsx("w-4 h-4 text-gray-500 transition-transform", expandedId === cluster.id && "rotate-90")} />
                    <div className="text-left">
                      <h3 className="text-white font-semibold">{cluster.label}</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(cluster.keywords || []).slice(0, 5).map((kw: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-400">{kw}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-gray-400">{cluster.storyCount} stories</span>
                </button>

                {expandedId === cluster.id && (
                  <div className="border-t border-surface-300/30 p-4 space-y-2 animate-in">
                    {(clusterStories?.data || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No stories in this cluster.</p>
                    ) : (
                      (clusterStories?.data || []).map((story: any) => (
                        <div key={story.id} className="flex items-center gap-3 py-2 border-b border-surface-300/20 last:border-0">
                          <StatusBadge status={story.status} />
                          <Link href={`/stories/${story.id}`} className="text-sm text-gray-200 hover:text-accent truncate flex-1">{story.title}</Link>
                          <span className="text-xs text-gray-500 tabular-nums">{Math.round((story.compositeScore || 0) * 100)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
