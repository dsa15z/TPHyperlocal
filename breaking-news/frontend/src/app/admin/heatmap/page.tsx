"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Flame } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface MarketPoint {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  storyCount: number;
  sourceCount: number;
  breakingCount: number;
}

// Simple Mercator projection for the map
function project(lat: number, lon: number, width: number, height: number): [number, number] {
  // Bounds: roughly covers North America + some international
  const minLat = 20, maxLat = 55, minLon = -130, maxLon = -60;
  const x = ((lon - minLon) / (maxLon - minLon)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))];
}

function getHeatColor(score: number): string {
  if (score > 50) return "#ef4444"; // red
  if (score > 20) return "#f97316"; // orange
  if (score > 10) return "#eab308"; // yellow
  if (score > 5) return "#22c55e";  // green
  return "#6366f1"; // indigo (low activity)
}

export default function HeatmapPage() {
  const [hoveredMarket, setHoveredMarket] = useState<MarketPoint | null>(null);
  const [timeRange, setTimeRange] = useState("24h");

  const { data: marketsData, isLoading } = useQuery({
    queryKey: ["heatmap-markets", timeRange],
    queryFn: () => apiFetch<any>(`/api/v1/admin/markets?limit=500`, { headers: getAuthHeaders() }),
    refetchInterval: 60_000,
  });

  const markets: MarketPoint[] = ((marketsData as any)?.data || [])
    .filter((m: any) => m.latitude && m.longitude && m.latitude !== 0)
    .map((m: any) => ({
      id: m.id,
      name: m.name,
      state: m.state || '',
      latitude: m.latitude,
      longitude: m.longitude,
      storyCount: m.storyCount || 0,
      sourceCount: m.sourceCount || 0,
      breakingCount: 0,
    }));

  const maxStories = Math.max(1, ...markets.map(m => m.storyCount));
  const W = 900, H = 500;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-400" />
            Story Heatmap
          </h1>
          <div className="flex items-center gap-2">
            {["6h", "24h", "7d", "30d"].map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  timeRange === t ? "bg-accent/20 text-accent border border-accent/50" : "text-gray-400 border border-gray-700"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="glass-card p-4 overflow-hidden relative">
          {isLoading && <div className="text-center py-20 text-gray-500">Loading markets...</div>}

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '60vh' }}>
            {/* Background */}
            <rect width={W} height={H} fill="rgba(15,23,42,0.5)" rx={8} />

            {/* Grid lines */}
            {[0.2, 0.4, 0.6, 0.8].map(pct => (
              <line key={`h${pct}`} x1={0} y1={pct * H} x2={W} y2={pct * H} stroke="rgba(255,255,255,0.03)" />
            ))}
            {[0.2, 0.4, 0.6, 0.8].map(pct => (
              <line key={`v${pct}`} x1={pct * W} y1={0} x2={pct * W} y2={H} stroke="rgba(255,255,255,0.03)" />
            ))}

            {/* Market dots */}
            {markets.map(m => {
              const [x, y] = project(m.latitude, m.longitude, W, H);
              const radius = Math.max(4, Math.min(25, (m.storyCount / maxStories) * 25 + 3));
              const color = getHeatColor(m.storyCount);
              const isHovered = hoveredMarket?.id === m.id;

              return (
                <g key={m.id}
                  onMouseEnter={() => setHoveredMarket(m)}
                  onMouseLeave={() => setHoveredMarket(null)}
                  className="cursor-pointer"
                >
                  {/* Glow */}
                  <circle cx={x} cy={y} r={radius * 1.5} fill={color} opacity={0.15} />
                  {/* Dot */}
                  <circle
                    cx={x} cy={y} r={isHovered ? radius * 1.3 : radius}
                    fill={color}
                    opacity={isHovered ? 0.9 : 0.7}
                    stroke={isHovered ? "white" : "none"}
                    strokeWidth={isHovered ? 2 : 0}
                  />
                  {/* Label (for large dots) */}
                  {(radius > 8 || isHovered) && (
                    <text x={x} y={y - radius - 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold" opacity={0.8}>
                      {m.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hoveredMarket && (
            <div className="absolute top-4 right-4 bg-gray-900/95 border border-surface-300 rounded-lg p-3 min-w-[200px] shadow-xl">
              <div className="text-sm font-bold text-white">{hoveredMarket.name}{hoveredMarket.state ? `, ${hoveredMarket.state}` : ''}</div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Stories:</span><span className="text-white font-mono">{hoveredMarket.storyCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Sources:</span><span className="text-white font-mono">{hoveredMarket.sourceCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Coordinates:</span><span className="text-gray-500 font-mono text-[10px]">{hoveredMarket.latitude.toFixed(2)}, {hoveredMarket.longitude.toFixed(2)}</span></div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <span>Dot size = story volume</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> 50+ stories</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> 20-50</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> 10-20</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> 5-10</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" /> &lt;5</span>
          </div>
        </div>

        {/* Market list */}
        <div className="glass-card p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Markets by Story Volume</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {markets
              .sort((a, b) => b.storyCount - a.storyCount)
              .slice(0, 24)
              .map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-200/30">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getHeatColor(m.storyCount) }} />
                  <span className="text-xs text-gray-300 truncate">{m.name}</span>
                  <span className="text-xs text-gray-500 font-mono ml-auto">{m.storyCount.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
