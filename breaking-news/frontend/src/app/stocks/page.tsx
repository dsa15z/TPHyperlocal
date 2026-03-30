"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, DollarSign, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  direction: string;
}

function formatPrice(price: number, isCrypto: boolean = false): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toFixed(2);
}

function ReferenceBar({ quotes }: { quotes: Quote[] }) {
  return (
    <div className="glass-card p-4 flex items-center justify-between gap-4">
      {quotes.map((q) => (
        <div key={q.symbol} className="flex items-center gap-3">
          <div>
            <div className="text-xs text-gray-500 font-medium">{q.label}</div>
            <div className="text-lg font-bold text-white tabular-nums">
              {q.symbol.includes("BTC") ? "$" : ""}{formatPrice(q.price, q.symbol.includes("BTC"))}
            </div>
          </div>
          <div className={clsx("flex items-center gap-1 text-sm font-bold tabular-nums", q.direction === "UP" ? "text-green-400" : "text-red-400")}>
            {q.direction === "UP" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function ScrollingTicker({ quotes }: { quotes: Quote[] }) {
  if (quotes.length === 0) return null;

  // Double the items for seamless loop
  const items = [...quotes, ...quotes];

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex animate-scroll">
        {items.map((q, i) => (
          <div key={`${q.symbol}-${i}`} className="flex items-center gap-2 px-4 py-2 whitespace-nowrap border-r border-surface-300/20">
            <span className="text-xs font-bold text-gray-300">{q.label || q.symbol}</span>
            <span className="text-xs text-white tabular-nums">${formatPrice(q.price)}</span>
            <span className={clsx("text-xs font-bold tabular-nums", q.direction === "UP" ? "text-green-400" : "text-red-400")}>
              {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

export default function StocksPage() {
  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ["stocks-live"],
    queryFn: () => apiFetch<any>("/api/v1/stocks/live"),
    refetchInterval: 60_000,
  });

  const { data: tickerData } = useQuery({
    queryKey: ["stocks-ticker"],
    queryFn: () => apiFetch<any>("/api/v1/stocks/ticker"),
    refetchInterval: 300_000,
  });

  const { data: alertData, isLoading: alertLoading } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () => apiFetch<any>("/api/v1/stocks/alerts"),
    refetchInterval: 60_000,
  });

  const liveQuotes: Quote[] = liveData?.data || [];
  const tickerQuotes: Quote[] = tickerData?.data || [];
  const alerts = alertData?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-green-400" /> Market Movers
        </h1>

        {/* Reference bar: DOW, NASDAQ, S&P, BTC */}
        {liveLoading ? (
          <div className="glass-card p-4 text-center text-gray-500">Loading market data...</div>
        ) : liveQuotes.length > 0 ? (
          <ReferenceBar quotes={liveQuotes} />
        ) : (
          <div className="glass-card p-4 text-center text-gray-500">Market data unavailable</div>
        )}

        {/* Scrolling ticker */}
        <ScrollingTicker quotes={tickerQuotes} />

        {/* Movers from ticker data (sorted by biggest move) */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Today&apos;s Biggest Movers</h2>
          {tickerQuotes.length === 0 ? (
            <div className="glass-card p-8 text-center text-gray-500">Loading ticker data...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tickerQuotes.filter((q) => Math.abs(q.changePercent) >= 0.5).map((q) => (
                <div key={q.symbol} className="glass-card p-4 flex items-center gap-4">
                  <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    q.direction === "UP" ? "bg-green-500/15" : "bg-red-500/15"
                  )}>
                    {q.direction === "UP"
                      ? <TrendingUp className="w-5 h-5 text-green-400" />
                      : <TrendingDown className="w-5 h-5 text-red-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold font-mono">{q.symbol.replace("-USD", "")}</span>
                      <span className="text-gray-500 text-xs">{q.label}</span>
                    </div>
                    <div className="text-sm text-gray-400">${formatPrice(q.price)}</div>
                  </div>
                  <div className={clsx("text-lg font-bold tabular-nums", q.direction === "UP" ? "text-green-400" : "text-red-400")}>
                    {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Major alerts from DB */}
        {alerts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Major Move Alerts ({">"}2%)</h2>
            <div className="space-y-3">
              {alerts.map((alert: any) => (
                <div key={alert.id} className="glass-card p-4 flex items-center gap-4 animate-in">
                  <div className={clsx(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    alert.direction === "UP" ? "bg-green-500/15" : "bg-red-500/15"
                  )}>
                    {alert.direction === "UP"
                      ? <TrendingUp className="w-6 h-6 text-green-400" />
                      : <TrendingDown className="w-6 h-6 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold font-mono">{alert.ticker}</span>
                      <span className="text-gray-400 text-sm">{alert.companyName}</span>
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-xs font-bold",
                        alert.magnitude === "MAJOR" ? "bg-red-500/20 text-red-400" :
                        alert.magnitude === "SIGNIFICANT" ? "bg-orange-500/20 text-orange-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      )}>{alert.magnitude}</span>
                    </div>
                    {alert.headline && <p className="text-sm text-gray-300 mt-1">{alert.headline}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-white tabular-nums">${alert.price?.toFixed(2)}</div>
                    <div className={clsx("text-sm font-bold tabular-nums", alert.direction === "UP" ? "text-green-400" : "text-red-400")}>
                      {alert.changePercent > 0 ? "+" : ""}{alert.changePercent?.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-600">{formatRelativeTime(alert.detectedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
