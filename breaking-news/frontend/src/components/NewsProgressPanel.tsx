"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  Play,
} from "lucide-react";
import clsx from "clsx";
import {
  fetchPipelineStatus,
  triggerPipelineIngestion,
  type QueueStatus,
} from "@/lib/api";

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
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
];

function QueueRow({ queue }: { queue: QueueStatus }) {
  const info = QUEUE_LABELS[queue.name] || {
    label: queue.name,
    icon: "\u2699\uFE0F",
  };
  const isActive = queue.active > 0;
  const hasWaiting = queue.waiting > 0;
  const hasFailed = queue.failed > 0;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-200/50">
      <div className="flex items-center gap-2 min-w-0">
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
          <span className="text-accent font-medium">
            {queue.active} active
          </span>
        )}
        {hasWaiting && (
          <span className="text-yellow-400">{queue.waiting} queued</span>
        )}
        <span className="text-gray-500">{queue.completed} done</span>
        {hasFailed && (
          <span className="text-red-400">{queue.failed} failed</span>
        )}
      </div>
    </div>
  );
}

export function NewsProgressPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLookback, setSelectedLookback] = useState(168); // default 7d
  const queryClient = useQueryClient();

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
        <div className="px-4 pb-4 space-y-3 animate-in border-t border-surface-300/30">
          {/* Queue rows */}
          {status?.queues.map((queue) => (
            <QueueRow key={queue.name} queue={queue} />
          ))}

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
                {triggerMutation.isPending
                  ? "Triggering..."
                  : "Pull Now"}
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
