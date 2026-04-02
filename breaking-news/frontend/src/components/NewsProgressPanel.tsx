"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  Play,
  XCircle,
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
import { useUser } from "./UserProvider";

const QUEUE_LABELS: Record<string, { label: string; icon: string }> = {
  ingestion: { label: "Ingestion", icon: "\u{1F4E5}" },
  enrichment: { label: "Enrichment", icon: "\u{1F3F7}\uFE0F" },
  clustering: { label: "Clustering", icon: "\u{1F517}" },
  scoring: { label: "Scoring", icon: "\u{1F4CA}" },
  alerts: { label: "Alerts", icon: "\u{1F514}" },
};

const LOOKBACK_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
];

function formatTimestamp(ts: number | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function JobRow({ job }: { job: PipelineJob }) {
  const [showStack, setShowStack] = useState(false);
  const isFailed = job.state === "failed";

  return (
    <div className="border-l-2 border-surface-300/30 ml-2 pl-3 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            {isFailed && <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
            <span className="text-gray-300 font-mono truncate">
              {job.name || job.data?.type || job.id}
            </span>
            {job.data?.feedUrl && (
              <span className="text-gray-600 truncate hidden sm:inline">
                {job.data.feedUrl.replace(/^https?:\/\//, "").substring(0, 40)}
              </span>
            )}
          </div>
          {isFailed && job.failedReason && (
            <div className="mt-1">
              <button
                onClick={() => setShowStack(!showStack)}
                className="text-[11px] text-red-400/80 hover:text-red-300 text-left leading-snug"
              >
                {job.failedReason.substring(0, 120)}
                {job.failedReason.length > 120 ? "..." : ""}
              </button>
              {showStack && job.stacktrace && (
                <pre className="mt-1 text-[10px] text-gray-600 bg-surface-300/30 rounded p-2 overflow-x-auto max-h-24 whitespace-pre-wrap">
                  {job.stacktrace}
                </pre>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-600 flex-shrink-0 tabular-nums">
          <span>att: {job.attemptsMade}</span>
          <span>{formatTimestamp(job.finishedOn || job.processedOn || job.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

function ExpandableQueueRow({ queue }: { queue: QueueStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [jobState, setJobState] = useState<string>("failed");
  const queryClient = useQueryClient();

  const clearMutation = useMutation({
    mutationFn: () => clearFailedJobs(queue.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const runMutation = useMutation({
    mutationFn: () => forceRunQueue(queue.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const info = QUEUE_LABELS[queue.name] || { label: queue.name, icon: "\u2699\uFE0F" };
  const isActive = queue.active > 0;
  const hasWaiting = queue.waiting > 0;
  const hasFailed = queue.failed > 0;
  const hasJobs = queue.active + queue.waiting + queue.completed + queue.failed > 0;

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["pipeline-jobs", queue.name, jobState],
    queryFn: () => fetchPipelineJobs(queue.name, jobState, 15),
    enabled: expanded,
    refetchInterval: expanded ? 10_000 : false,
  });

  return (
    <div className="rounded-lg bg-surface-200/50">
      {/* Queue summary row */}
      <button
        onClick={() => hasJobs && setExpanded(!expanded)}
        className={clsx(
          "w-full flex items-center justify-between py-2 px-3",
          hasJobs && "hover:bg-surface-200/80 cursor-pointer",
          !hasJobs && "cursor-default"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasJobs && (
            <ChevronRight
              className={clsx(
                "w-3 h-3 text-gray-600 transition-transform",
                expanded && "rotate-90"
              )}
            />
          )}
          <span className="text-sm">{info.icon}</span>
          <span className="text-sm font-medium text-gray-300 truncate">
            {info.label}
          </span>
          {isActive && (
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums flex-shrink-0">
          {isActive && (
            <span className="text-accent font-medium">{queue.active} active</span>
          )}
          {hasWaiting && (
            <span className="text-yellow-400">{queue.waiting} queued</span>
          )}
          <span className="text-gray-500">{queue.completed} done</span>
          {hasFailed && (
            <span className="text-red-400">{queue.failed} failed</span>
          )}
        </div>
      </button>

      {/* Expanded job details */}
      {expanded && (
        <div className="px-3 pb-3 animate-in">
          {/* State tabs */}
          <div className="flex items-center gap-1 mb-2 border-t border-surface-300/20 pt-2">
            {(["failed", "active", "waiting", "completed"] as const).map((s) => {
              const count =
                s === "failed" ? queue.failed :
                s === "active" ? queue.active :
                s === "waiting" ? queue.waiting :
                queue.completed;
              if (count === 0 && s !== jobState) return null;
              return (
                <button
                  key={s}
                  onClick={() => setJobState(s)}
                  className={clsx(
                    "px-2 py-0.5 text-[11px] rounded transition-colors",
                    jobState === s
                      ? "bg-surface-300 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  )}
                >
                  {s} ({count})
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5">
              {queue.failed > 0 && (
                <button
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  className="px-2 py-0.5 text-[11px] rounded text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {clearMutation.isPending ? "Clearing..." : `Clear ${queue.failed} failed`}
                </button>
              )}
              <button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                className="px-2 py-0.5 text-[11px] rounded text-accent hover:bg-accent/10 transition-colors flex items-center gap-1"
              >
                <Play className="w-2.5 h-2.5" />
                {runMutation.isPending ? "Running..." : "Run Now"}
              </button>
            </div>
          </div>

          {/* Job list */}
          {jobsLoading && (
            <div className="text-xs text-gray-500 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading jobs...
            </div>
          )}
          {!jobsLoading && jobsData?.jobs.length === 0 && (
            <div className="text-xs text-gray-600 py-2">
              No {jobState} jobs
            </div>
          )}
          {!jobsLoading && jobsData?.jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function BulkClearActions({ queues, summary }: { queues: QueueStatus[]; summary: { waiting: number; failed: number } }) {
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState<"pending" | "failed" | null>(null);

  const clearAllPending = async () => {
    setClearing("pending");
    try {
      const withWaiting = queues.filter((q) => q.waiting > 0);
      for (const q of withWaiting) {
        await clearAllJobs(q.name);
      }
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    } finally {
      setClearing(null);
    }
  };

  const clearAllFailed = async () => {
    setClearing("failed");
    try {
      const withFailed = queues.filter((q) => q.failed > 0);
      for (const q of withFailed) {
        await clearFailedJobs(q.name);
      }
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-surface-300/20">
      {summary.waiting > 0 && (
        <button
          onClick={clearAllPending}
          disabled={clearing !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/10 transition-colors disabled:opacity-50"
        >
          {clearing === "pending" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
          {clearing === "pending" ? "Clearing..." : `Clear ${summary.waiting.toLocaleString()} Pending`}
        </button>
      )}
      {summary.failed > 0 && (
        <button
          onClick={clearAllFailed}
          disabled={clearing !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {clearing === "failed" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
          {clearing === "failed" ? "Clearing..." : `Clear ${summary.failed.toLocaleString()} Failed`}
        </button>
      )}
    </div>
  );
}

export function NewsProgressPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLookback, setSelectedLookback] = useState(1);
  const queryClient = useQueryClient();
  const { isLoggedIn } = useUser();

  // Only show for logged-in users (admin check happens via role in UserProvider)
  // For now, checking isLoggedIn since admin panel links already gate on login
  if (!isLoggedIn) return null;

  const { data: status } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 5_000,
  });

  const triggerMutation = useMutation({
    mutationFn: (hours: number) => triggerPipelineIngestion(hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  const summary = status?.summary;
  const isProcessing = summary?.is_processing ?? false;

  return (
    <div className="glass-card overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-200/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isProcessing ? (
            <Activity className="w-4 h-4 text-accent animate-pulse" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          )}
          <span className="text-sm font-medium text-gray-200">
            News Pipeline
          </span>
          {isProcessing && (
            <span className="text-xs text-accent font-medium">
              {(summary?.active ?? 0) + (summary?.waiting ?? 0)} jobs in
              progress
            </span>
          )}
          {!isProcessing && summary && (
            <span className="text-xs text-gray-500">Idle</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className="hidden sm:flex items-center gap-3 text-xs tabular-nums text-gray-500">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {summary.completed}
              </span>
              {summary.failed > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  {summary.failed}
                </span>
              )}
            </div>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-2 animate-in border-t border-surface-300/30">
          {/* Queue rows - each expandable */}
          {status?.queues.map((queue) => (
            <ExpandableQueueRow key={queue.name} queue={queue} />
          ))}

          {/* Bulk clear actions */}
          {summary && (summary.waiting > 0 || summary.failed > 0) && (
            <BulkClearActions queues={status?.queues || []} summary={summary} />
          )}

          {/* Trigger ingestion */}
          <div className="pt-2 border-t border-surface-300/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Pull news from last:</span>
                <div className="flex items-center gap-1">
                  {LOOKBACK_OPTIONS.map((opt) => (
                    <button
                      key={opt.hours}
                      onClick={() => setSelectedLookback(opt.hours)}
                      className={clsx(
                        "px-2 py-0.5 text-xs rounded transition-colors",
                        selectedLookback === opt.hours
                          ? "bg-accent/20 text-accent border border-accent/40"
                          : "text-gray-500 hover:text-gray-300 border border-transparent"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => triggerMutation.mutate(selectedLookback)}
                disabled={triggerMutation.isPending || isProcessing}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  "bg-accent hover:bg-accent-dim text-white",
                  (triggerMutation.isPending || isProcessing) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {triggerMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {triggerMutation.isPending ? "Triggering..." : "Pull Now"}
              </button>
            </div>
            {triggerMutation.isSuccess && (
              <p className="text-xs text-green-400 mt-2">
                {triggerMutation.data?.message}
              </p>
            )}
            {triggerMutation.isError && (
              <p className="text-xs text-red-400 mt-2">
                Failed to trigger ingestion. Check that sources are configured.
              </p>
            )}
          </div>

          {/* Timestamp */}
          {status && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {new Date(status.timestamp).toLocaleTimeString()}
              </span>
              <span>Refreshes every 5s</span>
            </div>
          )}
          {!status && (
            <div className="py-4 text-center text-sm text-gray-500">
              Connecting to pipeline...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
