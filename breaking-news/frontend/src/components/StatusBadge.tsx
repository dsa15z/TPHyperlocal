"use client";

import clsx from "clsx";
import { getStatusColor } from "@/lib/utils";
import { Zap, TrendingUp, Radio, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  BREAKING: <Zap className="w-3 h-3" />,
  TRENDING: <TrendingUp className="w-3 h-3" />,
  ACTIVE: <Radio className="w-3 h-3" />,
  STALE: <Clock className="w-3 h-3" />,
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = getStatusColor(status);
  const icon = statusIcons[status.toUpperCase()];

  return (
    <span
      className={clsx(
        "status-badge",
        colors.bg,
        colors.text,
        "border",
        colors.border
      )}
    >
      {icon}
      {status}
    </span>
  );
}
