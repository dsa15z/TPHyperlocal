"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Zap } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

export function PredictionBadge({ storyId }: { storyId: string }) {
  const { data } = useQuery({
    queryKey: ["predictions", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/predictions`),
    staleTime: 60_000,
  });

  const predictions = data?.data || [];
  const latest = predictions[0];
  if (!latest) return null;

  const prob = Math.round(latest.viralProbability * 100);
  const factors = (latest.factors || {}) as Record<string, number>;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          Viral Prediction
        </h3>
        <div className="flex items-center gap-2">
          <span className={clsx(
            "text-2xl font-bold tabular-nums",
            prob >= 70 ? "text-red-400" :
            prob >= 50 ? "text-orange-400" :
            prob >= 30 ? "text-yellow-400" : "text-gray-400"
          )}>
            {prob}%
          </span>
          {latest.predictedStatus && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <Zap className="w-3 h-3" />
              {latest.predictedStatus.replace("_", " ")}
            </span>
          )}
        </div>
      </div>

      {/* Factor bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {Object.entries(factors).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-24 text-right truncate">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </span>
            <div className="flex-1 h-1.5 bg-surface-300 rounded-full overflow-hidden">
              <div
                className={clsx("h-full rounded-full",
                  val >= 0.7 ? "bg-green-500" : val >= 0.4 ? "bg-yellow-500" : "bg-gray-500"
                )}
                style={{ width: `${val * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-600 w-8 tabular-nums">{Math.round(val * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
