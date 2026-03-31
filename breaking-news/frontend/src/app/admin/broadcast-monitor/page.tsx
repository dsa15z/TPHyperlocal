"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle,
  Trophy,
  BarChart3,
  Users,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { PageTabBar, COMPETITION_TABS } from "@/components/PageTabBar";

interface Competitor {
  id: string;
  name: string;
  stationCall: string;
  feedUrl: string;
  storiesDetected: number;
  overlapRate: number;
  isActive: boolean;
}

interface DashboardData {
  competitorExclusives: { id: string; title: string; competitor: string; detectedAt: string }[];
  ourExclusives: { id: string; title: string; detectedAt: string }[];
  sharedCoverage: number;
  competitorActivity: number;
  beatScore: number;
  summary: string;
}

interface TimelineEntry {
  hour: string;
  competitor: number;
  ours: number;
}

export default function BroadcastMonitorPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCall, setFormCall] = useState("");
  const [formUrl, setFormUrl] = useState("");

  const { data: competitorsRaw, isLoading: competitorsLoading } = useQuery({
    queryKey: ["broadcast-competitors"],
    queryFn: () =>
      apiFetch<any>("/api/v1/broadcast-monitor/competitors", {
        headers: getAuthHeaders(),
      }),
  });
  const competitors: Competitor[] = competitorsRaw?.data || competitorsRaw || [];

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["broadcast-dashboard"],
    queryFn: () =>
      apiFetch<DashboardData>("/api/v1/broadcast-monitor/dashboard", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 60000,
  });

  const { data: timelineRaw } = useQuery({
    queryKey: ["broadcast-timeline"],
    queryFn: () =>
      apiFetch<any>("/api/v1/broadcast-monitor/timeline", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 60000,
  });
  const timeline: TimelineEntry[] = timelineRaw?.data || timelineRaw || [];

  const addMutation = useMutation({
    mutationFn: (d: { name: string; stationCall: string; feedUrl: string }) =>
      apiFetch<any>("/api/v1/broadcast-monitor/competitors", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(d),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-competitors"] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-dashboard"] });
      setShowForm(false);
      setFormName("");
      setFormCall("");
      setFormUrl("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/v1/broadcast-monitor/competitors/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-competitors"] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-dashboard"] });
    },
  });

  const beatScore = dashboard?.beatScore ?? 0;
  const maxTimeline = Math.max(
    1,
    ...timeline.map((t) => Math.max(t.competitor, t.ours))
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Radio className="w-6 h-6 text-red-400" />
              Broadcast Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Track competitor coverage and measure your beat score.
            </p>
          </div>
        </div>
        <PageTabBar tabs={COMPETITION_TABS} />
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Competitor
          </button>
        </div>

        {/* Add Competitor Form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Add Competitor Feed
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Station Call Sign *
                </label>
                <input
                  type="text"
                  value={formCall}
                  onChange={(e) => setFormCall(e.target.value)}
                  placeholder="KHOU"
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Station Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="KHOU 11 News"
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  RSS Feed URL *
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://www.khou.com/feeds/syndication/rss/news"
                  className="filter-input w-full"
                />
              </div>
            </div>
            <button
              onClick={() =>
                addMutation.mutate({
                  name: formName.trim(),
                  stationCall: formCall.trim(),
                  feedUrl: formUrl.trim(),
                })
              }
              disabled={
                !formName.trim() ||
                !formCall.trim() ||
                !formUrl.trim() ||
                addMutation.isPending
              }
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                (!formName.trim() || !formCall.trim() || !formUrl.trim()) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {addMutation.isPending ? "Adding..." : "Add Competitor"}
            </button>
          </div>
        )}

        {/* Score + Summary Cards */}
        {dashLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading dashboard...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Beat Score - Prominent */}
              <div className="glass-card p-6 md:col-span-1 flex flex-col items-center justify-center animate-in">
                <Trophy className="w-8 h-8 text-yellow-400 mb-2" />
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Beat Score
                </p>
                <p
                  className={clsx(
                    "text-5xl font-black",
                    beatScore >= 70
                      ? "text-green-400"
                      : beatScore >= 40
                      ? "text-yellow-400"
                      : "text-red-400"
                  )}
                >
                  {beatScore}%
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  Stories we detected first
                </p>
              </div>

              {/* Summary Cards */}
              <div className="glass-card p-6 animate-in">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Their Exclusives
                  </p>
                </div>
                <p className="text-3xl font-bold text-red-400">
                  {dashboard?.competitorExclusives?.length ?? 0}
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  Stories they have that we don&apos;t
                </p>
              </div>

              <div className="glass-card p-6 animate-in">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Our Exclusives
                  </p>
                </div>
                <p className="text-3xl font-bold text-green-400">
                  {dashboard?.ourExclusives?.length ?? 0}
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  Stories we have that they don&apos;t
                </p>
              </div>

              <div className="glass-card p-6 animate-in">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Shared Coverage
                  </p>
                </div>
                <p className="text-3xl font-bold text-blue-400">
                  {dashboard?.sharedCoverage ?? 0}
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  Stories covered by both sides
                </p>
              </div>
            </div>

            {/* Competitor Exclusives */}
            {(dashboard?.competitorExclusives?.length ?? 0) > 0 && (
              <div className="animate-in">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Competitor Exclusives
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboard!.competitorExclusives.map((story) => (
                    <div
                      key={story.id}
                      className="glass-card p-4 border border-red-500/30 bg-red-500/5"
                    >
                      <h3 className="text-white font-medium text-sm">
                        {story.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-red-400 font-medium">
                          {story.competitor}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {new Date(story.detectedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Our Exclusives */}
            {(dashboard?.ourExclusives?.length ?? 0) > 0 && (
              <div className="animate-in">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  Our Exclusives
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboard!.ourExclusives.map((story) => (
                    <div
                      key={story.id}
                      className="glass-card p-4 border border-green-500/30 bg-green-500/5"
                    >
                      <h3 className="text-white font-medium text-sm">
                        {story.title}
                      </h3>
                      <span className="text-[10px] text-gray-600 mt-2 block">
                        {new Date(story.detectedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="glass-card p-6 animate-in">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-400" />
              Hourly Activity Timeline
            </h2>
            <div className="flex items-center gap-4 mb-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-400/80" />
                Competitor
              </span>
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="w-3 h-3 rounded bg-cyan-400/80" />
                Ours
              </span>
            </div>
            <div className="flex items-end gap-1 h-40">
              {timeline.map((entry, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-0.5 justify-end h-full"
                >
                  <div className="w-full flex gap-0.5 justify-center items-end flex-1">
                    <div
                      className="w-[45%] bg-red-400/80 rounded-t"
                      style={{
                        height: `${(entry.competitor / maxTimeline) * 100}%`,
                        minHeight: entry.competitor > 0 ? "4px" : "0px",
                      }}
                    />
                    <div
                      className="w-[45%] bg-cyan-400/80 rounded-t"
                      style={{
                        height: `${(entry.ours / maxTimeline) * 100}%`,
                        minHeight: entry.ours > 0 ? "4px" : "0px",
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-600 mt-1">
                    {entry.hour}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Competitor Table */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">
              Competitor Feeds
            </h2>
          </div>
          {competitorsLoading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : competitors.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Radio className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-gray-400">No competitors configured.</p>
              <p className="text-gray-600 text-sm">
                Add competitor RSS feeds to start tracking their coverage.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Call Sign
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Stories Detected
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Overlap Rate
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((comp) => (
                    <tr
                      key={comp.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface-300/50 text-gray-300 font-mono">
                          {comp.stationCall}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {comp.name}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {comp.storiesDetected ?? 0}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {((comp.overlapRate ?? 0) * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (confirm("Remove this competitor feed?"))
                              deleteMutation.mutate(comp.id);
                          }}
                          className="filter-btn text-gray-500 hover:text-red-400"
                          title="Remove competitor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
