"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const VERDICT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  VERIFIED: { icon: <ShieldCheck className="w-4 h-4" />, color: "text-green-400", bg: "bg-green-500/10" },
  UNVERIFIED: { icon: <ShieldQuestion className="w-4 h-4" />, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  FALSE: { icon: <ShieldAlert className="w-4 h-4" />, color: "text-red-400", bg: "bg-red-500/10" },
  MISLEADING: { icon: <ShieldAlert className="w-4 h-4" />, color: "text-orange-400", bg: "bg-orange-500/10" },
  NEEDS_CONTEXT: { icon: <ShieldQuestion className="w-4 h-4" />, color: "text-blue-400", bg: "bg-blue-500/10" },
};

export function FactCheckPanel({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const [showManual, setShowManual] = useState(false);
  const [claim, setClaim] = useState("");
  const [verdict, setVerdict] = useState("UNVERIFIED");
  const [evidence, setEvidence] = useState("");

  const { data } = useQuery({
    queryKey: ["fact-checks", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/fact-checks`),
    refetchInterval: 30_000,
  });

  const autoCheckMutation = useMutation({
    mutationFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/fact-checks/auto`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fact-checks", storyId] }),
  });

  const manualCheckMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>(`/api/v1/stories/${storyId}/fact-checks`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fact-checks", storyId] }); setClaim(""); setEvidence(""); setShowManual(false); },
  });

  const checks = data?.data || [];
  const loggedIn = isAuthenticated();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-400" />
          Fact Checks ({checks.length})
        </h2>
        {loggedIn && (
          <div className="flex items-center gap-2">
            <button onClick={() => autoCheckMutation.mutate()} disabled={autoCheckMutation.isPending} className="filter-btn text-xs flex items-center gap-1">
              {autoCheckMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI Check
            </button>
            <button onClick={() => setShowManual(!showManual)} className="filter-btn text-xs">Manual</button>
          </div>
        )}
      </div>

      {showManual && (
        <div className="glass-card p-4 space-y-3 animate-in">
          <input type="text" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Enter claim to fact-check..." className="filter-input w-full" />
          <div className="flex items-center gap-2">
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="filter-select">
              {Object.keys(VERDICT_CONFIG).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input type="text" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence/source..." className="filter-input flex-1" />
            <button onClick={() => manualCheckMutation.mutate({ claim, verdict, evidence })} disabled={!claim.trim()} className={clsx("px-3 py-2 bg-accent text-white text-sm rounded-lg", !claim.trim() && "opacity-50")}>Add</button>
          </div>
        </div>
      )}

      {checks.length === 0 ? (
        <div className="text-sm text-gray-500">No fact checks yet. Click &quot;AI Check&quot; to analyze claims.</div>
      ) : (
        <div className="space-y-2">
          {checks.map((fc: any) => {
            const config = VERDICT_CONFIG[fc.verdict] || VERDICT_CONFIG.UNVERIFIED;
            return (
              <div key={fc.id} className={clsx("glass-card p-3 flex items-start gap-3", config.bg)}>
                <div className={clsx("mt-0.5", config.color)}>{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx("text-xs font-bold", config.color)}>{fc.verdict}</span>
                    <span className="text-[10px] text-gray-600">{fc.model === "manual" ? "Manual" : "AI"} &middot; {formatRelativeTime(fc.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1">{fc.claim}</p>
                  {fc.evidence && <p className="text-xs text-gray-500 mt-1">{fc.evidence}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
