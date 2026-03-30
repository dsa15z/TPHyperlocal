"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ALERT: <AlertTriangle className="w-3 h-3" />,
  BREAKING: <Zap className="w-3 h-3" />,
  TOP_STORY: <TrendingUp className="w-3 h-3" />,
};

export function StoryTimeline({ storyId }: { storyId: string }) {
  const { data } = useQuery({
    queryKey: ["story-transitions", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/annotations`),
  });

  // Also fetch score snapshots for the sparkline
  const { data: storyData } = useQuery({
    queryKey: ["story-detail-timeline", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}`),
  });

  const story = storyData?.data;
  const snapshots = story?.scoreSnapshots || [];
  const annotations = data?.data || [];

  // Build combined timeline from score snapshots and annotations
  const timelineEvents: Array<{
    time: string;
    type: "score" | "annotation" | "source";
    label: string;
    detail: string;
    color: string;
  }> = [];

  // Add score snapshots
  for (const snap of snapshots.slice(0, 20)) {
    timelineEvents.push({
      time: snap.snapshotAt,
      type: "score",
      label: `Score: ${Math.round(snap.compositeScore * 100)}%`,
      detail: `Breaking: ${Math.round(snap.breakingScore * 100)}% | Trending: ${Math.round(snap.trendingScore * 100)}%`,
      color: snap.breakingScore > 0.5 ? "border-red-500" : snap.compositeScore > 0.5 ? "border-orange-500" : "border-blue-500",
    });
  }

  // Add annotations as timeline events
  for (const ann of annotations) {
    timelineEvents.push({
      time: ann.createdAt,
      type: "annotation",
      label: `${ann.type}: ${ann.content.substring(0, 50)}`,
      detail: "",
      color: ann.type === "FLAG" ? "border-red-500" : ann.type === "TAG" ? "border-green-500" : "border-blue-500",
    });
  }

  // Sort by time descending
  timelineEvents.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Score sparkline
  const sparklineData = snapshots
    .slice(0, 20)
    .reverse()
    .map((s: any) => s.compositeScore);

  const maxScore = Math.max(...sparklineData, 0.01);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <Clock className="w-5 h-5 text-cyan-400" />
        Story Development Timeline
      </h2>

      {/* Score sparkline */}
      {sparklineData.length > 1 && (
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-2">Composite Score Over Time</div>
          <div className="flex items-end gap-1 h-16">
            {sparklineData.map((score: number, i: number) => {
              const height = (score / maxScore) * 100;
              return (
                <div
                  key={i}
                  className={clsx(
                    "flex-1 rounded-t min-h-[2px] transition-all",
                    score > 0.7 ? "bg-red-500" :
                    score > 0.5 ? "bg-orange-500" :
                    score > 0.3 ? "bg-yellow-500" : "bg-blue-500"
                  )}
                  style={{ height: `${height}%` }}
                  title={`${Math.round(score * 100)}%`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-gray-600 mt-1">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </div>
      )}

      {/* Timeline events */}
      {timelineEvents.length === 0 ? (
        <div className="text-sm text-gray-500">No timeline events yet.</div>
      ) : (
        <div className="relative pl-6 space-y-3">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-surface-300" />
          {timelineEvents.slice(0, 15).map((event, i) => (
            <div key={i} className="relative flex items-start gap-4">
              <div className={clsx("absolute left-[-15px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-surface", event.color)} />
              <div className="flex-1 glass-card p-3">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(event.time)}
                  <span className={clsx(
                    "px-1.5 py-0.5 rounded text-[10px]",
                    event.type === "score" ? "bg-blue-500/10 text-blue-400" :
                    event.type === "annotation" ? "bg-purple-500/10 text-purple-400" :
                    "bg-green-500/10 text-green-400"
                  )}>
                    {event.type}
                  </span>
                </div>
                <p className="text-sm text-gray-300">{event.label}</p>
                {event.detail && <p className="text-xs text-gray-500 mt-0.5">{event.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
