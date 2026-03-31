"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  MapPin,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Database,
  Globe,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const DATA_SOURCES = [
  "Google News",
  "Reddit",
  "TikTok",
  "X / Twitter",
  "Facebook",
  "YouTube",
  "Nextdoor",
  "Citizen App",
  "Ring / Neighbors",
  "Telegram",
  "Local RSS",
  "GDELT",
];

interface IntelStatus {
  configured: boolean;
  sources: number;
  markets: number;
}

interface Market {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

export default function HyperlocalIntelPage() {
  const [lookupResults, setLookupResults] = useState<Record<string, string>>({});

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["hyperlocal-intel-status"],
    queryFn: () =>
      apiFetch<IntelStatus>("/api/v1/hyperlocal-intel/status", {
        headers: getAuthHeaders(),
      }),
  });

  const { data: marketsRaw } = useQuery({
    queryKey: ["admin-markets"],
    queryFn: () =>
      apiFetch<any>("/api/v1/admin/markets", { headers: getAuthHeaders() }),
  });
  const markets: Market[] = Array.isArray(marketsRaw)
    ? marketsRaw
    : (marketsRaw as any)?.data || [];

  const { data: recentPosts } = useQuery({
    queryKey: ["hyperlocal-recent"],
    queryFn: () =>
      apiFetch<any>("/api/v1/stories?limit=10&sort=firstSeenAt&order=desc", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 30000,
  });

  const lookupMutation = useMutation({
    mutationFn: (marketId: string) =>
      apiFetch<any>("/api/v1/hyperlocal-intel/lookup", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ marketId }),
      }),
    onSuccess: (_data, marketId) => {
      setLookupResults((prev) => ({ ...prev, [marketId]: "success" }));
    },
    onError: (_err, marketId) => {
      setLookupResults((prev) => ({ ...prev, [marketId]: "error" }));
    },
  });

  const batchMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>("/api/v1/hyperlocal-intel/batch", {
        method: "POST",
        headers: getAuthHeaders(),
      }),
  });

  const stories = recentPosts?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <MapPin className="w-6 h-6 text-cyan-400" />
              HyperLocal Intel
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Multi-source local intelligence aggregation across all markets.
            </p>
          </div>
          <button
            onClick={() => batchMutation.mutate()}
            disabled={batchMutation.isPending}
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
              batchMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw
              className={clsx("w-4 h-4", batchMutation.isPending && "animate-spin")}
            />
            {batchMutation.isPending ? "Running..." : "Run Batch for All Markets"}
          </button>
        </div>

        {batchMutation.isSuccess && (
          <div className="glass-card p-3 border border-green-500/30 text-green-400 text-sm animate-in">
            Batch lookup completed successfully for all markets.
          </div>
        )}
        {batchMutation.isError && (
          <div className="glass-card p-3 border border-red-500/30 text-red-400 text-sm animate-in">
            Batch lookup failed. Check backend logs for details.
          </div>
        )}

        {/* Status Card */}
        <div className="glass-card p-6 animate-in">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-gray-400" />
            System Status
          </h2>
          {statusLoading ? (
            <p className="text-gray-500">Loading status...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-300/30 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  Configured
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {status?.configured ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className="text-white font-semibold">
                    {status?.configured ? "Yes" : "No"}
                  </span>
                </div>
              </div>
              <div className="bg-surface-300/30 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  Sources
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {status?.sources ?? 0}
                </p>
              </div>
              <div className="bg-surface-300/30 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  Markets
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {status?.markets ?? 0}
                </p>
              </div>
              <div className="bg-surface-300/30 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  API Endpoint
                </p>
                <p className="text-xs text-cyan-400 font-mono mt-2 truncate">
                  /api/v1/hyperlocal-intel
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Data Source Badges */}
        <div className="glass-card p-6 animate-in">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-gray-400" />
            Data Sources
          </h2>
          <div className="flex flex-wrap gap-2">
            {DATA_SOURCES.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-300/50 text-gray-300 border border-surface-300/60"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                {source}
              </span>
            ))}
          </div>
        </div>

        {/* Markets List */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">Markets</h2>
          </div>
          {markets.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No markets configured. Add markets in the Markets admin page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Market
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      State
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Coordinates
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => (
                    <tr
                      key={market.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">
                        {market.name}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {market.state || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {market.latitude.toFixed(4)}, {market.longitude.toFixed(4)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 text-xs",
                            market.isActive ? "text-green-400" : "text-gray-500"
                          )}
                        >
                          <span
                            className={clsx(
                              "w-2 h-2 rounded-full",
                              market.isActive ? "bg-green-400" : "bg-gray-500"
                            )}
                          />
                          {market.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => lookupMutation.mutate(market.id)}
                          disabled={lookupMutation.isPending}
                          className="filter-btn inline-flex items-center gap-1 text-xs"
                        >
                          <Play className="w-3 h-3" />
                          Trigger Lookup
                        </button>
                        {lookupResults[market.id] === "success" && (
                          <span className="ml-2 text-green-400 text-xs">Done</span>
                        )}
                        {lookupResults[market.id] === "error" && (
                          <span className="ml-2 text-red-400 text-xs">Failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Results Feed */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">Recent Intel Feed</h2>
            <p className="text-xs text-gray-500 mt-1">
              Latest source posts ingested across all markets
            </p>
          </div>
          {stories.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No recent intel results. Trigger a lookup to get started.
            </div>
          ) : (
            <div className="divide-y divide-surface-300/30">
              {stories.map((story: any) => (
                <div
                  key={story.id}
                  className="px-6 py-4 hover:bg-surface-300/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-medium text-sm truncate">
                        {story.editedTitle || story.title}
                      </h3>
                      <p className="text-gray-500 text-xs mt-1 line-clamp-2">
                        {story.aiSummary || story.summary || ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">
                        {story.status}
                      </span>
                      <span className="text-xs text-cyan-400 font-mono">
                        {(story.compositeScore ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-gray-600">
                      {story.category || "Unknown"}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {story._count?.storySources ?? story.sourceCount ?? 0} sources
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {story.firstSeenAt
                        ? new Date(story.firstSeenAt).toLocaleString()
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
