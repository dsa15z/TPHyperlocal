"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/utils";

export default function RisingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["rising-stories"],
    queryFn: () => apiFetch<any>("/api/v1/stories/rising"),
    refetchInterval: 30_000,
  });

  const stories = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-amber-400" />
            Rising Stories
          </h1>
          <p className="text-sm text-gray-500 mt-1">Stories with the highest predicted viral probability. AI-scored based on velocity, diversity, engagement, and category patterns.</p>
        </div>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Analyzing story trajectories...</div>
        ) : stories.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <TrendingUp className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No rising stories detected.</p>
            <p className="text-gray-600 text-sm">Predictions are generated as stories develop. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stories.map((story: any, i: number) => {
              const prob = Math.round((story.viralProbability || 0) * 100);
              return (
                <div key={story.id} className="glass-card p-4 flex items-center gap-4 animate-in">
                  {/* Rank */}
                  <div className="text-center w-10 flex-shrink-0">
                    <span className="text-2xl font-bold text-gray-600">#{i + 1}</span>
                  </div>

                  {/* Probability gauge */}
                  <div className="w-16 flex-shrink-0 text-center">
                    <div className={clsx(
                      "text-xl font-bold tabular-nums",
                      prob >= 70 ? "text-red-400" :
                      prob >= 50 ? "text-orange-400" :
                      prob >= 30 ? "text-yellow-400" : "text-gray-400"
                    )}>
                      {prob}%
                    </div>
                    <div className="text-[10px] text-gray-600">viral</div>
                  </div>

                  {/* Story info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={story.status} />
                      {story.predictedStatus && story.predictedStatus !== story.status && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400">
                          <Zap className="w-3 h-3" />
                          predicted: {story.predictedStatus.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <Link href={`/stories/${story.id}`} className="text-white font-medium hover:text-accent transition-colors line-clamp-1">
                      {story.title}
                    </Link>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{story.category || "Unknown"}</span>
                      <span>Score: {Math.round((story.compositeScore || 0) * 100)}%</span>
                      <span>{story.sourceCount} sources</span>
                      <span>{formatRelativeTime(story.firstSeenAt)}</span>
                    </div>
                  </div>

                  {/* Factor bars */}
                  {story.factors && (
                    <div className="hidden lg:flex flex-col gap-1 w-32 flex-shrink-0">
                      {Object.entries(story.factors as Record<string, number>).slice(0, 4).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-[9px] text-gray-600 w-14 text-right truncate">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <div className="flex-1 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${(val as number) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
