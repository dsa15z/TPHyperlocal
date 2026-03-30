"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, X, Zap, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);

  const loggedIn = isAuthenticated();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<any>("/api/v1/notifications", { headers: getAuthHeaders() }),
    enabled: loggedIn,
    refetchInterval: 30_000,
  });

  if (!loggedIn) return null;

  const notifications = data?.data || [];
  const unreadCount = notifications.filter((n: any) => !n.sentAt || Date.now() - new Date(n.createdAt).getTime() < 3600000).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl w-[360px] max-h-[480px] overflow-y-auto animate-in">
            <div className="sticky top-0 bg-surface-100 border-b border-surface-300/50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n: any) => (
                <Link
                  key={n.id}
                  href={`/stories/${n.storyId}`}
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-3 hover:bg-surface-200/50 border-b border-surface-300/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      "mt-0.5 p-1 rounded",
                      n.type?.includes("ALERT") ? "bg-red-500/15 text-red-400" :
                      n.type?.includes("BREAKING") ? "bg-orange-500/15 text-orange-400" :
                      "bg-blue-500/15 text-blue-400"
                    )}>
                      {n.type?.includes("ALERT") ? <AlertTriangle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 line-clamp-2">{n.story?.title || "Story update"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">{n.type?.replace("_ALERT", "")}</span>
                        <span className="text-[10px] text-gray-600">{formatRelativeTime(n.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
