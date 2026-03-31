"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Database,
  AlertCircle,
  X,
  Globe,
  Rss,
  Newspaper,
  Bot,
  Radio,
  Pencil,
  Download,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch, fetchSources, createSource, toggleSource, fetchMarkets } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PageTabBar, SOURCES_TABS } from "@/components/PageTabBar";

interface Source {
  id: string;
  name: string;
  platform: string;
  sourceType: string;
  url: string;
  trustScore: number;
  isActive: boolean;
  isGlobal: boolean;
  lastPolledAt: string | null;
  marketId: string | null;
  market?: { name: string } | null;
  _count?: { posts: number };
}

interface Market {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  isActive: boolean;
}

// Must match Prisma Platform enum
const PLATFORMS = [
  { value: "RSS", label: "RSS Feed", icon: <Rss className="w-4 h-4" />, description: "Add an RSS/Atom feed URL to poll for articles" },
  { value: "NEWSAPI", label: "NewsAPI", icon: <Newspaper className="w-4 h-4" />, description: "NewsAPI.org aggregated news articles" },
  { value: "TWITTER", label: "Twitter/X", icon: <Globe className="w-4 h-4" />, description: "Twitter API v2 search or list monitoring" },
  { value: "FACEBOOK", label: "Facebook Pages", icon: <Globe className="w-4 h-4" />, description: "Facebook Graph API page monitoring" },
  { value: "GDELT", label: "GDELT Project", icon: <Globe className="w-4 h-4" />, description: "Free global event/news validation layer" },
  { value: "LLM_OPENAI", label: "LLM: OpenAI", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via OpenAI" },
  { value: "LLM_CLAUDE", label: "LLM: Claude", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Claude" },
  { value: "LLM_GROK", label: "LLM: Grok", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Grok" },
  { value: "LLM_GEMINI", label: "LLM: Gemini", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Gemini" },
  { value: "MANUAL", label: "Manual", icon: <Radio className="w-4 h-4" />, description: "Manually submitted stories" },
];

// Must match Prisma SourceType enum
const SOURCE_TYPES = [
  { value: "NEWS_ORG", label: "News Organization" },
  { value: "GOV_AGENCY", label: "Government Agency" },
  { value: "PUBLIC_PAGE", label: "Public Page" },
  { value: "RSS_FEED", label: "RSS Feed" },
  { value: "API_PROVIDER", label: "API Provider" },
  { value: "LLM_PROVIDER", label: "LLM Provider" },
];

const PLATFORM_COLORS: Record<string, string> = {
  RSS: "text-orange-400 bg-orange-500/10",
  NEWSAPI: "text-blue-400 bg-blue-500/10",
  TWITTER: "text-sky-400 bg-sky-500/10",
  FACEBOOK: "text-indigo-400 bg-indigo-500/10",
  GDELT: "text-green-400 bg-green-500/10",
  LLM_OPENAI: "text-emerald-400 bg-emerald-500/10",
  LLM_CLAUDE: "text-amber-400 bg-amber-500/10",
  LLM_GROK: "text-red-400 bg-red-500/10",
  LLM_GEMINI: "text-violet-400 bg-violet-500/10",
  MANUAL: "text-gray-400 bg-gray-500/10",
};

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState("");
  const [formSourceType, setFormSourceType] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMarketId, setFormMarketId] = useState("");
  const [formTrustScore, setFormTrustScore] = useState(50);

  const { data: sourcesData, isLoading } = useQuery({
    queryKey: ["admin-sources"],
    queryFn: fetchSources,
  });
  const sources: Source[] = (sourcesData as any)?.data || sourcesData || [];

  const { data: marketsData } = useQuery({
    queryKey: ["admin-markets"],
    queryFn: fetchMarkets,
  });
  const markets: Market[] = (marketsData as any)?.data || marketsData || [];

  const createMutation = useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
      resetForm();
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/v1/admin/sources/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
      resetForm();
      setEditingId(null);
      setShowForm(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      toggleSource(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string; imported: number }>("/api/v1/pipeline/import-sources", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormPlatform("");
    setFormSourceType("");
    setFormUrl("");
    setFormMarketId("");
    setFormTrustScore(50);
    setEditingId(null);
  };

  const startEdit = (source: Source) => {
    setEditingId(source.id);
    setFormName(source.name);
    setFormPlatform(source.platform);
    setFormSourceType(source.sourceType);
    setFormUrl(source.url || "");
    setFormMarketId(source.marketId || "");
    setFormTrustScore(Math.round(source.trustScore * 100));
    setShowForm(true);
  };

  // Auto-set source type based on platform
  const handlePlatformChange = (platform: string) => {
    setFormPlatform(platform);
    if (platform === "RSS") setFormSourceType("RSS_FEED");
    else if (platform === "NEWSAPI" || platform === "GDELT") setFormSourceType("API_PROVIDER");
    else if (platform.startsWith("LLM_")) setFormSourceType("LLM_PROVIDER");
    else if (platform === "FACEBOOK" || platform === "TWITTER") setFormSourceType("PUBLIC_PAGE");
    else setFormSourceType("");
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formPlatform || !formSourceType) return;
    const payload = {
      name: formName.trim(),
      platform: formPlatform,
      sourceType: formSourceType,
      url: formUrl.trim(),
      marketId: formMarketId || undefined,
      trustScore: formTrustScore / 100,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isFormError = createMutation.isError || updateMutation.isError;
  const formError = (createMutation.error as Error)?.message || (updateMutation.error as Error)?.message;

  const filtered = sources.filter((s: Source) => {
    if (platformFilter && s.platform !== platformFilter) return false;
    if (typeFilter && s.sourceType !== typeFilter) return false;
    return true;
  });

  const activeSources = sources.filter((s) => s.isActive).length;
  const platformLabel = (p: string) =>
    PLATFORMS.find((pl) => pl.value === p)?.label || p;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Page title + stats */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Database className="w-6 h-6 text-cyan-400" />
              Data Feed Configuration
            </h1>
            <p className="text-sm text-gray-500">
              Configure the data sources that feed news into the system.
            </p>
          </div>
        </div>
        <PageTabBar tabs={SOURCES_TABS} />
        <div className="flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-white tabular-nums">
                {sources.length}
              </div>
              <div className="text-xs text-gray-500">
                {activeSources} active
              </div>
            </div>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Import 200+ pre-configured local news sources? This may take a moment."
                  )
                ) {
                  importMutation.mutate();
                }
              }}
              disabled={importMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 border border-surface-300/50 hover:border-accent/50 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {importMutation.isPending ? "Importing..." : "Import 200+ Sources"}
            </button>
            <button
              onClick={() => {
                if (editingId) {
                  resetForm();
                }
                setShowForm(!showForm);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Source
            </button>
          </div>
        </div>

        {/* Add Source form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-6 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit Data Feed" : "Add New Data Feed"}
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

            {/* Step 1: Choose platform */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                1. Choose Platform
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handlePlatformChange(p.value)}
                    className={clsx(
                      "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all",
                      formPlatform === p.value
                        ? "border-accent/50 bg-accent/10 text-white"
                        : "border-surface-300/50 bg-surface-200/30 text-gray-400 hover:border-surface-300 hover:text-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {p.icon}
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <span className="text-xs text-gray-500 line-clamp-1">
                      {p.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Details */}
            {formPlatform && (
              <div className="space-y-4 animate-in">
                <label className="block text-sm font-medium text-gray-300">
                  2. Configure Feed Details
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Feed Name *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder={
                        formPlatform === "RSS"
                          ? "e.g. Houston Chronicle RSS"
                          : formPlatform === "NEWSAPI"
                          ? "e.g. Houston NewsAPI"
                          : "Source name"
                      }
                      className="filter-input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {formPlatform === "RSS"
                        ? "RSS Feed URL *"
                        : formPlatform === "NEWSAPI"
                        ? "Search Query / Endpoint"
                        : formPlatform === "TWITTER"
                        ? "Twitter List or Search URL"
                        : formPlatform === "FACEBOOK"
                        ? "Facebook Page URL"
                        : "URL / Endpoint"}
                    </label>
                    <input
                      type="text"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder={
                        formPlatform === "RSS"
                          ? "https://example.com/rss"
                          : formPlatform === "NEWSAPI"
                          ? "houston breaking news"
                          : "https://..."
                      }
                      className="filter-input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Source Type
                    </label>
                    <select
                      value={formSourceType}
                      onChange={(e) => setFormSourceType(e.target.value)}
                      className="filter-select w-full"
                    >
                      <option value="">Select type</option>
                      {SOURCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Assign to Market
                    </label>
                    <select
                      value={formMarketId}
                      onChange={(e) => setFormMarketId(e.target.value)}
                      className="filter-select w-full"
                    >
                      <option value="">Global (all markets)</option>
                      {markets
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.state ? `, ${m.state}` : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Trust Score: {formTrustScore}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={formTrustScore}
                      onChange={(e) =>
                        setFormTrustScore(Number(e.target.value))
                      }
                      className="w-full accent-accent mt-2"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>Low trust</span>
                      <span>High trust</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSubmit}
                    disabled={
                      !formName.trim() ||
                      !formPlatform ||
                      !formSourceType ||
                      isPending
                    }
                    className={clsx(
                      "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                      (!formName.trim() ||
                        !formPlatform ||
                        !formSourceType ||
                        isPending) &&
                        "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isPending
                      ? "Saving..."
                      : editingId
                      ? "Update Feed"
                      : "Add Feed"}
                  </button>
                  {editingId && (
                    <button
                      onClick={() => {
                        resetForm();
                        setShowForm(false);
                      }}
                      className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                    >
                      Cancel Edit
                    </button>
                  )}
                  {isFormError && (
                    <span className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {formError || "Failed to save source. Check your credentials and try again."}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Types</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500 ml-2">
            {filtered.length} source{filtered.length !== 1 ? "s" : ""}
          </span>
          {importMutation.isSuccess && (
            <span className="text-green-400 text-sm ml-auto">
              Sources imported successfully!
            </span>
          )}
          {importMutation.isError && (
            <span className="text-red-400 text-sm ml-auto flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {(importMutation.error as Error)?.message || "Import failed"}
            </span>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading data feeds...
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Database className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No data feeds configured yet.</p>
            <p className="text-gray-500 text-sm">
              Click &quot;Add Source&quot; above to start pulling in news data.
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Platform
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Market
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Trust
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Active
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Last Polled
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((source: Source) => (
                    <tr
                      key={source.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-white font-medium">
                            {source.name}
                          </span>
                          {source.url && (
                            <span className="block text-xs text-gray-600 truncate max-w-[300px]">
                              {source.url}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                            PLATFORM_COLORS[source.platform] ||
                              "text-gray-400 bg-gray-500/10"
                          )}
                        >
                          {platformLabel(source.platform)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {SOURCE_TYPES.find(
                          (t) => t.value === source.sourceType
                        )?.label || source.sourceType}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {source.market?.name || (
                          <span className="text-gray-600">Global</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                            <div
                              className={clsx(
                                "h-full rounded-full",
                                source.trustScore >= 0.7
                                  ? "bg-green-500"
                                  : source.trustScore >= 0.4
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              )}
                              style={{
                                width: `${Math.min(source.trustScore * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums">
                            {Math.round(source.trustScore * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            toggleMutation.mutate({
                              id: source.id,
                              enabled: !source.isActive,
                            })
                          }
                          className={clsx(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                            source.isActive ? "bg-green-500" : "bg-gray-600"
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                              source.isActive
                                ? "translate-x-4"
                                : "translate-x-0.5"
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {source.lastPolledAt
                          ? formatRelativeTime(source.lastPolledAt)
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => startEdit(source)}
                            className="filter-btn flex items-center gap-1 text-xs"
                            title="Edit source"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
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
