"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Database, Cpu, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

const CHART_COLORS = ["#60a5fa", "#c084fc", "#fbbf24", "#4ade80", "#f87171", "#38bdf8", "#fb923c", "#a78bfa"];

function MiniChart({ data, color, label, height = 60 }: { data: number[]; color: string; label: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(1, ...data);
    const pad = 4;

    // Fill
    ctx.fillStyle = color + "15";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - pad - ((data[i] / max) * (h - pad * 2));
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - pad - ((data[i] / max) * (h - pad * 2));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, color, height]);

  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const prev = data.length > 1 ? data[data.length - 2] : latest;
  const delta = latest - prev;

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-white">{latest.toLocaleString()}</span>
          {delta !== 0 && (
            <span className={clsx("text-[10px] font-mono", delta > 0 ? "text-green-400" : "text-red-400")}>
              {delta > 0 ? "+" : ""}{delta.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height }} />
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [timeRange, setTimeRange] = useState(24);

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["metrics-summary"],
    queryFn: () => apiFetch<any>("/api/v1/pipeline/metrics/summary"),
    refetchInterval: 30_000,
  });

  // Fetch per-queue throughput time series
  const { data: throughputData } = useQuery({
    queryKey: ["metrics-throughput", timeRange],
    queryFn: async () => {
      const queues = ["ingestion", "enrichment", "clustering", "scoring"];
      const results: Record<string, number[]> = {};
      for (const q of queues) {
        const res = await apiFetch<any>(`/api/v1/pipeline/metrics?metric=pipeline.throughput&hours=${timeRange}&granularity=${timeRange > 6 ? 'hourly' : 'raw'}`);
        const filtered = (res.data || []).filter((d: any) => (d.tags?.queue || d.tags) === q || JSON.stringify(d.tags || {}).includes(q));
        results[q] = filtered.map((d: any) => d.value || d.sum || d.avg || 0);
      }
      return results;
    },
    refetchInterval: 60_000,
  });

  const { data: storyData } = useQuery({
    queryKey: ["metrics-stories", timeRange],
    queryFn: () => apiFetch<any>(`/api/v1/pipeline/metrics?metric=stories.total&hours=${timeRange}&granularity=${timeRange > 6 ? 'hourly' : 'raw'}`),
    refetchInterval: 60_000,
  });

  const { data: sourceData } = useQuery({
    queryKey: ["metrics-sources"],
    queryFn: () => apiFetch<any>(`/api/v1/pipeline/metrics?metric=sources.active&hours=${timeRange}&granularity=${timeRange > 6 ? 'hourly' : 'raw'}`),
    refetchInterval: 60_000,
  });

  const summary = summaryData || {};
  const latest = summary.latest || {};
  const throughput24h = summary.throughput24h || [];

  // Extract latest values
  const getLatest = (key: string) => latest[key]?.value ?? 0;

  const totalThroughput = throughput24h.reduce((s: number, r: any) => s + (r.total || 0), 0);

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-accent" />
            System Metrics
          </h1>
          <div className="flex items-center gap-2">
            {[6, 24, 72, 168, 720].map(h => (
              <button
                key={h}
                onClick={() => setTimeRange(h)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  timeRange === h ? "bg-accent/20 text-accent border border-accent/50" : "text-gray-400 border border-gray-700 hover:text-white"
                )}
              >
                {h <= 24 ? `${h}h` : h <= 168 ? `${h / 24}d` : "30d"}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Stories (total)" value={getLatest('stories.total')} icon={Database} color="bg-blue-500/20" />
          <MetricCard label="Stories (last hour)" value={getLatest('stories.last_hour')} icon={TrendingUp} color="bg-green-500/20" />
          <MetricCard label="Active Sources" value={getLatest('sources.active')} icon={RefreshCw} color="bg-purple-500/20" />
          <MetricCard label="24h Throughput" value={totalThroughput} icon={Cpu} color="bg-amber-500/20" />
        </div>

        {/* Throughput charts per queue */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["ingestion", "enrichment", "clustering", "scoring"].map((q, i) => (
            <MiniChart
              key={q}
              data={throughputData?.[q] || []}
              color={CHART_COLORS[i]}
              label={`${q.charAt(0).toUpperCase() + q.slice(1)} throughput`}
            />
          ))}
        </div>

        {/* Story & source trends */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniChart
            data={(storyData?.data || []).map((d: any) => d.value || d.sum || d.avg || 0)}
            color="#60a5fa"
            label="Total stories over time"
            height={100}
          />
          <MiniChart
            data={(sourceData?.data || []).map((d: any) => d.value || d.sum || d.avg || 0)}
            color="#c084fc"
            label="Active sources over time"
            height={100}
          />
        </div>

        {/* 24h throughput by queue */}
        {throughput24h.length > 0 && (
          <div className="glass-card p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">24-Hour Throughput by Queue</h2>
            <div className="space-y-2">
              {throughput24h.map((r: any, i: number) => {
                const pct = totalThroughput > 0 ? (r.total / totalThroughput) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 w-24">{r.queue}</span>
                    <div className="flex-1 bg-surface-300/30 rounded-full h-4 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i] }} />
                    </div>
                    <span className="text-sm font-mono text-gray-300 w-20 text-right">{(r.total || 0).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* System info */}
        <div className="glass-card p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">System</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Memory</span>
              <div className="text-white font-mono">{getLatest('system.memory_mb')} MB</div>
            </div>
            <div>
              <span className="text-gray-500">Uptime</span>
              <div className="text-white font-mono">{Math.round(getLatest('system.uptime_min') / 60)}h {getLatest('system.uptime_min') % 60}m</div>
            </div>
            <div>
              <span className="text-gray-500">Breaking Now</span>
              <div className="text-white font-mono">{getLatest('stories.breaking')}</div>
            </div>
            <div>
              <span className="text-gray-500">Inactive Sources</span>
              <div className="text-white font-mono">{getLatest('sources.inactive')}</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-600 text-center">
          Metrics collected every 60 seconds • Raw data retained 7 days • Hourly rollups retained indefinitely
        </div>
      </main>
    </div>
  );
}
