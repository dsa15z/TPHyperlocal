"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Trophy, BarChart3, Plus, X, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────

interface VariantStats {
  index: number;
  headline: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isLeading: boolean;
  significance: {
    vsControl: number;
    isSignificant95: boolean;
    isSignificant99: boolean;
  } | null;
}

interface TestData {
  storyId: string;
  isActive: boolean;
  winnerId: number | null;
  createdAt: string;
  durationHours: number;
  totals: { impressions: number; clicks: number; overallCtr: number };
  variants: VariantStats[];
}

// ─── Component ─────────────────────────────────────────────────────────────

export function HeadlineTestPanel({
  storyId,
  currentTitle,
}: {
  storyId: string;
  currentTitle: string;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [variants, setVariants] = useState<string[]>([currentTitle, ""]);
  const loggedIn = isAuthenticated();

  // Fetch active test status
  const { data: testResponse, isLoading, error } = useQuery({
    queryKey: ["headline-test", storyId],
    queryFn: () =>
      apiFetch<{ data: TestData }>(
        `/api/v1/stories/${storyId}/headlines/test`
      ).then((r) => r.data),
    refetchInterval: (query) => {
      // Auto-refresh every 10s when test is active
      const d = query.state.data;
      return d && d.isActive ? 10_000 : false;
    },
    retry: false,
  });

  const hasActiveTest = testResponse && testResponse.isActive;
  const hasCompletedTest = testResponse && !testResponse.isActive && testResponse.winnerId !== null;

  // Create test
  const createMutation = useMutation({
    mutationFn: (vars: string[]) =>
      apiFetch<any>(`/api/v1/stories/${storyId}/headlines/test`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ variants: vars }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headline-test", storyId] });
      setShowForm(false);
    },
  });

  // Pick winner
  const pickWinnerMutation = useMutation({
    mutationFn: (variant?: number) =>
      apiFetch<any>(`/api/v1/stories/${storyId}/headlines/pick-winner`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(variant !== undefined ? { variant } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headline-test", storyId] });
      queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    },
  });

  // ─── Variant form handlers ─────────────────────────────────────────────

  const addVariant = useCallback(() => {
    if (variants.length < 4) {
      setVariants((prev) => [...prev, ""]);
    }
  }, [variants.length]);

  const removeVariant = useCallback((index: number) => {
    if (variants.length > 2) {
      setVariants((prev) => prev.filter((_, i) => i !== index));
    }
  }, [variants.length]);

  const updateVariant = useCallback((index: number, value: string) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? value : v)));
  }, []);

  const canSubmit = variants.filter((v) => v.trim().length > 0).length >= 2;

  const handleCreate = () => {
    const validVariants = variants.filter((v) => v.trim().length > 0);
    if (validVariants.length >= 2) {
      createMutation.mutate(validVariants);
    }
  };

  // ─── CTR bar chart ─────────────────────────────────────────────────────

  function CtrBar({ variant }: { variant: VariantStats }) {
    const maxCtr = testResponse
      ? Math.max(...testResponse.variants.map((v) => v.ctr), 1)
      : 1;
    const barWidth = maxCtr > 0 ? (variant.ctr / maxCtr) * 100 : 0;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-gray-500 font-mono w-4 flex-shrink-0">
              {String.fromCharCode(65 + variant.index)}
            </span>
            <span
              className={clsx(
                "truncate",
                variant.isLeading ? "text-green-300 font-medium" : "text-gray-300"
              )}
              title={variant.headline}
            >
              {variant.headline}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            <span className="text-gray-500 tabular-nums w-16 text-right">
              {variant.impressions} imp
            </span>
            <span className="text-gray-500 tabular-nums w-14 text-right">
              {variant.clicks} clk
            </span>
            <span
              className={clsx(
                "font-bold tabular-nums w-14 text-right",
                variant.isLeading ? "text-green-400" : "text-gray-400"
              )}
            >
              {variant.ctr.toFixed(1)}%
            </span>
            {variant.significance && (
              <span className="w-5 flex-shrink-0 text-center">
                {variant.significance.isSignificant99 ? (
                  <Check className="w-4 h-4 text-green-400 inline" />
                ) : variant.significance.isSignificant95 ? (
                  <Check className="w-4 h-4 text-yellow-400 inline" />
                ) : null}
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-500",
              variant.isLeading ? "bg-green-500" : "bg-blue-500/70"
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-400" />
          Headline A/B Test
        </h2>
        {loggedIn && !hasActiveTest && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="filter-btn text-xs flex items-center gap-1"
          >
            <FlaskConical className="w-3 h-3" />
            {showForm ? "Cancel" : "Test Headlines"}
          </button>
        )}
      </div>

      {/* Create test form */}
      {showForm && !hasActiveTest && (
        <div className="glass-card p-4 space-y-3 animate-in">
          <p className="text-xs text-gray-400">
            Enter 2-4 headline variants. The first is pre-filled with the current title.
          </p>
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono w-4 flex-shrink-0">
                {String.fromCharCode(65 + i)}
              </span>
              <input
                type="text"
                value={v}
                onChange={(e) => updateVariant(i, e.target.value)}
                placeholder={`Headline variant ${String.fromCharCode(65 + i)}...`}
                className="filter-input flex-1"
              />
              {variants.length > 2 && (
                <button
                  onClick={() => removeVariant(i)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            {variants.length < 4 && (
              <button
                onClick={addVariant}
                className="filter-btn text-xs flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Variant
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleCreate}
              disabled={!canSubmit || createMutation.isPending}
              className={clsx(
                "px-4 py-2 bg-purple-600 text-white text-sm rounded-lg font-medium transition-colors",
                canSubmit && !createMutation.isPending
                  ? "hover:bg-purple-500"
                  : "opacity-50 cursor-not-allowed"
              )}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
              ) : null}
              Start Test
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-400">
              {(createMutation.error as Error).message || "Failed to create test"}
            </p>
          )}
        </div>
      )}

      {/* Active test display */}
      {hasActiveTest && testResponse && (
        <div className="glass-card p-4 space-y-4 animate-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400 font-medium">LIVE</span>
              <span className="text-xs text-gray-500">
                Running for {testResponse.durationHours}h
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{testResponse.totals.impressions} total impressions</span>
              <span>{testResponse.totals.clicks} total clicks</span>
              <span className="font-medium text-gray-400">
                {testResponse.totals.overallCtr}% CTR
              </span>
            </div>
          </div>

          {/* Bar chart */}
          <div className="space-y-3">
            {testResponse.variants.map((v) => (
              <CtrBar key={v.index} variant={v} />
            ))}
          </div>

          {/* Significance legend */}
          <div className="flex items-center gap-4 text-[10px] text-gray-600 border-t border-gray-800 pt-2">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-yellow-400" /> 95% confidence
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-400" /> 99% confidence
            </span>
          </div>

          {/* Pick winner controls */}
          {loggedIn && (
            <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
              <button
                onClick={() => pickWinnerMutation.mutate(undefined)}
                disabled={pickWinnerMutation.isPending}
                className="filter-btn text-xs flex items-center gap-1"
              >
                {pickWinnerMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trophy className="w-3 h-3" />
                )}
                Auto Pick Winner
              </button>
              <span className="text-[10px] text-gray-600">or select manually:</span>
              {testResponse.variants.map((v) => (
                <button
                  key={v.index}
                  onClick={() => pickWinnerMutation.mutate(v.index)}
                  disabled={pickWinnerMutation.isPending}
                  className={clsx(
                    "px-2 py-1 text-xs rounded border transition-colors",
                    v.isLeading
                      ? "border-green-600 text-green-400 hover:bg-green-600/20"
                      : "border-gray-700 text-gray-400 hover:bg-gray-700/50"
                  )}
                  title={v.headline}
                >
                  {String.fromCharCode(65 + v.index)}
                </button>
              ))}
            </div>
          )}
          {pickWinnerMutation.isError && (
            <p className="text-xs text-red-400">
              {(pickWinnerMutation.error as Error).message || "Failed to pick winner"}
            </p>
          )}
        </div>
      )}

      {/* Completed test display */}
      {hasCompletedTest && testResponse && (
        <div className="glass-card p-4 space-y-3 animate-in">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-yellow-400 font-medium">TEST COMPLETE</span>
            <span className="text-xs text-gray-500">
              Winner: Variant {String.fromCharCode(65 + (testResponse.winnerId ?? 0))}
            </span>
          </div>
          <div className="space-y-2">
            {testResponse.variants.map((v) => (
              <div
                key={v.index}
                className={clsx(
                  "flex items-center gap-2 text-xs px-2 py-1.5 rounded",
                  v.index === testResponse.winnerId
                    ? "bg-yellow-500/10 text-yellow-300"
                    : "text-gray-500"
                )}
              >
                <span className="font-mono w-4">
                  {String.fromCharCode(65 + v.index)}
                </span>
                <span className="truncate flex-1">{v.headline}</span>
                <span className="tabular-nums">{v.ctr.toFixed(1)}%</span>
                {v.index === testResponse.winnerId && (
                  <Trophy className="w-3 h-3 text-yellow-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasActiveTest && !hasCompletedTest && !showForm && !isLoading && (
        <div className="text-sm text-gray-500">
          No headline test running. Click &quot;Test Headlines&quot; to compare variants.
        </div>
      )}
    </section>
  );
}
