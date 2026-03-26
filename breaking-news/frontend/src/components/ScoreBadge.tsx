"use client";

import clsx from "clsx";
import { formatScore, getScoreBarColor, getScoreColor } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  label?: string;
  showBar?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({
  score,
  label,
  showBar = true,
  size = "sm",
}: ScoreBadgeProps) {
  const barColor = getScoreBarColor(score);
  const textColor = getScoreColor(score);

  return (
    <div
      className={clsx("flex flex-col gap-1", {
        "min-w-[60px]": size === "sm",
        "min-w-[100px]": size === "md",
        "min-w-[140px]": size === "lg",
      })}
    >
      <div className="flex items-center justify-between gap-2">
        {label && (
          <span className="text-xs text-gray-500 font-medium">{label}</span>
        )}
        <span className={clsx("text-xs font-bold tabular-nums", textColor)}>
          {formatScore(score)}
        </span>
      </div>
      {showBar && (
        <div className="score-bar">
          <div
            className={clsx("score-bar-fill", barColor)}
            style={{ width: `${Math.min(score * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
