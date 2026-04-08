"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Trash2,
  XCircle,
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
  blue: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-400/40", glow: "shadow-blue-500/20" },
  purple: { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-400/40", glow: "shadow-purple-500/20" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-400/40", glow: "shadow-amber-500/20" },
  green: { bg: "bg-green-500/15", text: "text-green-300", border: "border-green-400/40", glow: "shadow-green-500/20" },
};

// Failed jobs tooltip — shows error reasons on hover
function FailedJobsTooltip({ queue, count }: { queue: string; count: number }) {
  const [show, setShow] = useState(false);
  const { data } = useQuery({
    queryKey: ["pipeline-failed-jobs", queue],
    queryFn: () => fetchPipelineJobs(queue, "failed", 10),
    enabled: show,
    staleTime: 10_000,
  });

  const jobs = (data as any)?.jobs || (data as any)?.data || [];

  return (
    <span
      className="relative cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="font-mono text-red-300 font-bold">{count} failed</span>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-80 max-h-60 overflow-y-auto bg-gray-900 border border-red-500/30 rounded-lg shadow-2xl p-3 space-y-1.5">
          <div className="text-xs font-semibold text-red-300 mb-2">{queue} — {count} failed jobs</div>
          {jobs.length === 0 && <div className="text-xs text-gray-500">Loading...</div>}
          {jobs.map((job: any, i: number) => (
            <div key={i} className="text-[11px] border-l-2 border-red-500/40 pl-2 py-0.5">
              <div className="text-red-300 font-medium truncate">
                {job.failedReason || job.error || "Unknown error"}
              </div>
              <div className="text-gray-500 text-[10px]">
                {job.name || "job"} · att: {job.attemptsMade || "?"} · {job.processedOn ? new Date(job.processedOn).toLocaleTimeString() : ""}
              </div>
            </div>
          ))}
          {jobs.length >= 10 && <div className="text-[10px] text-gray-600 pt-1">Showing first 10 of {count}</div>}
        </div>
      )}
    </span>
  );
}

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
    <div className="relative">
      <div
        className={clsx(
          "relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer min-w-[130px]",
          c.bg, c.border,
          isProcessing && `shadow-lg ${c.glow}`,
          hasProblems && "ring-2 ring-red-500/40",
        )}
        onClick={() => setShowActions(!showActions)}
      >
        {isProcessing && (
          <div className="absolute -top-1.5 -right-1.5">
            <span className="relative flex h-3.5 w-3.5">
              <span className={clsx("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", c.text.replace("text-", "bg-"))} />
              <span className={clsx("relative inline-flex rounded-full h-3.5 w-3.5", c.text.replace("text-", "bg-"))} />
            </span>
          </div>
        )}

        <span className={clsx("text-sm font-bold uppercase tracking-wider", c.text)}>{stage.label}</span>

        <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
          {active > 0 && <span className={clsx("font-mono font-bold", c.text)}>{active} active</span>}
          {waiting > 0 && <span className="font-mono text-yellow-300 font-bold">{waiting} queued</span>}
          {failed > 0 && <FailedJobsTooltip queue={stage.key} count={failed} />}
          {active === 0 && waiting === 0 && failed === 0 && (
            <span className="text-gray-400 font-mono">{completed} done</span>
          )}
        </div>

        <span className="text-[11px] text-gray-400">{stage.desc}</span>
      </div>

      {showActions && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 bg-gray-900 border border-surface-300 rounded-lg shadow-2xl py-1.5 min-w-[160px]">
          <button onClick={() => { onAction("run", stage.key); setShowActions(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-300/50 flex items-center gap-2">
            <Play className="w-3.5 h-3.5 text-accent" /> Run Now
          </button>
          {failed > 0 && (
            <button onClick={() => { onAction("clear-failed", stage.key); setShowActions(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-300/50 flex items-center gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-400" /> Clear {failed} Failed
            </button>
          )}
          {waiting > 0 && (
            <button onClick={() => { onAction("clear-all", stage.key); setShowActions(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-300/50 flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-yellow-400" /> Clear {waiting} Pending
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center px-1.5">
      <div className={clsx("h-0.5 w-8 transition-colors rounded-full", active ? "bg-accent" : "bg-gray-700")} />
      <ArrowRight className={clsx("w-4 h-4 -ml-1.5 transition-colors", active ? "text-accent" : "text-gray-700")} />
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

  const handleClearAllFailed = () => {
    for (const q of queues) { if (q.failed > 0) clearFailedMut.mutate(q.name); }
  };

  const handleClearAllPending = () => {
    for (const q of queues) { if (q.waiting > 0) clearAllMut.mutate(q.name); }
  };

  const secondaryActive = queues.filter(q => SECONDARY_QUEUES.includes(q.name)).reduce((sum, q) => sum + q.active + q.waiting, 0);
  const secondaryCompleted = queues.filter(q => SECONDARY_QUEUES.includes(q.name)).reduce((sum, q) => sum + q.completed, 0);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-300/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Zap className={clsx("w-5 h-5", isProcessing ? "text-accent" : "text-gray-500")} />
          <span className="text-sm font-bold text-white">News Pipeline</span>
          {isProcessing ? (
            <span className="text-sm text-accent flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {totalActive + totalWaiting} jobs in progress
            </span>
          ) : (
            <span className="text-sm text-green-400 font-medium">Idle</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-300">{totalCompleted.toLocaleString()} processed</span>
          {totalFailed > 0 && <span className="text-red-400 font-bold">{totalFailed} failed</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-300/30 pt-4">
          {/* Pipeline flow */}
          <div className="flex items-center justify-center gap-0 py-3">
            {STAGES.map((stage, i) => (
              <div key={stage.key} className="flex items-center">
                <StageNode stage={stage} queue={queueMap[stage.key]} onAction={handleAction} />
                {i < STAGES.length - 1 && (
                  <FlowArrow active={(queueMap[STAGES[i].key]?.active || 0) > 0} />
                )}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {totalFailed > 0 && (
                <button onClick={handleClearAllFailed} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm font-medium hover:bg-red-500/10 transition-colors">
                  <XCircle className="w-4 h-4" /> Clear {totalFailed} Failed
                </button>
              )}
              {totalWaiting > 0 && (
                <button onClick={handleClearAllPending} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-yellow-500/40 text-yellow-300 text-sm font-medium hover:bg-yellow-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" /> Clear {totalWaiting} Pending
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">Pull news from last:</span>
              {LOOKBACK_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  onClick={() => setLookback(opt.hours)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    lookback === opt.hours
                      ? "bg-accent/20 text-accent border border-accent/50"
                      : "text-gray-300 hover:text-white border border-gray-600 hover:border-gray-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => ingestMutation.mutate(lookback)}
                disabled={ingestMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent-dim text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {ingestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Pull Now
              </button>
            </div>
          </div>

          {ingestMutation.isSuccess && (
            <p className="text-sm text-green-400">{(ingestMutation.data as any)?.message || "Ingestion triggered"}</p>
          )}

          {(secondaryActive > 0 || secondaryCompleted > 0) && (
            <div className="text-xs text-gray-400 flex items-center gap-3 border-t border-surface-300/20 pt-2">
              <span>Secondary workers: {secondaryCompleted} done</span>
              {secondaryActive > 0 && <span className="text-gray-300">{secondaryActive} active</span>}
              {queues.filter(q => SECONDARY_QUEUES.includes(q.name) && q.failed > 0).map(q => (
                <span key={q.name} className="text-red-400">{q.name}: {q.failed} failed</span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Updated {new Date().toLocaleTimeString()}</span>
            <span>Refreshes every 5s</span>
          </div>
        </div>
      )}
    </div>
  );
}
