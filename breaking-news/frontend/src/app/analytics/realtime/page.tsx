"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Users, Eye, Clock, Globe, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

export default function RealtimeAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-realtime"],
    queryFn: () => apiFetch<any>("/api/v1/analytics/realtime"),
    refetchInterval: 5000, // 5s refresh for real-time feel
  });

  const rt = data || {};

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400" />
            Real-Time Audience
          </h1>
          <div className="live-indicator">
            <span className="live-dot" />
            <span className="text-xs">LIVE</span>
          </div>
        </div>

        {/* Big numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 text-center">
            <Users className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <div className="text-3xl font-bold text-white tabular-nums">{rt.concurrentReaders ?? 0}</div>
            <div className="text-xs text-gray-500">Concurrent Readers</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Eye className="w-6 h-6 text-accent mx-auto mb-2" />
            <div className="text-3xl font-bold text-white tabular-nums">{rt.pageviewsPerMinute ?? 0}</div>
            <div className="text-xs text-gray-500">Views / Minute</div>
          </div>
          <div className="glass-card p-4 text-center">
            <BarChart3 className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <div className="text-3xl font-bold text-white tabular-nums">{rt.avgScrollDepth ?? 0}%</div>
            <div className="text-xs text-gray-500">Avg Scroll Depth</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Clock className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <div className="text-3xl font-bold text-white tabular-nums">{rt.avgTimeOnPage ?? 0}s</div>
            <div className="text-xs text-gray-500">Avg Time on Page</div>
          </div>
        </div>

        {/* Top stories by readers */}
        {(rt.topStories || []).length > 0 && (
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">Top Stories by Active Readers</h3>
            {(rt.topStories || []).map((s: any, i: number) => (
              <div key={s.storyId || i} className="flex items-center justify-between text-sm py-1 border-b border-surface-300/20 last:border-0">
                <span className="text-gray-300 truncate flex-1">{s.title || s.storyId}</span>
                <span className="text-green-400 font-mono text-xs ml-2">{s.readers} readers</span>
              </div>
            ))}
          </div>
        )}

        {/* Referrers */}
        {rt.referrerBreakdown && Object.keys(rt.referrerBreakdown).length > 0 && (
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Globe className="w-4 h-4" /> Top Referrers
            </h3>
            {Object.entries(rt.referrerBreakdown || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10).map(([ref, count]: any) => (
              <div key={ref} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 truncate">{ref || '(direct)'}</span>
                <span className="text-gray-300 font-mono text-xs">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Embed script instructions */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Embed Tracking Script</h3>
          <p className="text-xs text-gray-500">
            Add this script to your website to track real-time reader engagement:
          </p>
          <div className="bg-surface-300/30 rounded-lg p-3 font-mono text-xs text-gray-400 overflow-x-auto">
            {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/analytics/embed.js" async></script>`}
          </div>
        </div>

        {isLoading && (
          <div className="text-center text-gray-500 text-sm">Loading real-time data...</div>
        )}
      </main>
    </div>
  );
}
