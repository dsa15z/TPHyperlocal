"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Newspaper,
  MapPin,
  Download,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Radar,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const WIZARD_KEY = "bn_onboarding_complete";

interface AutofillResult {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  timezone: string;
  keywords: string[];
  neighborhoods: string[];
}

interface MarketResult {
  id: string;
  name: string;
  slug: string;
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  // Step 2: Market Setup
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [autofill, setAutofill] = useState<AutofillResult | null>(null);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [marketCreating, setMarketCreating] = useState(false);
  const [marketCreated, setMarketCreated] = useState<MarketResult | null>(null);
  const [marketError, setMarketError] = useState("");

  // Step 3: Import Sources
  const [importLoading, setImportLoading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importDone, setImportDone] = useState(false);

  // Step 4: First Poll
  const [pollTriggered, setPollTriggered] = useState(false);
  const [storiesFound, setStoriesFound] = useState(0);
  const [pollChecking, setPollChecking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(WIZARD_KEY);
    if (done) return;

    // Check if markets already exist
    const checkMarkets = async () => {
      try {
        const res = await apiFetch<any[]>("/api/v1/admin/markets", {
          headers: getAuthHeaders(),
        });
        const markets = Array.isArray(res) ? res : (res as any)?.data || [];
        if (markets.length === 0) {
          setVisible(true);
        } else {
          localStorage.setItem(WIZARD_KEY, "true");
        }
      } catch {
        // If the API call fails (not logged in, etc.), don't show wizard
      }
    };

    checkMarkets();
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(WIZARD_KEY, "true");
    setVisible(false);
  }, []);

  // Step 2: Auto-fill market data
  const handleAutofill = async () => {
    if (!city.trim() || !state) return;
    setAutofillLoading(true);
    setMarketError("");
    try {
      const res = await apiFetch<any>("/api/v1/admin/markets/autofill", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ city: city.trim(), state }),
      });
      setAutofill(res.data || res);
    } catch (err: any) {
      setMarketError(err.message || "Auto-fill failed");
    } finally {
      setAutofillLoading(false);
    }
  };

  const handleCreateMarket = async () => {
    if (!autofill) return;
    setMarketCreating(true);
    setMarketError("");
    try {
      const res = await apiFetch<any>("/api/v1/admin/markets", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: `${autofill.city}, ${autofill.state}`,
          city: autofill.city,
          state: autofill.state,
          latitude: autofill.latitude,
          longitude: autofill.longitude,
          timezone: autofill.timezone,
          keywords: autofill.keywords,
          neighborhoods: autofill.neighborhoods,
          radiusKm: 50,
          isActive: true,
        }),
      });
      setMarketCreated(res.data || res);
      setStep(2);
    } catch (err: any) {
      setMarketError(err.message || "Failed to create market");
    } finally {
      setMarketCreating(false);
    }
  };

  // Step 3: Import sources
  const handleImportSources = async () => {
    setImportLoading(true);
    try {
      const res = await apiFetch<any>("/api/v1/pipeline/import-sources", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const count = res.imported || res.count || 200;
      // Animate count up
      let current = 0;
      const interval = setInterval(() => {
        current += Math.ceil(count / 20);
        if (current >= count) {
          current = count;
          clearInterval(interval);
          setImportDone(true);
          setTimeout(() => setStep(3), 800);
        }
        setImportedCount(current);
      }, 80);
    } catch {
      // Even on error, allow continuing
      setImportDone(true);
      setImportedCount(0);
    } finally {
      setImportLoading(false);
    }
  };

  // Step 4: Trigger first poll and wait for stories
  useEffect(() => {
    if (step !== 3 || pollTriggered) return;
    setPollTriggered(true);

    const triggerPoll = async () => {
      try {
        await apiFetch<any>("/api/v1/pipeline/trigger", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ lookbackHours: 24 }),
        });
      } catch {
        // Non-critical
      }

      // Poll for stories appearing
      setPollChecking(true);
      let attempts = 0;
      const maxAttempts = 30; // ~2 minutes
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const res = await apiFetch<any>("/api/v1/stories?limit=1");
          const total = res.pagination?.total || (res.data || []).length || 0;
          if (total > 0) {
            setStoriesFound(total);
            clearInterval(checkInterval);
            setPollChecking(false);
            setTimeout(() => setStep(4), 1000);
          }
        } catch {
          // Keep polling
        }
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setPollChecking(false);
          setStep(4); // Proceed even if no stories yet
        }
      }, 4000);

      return () => clearInterval(checkInterval);
    };

    triggerPoll();
  }, [step, pollTriggered]);

  if (!visible) return null;

  const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
  ];

  const steps = [
    { label: "Welcome" },
    { label: "Market" },
    { label: "Sources" },
    { label: "Scan" },
    { label: "Done" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-surface-200 border border-surface-300 rounded-2xl shadow-2xl overflow-hidden">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {steps.map((s, i) => (
            <div
              key={s.label}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-8 bg-accent"
                  : i < step
                  ? "w-2 bg-accent/60"
                  : "w-2 bg-surface-400"
              }`}
            />
          ))}
        </div>

        <div className="px-8 pb-8 pt-4">
          {/* ── Step 0: Welcome ─────────────────────────────────── */}
          {step === 0 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-accent/15 flex items-center justify-center">
                <Newspaper className="w-10 h-10 text-accent" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Welcome to TopicPulse!
                </h2>
                <p className="mt-2 text-gray-400 text-sm leading-relaxed">
                  Let&apos;s set up your newsroom in 2 minutes. We&apos;ll configure
                  your market, import sources, and run your first news scan.
                </p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white font-medium rounded-lg transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step 1: Market Setup ───────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-xl bg-blue-500/15 flex items-center justify-center mb-3">
                  <MapPin className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  Where is your newsroom?
                </h2>
                <p className="mt-1 text-gray-400 text-sm">
                  We&apos;ll auto-configure local keywords, neighborhoods, and coordinates.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Houston"
                    className="w-full px-3 py-2 bg-surface-300 border border-surface-400 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    State
                  </label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-300 border border-surface-400 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="">--</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleAutofill}
                disabled={!city.trim() || !state || autofillLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-300 hover:bg-surface-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg border border-surface-400 transition-colors"
              >
                {autofillLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                )}
                Auto-fill Market Data
              </button>

              {autofill && (
                <div className="bg-surface-300/50 border border-surface-400 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Coordinates</span>
                    <span className="text-white">
                      {autofill.latitude.toFixed(4)}, {autofill.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Timezone</span>
                    <span className="text-white">{autofill.timezone}</span>
                  </div>
                  {autofill.keywords.length > 0 && (
                    <div>
                      <span className="text-gray-400">Keywords</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {autofill.keywords.slice(0, 8).map((kw) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 bg-accent/15 text-accent text-xs rounded-full"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {autofill.neighborhoods.length > 0 && (
                    <div>
                      <span className="text-gray-400">Neighborhoods</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {autofill.neighborhoods.slice(0, 6).map((n) => (
                          <span
                            key={n}
                            className="px-2 py-0.5 bg-surface-400 text-gray-300 text-xs rounded-full"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {marketError && (
                <p className="text-red-400 text-sm">{marketError}</p>
              )}

              <button
                onClick={handleCreateMarket}
                disabled={!autofill || marketCreating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {marketCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Create Market
              </button>
            </div>
          )}

          {/* ── Step 2: Import Sources ─────────────────────────── */}
          {step === 2 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-12 h-12 mx-auto rounded-xl bg-green-500/15 flex items-center justify-center">
                <Download className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Import pre-configured news sources?
                </h2>
                <p className="mt-1 text-gray-400 text-sm">
                  We have 200+ verified local and national sources ready to go.
                </p>
              </div>

              {importedCount > 0 && (
                <div className="space-y-2">
                  <div className="w-full bg-surface-400 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, (importedCount / 200) * 100)}%` }}
                    />
                  </div>
                  <p className="text-green-400 text-sm font-medium">
                    {importDone ? (
                      <span className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        {importedCount} sources imported
                      </span>
                    ) : (
                      `Importing... ${importedCount} sources`
                    )}
                  </p>
                </div>
              )}

              {!importLoading && !importDone && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportSources}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white font-medium rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Import All Sources
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                  >
                    Skip — I&apos;ll add sources manually
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: First Poll ─────────────────────────────── */}
          {step === 3 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-12 h-12 mx-auto rounded-xl bg-purple-500/15 flex items-center justify-center">
                <Radar className="w-6 h-6 text-purple-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Starting your first news scan...
                </h2>
                <p className="mt-2 text-gray-400 text-sm">
                  This usually takes 1-2 minutes. We&apos;re scanning all your
                  configured sources for recent stories.
                </p>
              </div>

              {pollChecking && (
                <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  Scanning sources...
                </div>
              )}

              {storiesFound > 0 && (
                <p className="text-green-400 font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Found {storiesFound} stories!
                </p>
              )}

              <button
                onClick={() => setStep(4)}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Skip waiting
              </button>
            </div>
          )}

          {/* ── Step 4: Done ───────────────────────────────────── */}
          {step === 4 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Your dashboard is ready!
                </h2>
                <p className="mt-2 text-gray-400 text-sm">
                  {storiesFound > 0
                    ? `We found ${storiesFound} stories from your sources. Your newsroom is live.`
                    : "Your sources are being scanned. Stories will appear on the dashboard shortly."}
                </p>
              </div>

              {marketCreated && (
                <div className="bg-surface-300/50 border border-surface-400 rounded-lg p-3 text-sm">
                  <span className="text-gray-400">Market: </span>
                  <span className="text-white font-medium">
                    {marketCreated.name}
                  </span>
                </div>
              )}

              <button
                onClick={dismiss}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white font-medium rounded-lg transition-colors"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
