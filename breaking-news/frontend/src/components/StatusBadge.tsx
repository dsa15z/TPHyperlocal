"use client";

import clsx from "clsx";
import {
  Zap,
  TrendingUp,
  Radio,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  RotateCw,
  Archive,
} from "lucide-react";

interface StatusBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; bg: string; text: string; border: string }
> = {
  ALERT: {
    icon: <AlertTriangle className="w-3 h-3" />,
    bg: "bg-red-600/20",
    text: "text-red-300",
    border: "border-red-500/40",
  },
  BREAKING: {
    icon: <Zap className="w-3 h-3" />,
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  DEVELOPING: {
    icon: <ArrowUpRight className="w-3 h-3" />,
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  TOP_STORY: {
    icon: <TrendingUp className="w-3 h-3" />,
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  ONGOING: {
    icon: <Radio className="w-3 h-3" />,
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  FOLLOW_UP: {
    icon: <RotateCw className="w-3 h-3" />,
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
  },
  STALE: {
    icon: <Clock className="w-3 h-3" />,
    bg: "bg-gray-500/15",
    text: "text-gray-400",
    border: "border-gray-500/30",
  },
  ARCHIVED: {
    icon: <Archive className="w-3 h-3" />,
    bg: "bg-gray-600/15",
    text: "text-gray-500",
    border: "border-gray-600/30",
  },
};

const DEFAULT_CONFIG = {
  icon: null,
  bg: "bg-gray-500/15",
  text: "text-gray-400",
  border: "border-gray-500/30",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status.toUpperCase()] || DEFAULT_CONFIG;

  return (
    <span
      className={clsx(
        "status-badge",
        config.bg,
        config.text,
        "border",
        config.border
      )}
    >
      {config.icon}
      {status.replace("_", " ")}
    </span>
  );
}
