"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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

// ─── Throughput Chart (canvas-based, no library) ─────────────────────────────

interface ThroughputPoint {
  time: number;
  ingestion: number;
  enrichment: number;
  clustering: number;
  scoring: number;
}

const CHART_COLORS = {
  ingestion: "#60a5fa",   // blue-400
  enrichment: "#c084fc",  // purple-400
  clustering: "#fbbf24",  // amber-400
  scoring: "#4ade80",     // green-400
};

const MAX_POINTS = 60; // 5 min of data at 5s intervals

// Persistent history (survives re-renders)
let throughputHistory: ThroughputPoint[] = [];
let lastCompleted: Record<string, number> = {};

function ThroughputChart({ queueMap }: { queueMap: Record<string, QueueStatus> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Record new data point
  useEffect(() => {
    const now = Date.now();
    const point: ThroughputPoint = { time: now, ingestion: 0, enrichment: 0, clustering: 0, scoring: 0 };
    for (const key of ["ingestion", "enrichment", "clustering", "scoring"] as const) {
      const current = queueMap[key]?.completed || 0;
      const prev = lastCompleted[key] || current;
      point[key] = Math.max(0, current - prev);
      lastCompleted[key] = current;
    }
    if (Object.values(lastCompleted).some(v => v > 0)) {
      throughputHistory.push(point);
      if (throughputHistory.length > MAX_POINTS) throughputHistory = throughputHistory.slice(-MAX_POINTS);
    }
  }, [queueMap]);

  const CHART_PAD = { top: 8, bottom: 20, left: 4, right: 4 }; // bottom padding for x-axis labels

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || throughputHistory.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = throughputHistory;
    const chartH = h - CHART_PAD.top - CHART_PAD.bottom;
    const chartW = w - CHART_PAD.left - CHART_PAD.right;
    const maxVal = Math.max(1, ...data.flatMap(d => [d.ingestion, d.enrichment, d.clustering, d.scoring]));

    const getX = (i: number) => CHART_PAD.left + (i / (MAX_POINTS - 1)) * chartW;
    const getY = (val: number) => CHART_PAD.top + chartH - (val / maxVal) * chartH;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = getY((maxVal * i) / 4);
      ctx.beginPath(); ctx.moveTo(CHART_PAD.left, y); ctx.lineTo(w - CHART_PAD.right, y); ctx.stroke();
    }

    // Draw series
    for (const [key, color] of Object.entries(CHART_COLORS)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = getX(i);
        const y = getY((data[i] as any)[key] || 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.lineTo(getX(data.length - 1), CHART_PAD.top + chartH);
      ctx.lineTo(getX(0), CHART_PAD.top + chartH);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // X-axis time labels (every ~60s / 12 points)
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const labelInterval = Math.max(6, Math.floor(data.length / 5));
    for (let i = 0; i < data.length; i += labelInterval) {
      const t = new Date(data[i].time);
      const label = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ctx.fillText(label, getX(i), h - 4);
    }
    // Always show latest time
    if (data.length > 1) {
      const t = new Date(data[data.length - 1].time);
      ctx.textAlign = "right";
      ctx.fillText(t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), w - 4, h - 4);
    }

    // Y-axis labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "right";
    ctx.fillText(maxVal.toLocaleString(), w - 4, CHART_PAD.top + 8);

    // Hover crosshair
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length) {
      const x = getX(hoverIdx);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, CHART_PAD.top); ctx.lineTo(x, CHART_PAD.top + chartH); ctx.stroke();
      ctx.setLineDash([]);

      // Dots at each series value
      for (const [key, color] of Object.entries(CHART_COLORS)) {
        const val = (data[hoverIdx] as any)[key] || 0;
        const y = getY(val);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, [queueMap, throughputHistory.length, hoverIdx]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || throughputHistory.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartW = rect.width - CHART_PAD.left - CHART_PAD.right;
    const relX = (mouseX - CHART_PAD.left) / chartW;
    const idx = Math.round(relX * (MAX_POINTS - 1));
    const clamped = Math.max(0, Math.min(throughputHistory.length - 1, idx));
    setHoverIdx(clamped);
  }, []);

  const hoverData = hoverIdx !== null && hoverIdx < throughputHistory.length ? throughputHistory[hoverIdx] : null;
  const latest = throughputHistory.length > 0 ? throughputHistory[throughputHistory.length - 1] : null;
  const displayData = hoverData || latest;

  return (
    <div className="space-y-1" ref={containerRef}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">
          Throughput (items/5s)
          {hoverData && <span className="text-gray-500 ml-2">{new Date(hoverData.time).toLocaleTimeString()}</span>}
        </span>
        {displayData && (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span style={{ color: CHART_COLORS.ingestion }}>● Ingest {displayData.ingestion.toLocaleString()}</span>
            <span style={{ color: CHART_COLORS.enrichment }}>● Enrich {displayData.enrichment.toLocaleString()}</span>
            <span style={{ color: CHART_COLORS.clustering }}>● Cluster {displayData.clustering.toLocaleString()}</span>
            <span style={{ color: CHART_COLORS.scoring }}>● Score {displayData.scoring.toLocaleString()}</span>
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg bg-surface-200/30 border border-surface-300/20 cursor-crosshair"
        style={{ height: 120 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      />
      {throughputHistory.length < 3 && (
        <div className="text-[10px] text-gray-600 text-center">Collecting data... chart appears after ~15 seconds</div>
      )}
    </div>
  );
}

// Failed jobs tooltip — shows error reasons on hover with copy + auto-fix
function FailedJobsTooltip({ queue, count }: { queue: string; count: number }) {
  const [show, setShow] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data } = useQuery({
    queryKey: ["pipeline-failed-jobs", queue],
    queryFn: () => fetchPipelineJobs(queue, "failed", 20),
    enabled: show || pinned,
    staleTime: 10_000,
  });

  const jobs = (data as any)?.jobs || (data as any)?.data || [];

  const buildFailureLog = () => {
    const lines = [`=== ${queue} FAILURE LOG (${count.toLocaleString()} failed) ===`, `Time: ${new Date().toISOString()}`, ''];
    // Deduplicate by error message and count occurrences
    const errorCounts: Record<string, number> = {};
    for (const job of jobs) {
      const reason = job.failedReason || job.error || "Unknown error";
      errorCounts[reason] = (errorCounts[reason] || 0) + 1;
    }
    for (const [reason, cnt] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`[${cnt}x] ${reason}`);
    }
    lines.push('', `Total unique errors: ${Object.keys(errorCounts).length}`, `Total failed: ${count}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const log = buildFailureLog();
    try {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = log;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isVisible = show || pinned;

  return (
    <span className="relative">
      <span
        className="font-mono text-red-300 font-bold cursor-pointer underline decoration-dotted"
        onClick={() => setPinned(!pinned)}
      >
        {count.toLocaleString()} failed
      </span>
      {isVisible && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[480px] max-h-[70vh] bg-gray-900 border border-red-500/50 rounded-xl shadow-2xl"
        >
          {/* Header with actions */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-red-500/20">
            <span className="text-xs font-bold text-red-300">{queue} — {count.toLocaleString()} failed</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopy}
                className="px-2 py-0.5 text-[10px] font-medium rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
              >
                {copied ? "✓ Copied!" : "📋 Copy Log"}
              </button>
              {pinned && (
                <button onClick={() => { setPinned(false); setShow(false); }} className="text-gray-500 hover:text-white text-xs">✕</button>
              )}
            </div>
          </div>

          {/* Error list — deduplicated */}
          <div className="overflow-y-auto max-h-52 p-3 space-y-1.5">
            {jobs.length === 0 && <div className="text-xs text-gray-500">Loading...</div>}
            {(() => {
              const errorCounts: Record<string, { count: number; latest: string; attempts: number }> = {};
              for (const job of jobs) {
                const reason = job.failedReason || job.error || "Unknown error";
                if (!errorCounts[reason]) {
                  errorCounts[reason] = { count: 0, latest: '', attempts: job.attemptsMade || 0 };
                }
                errorCounts[reason].count++;
                errorCounts[reason].latest = job.processedOn ? new Date(job.processedOn).toLocaleTimeString() : '';
              }
              return Object.entries(errorCounts)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([reason, info], i) => (
                  <div key={i} className="text-[11px] border-l-2 border-red-500/40 pl-2 py-1">
                    <div className="text-red-200 font-medium">{reason}</div>
                    <div className="text-gray-500 text-[10px]">
                      {info.count > 1 ? `${info.count} occurrences` : '1 occurrence'} · last: {info.latest}
                    </div>
                  </div>
                ));
            })()}
          </div>

          <div className="text-[10px] text-gray-600 px-3 py-1.5 border-t border-red-500/20">
            Click "Copy Log" to paste into Claude for analysis
          </div>
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
          {active > 0 && <span className={clsx("font-mono font-bold", c.text)}>{active.toLocaleString()} active</span>}
          {waiting > 0 && <span className="font-mono text-yellow-300 font-bold">{waiting.toLocaleString()} queued</span>}
          {failed > 0 && <FailedJobsTooltip queue={stage.key} count={failed} />}
          {active === 0 && waiting === 0 && failed === 0 && (
            <span className="text-gray-400 font-mono">{completed.toLocaleString()} done</span>
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
          {totalFailed > 0 && <span className="text-red-400 font-bold">{totalFailed.toLocaleString()} failed</span>}
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

          {/* Throughput chart */}
          <ThroughputChart queueMap={queueMap} />

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
                  <Trash2 className="w-4 h-4" /> Clear {totalWaiting.toLocaleString()} Pending
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
