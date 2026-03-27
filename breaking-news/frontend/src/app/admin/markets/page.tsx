"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  MapPin,
  Pencil,
  Trash2,
  AlertCircle,
  X,
  Check,
} from "lucide-react";
import clsx from "clsx";
import {
  fetchMarkets,
  createMarket,
  updateMarket,
  deleteMarket,
} from "@/lib/api";

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
}

export default function MarketsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const { data: markets = [], isLoading } = useQuery({
    queryKey: ["admin-markets"],
    queryFn: fetchMarkets,
  });

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
    latitude: parseFloat(formLat),
    longitude: parseFloat(formLon),
    radiusKm: parseFloat(formRadius),
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
      {/* Header */}
      <header className="border-b border-surface-300/50 bg-surface-50/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" />
              Markets
            </h1>
          </div>
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
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
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
                  onChange={(e) => setFormName(e.target.value)}
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
                <input
                  type="text"
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                  placeholder="e.g., TX"
                  className="filter-input w-full"
                />
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
                  Failed to save market
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
          <div className="glass-card p-12 text-center space-y-3">
            <MapPin className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No markets configured.</p>
            <p className="text-gray-600 text-sm">
              Add a market to start collecting local news data.
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
                      State
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Lat / Lon
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Radius
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Active
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Sources
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market: Market) => (
                    <tr
                      key={market.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">
                        {market.name}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {market.state}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {market.latitude.toFixed(4)},{" "}
                        {market.longitude.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {market.radiusKm} km
                      </td>
                      <td className="px-4 py-3">
                        {market.isActive ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <X className="w-4 h-4 text-gray-600" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {market.sourceCount ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(market)}
                            className="filter-btn flex items-center gap-1 text-xs"
                            title="Edit market"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete market "${market.name}"? This cannot be undone.`
                                )
                              ) {
                                deleteMutation.mutate(market.id);
                              }
                            }}
                            className="filter-btn text-gray-500 hover:text-red-400"
                            title="Delete market"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
