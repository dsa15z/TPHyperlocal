import {
  formatDistanceToNowStrict,
  parseISO,
  differenceInMinutes,
} from "date-fns";

/**
 * Format a date string as relative time (e.g., "5m ago", "2h ago").
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = parseISO(dateString);
    const minutes = differenceInMinutes(new Date(), date);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;

    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * Format a 0-1 score as a display string.
 */
export function formatScore(score: number): string {
  return (score * 100).toFixed(0);
}

/**
 * Get a Tailwind color class for a 0-1 score value.
 * Gray (0) -> Green (0.3) -> Yellow (0.6) -> Red (1.0)
 */
export function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-red-400";
  if (score >= 0.6) return "text-yellow-400";
  if (score >= 0.3) return "text-green-400";
  return "text-gray-400";
}

/**
 * Get a Tailwind background color class for a 0-1 score value.
 */
export function getScoreBarColor(score: number): string {
  if (score >= 0.8) return "bg-red-500";
  if (score >= 0.6) return "bg-yellow-500";
  if (score >= 0.3) return "bg-green-500";
  return "bg-gray-500";
}

/**
 * Get a status badge CSS class.
 */
export function getStatusColor(
  status: string
): {
  bg: string;
  text: string;
  border: string;
  className: string;
} {
  const map: Record<string, { bg: string; text: string; border: string; className: string }> = {
    ALERT:     { bg: "bg-red-600/20", text: "text-red-300", border: "border-red-500/40", className: "status-breaking" },
    BREAKING:  { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", className: "status-breaking" },
    DEVELOPING:{ bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", className: "status-trending" },
    TOP_STORY: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", className: "status-trending" },
    ONGOING:   { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", className: "status-active" },
    FOLLOW_UP: { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30", className: "status-active" },
    STALE:     { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/30", className: "status-stale" },
    ARCHIVED:  { bg: "bg-gray-600/15", text: "text-gray-500", border: "border-gray-600/30", className: "status-stale" },
  };
  return map[status.toUpperCase()] || map.STALE;
}

/**
 * Get a specific score type color.
 */
export function getScoreTypeColor(
  type: "breaking" | "trending" | "confidence" | "locality"
): { bar: string; text: string; bg: string } {
  switch (type) {
    case "breaking":
      return { bar: "bg-red-500", text: "text-red-400", bg: "bg-red-500/12" };
    case "trending":
      return {
        bar: "bg-orange-500",
        text: "text-orange-400",
        bg: "bg-orange-500/12",
      };
    case "confidence":
      return {
        bar: "bg-green-500",
        text: "text-green-400",
        bg: "bg-green-500/12",
      };
    case "locality":
      return {
        bar: "bg-blue-500",
        text: "text-blue-400",
        bg: "bg-blue-500/12",
      };
  }
}
