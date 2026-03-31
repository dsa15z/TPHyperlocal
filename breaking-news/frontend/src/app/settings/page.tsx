"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  MapPin,
  Tag,
  BarChart3,
  Search,
  Check,
  Loader2,
  Bell,
  Save,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useUser } from "@/components/UserProvider";
import { apiFetch, updateUserPreferences, type UserPreferences } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

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

const CHANNELS = ["push", "email", "slack"];
const STATES = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP"];

export default function SettingsPage() {
  const { profile, markets, preferences, isLoggedIn, isLoading } = useUser();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"profile" | "notifications">("profile");

  // --- Profile state ---
  const [defaultMarketId, setDefaultMarketId] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [keywords, setKeywords] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // --- Notifications state ---
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [minStates, setMinStates] = useState<string[]>(["ALERT", "BREAKING"]);
  const [notifMinScore, setNotifMinScore] = useState(0.5);
  const [notifSaved, setNotifSaved] = useState(false);

  // Sync profile state from preferences
  useEffect(() => {
    if (preferences) {
      setDefaultMarketId(preferences.defaultMarketId);
      setSelectedCategories(preferences.categories ?? []);
      setMinScore(preferences.minScore);
      setKeywords((preferences.keywords ?? []).join(", "));
    }
  }, [preferences]);

  // Fetch notification preferences
  const { data: notifData } = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () =>
      apiFetch<any>("/api/v1/notifications/preferences", {
        headers: getAuthHeaders(),
      }),
    enabled: isLoggedIn,
  });

  useEffect(() => {
    if (notifData?.data) {
      setChannels(notifData.data.channels || ["email"]);
      setMinStates(notifData.data.minStates || ["ALERT", "BREAKING"]);
      setNotifMinScore(notifData.data.minScore || 0.5);
    }
  }, [notifData]);

  // --- Profile mutation ---
  const profileMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => updateUserPreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
  });

  const handleProfileSave = () => {
    const keywordList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    profileMutation.mutate({
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

  // --- Notifications mutation ---
  const notifMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ channels, minStates, minScore: notifMinScore }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    },
  });

  const toggleChannel = (ch: string) =>
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );

  const toggleState = (st: string) =>
    setMinStates((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <p className="text-gray-400 mb-4">
            Sign in to configure your settings.
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
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Settings className="w-6 h-6 text-accent" /> Settings
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-0">
          <button
            onClick={() => setTab("profile")}
            className={clsx(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "profile"
                ? "border-accent text-accent"
                : "border-transparent text-gray-400 hover:text-gray-200"
            )}
          >
            Profile
          </button>
          <button
            onClick={() => setTab("notifications")}
            className={clsx(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "notifications"
                ? "border-accent text-accent"
                : "border-transparent text-gray-400 hover:text-gray-200"
            )}
          >
            Notifications
          </button>
        </div>

        {/* ===================== PROFILE TAB ===================== */}
        {tab === "profile" && (
          <>
            {/* Market Selection */}
            <section className="glass-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-white">
                  Default Market
                </h2>
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
                Select categories you&apos;re interested in. Leave empty to see
                all categories.
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

            {/* Save Profile */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleProfileSave}
                disabled={profileMutation.isPending}
                className={clsx(
                  "px-6 py-3 rounded-lg font-medium text-sm transition-all",
                  "bg-accent hover:bg-accent-dim text-white",
                  profileMutation.isPending && "opacity-60 cursor-not-allowed"
                )}
              >
                {profileMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Save Profile"
                )}
              </button>
              {profileSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-400 animate-in">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              {profileMutation.isError && (
                <span className="text-sm text-red-400">
                  Failed to save. Please try again.
                </span>
              )}
            </div>
          </>
        )}

        {/* ===================== NOTIFICATIONS TAB ===================== */}
        {tab === "notifications" && (
          <>
            {/* Notification Channels */}
            <section className="glass-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">
                  Notification Channels
                </h2>
              </div>
              <p className="text-sm text-gray-400">
                How do you want to receive alerts?
              </p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    className={clsx(
                      "filter-btn px-4 py-2 text-sm capitalize",
                      channels.includes(ch) && "filter-btn-active"
                    )}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </section>

            {/* Alert on Story States */}
            <section className="glass-card p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">
                Alert on Story States
              </h2>
              <p className="text-sm text-gray-400">
                Which story states should trigger notifications?
              </p>
              <div className="flex flex-wrap gap-2">
                {STATES.map((st) => (
                  <button
                    key={st}
                    onClick={() => toggleState(st)}
                    className={clsx(
                      "filter-btn px-3 py-1.5 text-xs",
                      minStates.includes(st) && "filter-btn-active"
                    )}
                  >
                    {st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </section>

            {/* Notification Min Score */}
            <section className="glass-card p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">
                Minimum Score Threshold
              </h2>
              <p className="text-sm text-gray-400">
                Only alert for stories above this composite score.
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={notifMinScore}
                  onChange={(e) =>
                    setNotifMinScore(parseFloat(e.target.value))
                  }
                  className="flex-1 accent-accent"
                />
                <span className="text-sm font-mono text-gray-300 w-12 text-right">
                  {(notifMinScore * 100).toFixed(0)}%
                </span>
              </div>
            </section>

            {/* Save Notifications */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => notifMutation.mutate()}
                disabled={notifMutation.isPending}
                className={clsx(
                  "px-6 py-3 rounded-lg font-medium text-sm transition-all",
                  "bg-accent hover:bg-accent-dim text-white",
                  notifMutation.isPending && "opacity-60 cursor-not-allowed"
                )}
              >
                {notifMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Save Preferences
                  </span>
                )}
              </button>
              {notifSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-400 animate-in">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              {notifMutation.isError && (
                <span className="text-sm text-red-400">
                  Failed to save. Please try again.
                </span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
