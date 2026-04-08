"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  Play,
  Trash2,
  XCircle,
  RotateCcw,
  Zap,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import {
  fetchPipelineStatus,
  fetchPipelineJobs,
  triggerPipelineIngestion,
  clearFailedJobs,
  clearAllJobs,
  forceRunQueue,
  type QueueStatus,
  type PipelineJob,
} from "@/lib/api";

const STAGES = [
  { key: "ingestion", label: "Ingestion", color: "blue", desc: "Polling sources" },
  { key: "enrichment", label: "Enrichment", color: "purple", desc: "AI categorization" },
  { key: "clustering", label: "Clustering", color: "amber", desc: "Dedup & merge" },
  { key: "scoring", label: "Scoring", color: "green", desc: "Rank & score" },
];

const SECONDARY_QUEUES = [
  "alerts", "coverage", "first-draft", "llm-ingestion", "notification",
  "summarization", "sentiment", "embeddings", "article-extraction",
  "newscatcher", "hyperlocal-intel", "web-scraper", "event-registry",
  "news-director", "account-story-sync",
];

const LOOKBACK_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
];

const colorMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  blue: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/40", glow: "shadow-blue-500/20" },
  purple: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40", glow: "shadow-purple-500/20" },
  amber: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40", glow: "shadow-amber-500/20" },
  green: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/40", glow: "shadow-green-500/20" },
};

function StageNode({ stage, queue, onAction }: {
  stage: typeof STAGES[0];
  queue: QueueStatus | undefined;
  onAction: (action: string, queue: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const c = colorMap[stage.color];
  const active = queue?.active || 0;
  const waiting = queue?.waiting || 0;
  const failed = queue?.failed || 0;
  const completed = queue?.completed || 0;
  const isProcessing = active > 0;
  const hasProblems = failed > 0;

  return (
    <div className="relative group">
      <div
        className={clsx(
          "relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all cursor-pointer",
          c.bg, c.border,
          isProcessing && `shadow-lg ${c.glow}`,
          hasProblems && "ring-1 ring-red-500/30",
        )}
        onClick={() => setShowActions(!showActions)}
      >
        {/* Activity indicator */}
        {isProcessing && (
          <div className="absolute -top-1 -right-1">
            <span className="relative flex h-3 w-3">
              <span className={clsx("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", c.text.replace("text-", "bg-"))} />
              <span className={clsx("relative inline-flex rounded-full h-3 w-3", c.text.replace("text-", "bg-"))} />
            </span>
          </div>
        )}

        <span className={clsx("text-xs font-bold uppercase tracking-wider", c.text)}>{stage.label}</span>

        {/* Counts */}
        <div className="flex items-center gap-2 text-[11px]">
          {active > 0 && <span className={clsx("font-mono font-bold", c.text)}>{active} active</span>}
          {waiting > 0 && <span className="font-mono text-yellow-400 font-bold">{waiting} queued</span>}
          {failed > 0 && <span className="font-mono text-red-400 font-bold">{failed} failed</span>}
          {active === 0 && waiting === 0 && failed === 0 && <span className="text-gray-600">{completed} done</span>}
        </div>

        <span className="text-[10px] text-gray-600">{stage.desc}</span>
      </div>

      {/* Action dropdown */}
      {showActions && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 bg-surface-100 border border-surface-300 rounded-lg shadow-xl py-1 min-w-[140px]">
          <button onClick={() => { onAction("run", stage.key); setShowActions(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-300/50 flex items-center gap-2">
            <Play className="w-3 h-3 text-accent" /> Run Now
          </button>
          {failed > 0 && (
            <button onClick={() => { onAction("clear-failed", stage.key); setShowActions(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-300/50 flex items-center gap-2">
              <XCircle className="w-3 h-3 text-red-400" /> Clear {failed} Failed
            </button>
          )}
          {waiting > 0 && (
            <button onClick={() => { onAction("clear-all", stage.key); setShowActions(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-300/50 flex items-center gap-2">
              <Trash2 className="w-3 h-3 text-yellow-400" /> Clear {waiting} Pending
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center px-1">
      <div className={clsx(
        "h-px w-6 transition-colors",
        active ? "bg-accent" : "bg-surface-300/50"
      )} />
      <ArrowRight className={clsx(
        "w-3 h-3 -ml-1 transition-colors",
        active ? "text-accent" : "text-surface-300/50"
      )} />
    </div>
  );
}

export function NewsProgressPanel() {
  const [expanded, setExpanded] = useState(false);
  const [lookback, setLookback] = useState(1);
  const queryClient = useQueryClient();

  const { data: statusData } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 5_000,
  });

  const queues: QueueStatus[] = (statusData as any)?.queues || [];
  const summary = (statusData as any)?.summary || {};

  const queueMap = useMemo(() => {
    const map: Record<string, QueueStatus> = {};
    for (const q of queues) map[q.name] = q;
    return map;
  }, [queues]);

  const totalActive = summary.active || 0;
  const totalWaiting = summary.waiting || 0;
  const totalFailed = summary.failed || 0;
  const totalCompleted = summary.completed || 0;
  const isProcessing = totalActive > 0 || totalWaiting > 0;

  const ingestMutation = useMutation({
    mutationFn: (hours: number) => triggerPipelineIngestion(hours),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const clearFailedMut = useMutation({
    mutationFn: (queue: string) => clearFailedJobs(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const clearAllMut = useMutation({
    mutationFn: (queue: string) => clearAllJobs(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const runMut = useMutation({
    mutationFn: (queue: string) => forceRunQueue(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const handleAction = (action: string, queue: string) => {
    if (action === "run") runMut.mutate(queue);
    else if (action === "clear-failed") clearFailedMut.mutate(queue);
    else if (action === "clear-all") clearAllMut.mutate(queue);
  };

  // Clear all failed across all queues
  const handleClearAllFailed = () => {
    for (const q of queues) {
      if (q.failed > 0) clearFailedMut.mutate(q.name);
    }
  };

  // Clear all pending across all queues
  const handleClearAllPending = () => {
    for (const q of queues) {
      if (q.waiting > 0) clearAllMut.mutate(q.name);
    }
  };

  // Secondary queues summary
  const secondaryActive = queues
    .filter(q => SECONDARY_QUEUES.includes(q.name))
    .reduce((sum, q) => sum + q.active + q.waiting, 0);
  const secondaryCompleted = queues
    .filter(q => SECONDARY_QUEUES.includes(q.name))
    .reduce((sum, q) => sum + q.completed, 0);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-300/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Zap className={clsx("w-4 h-4", isProcessing ? "text-accent" : "text-gray-600")} />
          <span className="text-sm font-semibold text-gray-200">News Pipeline</span>
          {isProcessing ? (
            <span className="text-xs text-accent flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {totalActive + totalWaiting} jobs in progress
            </span>
          ) : (
            <span className="text-xs text-green-500">Idle</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{totalCompleted.toLocaleString()} processed</span>
          {totalFailed > 0 && <span className="text-red-400">{totalFailed} failed</span>}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-300/30 pt-3">
          {/* Pipeline flow visualization */}
          <div className="flex items-center justify-center gap-0 py-2">
            {STAGES.map((stage, i) => (
              <div key={stage.key} className="flex items-center">
                <StageNode stage={stage} queue={queueMap[stage.key]} onAction={handleAction} />
                {i < STAGES.length - 1 && (
                  <FlowArrow active={(queueMap[STAGES[i].key]?.active || 0) > 0} />
                )}
              </div>
            ))}
          </div>

          {/* Quick actions bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {totalFailed > 0 && (
                <button
                  onClick={handleClearAllFailed}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
                >
                  <XCircle className="w-3 h-3" />
                  Clear {totalFailed} Failed
                </button>
              )}
              {totalWaiting > 0 && (
                <button
                  onClick={handleClearAllPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-yellow-500/30 text-yellow-400 text-xs font-medium hover:bg-yellow-500/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear {totalWaiting} Pending
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Pull news from last:</span>
              {LOOKBACK_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  onClick={() => setLookback(opt.hours)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs font-medium transition-colors",
                    lookback === opt.hours
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "text-gray-400 hover:text-white border border-surface-300/50 hover:border-surface-300"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => ingestMutation.mutate(lookback)}
                disabled={ingestMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {ingestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Pull Now
              </button>
            </div>
          </div>

          {/* Status message */}
          {ingestMutation.isSuccess && (
            <p className="text-xs text-green-400">
              {(ingestMutation.data as any)?.message || "Ingestion triggered"}
            </p>
          )}

          {/* Secondary queues (collapsed) */}
          {(secondaryActive > 0 || secondaryCompleted > 0) && (
            <div className="text-[11px] text-gray-600 flex items-center gap-3 border-t border-surface-300/20 pt-2">
              <span>Secondary workers: {secondaryCompleted} done</span>
              {secondaryActive > 0 && <span className="text-gray-400">{secondaryActive} active</span>}
              {queues.filter(q => SECONDARY_QUEUES.includes(q.name) && q.failed > 0).map(q => (
                <span key={q.name} className="text-red-400">{q.name}: {q.failed} failed</span>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center justify-between text-[10px] text-gray-600">
            <span>Updated {new Date().toLocaleTimeString()}</span>
            <span>Refreshes every 5s</span>
          </div>
        </div>
      )}
    </div>
  );
}
