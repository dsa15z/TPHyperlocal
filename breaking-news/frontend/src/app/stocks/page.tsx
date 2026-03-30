"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export default function StocksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () => apiFetch<any>("/api/v1/stocks/alerts"),
    refetchInterval: 60_000,
  });

  const alerts = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-green-400" /> Market Movers
          </h1>
          <p className="text-sm text-gray-500 mt-1">Major stock price movements that may generate Finance category stories. Only shows moves above 2%.</p>
        </div>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading market data...</div>
        ) : alerts.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <DollarSign className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No significant market moves detected.</p>
            <p className="text-gray-600 text-sm">Stock alerts appear when tickers move more than 2% in a session.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="glass-card p-4 flex items-center gap-4 animate-in">
                {/* Direction indicator */}
                <div className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  alert.direction === "UP" ? "bg-green-500/15" : "bg-red-500/15"
                )}>
                  {alert.direction === "UP"
                    ? <TrendingUp className="w-6 h-6 text-green-400" />
                    : <TrendingDown className="w-6 h-6 text-red-400" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold font-mono">{alert.ticker}</span>
                    <span className="text-gray-400 text-sm">{alert.companyName}</span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-xs font-bold",
                      alert.magnitude === "MAJOR" ? "bg-red-500/20 text-red-400" :
                      alert.magnitude === "SIGNIFICANT" ? "bg-orange-500/20 text-orange-400" :
                      "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {alert.magnitude}
                    </span>
                  </div>
                  {alert.headline && <p className="text-sm text-gray-300 mt-1">{alert.headline}</p>}
                </div>

                {/* Price info */}
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-white tabular-nums">${alert.price?.toFixed(2)}</div>
                  <div className={clsx(
                    "text-sm font-bold tabular-nums",
                    alert.direction === "UP" ? "text-green-400" : "text-red-400"
                  )}>
                    {alert.changePercent > 0 ? "+" : ""}{alert.changePercent?.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-600">{formatRelativeTime(alert.detectedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
