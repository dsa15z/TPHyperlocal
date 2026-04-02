"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  Search,
  AlertTriangle,
  Trash2,
  FlaskConical,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square,
  Power,
  PowerOff,
  MapPin,
  Play,
} from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/Modal";
import { apiFetch, fetchSources, createSource, toggleSource, deleteSource, testSource, bulkSourceAction, pollSourceNow, fetchMarkets, type TestSourceResult } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
// PageTabBar removed — filters handle the same functionality
import { MultiSelectDropdown, getEffectiveSelection } from "@/components/MultiSelectDropdown";
import { TablePagination } from "@/components/TablePagination";
import { ColumnCustomizer } from "@/components/ColumnCustomizer";
import { useTableColumns } from "@/hooks/useTableColumns";

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
  metadata?: Record<string, unknown> | null;
  totalPosts?: number;
  recentPosts?: number;
  _count?: { posts: number };
}

interface Market {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  isActive: boolean;
}

// Source types for the create form and filter dropdown
// Maps to Prisma Platform enum values but with user-friendly labels
const PLATFORMS = [
  { value: "RSS", label: "RSS Feed", icon: <Rss className="w-4 h-4" />, description: "Add an RSS/Atom feed URL to poll for articles" },
  { value: "NEWSAPI", label: "API (News)", icon: <Newspaper className="w-4 h-4" />, description: "News API sources (Event Registry, NewsAPI.org, HyperLocal Intel, Newscatcher)" },
  { value: "TWITTER", label: "Twitter/X", icon: <Globe className="w-4 h-4" />, description: "Twitter API v2 search or list monitoring" },
  { value: "FACEBOOK", label: "Facebook", icon: <Globe className="w-4 h-4" />, description: "Facebook Graph API page monitoring" },
  { value: "GDELT", label: "GDELT", icon: <Globe className="w-4 h-4" />, description: "Free global event/news validation layer" },
  { value: "NEWSCATCHER", label: "Newscatcher", icon: <Newspaper className="w-4 h-4" />, description: "Newscatcher API news search" },
  { value: "LLM_OPENAI", label: "AI: OpenAI", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via OpenAI" },
  { value: "LLM_CLAUDE", label: "AI: Claude", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Claude" },
  { value: "LLM_GROK", label: "AI: Grok", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Grok (real-time X data)" },
  { value: "LLM_GEMINI", label: "AI: Gemini", icon: <Bot className="w-4 h-4" />, description: "AI-generated news analysis via Gemini" },
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
  NEWSCATCHER: "text-blue-400 bg-blue-500/10",
  PERIGON: "text-blue-400 bg-blue-500/10",
  TWITTER: "text-sky-400 bg-sky-500/10",
  FACEBOOK: "text-indigo-400 bg-indigo-500/10",
  GDELT: "text-green-400 bg-green-500/10",
  LLM_OPENAI: "text-emerald-400 bg-emerald-500/10",
  LLM_CLAUDE: "text-amber-400 bg-amber-500/10",
  LLM_GROK: "text-red-400 bg-red-500/10",
  LLM_GEMINI: "text-violet-400 bg-violet-500/10",
  MANUAL: "text-gray-400 bg-gray-500/10",
};

const STATUS_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "failing", label: "Failing" },
  { value: "inactive", label: "Inactive" },
];

const SOURCE_COLUMNS = [
  { id: "name", label: "Name", width: 280, defaultWidth: 280, minWidth: 150 },
  { id: "platform", label: "Source Type", width: 110, defaultWidth: 110, minWidth: 70 },
  { id: "market", label: "Market", width: 100, defaultWidth: 100, minWidth: 70 },
  { id: "health", label: "Health", width: 80, defaultWidth: 80, minWidth: 60 },
  { id: "trust", label: "Trust", width: 90, defaultWidth: 90, minWidth: 60 },
  { id: "stories", label: "Stories", width: 90, defaultWidth: 90, minWidth: 60 },
  { id: "active", label: "Active", width: 70, defaultWidth: 70, minWidth: 50 },
  { id: "lastPolled", label: "Last Polled", width: 100, defaultWidth: 100, minWidth: 70 },
  { id: "actions", label: "Actions", width: 100, defaultWidth: 100, minWidth: 70 },
];

function getSourceHealth(source: Source): { status: "healthy" | "warning" | "failing" | "inactive"; color: string; label: string } {
  if (!source.isActive) return { status: "inactive", color: "text-gray-500 bg-gray-500/10", label: "Inactive" };
  if (!source.lastPolledAt) return { status: "warning", color: "text-yellow-400 bg-yellow-500/10", label: "Never" };
  const hoursSincePolled = (Date.now() - new Date(source.lastPolledAt).getTime()) / (1000 * 60 * 60);
  const meta = source.metadata as Record<string, unknown> | null;
  const failures = (meta?.consecutiveFailures as number) || 0;
  if (failures >= 3 || hoursSincePolled > 24) return { status: "failing", color: "text-red-400 bg-red-500/10", label: "Failing" };
  if (failures >= 1 || hoursSincePolled > 6) return { status: "warning", color: "text-yellow-400 bg-yellow-500/10", label: "Warning" };
  return { status: "healthy", color: "text-green-400 bg-green-500/10", label: "Healthy" };
}

export default function SourcesPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>}>
      <SourcesPage />
    </Suspense>
  );
}

function SourcesPage() {
  const queryClient = useQueryClient();
  const urlParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);

  // Auto-open form if linked from Markets page with addSource=true
  useEffect(() => {
    if (urlParams.get("addSource") === "true") {
      setShowForm(true);
      const mktId = urlParams.get("marketId");
      if (mktId) {
        setFormMarketIds([mktId]);
      }
    }
  }, [urlParams]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState("");
  const [formSourceType, setFormSourceType] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMarketIds, setFormMarketIds] = useState<string[]>([]);
  const [formTrustScore, setFormTrustScore] = useState(50);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { columns: sourceColumns, updateColumns: setSourceColumns, visibleColumns } = useTableColumns("sources", SOURCE_COLUMNS);

  const isColVisible = (id: string) => visibleColumns.some(c => c.id === id);
  const colWidth = (id: string) => visibleColumns.find(c => c.id === id)?.width;

  const { data: sourcesData, isLoading } = useQuery({
    queryKey: ["admin-sources", searchQuery, page],
    queryFn: () => fetchSources({ limit: pageSize, offset: (page - 1) * pageSize, search: searchQuery || undefined }),
  });
  const sourcesResponse = sourcesData as any;
  const sources: Source[] = sourcesResponse?.data || [];
  const totalSources = sourcesResponse?.total || sources.length;
  const activeSources = sourcesResponse?.active || sources.filter((s: any) => s.isActive).length;
  const totalPages = sourcesResponse?.totalPages || 1;

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
    },
  });

  const pollMutation = useMutation({
    mutationFn: (id: string) => pollSourceNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
    },
  });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMarketPicker, setShowBulkMarketPicker] = useState(false);
  const [bulkMarketIds, setBulkMarketIds] = useState<string[]>([]);

  const bulkMutation = useMutation({
    mutationFn: ({ action, marketIds }: { action: "activate" | "deactivate" | "delete" | "assign_markets"; marketIds?: string[] }) =>
      bulkSourceAction(Array.from(selectedIds), action, marketIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
      setSelectedIds(new Set());
      setShowBulkMarketPicker(false);
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s: Source) => s.id)));
    }
  };

  const handleBulkActivate = () => bulkMutation.mutate({ action: "activate" });
  const handleBulkDeactivate = () => bulkMutation.mutate({ action: "deactivate" });
  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} sources? This removes all their posts and story links. Cannot be undone.`)) return;
    bulkMutation.mutate({ action: "delete" });
  };
  const handleBulkAssignMarkets = () => {
    if (bulkMarketIds.length === 0) {
      if (!confirm("Clear market assignment from selected sources (make them global)?")) return;
    }
    bulkMutation.mutate({ action: "assign_markets", marketIds: bulkMarketIds });
  };

  const [testResult, setTestResult] = useState<TestSourceResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestFeed = async () => {
    if (!formUrl.trim() || !formPlatform) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSource(formUrl.trim(), formPlatform);
      setTestResult(result);
      // Auto-fill name from feed title if name is empty
      if (result.success && result.feedTitle && !formName.trim()) {
        setFormName(result.feedTitle);
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || "Test failed", url: formUrl });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = (source: Source) => {
    if (!confirm(`Delete "${source.name}"? This will also remove all associated posts and story links. This cannot be undone.`)) return;
    deleteMutation.mutate(source.id);
  };

  const resetForm = () => {
    setFormName("");
    setFormPlatform("");
    setFormSourceType("");
    setFormUrl("");
    setFormMarketIds([]);
    setFormTrustScore(50);
    setEditingId(null);
    setTestResult(null);
  };

  const startEdit = (source: Source) => {
    setEditingId(source.id);
    setFormName(source.name);
    setFormPlatform(source.platform);
    setFormSourceType(source.sourceType);
    setFormUrl(source.url || "");
    // Load market IDs from API response (marketIds from SourceMarket join table, or legacy marketId)
    const mktIds = (source as any).marketIds || [];
    setFormMarketIds(mktIds.length > 0 ? mktIds : source.marketId ? [source.marketId] : []);
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
      marketId: formMarketIds.length > 0 ? formMarketIds[0] : undefined, // Primary market (backward compat)
      marketIds: formMarketIds.length > 0 ? formMarketIds : undefined, // All markets via SourceMarket
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

  // Build filter options
  const platformOptions = PLATFORMS.map((p) => ({ value: p.value, label: p.label }));
  const marketOptions = [
    { value: "__global__", label: "Global (no market)" },
    ...markets.filter((m) => m.isActive).map((m) => ({
      value: m.id,
      label: m.name + (m.state ? `, ${m.state}` : ""),
    })),
  ];

  // Apply filters client-side
  const filtered = sources.filter((s: Source) => {
    const effectivePlatforms = getEffectiveSelection(selectedPlatforms);
    if (effectivePlatforms && effectivePlatforms.length > 0 && !effectivePlatforms.includes(s.platform)) return false;
    if (effectivePlatforms && effectivePlatforms.length === 0) return false;

    const effectiveMarkets = getEffectiveSelection(selectedMarkets);
    if (effectiveMarkets && effectiveMarkets.length > 0) {
      const sourceMarket = s.marketId || "__global__";
      if (!effectiveMarkets.includes(sourceMarket)) return false;
    }
    if (effectiveMarkets && effectiveMarkets.length === 0) return false;

    const effectiveStatus = getEffectiveSelection(selectedStatus);
    if (effectiveStatus && effectiveStatus.length > 0) {
      const h = getSourceHealth(s).status;
      if (!effectiveStatus.includes(h)) return false;
    }
    if (effectiveStatus && effectiveStatus.length === 0) return false;

    return true;
  });

  // Cross-cutting facet counts: each dropdown shows counts based on ALL OTHER filters
  function filterExcluding(exclude: string) {
    return sources.filter((s: Source) => {
      if (exclude !== "platform") {
        const eff = getEffectiveSelection(selectedPlatforms);
        if (eff && eff.length > 0 && !eff.includes(s.platform)) return false;
        if (eff && eff.length === 0) return false;
      }
      if (exclude !== "market") {
        const eff = getEffectiveSelection(selectedMarkets);
        if (eff && eff.length > 0) {
          if (!eff.includes(s.marketId || "__global__")) return false;
        }
        if (eff && eff.length === 0) return false;
      }
      if (exclude !== "status") {
        const eff = getEffectiveSelection(selectedStatus);
        if (eff && eff.length > 0) {
          if (!eff.includes(getSourceHealth(s).status)) return false;
        }
        if (eff && eff.length === 0) return false;
      }
      return true;
    });
  }

  // Compute options with counts from cross-filtered data
  const platformFacet = filterExcluding("platform");
  const platformOptionsWithCounts = PLATFORMS.map((p) => {
    const count = platformFacet.filter((s: Source) => s.platform === p.value).length;
    return { value: p.value, label: p.label, count };
  }).filter((o) => o.count > 0);

  const marketFacet = filterExcluding("market");
  const marketOptionsWithCounts = [
    { value: "__global__", label: "Global (no market)", count: marketFacet.filter((s: Source) => !s.marketId).length },
    ...markets.filter((m: Market) => m.isActive).map((m: Market) => ({
      value: m.id,
      label: m.name + (m.state ? `, ${m.state}` : ""),
      count: marketFacet.filter((s: Source) => s.marketId === m.id).length,
    })),
  ].filter((o) => o.count > 0);

  const statusFacet = filterExcluding("status");
  const statusOptionsWithCounts = STATUS_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    count: statusFacet.filter((s: Source) => getSourceHealth(s).status === opt.value).length,
  })).filter((o) => o.count > 0);

  const platformLabel = (p: string) =>
    PLATFORMS.find((pl) => pl.value === p)?.label || p;

  const getDeactivationInfo = (source: Source) => {
    if (source.isActive) return null;
    const meta = source.metadata as Record<string, unknown> | null;
    if (!meta) return null;
    const reason = meta.deactivateReason as string | undefined;
    const failures = meta.consecutiveFailures as number | undefined;
    const lastFailure = meta.lastFailure as string | undefined;
    const deactivatedAt = meta.deactivatedAt as string | undefined;
    const healAttempts = meta.healAttempts as number | undefined;
    const healResult = meta.healResult as string | undefined;
    if (!reason && !lastFailure) return null;
    return { reason, failures, lastFailure, deactivatedAt, healAttempts, healResult };
  };

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
        <div className="flex items-center justify-end gap-3">
          <ColumnCustomizer
            columns={sourceColumns}
            onChange={setSourceColumns}
            allColumns={SOURCE_COLUMNS}
          />
          <button
            onClick={() => {
              if (confirm("Import 200+ pre-configured local news sources? This may take a moment.")) {
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
              if (editingId) resetForm();
              setShowForm(!showForm);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Source
          </button>
        </div>

        {/* Add/Edit Source modal */}
        <Modal
          isOpen={showForm}
          onClose={() => { setShowForm(false); resetForm(); }}
          title={editingId ? "Edit Data Feed" : "Add New Data Feed"}
          width="max-w-4xl"
        >

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
                      Assign to Markets
                    </label>
                    <MultiSelectDropdown
                      options={markets.map((m: Market) => ({
                        value: m.id,
                        label: m.name + (m.state ? `, ${m.state}` : "") + (!m.isActive ? " (INACTIVE)" : ""),
                        badge: !m.isActive ? "OFF" : undefined,
                      }))}
                      selected={formMarketIds}
                      onChange={(ids) => {
                        // Warn about inactive markets
                        const newIds = ids.filter(id => !formMarketIds.includes(id));
                        for (const id of newIds) {
                          const mkt = markets.find((m: Market) => m.id === id);
                          if (mkt && !mkt.isActive) {
                            if (!confirm(`"${mkt.name}" is inactive. Sources won't be polled. Add anyway?`)) {
                              return; // Cancel the change
                            }
                          }
                        }
                        setFormMarketIds(ids);
                      }}
                      placeholder="No markets (global)"
                      searchable
                    />
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

                <div className="flex items-center gap-3 pt-2 flex-wrap">
                  {/* Test Feed button */}
                  <button
                    onClick={handleTestFeed}
                    disabled={!formUrl.trim() || !formPlatform || isTesting}
                    className={clsx(
                      "px-4 py-2 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
                      (!formUrl.trim() || !formPlatform || isTesting) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FlaskConical className="w-4 h-4" />
                    )}
                    {isTesting ? "Testing..." : "Test Feed"}
                  </button>

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

                {/* Test result */}
                {testResult && (
                  <div className={clsx(
                    "mt-3 p-3 rounded-lg border text-sm flex items-start gap-2",
                    testResult.success
                      ? "bg-green-500/10 border-green-500/30 text-green-300"
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                  )}>
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">
                        {testResult.success ? "Feed is valid!" : "Feed test failed"}
                      </p>
                      {testResult.feedTitle && (
                        <p className="text-xs mt-1 text-gray-400">Title: {testResult.feedTitle}</p>
                      )}
                      {testResult.itemCount !== undefined && (
                        <p className="text-xs text-gray-400">Items found: {testResult.itemCount}</p>
                      )}
                      {testResult.error && (
                        <p className="text-xs mt-1">{testResult.error}</p>
                      )}
                      {testResult.message && !testResult.error && (
                        <p className="text-xs mt-1 text-gray-400">{testResult.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
        </Modal>

        {/* Search + Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search sources by name or URL..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="filter-input w-full pl-9"
            />
          </div>
          <MultiSelectDropdown
            options={platformOptionsWithCounts}
            selected={selectedPlatforms}
            onChange={setSelectedPlatforms}
            placeholder="All Source Types"
          />
          <MultiSelectDropdown
            options={marketOptionsWithCounts}
            selected={selectedMarkets}
            onChange={setSelectedMarkets}
            placeholder="All Markets"
            searchable
          />
          <MultiSelectDropdown
            options={statusOptionsWithCounts}
            selected={selectedStatus}
            onChange={setSelectedStatus}
            placeholder="All Status"
          />
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

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="glass-card-strong p-3 flex items-center gap-3 flex-wrap animate-in">
            <span className="text-sm text-white font-medium">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-surface-300/50" />

            <button
              onClick={handleBulkActivate}
              disabled={bulkMutation.isPending}
              className="filter-btn flex items-center gap-1.5 text-xs text-green-400 hover:border-green-500/50"
            >
              <Power className="w-3 h-3" /> Activate
            </button>
            <button
              onClick={handleBulkDeactivate}
              disabled={bulkMutation.isPending}
              className="filter-btn flex items-center gap-1.5 text-xs text-yellow-400 hover:border-yellow-500/50"
            >
              <PowerOff className="w-3 h-3" /> Deactivate
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkMutation.isPending}
              className="filter-btn flex items-center gap-1.5 text-xs text-red-400 hover:border-red-500/50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>

            <div className="h-4 w-px bg-surface-300/50" />

            {/* Assign to Market */}
            <div className="relative">
              <button
                onClick={() => setShowBulkMarketPicker(!showBulkMarketPicker)}
                disabled={bulkMutation.isPending}
                className="filter-btn flex items-center gap-1.5 text-xs text-cyan-400 hover:border-cyan-500/50"
              >
                <MapPin className="w-3 h-3" /> Assign Market
              </button>
              {showBulkMarketPicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl min-w-[260px] max-h-[320px] flex flex-col animate-in">
                  <div className="px-3 py-2 border-b border-surface-300/50 text-xs text-gray-400">
                    Select markets (multi-select)
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {markets.map((m: Market) => {
                      const checked = bulkMarketIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (!m.isActive && !checked) {
                              if (!confirm(`"${m.name}" is inactive. Sources won't be polled. Add anyway?`)) return;
                            }
                            setBulkMarketIds((prev) =>
                              checked ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            );
                          }}
                          className={clsx(
                            "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-200/50 transition-colors text-sm",
                            checked && "bg-accent/5"
                          )}
                        >
                          <div className={clsx(
                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                            checked ? "bg-accent border-accent" : "border-surface-300"
                          )}>
                            {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <span className={clsx("truncate", checked ? "text-white" : "text-gray-300")}>
                            {m.name}{m.state ? `, ${m.state}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 border-t border-surface-300/50 flex items-center gap-2">
                    <button
                      onClick={handleBulkAssignMarkets}
                      disabled={bulkMutation.isPending}
                      className="px-3 py-1 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded transition-colors"
                    >
                      {bulkMarketIds.length === 0
                        ? "Clear Markets (Global)"
                        : `Assign to ${bulkMarketIds.length} Market${bulkMarketIds.length > 1 ? "s" : ""}`}
                    </button>
                    <button
                      onClick={() => setShowBulkMarketPicker(false)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="ml-auto">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear selection
              </button>
            </div>

            {bulkMutation.isError && (
              <span className="text-red-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {(bulkMutation.error as Error)?.message || "Bulk action failed"}
              </span>
            )}
            {bulkMutation.isSuccess && (
              <span className="text-green-400 text-xs">Done!</span>
            )}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading data feeds...
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Database className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No data feeds match your filters.</p>
            <p className="text-gray-500 text-sm">
              Try adjusting your filters or click &quot;Add Source&quot; to add a new feed.
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="px-3 py-3 w-10">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-white transition-colors">
                        {selectedIds.size === filtered.length && filtered.length > 0
                          ? <CheckSquare className="w-4 h-4 text-accent" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>
                    </th>
                    {isColVisible("name") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("name") }}>
                      Name
                    </th>}
                    {isColVisible("platform") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("platform") }}>
                      Source Type
                    </th>}
                    {isColVisible("market") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("market") }}>
                      Market
                    </th>}
                    {isColVisible("health") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("health") }}>Health</th>}
                    {isColVisible("trust") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("trust") }}>
                      Trust
                    </th>}
                    {isColVisible("stories") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("stories") }}>Stories</th>}
                    {isColVisible("active") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("active") }}>
                      Active
                    </th>}
                    {isColVisible("lastPolled") && <th className="text-left px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("lastPolled") }}>
                      Last Polled
                    </th>}
                    {isColVisible("actions") && <th className="text-right px-4 py-3 text-gray-400 font-medium" style={{ width: colWidth("actions") }}>
                      Actions
                    </th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((source: Source) => {
                    const deactivation = getDeactivationInfo(source);
                    const isSelected = selectedIds.has(source.id);
                    return (
                      <tr
                        key={source.id}
                        onClick={() => startEdit(source)}
                        className={clsx(
                          "border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors cursor-pointer",
                          !source.isActive && "opacity-70",
                          isSelected && "bg-accent/5"
                        )}
                      >
                        <td className="px-3 py-3 w-10">
                          <button onClick={(e) => { e.stopPropagation(); toggleSelect(source.id); }} className="text-gray-400 hover:text-white transition-colors">
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-accent" />
                              : <Square className="w-4 h-4" />
                            }
                          </button>
                        </td>
                        {isColVisible("name") && <td className="px-4 py-3" style={{ width: colWidth("name") }}>
                          <div>
                            <span className="text-white font-medium">
                              {source.name}
                            </span>
                            {source.url && (
                              <span className="block text-xs text-gray-600 truncate max-w-[300px]">
                                {source.url}
                              </span>
                            )}
                            {/* Deactivation reason */}
                            {deactivation && (
                              <div className="mt-1 flex items-start gap-1.5">
                                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div className="text-xs">
                                  <span className="text-amber-400">
                                    Auto-deactivated
                                    {deactivation.deactivatedAt
                                      ? ` ${formatRelativeTime(deactivation.deactivatedAt)}`
                                      : ""}
                                  </span>
                                  {deactivation.reason && (
                                    <span className="block text-gray-500 truncate max-w-[280px]" title={deactivation.reason}>
                                      {deactivation.reason}
                                    </span>
                                  )}
                                  {deactivation.failures && (
                                    <span className="text-gray-600">
                                      {deactivation.failures} consecutive failures
                                    </span>
                                  )}
                                  {deactivation.healAttempts && (
                                    <span className="block text-gray-600">
                                      Heal attempts: {deactivation.healAttempts}
                                      {deactivation.healResult ? ` (${deactivation.healResult})` : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>}
                        {isColVisible("platform") && <td className="px-4 py-3" style={{ width: colWidth("platform") }}>
                          <span
                            className={clsx(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                              PLATFORM_COLORS[source.platform] ||
                                "text-gray-400 bg-gray-500/10"
                            )}
                          >
                            {platformLabel(source.platform)}
                          </span>
                        </td>}
                        {isColVisible("market") && <td className="px-4 py-3 text-gray-400 text-xs" style={{ width: colWidth("market") }}>
                          {(() => {
                            const mkts = (source as any).markets || [];
                            if (mkts.length > 0) {
                              return mkts.length === 1
                                ? mkts[0].name
                                : `${mkts[0].name} +${mkts.length - 1}`;
                            }
                            return source.market?.name || <span className="text-gray-600">Global</span>;
                          })()}
                        </td>}
                        {isColVisible("health") && (() => {
                          const h = getSourceHealth(source);
                          return <td className="px-4 py-3" style={{ width: colWidth("health") }}>
                            <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", h.color)}>{h.label}</span>
                          </td>;
                        })()}
                        {isColVisible("trust") && <td className="px-4 py-3" style={{ width: colWidth("trust") }}>
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
                        </td>}
                        {isColVisible("stories") && <td className="px-4 py-3 tabular-nums" style={{ width: colWidth("stories") }}>
                          <span className="text-white text-sm">{source.totalPosts ?? 0}</span>
                          <span className="text-gray-600 text-xs">/{source.recentPosts ?? 0}</span>
                        </td>}
                        {isColVisible("active") && <td className="px-4 py-3" style={{ width: colWidth("active") }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMutation.mutate({
                                id: source.id,
                                enabled: !source.isActive,
                              });
                            }}
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
                        </td>}
                        {isColVisible("lastPolled") && <td className="px-4 py-3 text-gray-500 text-xs" style={{ width: colWidth("lastPolled") }}>
                          {source.lastPolledAt
                            ? formatRelativeTime(source.lastPolledAt)
                            : "Never"}
                        </td>}
                        {isColVisible("actions") && <td className="px-4 py-3" style={{ width: colWidth("actions") }}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); pollMutation.mutate(source.id); }}
                              disabled={pollMutation.isPending}
                              className="filter-btn flex items-center gap-1 text-xs text-accent hover:border-accent/50"
                              title="Poll this source now"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(source); }}
                              disabled={deleteMutation.isPending}
                              className="filter-btn flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:border-red-500/50"
                              title="Delete source"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              shown={filtered.length}
              total={totalSources}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              extra={`${activeSources} active`}
            />
          </div>
        )}
      </main>
    </div>
  );
}
