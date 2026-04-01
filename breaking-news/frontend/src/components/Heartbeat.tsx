"use client";

import { useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Silent component that pings the backend heartbeat every 5 minutes
 * while the UI is open. Workers check this to decide whether to poll.
 * Saves API costs by not running workers when no one is watching.
 */
export function Heartbeat() {
  useEffect(() => {
    const ping = () => {
      fetch(`${API_BASE}/api/v1/heartbeat`, { method: "POST" }).catch(() => {});
    };

    // Ping immediately on mount
    ping();

    // Then every 5 minutes
    const interval = setInterval(ping, HEARTBEAT_INTERVAL);

    // Also ping on visibility change (tab becomes visible)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null; // Renders nothing
}
