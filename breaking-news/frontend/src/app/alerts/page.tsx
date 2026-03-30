"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudLightning, Car, Gavel, Building2, Radio } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  SEVERE_WEATHER: { icon: <CloudLightning className="w-4 h-4" />, color: "text-yellow-400 bg-yellow-500/10" },
  POWER_OUTAGE: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-orange-400 bg-orange-500/10" },
  TRAFFIC_CLOSURE: { icon: <Car className="w-4 h-4" />, color: "text-blue-400 bg-blue-500/10" },
  COURT_FILING: { icon: <Gavel className="w-4 h-4" />, color: "text-purple-400 bg-purple-500/10" },
  GOV_AGENDA_ITEM: { icon: <Building2 className="w-4 h-4" />, color: "text-cyan-400 bg-cyan-500/10" },
  POLICE_DISPATCH: { icon: <Radio className="w-4 h-4" />, color: "text-red-400 bg-red-500/10" },
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/40",
  WARNING: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  WATCH: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  INFO: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

export default function AlertsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-data-alerts"],
    queryFn: () => apiFetch<any>("/api/v1/public-data/alerts"),
    refetchInterval: 30_000,
  });

  const alerts = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400" /> Public Data Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Real-time alerts from NWS weather, utility outages, court filings, government agendas, police dispatch, and traffic incidents.</p>
        </div>

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No public data alerts.</p>
            <p className="text-gray-600 text-sm">Configure public data feeds in admin to start receiving alerts from government sources.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert: any) => {
              const typeConfig = TYPE_CONFIG[alert.type] || TYPE_CONFIG.POLICE_DISPATCH;
              return (
                <div key={alert.id} className="glass-card p-4 flex items-start gap-4 animate-in">
                  <div className={clsx("p-2 rounded-lg flex-shrink-0", typeConfig.color)}>
                    {typeConfig.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold border", SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.INFO)}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-gray-500">{alert.feed?.name || alert.type.replace("_", " ")}</span>
                      <span className="text-xs text-gray-600">{formatRelativeTime(alert.detectedAt)}</span>
                    </div>
                    <h3 className="text-white font-medium">{alert.title}</h3>
                    {alert.location && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <span className="text-gray-600">📍</span> {alert.location}
                      </p>
                    )}
                    {alert.description && (
                      <p className="text-sm text-gray-400 mt-2 line-clamp-3">{alert.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
