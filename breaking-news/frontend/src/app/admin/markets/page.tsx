"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MapPin,
  Trash2,
  Download,
  AlertCircle,
  Sparkles,
  Loader2,
  Radio,
  Tv,
  Globe,
  Search,
} from "lucide-react";
import clsx from "clsx";
import {
  apiFetch,
  createMarket,
  updateMarket,
  deleteMarket,
} from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { TablePagination } from "@/components/TablePagination";
import { ColumnCustomizer } from "@/components/ColumnCustomizer";
import { useTableColumns } from "@/hooks/useTableColumns";
import { Modal } from "@/components/Modal";

const MARKET_COLUMNS = [
  { id: "name", label: "Name", width: 150, defaultWidth: 150, minWidth: 100 },
  { id: "state", label: "State", width: 80, defaultWidth: 80, minWidth: 50 },
  { id: "coords", label: "Lat / Lon", width: 160, defaultWidth: 160, minWidth: 100 },
  { id: "radius", label: "Radius", width: 80, defaultWidth: 80, minWidth: 50 },
  { id: "active", label: "Active", width: 70, defaultWidth: 70, minWidth: 50 },
  { id: "sources", label: "Sources", width: 80, defaultWidth: 80, minWidth: 50 },
  { id: "actions", label: "Actions", width: 120, defaultWidth: 120, minWidth: 80 },
];

interface MarketSource {
  id: string;
  name: string;
  platform: string;
  sourceType: string;
  url: string;
  isActive: boolean;
  trustScore: number;
  type: string; // tv, radio, hyperlocal-intel, news, other
  callSign?: string;
  network?: string;
  format?: string;
}

interface Market {
  id: string;
  name: string;
  slug: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  timezone: string;
  keywords: string[];
  neighborhoods: string[];
  isActive: boolean;
  sourceCount?: number;
  sources?: MarketSource[];
}

export default function MarketsPage() {
  const queryClient = useQueryClient();

  // Modal state: null = closed, Market object = edit mode, "create" = create mode
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "sources">("details");

  // Form state
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formState, setFormState] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLon, setFormLon] = useState("");
  const [formRadius, setFormRadius] = useState("50");
  const [formTimezone, setFormTimezone] = useState("America/Chicago");
  const [formCountry, setFormCountry] = useState("US");
  const [formLanguage, setFormLanguage] = useState("en");
  const [formKeywords, setFormKeywords] = useState("");
  const [formNeighborhoods, setFormNeighborhoods] = useState("");

  const { columns: marketCols, updateColumns: setMarketCols, visibleColumns } = useTableColumns("markets", MARKET_COLUMNS);
  const isCol = (id: string) => visibleColumns.some(c => c.id === id);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: marketsData, isLoading } = useQuery({
    queryKey: ["admin-markets", page],
    queryFn: () => apiFetch<any>(`/api/v1/admin/markets?limit=${pageSize}&offset=${(page - 1) * pageSize}`, { headers: getAuthHeaders() }),
  });
  const allMarkets: Market[] = (marketsData as any)?.data || marketsData || [];
  // Client-side search filter
  const markets = searchQuery.trim()
    ? allMarkets.filter((m: Market) => {
        const q = searchQuery.toLowerCase();
        return (
          m.name?.toLowerCase().includes(q) ||
          m.slug?.toLowerCase().includes(q) ||
          m.state?.toLowerCase().includes(q) ||
          (m.keywords as string[] || []).some((k: string) => k.toLowerCase().includes(q)) ||
          (m.neighborhoods as string[] || []).some((n: string) => n.toLowerCase().includes(q))
        );
      })
    : allMarkets;
  const totalMarkets = (marketsData as any)?.total || allMarkets.length;
  const totalPages = Math.max(1, Math.ceil(totalMarkets / pageSize));

  // Auto-seed default markets if none exist
  const seedMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ seeded: number }>("/api/v1/admin/markets/seed", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
    },
  });

  // Auto-seed when markets are empty
  const [didAutoSeed, setDidAutoSeed] = useState(false);
  useEffect(() => {
    if (!isLoading && markets.length === 0 && !didAutoSeed && !seedMutation.isPending) {
      setDidAutoSeed(true);
      seedMutation.mutate();
    }
  }, [isLoading, markets.length, didAutoSeed, seedMutation]);

  const createMutation = useMutation({
    mutationFn: createMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateMarket(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMarket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateMarket(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
    },
  });

  const autofillMutation = useMutation({
    mutationFn: (params: { name: string; state: string }) =>
      apiFetch<any>("/api/v1/admin/markets/autofill", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      }),
    onSuccess: (data: any) => {
      if (data.latitude) setFormLat(String(data.latitude));
      if (data.longitude) setFormLon(String(data.longitude));
      if (data.timezone) setFormTimezone(data.timezone);
      if (data.radiusKm) setFormRadius(String(data.radiusKm));
      if (data.keywords?.length) setFormKeywords(data.keywords.join(", "));
      if (data.neighborhoods?.length) setFormNeighborhoods(data.neighborhoods.join(", "));
      if (data.slug && !formSlug) setFormSlug(data.slug);
    },
  });

  const disconnectSource = async (sourceId: string) => {
    if (!selectedMarket) return;
    try {
      const result = await apiFetch<any>(`/api/v1/admin/sources/${sourceId}/toggle-market`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ marketId: selectedMarket.id, connect: false }),
      });
      // Also remove via legacy marketId FK if applicable
      try {
        await apiFetch(`/api/v1/admin/sources/${sourceId}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ marketId: null }),
        });
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
      // Force re-select the market to refresh sources
      const freshMarkets = await apiFetch<any>(`/api/v1/admin/markets?limit=100`, { headers: getAuthHeaders() });
      const fresh = ((freshMarkets as any)?.data || freshMarkets || []).find((m: any) => m.id === selectedMarket.id);
      if (fresh) setSelectedMarket(fresh);
    } catch (err) {
      console.error('Disconnect source failed:', err);
      alert('Failed to disconnect source. Check console for details.');
    }
  };

  const handleAutofill = () => {
    if (formName.trim() && formState.trim()) {
      autofillMutation.mutate({ name: formName.trim(), state: formState.trim() });
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormSlug("");
    setFormState("");
    setFormLat("");
    setFormLon("");
    setFormRadius("50");
    setFormTimezone("America/Chicago");
    setFormCountry("US");
    setFormLanguage("en");
    setFormKeywords("");
    setFormNeighborhoods("");
  };

  const openCreate = () => {
    resetForm();
    setSelectedMarket(null);
    setIsCreateMode(true);
    setActiveTab("details");
  };

  const startEdit = (market: Market) => {
    setSelectedMarket(market);
    setIsCreateMode(false);
    setFormName(market.name);
    setFormSlug(market.slug);
    setFormState(market.state);
    setFormLat(String(market.latitude));
    setFormLon(String(market.longitude));
    setFormRadius(String(market.radiusKm));
    setFormTimezone(market.timezone);
    setFormCountry((market as any).country || "US");
    setFormLanguage((market as any).language || "en");
    setFormKeywords(market.keywords?.join(", ") || "");
    setFormNeighborhoods(market.neighborhoods?.join(", ") || "");
    setActiveTab("details");
  };

  const closeModal = () => {
    setSelectedMarket(null);
    setIsCreateMode(false);
    resetForm();
  };

  const isModalOpen = isCreateMode || selectedMarket !== null;

  const buildPayload = () => ({
    name: formName.trim(),
    slug: formSlug.trim(),
    state: formState.trim(),
    latitude: parseFloat(formLat) || 0,
    longitude: parseFloat(formLon) || 0,
    radiusKm: parseFloat(formRadius) || 50,
    timezone: formTimezone.trim(),
    country: formCountry.trim() || "US",
    language: formLanguage.trim() || "en",
    keywords: formKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    neighborhoods: formNeighborhoods
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
  });

  const handleSubmit = () => {
    if (!formName.trim() || !formSlug.trim() || !formState.trim()) return;
    const payload = buildPayload();

    if (selectedMarket) {
      updateMutation.mutate({ id: selectedMarket.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isFormError = createMutation.isError || updateMutation.isError;

  // Source helpers for modal
  const tvStations = (selectedMarket?.sources || []).filter((s) => s.type === "tv");
  const radioStations = (selectedMarket?.sources || []).filter((s) => s.type === "radio");
  const hlSources = (selectedMarket?.sources || []).filter((s) => s.type === "hyperlocal-intel");
  const otherSources = (selectedMarket?.sources || []).filter((s) => !["tv", "radio", "hyperlocal-intel"].includes(s.type));
  const modalSourceCount = selectedMarket?.sourceCount ?? (selectedMarket?.sources?.length || 0);

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <MapPin className="w-6 h-6 text-emerald-400" />
            Markets
          </h1>
          <div className="flex items-center gap-3">
            <ColumnCustomizer columns={marketCols} onChange={setMarketCols} allColumns={MARKET_COLUMNS} />
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 border border-surface-300/50 hover:border-accent/50 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
            >
              {seedMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {seedMutation.isPending ? "Seeding..." : "Sync All 50 Markets"}
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Market
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markets by name, state, keywords, or neighborhoods..."
            className="w-full pl-9 pr-4 py-2 bg-surface-200 border border-surface-300 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading markets...
          </div>
        ) : markets.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-4">
            <MapPin className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">
              {seedMutation.isPending ? "Seeding 50 US markets + TV/radio stations..." : "No markets configured."}
            </p>
            {seedMutation.isPending && <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto" />}
            {!seedMutation.isPending && (
              <button
                onClick={() => seedMutation.mutate()}
                className="px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
              >
                Import 50 US Markets + Stations
              </button>
            )}
            {seedMutation.isError && (
              <p className="text-red-400 text-sm">{(seedMutation.error as Error)?.message || "Seed failed"}</p>
            )}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    {isCol("name") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>}
                    {isCol("state") && <th className="text-left px-4 py-3 text-gray-400 font-medium">State</th>}
                    {isCol("coords") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Lat / Lon</th>}
                    {isCol("radius") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Radius</th>}
                    {isCol("active") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Active</th>}
                    {isCol("sources") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Sources</th>}
                    {isCol("actions") && <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market: Market) => {
                    const tvCount = (market.sources || []).filter((s) => s.type === "tv").length;
                    const radioCount = (market.sources || []).filter((s) => s.type === "radio").length;
                    const totalSrc = market.sourceCount ?? (market.sources?.length || 0);

                    return (
                      <tr
                        key={market.id}
                        className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors cursor-pointer"
                        onClick={() => startEdit(market)}
                      >
                        {isCol("name") && (
                          <td className="px-4 py-3 text-white font-medium">
                            {market.name}
                          </td>
                        )}
                        {isCol("state") && <td className="px-4 py-3 text-gray-400">{market.state}</td>}
                        {isCol("coords") && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{market.latitude.toFixed(4)}, {market.longitude.toFixed(4)}</td>}
                        {isCol("radius") && <td className="px-4 py-3 text-gray-400">{market.radiusKm} km</td>}
                        {isCol("active") && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                if (market.isActive) {
                                  if (confirm(`Deactivate "${market.name}"? Sources linked to this market will stop being polled. Existing stories remain visible.`)) {
                                    toggleActiveMutation.mutate({ id: market.id, isActive: false });
                                  }
                                } else {
                                  toggleActiveMutation.mutate({ id: market.id, isActive: true });
                                }
                              }}
                              className={clsx(
                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                market.isActive ? "bg-green-500" : "bg-gray-600"
                              )}
                            >
                              <span className={clsx(
                                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                                market.isActive ? "translate-x-4" : "translate-x-0.5"
                              )} />
                            </button>
                          </td>
                        )}
                        {isCol("sources") && (
                          <td className="px-4 py-3">
                            <span className="text-gray-400">{totalSrc}</span>
                            {totalSrc > 0 && <span className="text-gray-600 text-xs ml-1">({tvCount} TV, {radioCount} Radio)</span>}
                          </td>
                        )}
                        {isCol("actions") && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete market "${market.name}"? This cannot be undone.`)) deleteMutation.mutate(market.id);
                                }}
                                className="filter-btn text-gray-500 hover:text-red-400"
                                title="Delete market"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              shown={markets.length}
              total={totalMarkets}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              extra={`${markets.filter((m: Market) => m.isActive).length} active`}
            />
          </div>
        )}

        {/* Market Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={selectedMarket ? `Edit Market: ${selectedMarket.name}` : "Add New Market"}
          width="max-w-3xl"
        >
          {/* Tabs — only show Sources tab in edit mode */}
          {selectedMarket && (
            <div className="flex gap-1 mb-5 border-b border-surface-300/50 -mt-1">
              <button
                onClick={() => setActiveTab("details")}
                className={clsx(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "details"
                    ? "border-accent text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                )}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("sources")}
                className={clsx(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "sources"
                    ? "border-accent text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                )}
              >
                Sources ({modalSourceCount})
              </button>
            </div>
          )}

          {/* Details Tab */}
          {activeTab === "details" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!selectedMarket) {
                        setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                      }
                    }}
                    placeholder="e.g., Houston"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Slug *</label>
                  <input
                    type="text"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="e.g., houston"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">State *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      onBlur={() => {
                        if (formName.trim() && formState.trim() && !formLat && !selectedMarket) {
                          handleAutofill();
                        }
                      }}
                      placeholder="e.g., TX"
                      className="filter-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAutofill}
                      disabled={!formName.trim() || !formState.trim() || autofillMutation.isPending}
                      className={clsx(
                        "filter-btn flex items-center gap-1 text-xs whitespace-nowrap",
                        autofillMutation.isPending
                          ? "text-purple-400 border-purple-500/30"
                          : "text-purple-400 border-purple-500/30 hover:bg-purple-500/10",
                        (!formName.trim() || !formState.trim()) && "opacity-40 cursor-not-allowed"
                      )}
                      title="Auto-fill lat/long, keywords, neighborhoods using AI"
                    >
                      {autofillMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Auto-fill
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    placeholder="29.7604"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formLon}
                    onChange={(e) => setFormLon(e.target.value)}
                    placeholder="-95.3698"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Radius (km)</label>
                  <input
                    type="number"
                    value={formRadius}
                    onChange={(e) => setFormRadius(e.target.value)}
                    placeholder="50"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={formTimezone}
                    onChange={(e) => setFormTimezone(e.target.value)}
                    placeholder="America/Chicago"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Country (ISO)</label>
                  <input
                    type="text"
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value.toUpperCase())}
                    placeholder="US"
                    className="filter-input w-full"
                    maxLength={2}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Language (ISO)</label>
                  <input
                    type="text"
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value.toLowerCase())}
                    placeholder="en"
                    className="filter-input w-full"
                    maxLength={2}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Keywords (comma-separated)</label>
                  <input
                    type="text"
                    value={formKeywords}
                    onChange={(e) => setFormKeywords(e.target.value)}
                    placeholder="houston, htx, h-town"
                    className="filter-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Neighborhoods (comma-separated)</label>
                  <input
                    type="text"
                    value={formNeighborhoods}
                    onChange={(e) => setFormNeighborhoods(e.target.value)}
                    placeholder="Montrose, Heights, Midtown"
                    className="filter-input w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={
                    !formName.trim() ||
                    !formSlug.trim() ||
                    !formState.trim() ||
                    isPending
                  }
                  className={clsx(
                    "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                    (!formName.trim() ||
                      !formSlug.trim() ||
                      !formState.trim() ||
                      isPending) &&
                      "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isPending
                    ? "Saving..."
                    : selectedMarket
                    ? "Update Market"
                    : "Add Market"}
                </button>
                {isFormError && (
                  <span className="text-red-400 text-sm flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {(createMutation.error as Error)?.message ||
                      (updateMutation.error as Error)?.message ||
                      "Failed to save market"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sources Tab */}
          {activeTab === "sources" && selectedMarket && (
            <div className="space-y-3">
              {tvStations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tv className="w-3 h-3" /> TV Stations ({tvStations.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {tvStations.map((s) => (
                      <div key={s.id} className="group/src flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs hover:bg-surface-300/30 cursor-pointer" onClick={() => window.open(`/admin/sources?editId=${s.id}`, '_blank')}>
                        <span className="font-mono font-semibold text-white">{s.callSign || s.name.split(" - ")[0]}</span>
                        <span className="text-gray-500 truncate flex-1">{s.network ? `${s.network}` : ""} {s.name.split(" - ").slice(1).join(" - ")}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                        <button
                          onClick={(e) => { e.stopPropagation(); disconnectSource(s.id); }}
                          className="opacity-0 group-hover/src:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                          title="Remove from this market"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {radioStations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Radio className="w-3 h-3" /> Radio Stations ({radioStations.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {radioStations.map((s) => (
                      <div key={s.id} className="group/src flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs hover:bg-surface-300/30 cursor-pointer" onClick={() => window.open(`/admin/sources?editId=${s.id}`, '_blank')}>
                        <span className="font-mono font-semibold text-white">{s.callSign || s.name.split(" - ")[0]}</span>
                        <span className="text-gray-500 truncate flex-1">{s.format ? `(${s.format})` : ""} {s.name.split(" - ").slice(1).join(" - ")}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                        <button
                          onClick={(e) => { e.stopPropagation(); disconnectSource(s.id); }}
                          className="opacity-0 group-hover/src:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                          title="Remove from this market"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hlSources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Globe className="w-3 h-3" /> HyperLocal Intel ({hlSources.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {hlSources.map((s) => (
                      <div key={s.id} className="group/src flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs hover:bg-surface-300/30 cursor-pointer" onClick={() => window.open(`/admin/sources?editId=${s.id}`, '_blank')}>
                        <span className="text-white">{s.name}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                        <button
                          onClick={(e) => { e.stopPropagation(); disconnectSource(s.id); }}
                          className="opacity-0 group-hover/src:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                          title="Remove from this market"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {otherSources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Other Sources ({otherSources.length})</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {otherSources.map((s) => (
                      <div key={s.id} className="group/src flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs hover:bg-surface-300/30 cursor-pointer" onClick={() => window.open(`/admin/sources?editId=${s.id}`, '_blank')}>
                        <span className="text-white">{s.name}</span>
                        <span className="text-gray-600">{s.platform}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                        <button
                          onClick={(e) => { e.stopPropagation(); disconnectSource(s.id); }}
                          className="opacity-0 group-hover/src:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                          title="Remove from this market"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {modalSourceCount === 0 && (
                <p className="text-gray-600 text-xs">No sources linked to this market yet.</p>
              )}
              <div className="pt-3 border-t border-surface-300/20 mt-3">
                <a
                  href={`/admin/sources?addSource=true&marketId=${selectedMarket.id}&marketName=${encodeURIComponent(selectedMarket.name)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add TV/Radio Station to {selectedMarket.name}
                </a>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}
