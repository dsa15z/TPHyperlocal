"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Shield, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Trash2, Heart, Loader2, Copy } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

interface MonitorEntry {
  timestamp: string;
  cycle: number;
  queues: Record<string, { active: number; waiting: number; completed: number; failed: number }>;
  actions: string[];
  errors: Array<{ queue: string; error: string; count: number; action: string }>;
  sourcesHealed: number;
  jobsCleared: number;
}

interface SourceHealth {
  summary: { total: number; active: number; inactive: number; neverPolled: number; failing: number };
  problemSources: Array<{
    name: string; platform: string; active: boolean; failures: number;
    healResult: string | null; lastFailure: string | null; deactivateReason: string | null; lastPolled: string | null;
  }>;
}

export default function PipelineHealthPage() {
  const queryClient = useQueryClient();

  const { data: monitorData, isLoading: monitorLoading } = useQuery({
    queryKey: ["pipeline-monitor"],
    queryFn: () => apiFetch<{ latest: MonitorEntry | null; log: MonitorEntry[] }>("/api/v1/pipeline/monitor"),
    refetchInterval: 10_000,
  });

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ["source-health"],
    queryFn: () => apiFetch<SourceHealth>("/api/v1/pipeline/source-health"),
    refetchInterval: 30_000,
  });

  const healMutation = useMutation({
    mutationFn: () => apiFetch("/api/v1/pipeline/heal-sources", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["source-health"] }),
  });

  const clearFailedMutation = useMutation({
    mutationFn: (queue: string) => apiFetch(`/api/v1/pipeline/clear-failed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queue }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-monitor"] }),
  });

  const monitor = monitorData as any;
  const latest: MonitorEntry | null = monitor?.latest || null;
  const log: MonitorEntry[] = monitor?.log || [];
  const health: SourceHealth | null = healthData as any;

  const summary = health?.summary || { total: 0, active: 0, inactive: 0, neverPolled: 0, failing: 0 };
  const problems = health?.problemSources || [];
  const deactivated = problems.filter(p => !p.active);
  const failing = problems.filter(p => p.active && p.failures >= 3);

  // Stats from monitor log
  const totalHealed = log.reduce((sum, e) => sum + (e.sourcesHealed || 0), 0);
  const totalCleared = log.reduce((sum, e) => sum + (e.jobsCleared || 0), 0);
  const totalActions = log.reduce((sum, e) => sum + (e.actions?.length || 0), 0);
  const needsReview = log.flatMap(e => (e.errors || []).filter(err => err.action === 'NEEDS REVIEW'));

  const [copied, setCopied] = useState(false);
  const copyFullLog = () => {
    const lines = ["=== PIPELINE HEALTH REPORT ===", `Time: ${new Date().toISOString()}`, ""];
    lines.push(`Sources: ${summary.total} total, ${summary.active} active, ${summary.inactive} inactive, ${summary.failing} failing`);
    lines.push(`Monitor: ${log.length} cycles, ${totalHealed} healed, ${totalCleared} cleared, ${totalActions} actions`);
    lines.push("");
    if (needsReview.length > 0) {
      lines.push("--- NEEDS REVIEW ---");
      const deduped: Record<string, number> = {};
      for (const e of needsReview) { deduped[`[${e.queue}] ${e.error}`] = (deduped[`[${e.queue}] ${e.error}`] || 0) + e.count; }
      for (const [err, count] of Object.entries(deduped).sort((a, b) => b[1] - a[1])) {
        lines.push(`  [${count}x] ${err}`);
      }
      lines.push("");
    }
    if (deactivated.length > 0) {
      lines.push(`--- DEACTIVATED SOURCES (${deactivated.length}) ---`);
      for (const s of deactivated.slice(0, 30)) {
        lines.push(`  ${s.name} | heal=${s.healResult || 'none'} | ${s.lastFailure || 'unknown'}`);
      }
      lines.push("");
    }
    lines.push("--- RECENT MONITOR LOG ---");
    for (const entry of log.slice(0, 20)) {
      lines.push(`Cycle #${entry.cycle} at ${entry.timestamp}`);
      for (const a of entry.actions) lines.push(`  → ${a}`);
      if (entry.actions.length === 0) lines.push("  (no issues)");
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-6 h-6 text-emerald-400" />
            Pipeline Health & Self-Healing
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={copyFullLog} className="flex items-center gap-1.5 px-3 py-2 border border-surface-300 text-gray-300 text-sm rounded-lg hover:border-gray-400 transition-colors">
              <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy Full Report"}
            </button>
            <button
              onClick={() => healMutation.mutate()}
              disabled={healMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {healMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
              Heal All Sources
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-white">{summary.total.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Total Sources</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{summary.active.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Active</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{summary.inactive.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Inactive</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{summary.neverPolled.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Never Polled</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{totalHealed.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Auto-Healed</div>
          </div>
        </div>

        {/* Monitor activity log */}
        <div className="glass-card p-4">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Self-Healing Monitor Log
            <span className="text-xs text-gray-500 font-normal ml-2">Runs every 2 minutes</span>
          </h2>

          {needsReview.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="text-sm font-semibold text-red-300 mb-1">Errors Needing Code Fix</div>
              {(() => {
                const deduped: Record<string, number> = {};
                for (const e of needsReview) { deduped[`[${e.queue}] ${e.error}`] = (deduped[`[${e.queue}] ${e.error}`] || 0) + e.count; }
                return Object.entries(deduped).sort((a, b) => b[1] - a[1]).map(([err, count], i) => (
                  <div key={i} className="text-xs text-red-200 font-mono">[{count}x] {err}</div>
                ));
              })()}
            </div>
          )}

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {log.length === 0 && <div className="text-sm text-gray-500 text-center py-4">Monitor starting up... first cycle in ~30 seconds</div>}
            {log.map((entry, i) => {
              const hasActions = entry.actions.length > 0;
              const hasReview = (entry.errors || []).some(e => e.action === 'NEEDS REVIEW');
              const icon = hasReview ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> :
                hasActions ? <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> :
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;

              return (
                <div key={i} className={clsx("px-3 py-2 rounded-lg text-sm", hasReview ? "bg-red-500/5" : hasActions ? "bg-amber-500/5" : "bg-surface-200/30")}>
                  <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-gray-300 font-medium">Cycle #{entry.cycle}</span>
                    <span className="text-gray-500 text-xs">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    {entry.jobsCleared > 0 && <span className="text-xs text-green-400">cleared {entry.jobsCleared}</span>}
                    {entry.sourcesHealed > 0 && <span className="text-xs text-emerald-400">healed {entry.sourcesHealed}</span>}
                    {!hasActions && !hasReview && <span className="text-xs text-gray-600">all clear</span>}
                  </div>
                  {entry.actions.length > 0 && (
                    <div className="mt-1 ml-5 space-y-0.5">
                      {entry.actions.map((a, j) => (
                        <div key={j} className="text-xs text-gray-400">→ {a}</div>
                      ))}
                    </div>
                  )}
                  {(entry.errors || []).filter(e => e.action === 'NEEDS REVIEW').map((e, j) => (
                    <div key={`err-${j}`} className="text-xs text-red-300 ml-5 mt-0.5">⚠ {e.queue}: {e.error} ({e.count}x)</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Problem sources */}
        <div className="glass-card p-4">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            Problem Sources ({problems.length})
          </h2>

          {deactivated.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Deactivated ({deactivated.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-300/30 text-left text-gray-400 text-xs">
                      <th className="pb-2 pr-4">Source</th>
                      <th className="pb-2 pr-4">Platform</th>
                      <th className="pb-2 pr-4">Failures</th>
                      <th className="pb-2 pr-4">Heal Result</th>
                      <th className="pb-2">Last Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deactivated.slice(0, 30).map((s, i) => (
                      <tr key={i} className="border-b border-surface-300/10">
                        <td className="py-1.5 pr-4 text-gray-300">{s.name}</td>
                        <td className="py-1.5 pr-4 text-gray-500 text-xs">{s.platform}</td>
                        <td className="py-1.5 pr-4 text-red-400 font-mono text-xs">{s.failures}</td>
                        <td className="py-1.5 pr-4">
                          <span className={clsx("text-xs px-1.5 py-0.5 rounded",
                            s.healResult === 'failed' ? "text-red-300 bg-red-500/10" :
                            s.healResult ? "text-amber-300 bg-amber-500/10" :
                            "text-gray-500 bg-gray-500/10"
                          )}>
                            {s.healResult || 'never attempted'}
                          </span>
                        </td>
                        <td className="py-1.5 text-gray-500 text-xs truncate max-w-[200px]">{s.lastFailure || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {deactivated.length > 30 && <div className="text-xs text-gray-600 mt-2">Showing 30 of {deactivated.length}</div>}
            </div>
          )}

          {failing.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-yellow-300 mb-2">Failing but Active ({failing.length})</h3>
              <div className="space-y-1">
                {failing.map((s, i) => (
                  <div key={i} className="text-sm text-gray-300 flex items-center gap-3">
                    <span className="text-yellow-400 font-mono text-xs w-8">{s.failures}x</span>
                    <span>{s.name}</span>
                    <span className="text-gray-600 text-xs">{s.lastFailure}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {problems.length === 0 && !healthLoading && (
            <div className="text-center py-6 text-gray-500">All sources healthy</div>
          )}
        </div>
      </main>
    </div>
  );
}
