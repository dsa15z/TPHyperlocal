"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Download,
  AlertCircle,
  X,
  Check,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Radio,
  Tv,
  Globe,
} from "lucide-react";
import clsx from "clsx";
import {
  apiFetch,
  fetchMarkets,
  createMarket,
  updateMarket,
  deleteMarket,
} from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { TablePagination } from "@/components/TablePagination";
import { ColumnCustomizer } from "@/components/ColumnCustomizer";
import { useTableColumns } from "@/hooks/useTableColumns";

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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formState, setFormState] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLon, setFormLon] = useState("");
  const [formRadius, setFormRadius] = useState("50");
  const [formTimezone, setFormTimezone] = useState("America/Chicago");
  const [formKeywords, setFormKeywords] = useState("");
  const [formNeighborhoods, setFormNeighborhoods] = useState("");

  const { columns: marketCols, updateColumns: setMarketCols, visibleColumns } = useTableColumns("markets", MARKET_COLUMNS);
  const isCol = (id: string) => visibleColumns.some(c => c.id === id);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: marketsData, isLoading } = useQuery({
    queryKey: ["admin-markets", page],
    queryFn: () => apiFetch<any>(`/api/v1/admin/markets?limit=${pageSize}&offset=${(page - 1) * pageSize}`, { headers: getAuthHeaders() }),
  });
  const markets: Market[] = (marketsData as any)?.data || marketsData || [];
  const totalMarkets = (marketsData as any)?.total || markets.length;
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
      resetForm();
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateMarket(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
      resetForm();
      setEditingId(null);
      setShowForm(false);
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
    setFormKeywords("");
    setFormNeighborhoods("");
  };

  const startEdit = (market: Market) => {
    setEditingId(market.id);
    setFormName(market.name);
    setFormSlug(market.slug);
    setFormState(market.state);
    setFormLat(String(market.latitude));
    setFormLon(String(market.longitude));
    setFormRadius(String(market.radiusKm));
    setFormTimezone(market.timezone);
    setFormKeywords(market.keywords?.join(", ") || "");
    setFormNeighborhoods(market.neighborhoods?.join(", ") || "");
    setShowForm(true);
  };

  const buildPayload = () => ({
    name: formName.trim(),
    slug: formSlug.trim(),
    state: formState.trim(),
    latitude: parseFloat(formLat) || 0,
    longitude: parseFloat(formLon) || 0,
    radiusKm: parseFloat(formRadius) || 50,
    timezone: formTimezone.trim(),
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

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isFormError = createMutation.isError || updateMutation.isError;

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
              onClick={() => {
                if (editingId) {
                  setEditingId(null);
                  resetForm();
                }
                setShowForm(!showForm);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Market
            </button>
          </div>
        </div>
        {/* Form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit Market" : "Add New Market"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
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
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    // Auto-generate slug from name
                    if (!editingId) {
                      setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }
                  }}
                  placeholder="e.g., Houston"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Slug *
                </label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="e.g., houston"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  State *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formState}
                    onChange={(e) => setFormState(e.target.value)}
                    onBlur={() => {
                      // Auto-fill when both name and state are set
                      if (formName.trim() && formState.trim() && !formLat && !editingId) {
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
                <label className="block text-sm text-gray-400 mb-1">
                  Latitude
                </label>
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
                <label className="block text-sm text-gray-400 mb-1">
                  Longitude
                </label>
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
                <label className="block text-sm text-gray-400 mb-1">
                  Radius (km)
                </label>
                <input
                  type="number"
                  value={formRadius}
                  onChange={(e) => setFormRadius(e.target.value)}
                  placeholder="50"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={formTimezone}
                  onChange={(e) => setFormTimezone(e.target.value)}
                  placeholder="America/Chicago"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="houston, htx, h-town"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Neighborhoods (comma-separated)
                </label>
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
                  : editingId
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
                    const isExpanded = expandedId === market.id;
                    const tvStations = (market.sources || []).filter((s) => s.type === "tv");
                    const radioStations = (market.sources || []).filter((s) => s.type === "radio");
                    const hlSources = (market.sources || []).filter((s) => s.type === "hyperlocal-intel");
                    const otherSources = (market.sources || []).filter((s) => !["tv", "radio", "hyperlocal-intel"].includes(s.type));
                    const totalSrc = market.sourceCount ?? (market.sources?.length || 0);
                    const colCount = visibleColumns.length;

                    return (
                      <React.Fragment key={market.id}>
                        <tr
                          className={clsx("border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors cursor-pointer", isExpanded && "bg-surface-300/10")}
                          onClick={() => setExpandedId(isExpanded ? null : market.id)}
                        >
                          {isCol("name") && <td className="px-4 py-3 text-white font-medium">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                              {market.name}
                            </div>
                          </td>}
                          {isCol("state") && <td className="px-4 py-3 text-gray-400">{market.state}</td>}
                          {isCol("coords") && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{market.latitude.toFixed(4)}, {market.longitude.toFixed(4)}</td>}
                          {isCol("radius") && <td className="px-4 py-3 text-gray-400">{market.radiusKm} km</td>}
                          {isCol("active") && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                          </td>}
                          {isCol("sources") && <td className="px-4 py-3">
                            <span className="text-gray-400">{totalSrc}</span>
                            {totalSrc > 0 && <span className="text-gray-600 text-xs ml-1">({tvStations.length} TV, {radioStations.length} Radio)</span>}
                          </td>}
                          {isCol("actions") && <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => startEdit(market)} className="filter-btn flex items-center gap-1 text-xs" title="Edit market">
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button onClick={() => { if (confirm(`Delete market "${market.name}"? This cannot be undone.`)) deleteMutation.mutate(market.id); }}
                                className="filter-btn text-gray-500 hover:text-red-400" title="Delete market">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>}
                        </tr>
                        {isExpanded && (
                          <tr className="bg-surface-200/20">
                            <td colSpan={colCount} className="px-6 py-4">
                              <div className="space-y-3">
                                {tvStations.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <Tv className="w-3 h-3" /> TV Stations ({tvStations.length})
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {tvStations.map((s) => (
                                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs">
                                          <span className="font-mono font-semibold text-white">{s.callSign || s.name.split(" - ")[0]}</span>
                                          <span className="text-gray-500 truncate flex-1">{s.network ? `${s.network}` : ""} {s.name.split(" - ").slice(1).join(" - ")}</span>
                                          <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
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
                                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs">
                                          <span className="font-mono font-semibold text-white">{s.callSign || s.name.split(" - ")[0]}</span>
                                          <span className="text-gray-500 truncate flex-1">{s.format ? `(${s.format})` : ""} {s.name.split(" - ").slice(1).join(" - ")}</span>
                                          <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
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
                                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs">
                                          <span className="text-white">{s.name}</span>
                                          <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
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
                                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300/20 text-xs">
                                          <span className="text-white">{s.name}</span>
                                          <span className="text-gray-600">{s.platform}</span>
                                          <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.isActive ? "bg-green-500" : "bg-gray-600")} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {totalSrc === 0 && (
                                  <p className="text-gray-600 text-xs">No sources linked to this market yet.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
      </main>
    </div>
  );
}
