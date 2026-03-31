"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio,
  Plus,
  Trash2,
  X,
  Globe,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Twitter,
  Facebook,
  Activity,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { PageTabBar, SOURCES_TABS } from "@/components/PageTabBar";

const URL_TYPES = [
  { value: "FB_PAGE", label: "Facebook Page", platform: "FACEBOOK", placeholder: "https://facebook.com/YourStation" },
  { value: "FB_GROUP", label: "Facebook Group", platform: "FACEBOOK", placeholder: "https://facebook.com/groups/..." },
  { value: "TWITTER_LIST", label: "Twitter/X List", platform: "TWITTER", placeholder: "https://x.com/i/lists/..." },
  { value: "TWITTER_SEARCH", label: "Twitter/X Search", platform: "TWITTER", placeholder: "#HoustonNews OR Houston breaking" },
];

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "FACEBOOK") return <Facebook className="w-4 h-4 text-blue-400" />;
  if (platform === "TWITTER") return <Twitter className="w-4 h-4 text-sky-400" />;
  return <Globe className="w-4 h-4 text-teal-400" />;
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    FACEBOOK: "bg-blue-500/20 text-blue-400",
    TWITTER: "bg-sky-500/20 text-sky-400",
  };
  return (
    <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", colors[platform] || "bg-surface-300/60 text-gray-400")}>
      {platform}
    </span>
  );
}

function SentimentDot({ label, score }: { label: string | null; score: number | null }) {
  const color =
    label === "positive" ? "bg-green-400" :
    label === "negative" ? "bg-red-400" :
    label === "mixed" ? "bg-yellow-400" :
    "bg-gray-500";

  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx("w-2.5 h-2.5 rounded-full inline-block", color)} />
      <span className="text-xs text-gray-400">
        {label || "neutral"}{score != null ? ` (${score > 0 ? "+" : ""}${score.toFixed(2)})` : ""}
      </span>
    </div>
  );
}

function SentimentBar({ positive, negative, neutral, mixed, total }: { positive: number; negative: number; neutral: number; mixed: number; total: number }) {
  if (total === 0) return <div className="h-2 rounded bg-surface-300/40 w-full" />;
  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;
  const mPct = (mixed / total) * 100;
  const uPct = (neutral / total) * 100;
  return (
    <div className="flex h-2 rounded overflow-hidden w-full">
      {pPct > 0 && <div className="bg-green-400" style={{ width: `${pPct}%` }} />}
      {mPct > 0 && <div className="bg-yellow-400" style={{ width: `${mPct}%` }} />}
      {uPct > 0 && <div className="bg-gray-500" style={{ width: `${uPct}%` }} />}
      {nPct > 0 && <div className="bg-red-400" style={{ width: `${nPct}%` }} />}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CommunityRadarPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrlType, setFormUrlType] = useState("FB_PAGE");
  const [formUrl, setFormUrl] = useState("");
  const [formFreq, setFormFreq] = useState(60);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Configs
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ["community-radar-configs"],
    queryFn: () => apiFetch<any>("/api/v1/admin/community-radar", { headers: getAuthHeaders() }),
    refetchInterval: 30000,
  });
  const configs = configsData?.data || [];

  // Unified feed
  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ["community-radar-feed"],
    queryFn: () => apiFetch<any>("/api/v1/admin/community-radar/feed", { headers: getAuthHeaders() }),
    refetchInterval: 30000,
  });
  const feedPosts = feedData?.data || [];

  // Sentiment
  const { data: sentimentData } = useQuery({
    queryKey: ["community-radar-sentiment"],
    queryFn: () => apiFetch<any>("/api/v1/admin/community-radar/sentiment", { headers: getAuthHeaders() }),
    refetchInterval: 30000,
  });
  const sentimentStats = sentimentData?.data || [];

  // Create config
  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/v1/admin/community-radar", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-radar-configs"] });
      setShowForm(false);
      setFormName("");
      setFormUrl("");
      setFormFreq(60);
    },
  });

  // Delete config
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/admin/community-radar/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }).catch(() => {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-radar-configs"] });
      queryClient.invalidateQueries({ queryKey: ["community-radar-feed"] });
      queryClient.invalidateQueries({ queryKey: ["community-radar-sentiment"] });
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/v1/admin/community-radar/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-radar-configs"] });
    },
  });

  // Scan now
  const scanMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/admin/community-radar/${id}/scan`, {
        method: "POST",
        headers: getAuthHeaders(),
      }),
  });

  const handleCreate = () => {
    const urlTypeObj = URL_TYPES.find((u) => u.value === formUrlType);
    createMutation.mutate({
      name: formName.trim(),
      platform: urlTypeObj?.platform || "FACEBOOK",
      url: formUrl.trim(),
      urlType: formUrlType,
      scrapeFrequencyMin: formFreq,
    });
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Radio className="w-6 h-6 text-teal-400" /> Community Radar
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Monitor Facebook pages, groups, and Twitter for community conversations about your market.
            </p>
          </div>
        </div>
        <PageTabBar tabs={SOURCES_TABS} />
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Source
          </button>
        </div>

        {/* Add Source Form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-5 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Social Source</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Source Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {URL_TYPES.map((ut) => (
                  <button
                    key={ut.value}
                    onClick={() => setFormUrlType(ut.value)}
                    className={clsx(
                      "p-3 rounded-lg border text-left text-sm transition-all",
                      formUrlType === ut.value
                        ? "border-accent/50 bg-accent/10 text-white"
                        : "border-surface-300/50 bg-surface-200/30 text-gray-400 hover:border-surface-300"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={ut.platform} />
                      {ut.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Monitor Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Houston Community Group"
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">URL or Query *</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder={URL_TYPES.find((u) => u.value === formUrlType)?.placeholder}
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Check every {formFreq} min</label>
                <input
                  type="range"
                  min="15"
                  max="480"
                  step="15"
                  value={formFreq}
                  onChange={(e) => setFormFreq(Number(e.target.value))}
                  className="w-full accent-accent mt-2"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || !formUrl.trim() || createMutation.isPending}
                className={clsx(
                  "px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg transition-opacity",
                  (!formName.trim() || !formUrl.trim() || createMutation.isPending) && "opacity-50 cursor-not-allowed"
                )}
              >
                {createMutation.isPending ? "Adding..." : "Add Source"}
              </button>
              <p className="text-xs text-gray-600">
                Social monitoring requires platform API credentials configured in API Keys.
              </p>
            </div>
          </div>
        )}

        {/* Config List */}
        {configsLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading monitors...</div>
        ) : configs.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Radio className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No social sources configured.</p>
            <p className="text-gray-600 text-sm">
              Add Facebook pages, groups, or Twitter searches to monitor community conversations.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Monitored Sources ({configs.length})
            </h2>
            {configs.map((config: any) => (
              <div key={config.id} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlatformIcon platform={config.platform} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-semibold">{config.name}</h3>
                        <PlatformBadge platform={config.platform} />
                        <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-500">
                          {config.urlType}
                        </span>
                        <span className="text-xs text-gray-500">
                          every {config.scrapeFrequencyMin}m
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate max-w-[400px]">{config.url}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                        <span>{config.postCount || 0} posts</span>
                        {config.lastScrapedAt && (
                          <span>Last scan: {timeAgo(config.lastScrapedAt)}</span>
                        )}
                        {config.latestPostDate && (
                          <span>Latest post: {timeAgo(config.latestPostDate)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => scanMutation.mutate(config.id)}
                      disabled={scanMutation.isPending}
                      className="p-2 rounded-lg text-gray-500 hover:text-teal-400 hover:bg-surface-200/50 transition-colors"
                      title="Scan now"
                    >
                      <RefreshCw className={clsx("w-4 h-4", scanMutation.isPending && "animate-spin")} />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: config.id, isActive: !config.isActive })}
                      className={clsx(
                        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                        config.isActive
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          : "bg-gray-500/20 text-gray-500 hover:bg-gray-500/30"
                      )}
                    >
                      {config.isActive ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${config.name}" and all its posts?`)) {
                          deleteMutation.mutate(config.id);
                        }
                      }}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-surface-200/50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sentiment Overview */}
        {sentimentStats.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" /> Sentiment Overview (24h)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sentimentStats.map((stat: any) => (
                <div key={stat.configId} className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlatformIcon platform={stat.platform} />
                      <span className="text-sm text-white font-medium truncate">{stat.configName}</span>
                    </div>
                    <span className="text-xs text-gray-500">{stat.totalPosts} posts</span>
                  </div>
                  <SentimentBar
                    positive={stat.positive}
                    negative={stat.negative}
                    neutral={stat.neutral}
                    mixed={stat.mixed}
                    total={stat.totalPosts}
                  />
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> {stat.positive}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> {stat.mixed}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> {stat.neutral}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {stat.negative}
                      </span>
                    </div>
                    {stat.averageSentiment != null && (
                      <span className={clsx(
                        "font-medium",
                        stat.averageSentiment > 0.1 ? "text-green-400" :
                        stat.averageSentiment < -0.1 ? "text-red-400" : "text-gray-400"
                      )}>
                        Avg: {stat.averageSentiment > 0 ? "+" : ""}{stat.averageSentiment.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unified Social Feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4" /> Social Feed
          </h2>
          {feedLoading ? (
            <div className="glass-card p-12 text-center text-gray-500">Loading feed...</div>
          ) : feedPosts.length === 0 ? (
            <div className="glass-card p-8 text-center text-gray-500">
              No posts yet. Add social sources and run a scan to start monitoring.
            </div>
          ) : (
            <div className="space-y-2">
              {feedPosts.map((post: any) => {
                const isExpanded = expandedPostId === post.id;
                return (
                  <div key={post.id} className="glass-card p-4 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon platform={post.configPlatform} />
                        <span className="text-xs font-medium text-gray-300">{post.configName}</span>
                        {post.authorName && (
                          <>
                            <span className="text-gray-600">-</span>
                            <span className="text-xs text-gray-400">{post.authorName}</span>
                          </>
                        )}
                        <span className="text-xs text-gray-600">{timeAgo(post.postedAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {post.engagementScore > 0 && (
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            post.engagementScore > 100 ? "bg-orange-500/20 text-orange-400" :
                            post.engagementScore > 20 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-surface-300/60 text-gray-400"
                          )}>
                            {post.engagementScore} engagement
                          </span>
                        )}
                        <SentimentDot label={post.sentimentLabel} score={post.sentimentScore} />
                      </div>
                    </div>

                    {/* Content */}
                    <div>
                      <p
                        className={clsx(
                          "text-sm text-gray-300",
                          !isExpanded && "line-clamp-3"
                        )}
                      >
                        {post.content}
                      </p>
                      {post.content && post.content.length > 200 && (
                        <button
                          onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                          className="text-xs text-accent hover:text-accent-dim mt-1 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>Show less <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>Show more <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Story link */}
                    {post.storyId && (
                      <a
                        href={`/stories/${post.storyId}`}
                        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-dim"
                      >
                        <ExternalLink className="w-3 h-3" /> Linked to story
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
