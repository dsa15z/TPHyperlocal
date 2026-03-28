"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Tag,
  BarChart3,
  Search,
  Check,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useUser } from "@/components/UserProvider";
import { updateUserPreferences, type UserPreferences } from "@/lib/api";

const CATEGORY_OPTIONS = [
  "CRIME",
  "POLITICS",
  "WEATHER",
  "TRAFFIC",
  "BUSINESS",
  "EDUCATION",
  "HEALTH",
  "SPORTS",
  "ENVIRONMENT",
  "TECHNOLOGY",
  "COMMUNITY",
  "BREAKING",
];

export default function SettingsPage() {
  const { profile, markets, preferences, isLoggedIn, isLoading } = useUser();
  const queryClient = useQueryClient();

  const [defaultMarketId, setDefaultMarketId] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [keywords, setKeywords] = useState("");
  const [saved, setSaved] = useState(false);

  // Sync local state from preferences
  useEffect(() => {
    if (preferences) {
      setDefaultMarketId(preferences.defaultMarketId);
      setSelectedCategories(preferences.categories ?? []);
      setMinScore(preferences.minScore);
      setKeywords((preferences.keywords ?? []).join(", "));
    }
  }, [preferences]);

  const mutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) =>
      updateUserPreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    const keywordList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    mutation.mutate({
      defaultMarketId,
      categories: selectedCategories.length > 0 ? selectedCategories : null,
      minScore,
      keywords: keywordList.length > 0 ? keywordList : null,
    });
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <p className="text-gray-400 mb-4">
            Sign in to configure your news profile.
          </p>
          <Link
            href="/login"
            className="text-accent hover:text-accent-dim transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-white">News Profile</h1>
        {/* Market Selection */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-white">Default Market</h2>
          </div>
          <p className="text-sm text-gray-400">
            Choose which market to show by default on the dashboard. You can
            manage markets in{" "}
            <Link
              href="/admin/markets"
              className="text-accent hover:underline"
            >
              Admin &rarr; Markets
            </Link>
            .
          </p>
          {markets.length === 0 ? (
            <p className="text-sm text-gray-500">
              No markets configured yet. Add a market to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setDefaultMarketId(null)}
                className={clsx(
                  "filter-btn text-left px-4 py-3",
                  defaultMarketId === null && "filter-btn-active"
                )}
              >
                <span className="text-sm font-medium">All Markets</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Show news from all your markets
                </span>
              </button>
              {markets.map((market) => (
                <button
                  key={market.id}
                  onClick={() => setDefaultMarketId(market.id)}
                  className={clsx(
                    "filter-btn text-left px-4 py-3",
                    defaultMarketId === market.id && "filter-btn-active"
                  )}
                >
                  <span className="text-sm font-medium">{market.name}</span>
                  {market.state && (
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {market.state} &middot; {market.radiusKm}km radius
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Category Preferences */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Tag className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">
              News Categories
            </h2>
          </div>
          <p className="text-sm text-gray-400">
            Select categories you&apos;re interested in. Leave empty to see all
            categories.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={clsx(
                  "filter-btn text-xs px-3 py-1.5",
                  selectedCategories.includes(cat) && "filter-btn-active"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Minimum Score */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">
              Minimum Score Threshold
            </h2>
          </div>
          <p className="text-sm text-gray-400">
            Only show stories with a composite score above this threshold.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-mono text-gray-300 w-12 text-right">
              {minScore.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Keywords */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">
              Keywords of Interest
            </h2>
          </div>
          <p className="text-sm text-gray-400">
            Comma-separated keywords to prioritize in your feed. These help
            surface stories matching your interests.
          </p>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. flooding, city council, energy, real estate"
            className="filter-input w-full"
          />
        </section>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className={clsx(
              "px-6 py-3 rounded-lg font-medium text-sm transition-all",
              "bg-accent hover:bg-accent-dim text-white",
              mutation.isPending && "opacity-60 cursor-not-allowed"
            )}
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              "Save Profile"
            )}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 animate-in">
              <Check className="w-4 h-4" />
              Saved
            </span>
          )}
          {mutation.isError && (
            <span className="text-sm text-red-400">
              Failed to save. Please try again.
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
