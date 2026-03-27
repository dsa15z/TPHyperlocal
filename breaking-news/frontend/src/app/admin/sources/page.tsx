"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Database,
  AlertCircle,
  X,
} from "lucide-react";
import clsx from "clsx";
import { fetchSources, createSource, toggleSource } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

interface Source {
  id: string;
  name: string;
  platform: string;
  sourceType: string;
  url: string;
  trustScore: number;
  isActive: boolean;
  lastPolledAt: string | null;
  marketId: string | null;
  market?: { name: string } | null;
}

const PLATFORMS = [
  "twitter",
  "facebook",
  "reddit",
  "rss",
  "web",
  "telegram",
  "youtube",
  "tiktok",
];

const SOURCE_TYPES = [
  "official",
  "news",
  "community",
  "social",
  "government",
  "emergency",
];

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState("");
  const [formSourceType, setFormSourceType] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMarketId, setFormMarketId] = useState("");
  const [formTrustScore, setFormTrustScore] = useState(50);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["admin-sources"],
    queryFn: fetchSources,
  });

  const createMutation = useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
      resetForm();
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

  const resetForm = () => {
    setFormName("");
    setFormPlatform("");
    setFormSourceType("");
    setFormUrl("");
    setFormMarketId("");
    setFormTrustScore(50);
  };

  const handleCreate = () => {
    if (!formName.trim() || !formPlatform || !formSourceType) return;
    createMutation.mutate({
      name: formName.trim(),
      platform: formPlatform,
      sourceType: formSourceType,
      url: formUrl.trim(),
      marketId: formMarketId.trim() || undefined,
      trustScore: formTrustScore,
    });
  };

  const filtered = sources.filter((s: Source) => {
    if (platformFilter && s.platform !== platformFilter) return false;
    if (typeFilter && s.sourceType !== typeFilter) return false;
    return true;
  });

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
              <Database className="w-5 h-5 text-cyan-400" />
              Source Management
            </h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Source
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        {/* Add Source form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Add New Source
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
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Source name"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Platform *
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="filter-select w-full"
                >
                  <option value="">Select platform</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Source Type *
                </label>
                <select
                  value={formSourceType}
                  onChange={(e) => setFormSourceType(e.target.value)}
                  className="filter-select w-full"
                >
                  <option value="">Select type</option>
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">URL</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Market ID
                </label>
                <input
                  type="text"
                  value={formMarketId}
                  onChange={(e) => setFormMarketId(e.target.value)}
                  placeholder="Market UUID (optional)"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Trust Score: {formTrustScore}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={formTrustScore}
                  onChange={(e) => setFormTrustScore(Number(e.target.value))}
                  className="w-full accent-accent mt-2"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={
                  !formName.trim() ||
                  !formPlatform ||
                  !formSourceType ||
                  createMutation.isPending
                }
                className={clsx(
                  "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                  (!formName.trim() ||
                    !formPlatform ||
                    !formSourceType ||
                    createMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {createMutation.isPending ? "Adding..." : "Add Source"}
              </button>
              {createMutation.isError && (
                <span className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Failed to add source
                </span>
              )}
            </div>
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
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
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
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500 ml-2">
            {filtered.length} source{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading sources...
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Database className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No sources found.</p>
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
                      Trust
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Active
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Last Polled
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Market
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((source: Source) => (
                    <tr
                      key={source.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">
                        {source.name}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface-300/50">
                          {source.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {source.sourceType}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "text-sm font-mono",
                            source.trustScore >= 70
                              ? "text-green-400"
                              : source.trustScore >= 40
                              ? "text-yellow-400"
                              : "text-red-400"
                          )}
                        >
                          {source.trustScore}
                        </span>
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
                                ? "translate-x-4.5"
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
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {source.market?.name || "-"}
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
