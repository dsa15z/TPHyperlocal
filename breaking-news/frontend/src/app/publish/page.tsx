"use client";

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Tv,
  MessageSquare,
  Bell,
  Globe,
  CheckCircle,
  Pencil,
  Eye,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, PUBLISH_TABS } from "@/components/PageTabBar";

interface BreakingPackage {
  id: string;
  storyId: string;
  storyTitle: string;
  status: "PENDING" | "REVIEWED" | "PUBLISHED";
  category: string;
  createdAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
  broadcastScript: string;
  socialPost: string;
  pushTitle: string;
  pushBody: string;
  webSummary: string;
  publishedChannels: string[];
}

interface PublishStats {
  total: number;
  pending: number;
  reviewed: number;
  published: number;
}

type TabFilter = "ALL" | "PENDING" | "REVIEWED" | "PUBLISHED";

const CHANNELS = [
  { key: "broadcast", label: "Broadcast", icon: Tv },
  { key: "social", label: "Social", icon: MessageSquare },
  { key: "push", label: "Push", icon: Bell },
  { key: "web", label: "Web", icon: Globe },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  REVIEWED: { bg: "bg-blue-500/20", text: "text-blue-400" },
  PUBLISHED: { bg: "bg-green-500/20", text: "text-green-400" },
};

export default function PublishQueuePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabFilter>("ALL");
  const [selectedChannels, setSelectedChannels] = useState<
    Record<string, Set<ChannelKey>>
  >({});
  const [expandedSections, setExpandedSections] = useState<
    Record<string, Set<ChannelKey>>
  >({});
  const [editingPackage, setEditingPackage] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const { data: packagesData, isLoading } = useQuery({
    queryKey: ["publish-queue"],
    queryFn: () =>
      apiFetch<{ data: BreakingPackage[] }>("/api/v1/publish-queue", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 15_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["publish-stats"],
    queryFn: () =>
      apiFetch<{ data: PublishStats }>("/api/v1/publish-queue/stats", {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Record<string, string>;
    }) =>
      apiFetch<any>(`/api/v1/publish-queue/${id}/review`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish-queue"] });
      queryClient.invalidateQueries({ queryKey: ["publish-stats"] });
      setEditingPackage(null);
      setEditValues({});
    },
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, channels }: { id: string; channels: string[] }) =>
      apiFetch<any>(`/api/v1/publish-queue/${id}/publish`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ channels }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish-queue"] });
      queryClient.invalidateQueries({ queryKey: ["publish-stats"] });
    },
  });

  const packages = packagesData?.data || [];
  const stats = statsData?.data || { total: 0, pending: 0, reviewed: 0, published: 0 };

  const filtered =
    activeTab === "ALL"
      ? packages
      : packages.filter((p) => p.status === activeTab);

  function toggleChannel(pkgId: string, channel: ChannelKey) {
    setSelectedChannels((prev) => {
      const current = new Set(prev[pkgId] || []);
      if (current.has(channel)) {
        current.delete(channel);
      } else {
        current.add(channel);
      }
      return { ...prev, [pkgId]: current };
    });
  }

  function toggleSection(pkgId: string, channel: ChannelKey) {
    setExpandedSections((prev) => {
      const current = new Set(prev[pkgId] || []);
      if (current.has(channel)) {
        current.delete(channel);
      } else {
        current.add(channel);
      }
      return { ...prev, [pkgId]: current };
    });
  }

  function isChannelPublished(pkg: BreakingPackage, channel: ChannelKey): boolean {
    return (pkg.publishedChannels || []).includes(channel);
  }

  function startEditing(pkg: BreakingPackage) {
    setEditingPackage(pkg.id);
    setEditValues({
      broadcastScript: pkg.broadcastScript || "",
      socialPost: pkg.socialPost || "",
      pushTitle: pkg.pushTitle || "",
      pushBody: pkg.pushBody || "",
      webSummary: pkg.webSummary || "",
    });
  }

  function saveEdits(pkgId: string) {
    reviewMutation.mutate({ id: pkgId, updates: editValues });
  }

  function getChannelContent(
    pkg: BreakingPackage,
    channel: ChannelKey
  ): { label: string; content: string; editKey: string }[] {
    switch (channel) {
      case "broadcast":
        return [
          {
            label: "Script",
            content: pkg.broadcastScript || "No script generated",
            editKey: "broadcastScript",
          },
        ];
      case "social":
        return [
          {
            label: "Social Post",
            content: pkg.socialPost || "No social post generated",
            editKey: "socialPost",
          },
        ];
      case "push":
        return [
          {
            label: "Title",
            content: pkg.pushTitle || "No push title",
            editKey: "pushTitle",
          },
          {
            label: "Body",
            content: pkg.pushBody || "No push body",
            editKey: "pushBody",
          },
        ];
      case "web":
        return [
          {
            label: "Web Summary",
            content: pkg.webSummary || "No web summary generated",
            editKey: "webSummary",
          },
        ];
    }
  }

  const statCards = [
    {
      label: "Total Packages",
      value: stats.total,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Pending Review",
      value: stats.pending,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Reviewed",
      value: stats.reviewed,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Published",
      value: stats.published,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
  ];

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "PENDING", label: "Pending" },
    { key: "REVIEWED", label: "Reviewed" },
    { key: "PUBLISHED", label: "Published" },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Send className="w-6 h-6 text-purple-400" />
            Publish Queue
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review, edit, and publish breaking news packages across channels
          </p>
        </div>

        <PageTabBar tabs={PUBLISH_TABS} />

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading publish queue...
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className={clsx("glass-card p-4 text-center animate-in", card.bg)}
                >
                  <div className={clsx("text-2xl font-bold tabular-nums", card.color)}>
                    {card.value}
                  </div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Tab Filters */}
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    "filter-btn",
                    activeTab === tab.key && "filter-btn-active"
                  )}
                >
                  {tab.label}
                  {tab.key !== "ALL" && (
                    <span className="ml-1.5 text-xs opacity-70">
                      {tab.key === "PENDING"
                        ? stats.pending
                        : tab.key === "REVIEWED"
                        ? stats.reviewed
                        : stats.published}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Package Cards */}
            <div className="space-y-4">
              {filtered.length === 0 && (
                <div className="glass-card p-12 text-center text-gray-500">
                  No packages in this view
                </div>
              )}

              {filtered.map((pkg) => {
                const isEditing = editingPackage === pkg.id;
                const pkgChannels = selectedChannels[pkg.id] || new Set();
                const pkgExpanded = expandedSections[pkg.id] || new Set();
                const statusStyle =
                  STATUS_STYLES[pkg.status] || STATUS_STYLES.PENDING;

                return (
                  <div
                    key={pkg.id}
                    className="glass-card p-5 space-y-4 animate-in"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Link
                            href={`/stories/${pkg.storyId}`}
                            className="text-lg font-semibold text-white hover:text-blue-400 transition-colors"
                          >
                            {pkg.storyTitle}
                          </Link>
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              statusStyle.bg,
                              statusStyle.text
                            )}
                          >
                            {pkg.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                            {pkg.category}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Created {formatRelativeTime(pkg.createdAt)}
                          {pkg.reviewedAt &&
                            ` | Reviewed ${formatRelativeTime(pkg.reviewedAt)}`}
                          {pkg.publishedAt &&
                            ` | Published ${formatRelativeTime(pkg.publishedAt)}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isEditing && pkg.status !== "PUBLISHED" && (
                          <button
                            onClick={() => startEditing(pkg)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-surface-300/50 rounded-lg hover:border-surface-300 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Channel Toggles */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {CHANNELS.map(({ key, label, icon: Icon }) => {
                        const published = isChannelPublished(pkg, key);
                        const selected = pkgChannels.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (!published) toggleChannel(pkg.id, key);
                            }}
                            disabled={published}
                            className={clsx(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                              published
                                ? "bg-green-500/15 border-green-500/30 text-green-400 cursor-default"
                                : selected
                                ? "bg-accent/15 border-accent/40 text-white"
                                : "bg-surface-200/50 border-surface-300/30 text-gray-400 hover:border-surface-300 hover:text-white"
                            )}
                          >
                            {published ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Icon className="w-3.5 h-3.5" />
                            )}
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Content Preview Sections */}
                    <div className="space-y-2">
                      {CHANNELS.map(({ key, label, icon: Icon }) => {
                        const isOpen = pkgExpanded.has(key);
                        const contents = getChannelContent(pkg, key);
                        const published = isChannelPublished(pkg, key);

                        return (
                          <div
                            key={key}
                            className="border border-surface-300/20 rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() => toggleSection(pkg.id, key)}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-200/30 transition-colors"
                            >
                              <div className="flex items-center gap-2 text-sm">
                                <Icon className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-300 font-medium">
                                  {label}
                                </span>
                                {published && (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                                )}
                              </div>
                              <Eye className="w-3.5 h-3.5 text-gray-500" />
                            </button>

                            {isOpen && (
                              <div className="px-4 pb-3 space-y-2 border-t border-surface-300/20">
                                {contents.map((item) => (
                                  <div key={item.editKey} className="pt-2">
                                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                                      {item.label}
                                    </label>
                                    {isEditing ? (
                                      <textarea
                                        value={
                                          editValues[item.editKey] ?? item.content
                                        }
                                        onChange={(e) =>
                                          setEditValues((prev) => ({
                                            ...prev,
                                            [item.editKey]: e.target.value,
                                          }))
                                        }
                                        rows={3}
                                        className="filter-input w-full mt-1 text-sm"
                                      />
                                    ) : (
                                      <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">
                                        {item.content}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-300/20">
                      {isEditing && (
                        <>
                          <button
                            onClick={() => {
                              setEditingPackage(null);
                              setEditValues({});
                            }}
                            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdits(pkg.id)}
                            disabled={reviewMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            {reviewMutation.isPending
                              ? "Saving..."
                              : "Save & Mark Reviewed"}
                          </button>
                        </>
                      )}

                      {!isEditing && pkg.status !== "PUBLISHED" && (
                        <button
                          onClick={() =>
                            publishMutation.mutate({
                              id: pkg.id,
                              channels: Array.from(pkgChannels),
                            })
                          }
                          disabled={
                            pkgChannels.size === 0 || publishMutation.isPending
                          }
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors",
                            pkgChannels.size > 0
                              ? "bg-green-600 hover:bg-green-500 text-white"
                              : "bg-surface-300/30 text-gray-500 cursor-not-allowed"
                          )}
                        >
                          <Send className="w-3.5 h-3.5" />
                          {publishMutation.isPending
                            ? "Publishing..."
                            : `Publish Selected (${pkgChannels.size})`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
