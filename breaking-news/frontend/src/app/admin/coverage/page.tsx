"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Shield,
  AlertCircle,
  X,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Rss,
  Globe,
  Code,
} from "lucide-react";
import clsx from "clsx";
import {
  apiFetch,
  fetchCoverageFeeds,
  createCoverageFeed,
  deleteCoverageFeed,
  triggerCoverageCheck,
  CoverageFeedData,
} from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, COMPETITION_TABS } from "@/components/PageTabBar";

interface CoverageGap {
  id: string;
  isCovered: boolean;
  story: {
    id: string;
    title: string;
    status: string;
    category: string;
    compositeScore: number;
    breakingScore: number;
    firstSeenAt: string;
    sourceCount: number;
  };
}

const FEED_TYPES = [
  { value: "RSS", label: "RSS Feed", icon: <Rss className="w-4 h-4" /> },
  { value: "API", label: "API Endpoint", icon: <Globe className="w-4 h-4" /> },
  { value: "SCRAPE", label: "Web Scrape", icon: <Code className="w-4 h-4" /> },
];

export default function CoveragePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("RSS");
  const [formUrl, setFormUrl] = useState("");
  const [formInterval, setFormInterval] = useState("15");
  const [formCssSelector, setFormCssSelector] = useState("");

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ["admin-coverage"],
    queryFn: fetchCoverageFeeds,
  });

  const createMutation = useMutation({
    mutationFn: createCoverageFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coverage"] });
      resetForm();
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCoverageFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coverage"] });
    },
  });

  const checkMutation = useMutation({
    mutationFn: triggerCoverageCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coverage"] });
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormType("RSS");
    setFormUrl("");
    setFormInterval("15");
    setFormCssSelector("");
  };

  const handleCreate = () => {
    if (!formName.trim() || !formUrl.trim()) return;
    createMutation.mutate({
      name: formName.trim(),
      type: formType,
      url: formUrl.trim(),
      pollIntervalMin: parseInt(formInterval) || 15,
      cssSelector: formCssSelector.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Shield className="w-6 h-6 text-amber-400" />
              Coverage Gaps
            </h1>
            <p className="text-sm text-gray-500">
              Monitor competitor feeds to find stories your newsroom is missing.
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
            Add Feed
          </button>
        </div>

        {/* Add Feed form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Add Coverage Feed
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Feed Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Houston Chronicle"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Type
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="filter-select w-full"
                >
                  {FEED_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  URL *
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com/rss"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Poll Interval (minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={formInterval}
                  onChange={(e) => setFormInterval(e.target.value)}
                  placeholder="15"
                  className="filter-input w-full"
                />
              </div>

              {formType === "SCRAPE" && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    CSS Selector
                  </label>
                  <input
                    type="text"
                    value={formCssSelector}
                    onChange={(e) => setFormCssSelector(e.target.value)}
                    placeholder="article h2 a"
                    className="filter-input w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={
                  !formName.trim() ||
                  !formUrl.trim() ||
                  createMutation.isPending
                }
                className={clsx(
                  "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                  (!formName.trim() ||
                    !formUrl.trim() ||
                    createMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {createMutation.isPending ? "Adding..." : "Add Feed"}
              </button>
              {createMutation.isError && (
                <span className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {(createMutation.error as Error)?.message ||
                    "Failed to add coverage feed"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Feed list */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading coverage feeds...
          </div>
        ) : feeds.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Shield className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No coverage feeds configured.</p>
            <p className="text-gray-600 text-sm">
              Add competitor RSS feeds or news sites to detect coverage gaps.
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium w-8" />
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      URL
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Last Polled
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Items
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Gaps
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {feeds.map((feed: CoverageFeedData) => (
                    <FeedRow
                      key={feed.id}
                      feed={feed}
                      isExpanded={expandedFeedId === feed.id}
                      onToggleExpand={() =>
                        setExpandedFeedId(
                          expandedFeedId === feed.id ? null : feed.id
                        )
                      }
                      onCheck={() => checkMutation.mutate(feed.id)}
                      onDelete={() => {
                        if (
                          confirm(
                            `Delete coverage feed "${feed.name}"? This cannot be undone.`
                          )
                        ) {
                          deleteMutation.mutate(feed.id);
                        }
                      }}
                      isChecking={
                        checkMutation.isPending &&
                        checkMutation.variables === feed.id
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function FeedRow({
  feed,
  isExpanded,
  onToggleExpand,
  onCheck,
  onDelete,
  isChecking,
}: {
  feed: CoverageFeedData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCheck: () => void;
  onDelete: () => void;
  isChecking: boolean;
}) {
  const { data: gapsData, isLoading: gapsLoading } = useQuery({
    queryKey: ["admin-coverage-gaps", feed.id],
    queryFn: () =>
      apiFetch<{ data: CoverageGap[] }>(
        `/api/v1/admin/coverage/${feed.id}/gaps`,
        { headers: getAuthHeaders() }
      ),
    enabled: isExpanded,
  });

  const gaps: CoverageGap[] = gapsData?.data || [];

  return (
    <>
      <tr className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors">
        <td className="px-4 py-3">
          <button
            onClick={onToggleExpand}
            className="text-gray-500 hover:text-white transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-white font-medium">{feed.name}</td>
        <td className="px-4 py-3">
          <span
            className={clsx(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
              feed.type === "RSS"
                ? "text-orange-400 bg-orange-500/10"
                : feed.type === "API"
                ? "text-blue-400 bg-blue-500/10"
                : "text-purple-400 bg-purple-500/10"
            )}
          >
            {feed.type}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[250px]">
          {feed.url}
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">
          {feed.lastPolledAt
            ? formatRelativeTime(feed.lastPolledAt)
            : "Never"}
        </td>
        <td className="px-4 py-3 text-gray-400 tabular-nums">
          {feed.itemCount ?? feed.stats?.total ?? 0}
        </td>
        <td className="px-4 py-3">
          {(feed.stats?.gaps ?? 0) > 0 ? (
            <span className="text-amber-400 font-medium tabular-nums">
              {feed.stats.gaps}
            </span>
          ) : (
            <span className="text-gray-600">0</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCheck}
              disabled={isChecking}
              className="filter-btn flex items-center gap-1 text-xs"
              title="Run coverage check now"
            >
              {isChecking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Check
            </button>
            <button
              onClick={onDelete}
              className="filter-btn text-gray-500 hover:text-red-400"
              title="Delete feed"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="px-4 py-3 bg-surface-200/30">
            {gapsLoading ? (
              <div className="text-center text-gray-500 py-4">
                Loading coverage gaps...
              </div>
            ) : gaps.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                No coverage gaps detected for this feed.
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-gray-400 mb-2">
                  {gaps.length} uncovered{" "}
                  {gaps.length === 1 ? "story" : "stories"}:
                </p>
                {gaps.map((gap) => (
                  <div
                    key={gap.id}
                    className="flex items-center justify-between px-3 py-2 rounded bg-surface-300/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={clsx(
                          "inline-block px-2 py-0.5 rounded text-xs font-medium",
                          gap.story.status === "BREAKING" ||
                            gap.story.status === "ALERT"
                            ? "text-red-400 bg-red-500/10"
                            : gap.story.status === "DEVELOPING"
                            ? "text-amber-400 bg-amber-500/10"
                            : "text-gray-400 bg-gray-500/10"
                        )}
                      >
                        {gap.story.status}
                      </span>
                      <span className="text-white text-sm truncate">
                        {gap.story.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0 ml-4">
                      <span>{gap.story.category}</span>
                      <span className="tabular-nums">
                        Score: {Math.round(gap.story.compositeScore * 100)}
                      </span>
                      <span className="tabular-nums">
                        {gap.story.sourceCount} source
                        {gap.story.sourceCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
