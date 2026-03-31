"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Copy,
  Trash2,
  Rss,
  Check,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import {
  fetchFeeds,
  createFeed,
  deleteFeed,
  type CreateFeedPayload,
  type Feed,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, SOURCES_TABS } from "@/components/PageTabBar";

const CATEGORIES = [
  "",
  "Crime",
  "Traffic",
  "Weather",
  "Politics",
  "Business",
  "Health",
  "Education",
  "Sports",
  "Entertainment",
  "Technology",
  "Environment",
];

const STATUSES = ["", "ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP"];

export default function FeedsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [keywords, setKeywords] = useState("");

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ["feeds"],
    queryFn: fetchFeeds,
  });

  const createMutation = useMutation({
    mutationFn: createFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      resetForm();
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  const resetForm = () => {
    setName("");
    setCategory("");
    setStatus("");
    setMinScore(0);
    setKeywords("");
  };

  const handleCreate = () => {
    if (!name.trim()) return;

    const payload: CreateFeedPayload = {
      name: name.trim(),
      filters: {
        ...(category && { category }),
        ...(status && { status }),
        ...(minScore > 0 && { min_score: minScore }),
        ...(keywords.trim() && { keywords: keywords.trim() }),
      },
    };

    createMutation.mutate(payload);
  };

  const handleCopy = async (feed: Feed) => {
    try {
      await navigator.clipboard.writeText(feed.rss_url);
      setCopiedId(feed.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for non-HTTPS
      const input = document.createElement("input");
      input.value = feed.rss_url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedId(feed.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const describeFilters = (feed: Feed): string => {
    const parts: string[] = [];
    if (feed.filters.category) parts.push(`Category: ${feed.filters.category}`);
    if (feed.filters.status) parts.push(`Status: ${feed.filters.status}`);
    if (feed.filters.min_score)
      parts.push(`Min Score: ${feed.filters.min_score}`);
    if (feed.filters.keywords)
      parts.push(`Keywords: ${feed.filters.keywords}`);
    return parts.length > 0 ? parts.join(" | ") : "All stories";
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Rss className="w-6 h-6 text-orange-400" />
            RSS Feeds
          </h1>
        </div>
        <PageTabBar tabs={SOURCES_TABS} />
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Feed
          </button>
        </div>
        {/* Create form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <h2 className="text-lg font-semibold text-white">
              Create New Feed
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">
                  Feed Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Breaking Crime News"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="filter-select w-full"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.filter(Boolean).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="filter-select w-full"
                >
                  <option value="">All Statuses</option>
                  {STATUSES.filter(Boolean).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Keywords
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., highway, flooding"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Minimum Score: {minScore}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-accent mt-2"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={!name.trim() || createMutation.isPending}
                className={clsx(
                  "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                  (!name.trim() || createMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {createMutation.isPending ? "Creating..." : "Create Feed"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-5 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              {createMutation.isError && (
                <span className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Failed to create feed
                </span>
              )}
            </div>
          </div>
        )}

        {/* Feeds list */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading feeds...
          </div>
        ) : feeds.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Rss className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No RSS feeds created yet.</p>
            <p className="text-gray-600 text-sm">
              Create a feed to get a customized RSS URL for your newsroom tools.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="glass-card p-5 space-y-3 animate-in"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold">{feed.name}</h3>
                    <p className="text-gray-500 text-sm mt-1">
                      {describeFilters(feed)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(feed)}
                      className="filter-btn flex items-center gap-1"
                      title="Copy RSS URL"
                    >
                      {copiedId === feed.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy URL
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this feed?")) {
                          deleteMutation.mutate(feed.id);
                        }
                      }}
                      className="filter-btn text-gray-500 hover:text-red-400"
                      title="Delete feed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* RSS URL */}
                <div className="bg-surface-300/50 rounded-lg px-4 py-2 font-mono text-xs text-gray-400 break-all">
                  {feed.rss_url}
                </div>

                <span className="text-xs text-gray-600">
                  Created {formatRelativeTime(feed.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
