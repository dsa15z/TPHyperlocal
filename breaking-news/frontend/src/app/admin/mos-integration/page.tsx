"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor,
  Settings,
  CheckCircle,
  XCircle,
  Send,
  Wifi,
  WifiOff,
  Clock,
  Tv,
  ListOrdered,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type SystemType = "ENPS" | "INEWS" | "OTHER";

interface MOSConfig {
  host: string;
  port: number;
  ncsID: string;
  mosID: string;
  systemType: SystemType;
  isConfigured: boolean;
  isConnected: boolean;
}

export default function MOSIntegrationPage() {
  const queryClient = useQueryClient();

  // Config form state
  const [systemType, setSystemType] = useState<SystemType>("ENPS");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("10540");
  const [ncsID, setNcsID] = useState("");
  const [mosID, setMosID] = useState("");

  // Test result
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  // Push form state
  const [rundownName, setRundownName] = useState("");
  const [showName, setShowName] = useState("");
  const [showTime, setShowTime] = useState("");

  // Fetch config
  const { data: config } = useQuery({
    queryKey: ["mos-config"],
    queryFn: () =>
      apiFetch<MOSConfig>("/api/v1/mos/config", { headers: getAuthHeaders() }),
  });

  // Configure mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch<any>("/api/v1/mos/configure", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mos-config"] });
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; latencyMs: number }>("/api/v1/mos/test", {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: (result) => setTestResult(result),
    onError: () =>
      setTestResult({ success: false, message: "Connection test failed" }),
  });

  // Push rundown mutation
  const pushRundownMutation = useMutation({
    mutationFn: (data: { rundownName: string }) =>
      apiFetch<any>("/api/v1/mos/push-rundown", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
  });

  // Push lineup mutation
  const pushLineupMutation = useMutation({
    mutationFn: (data: { showName: string; showTime: string }) =>
      apiFetch<any>("/api/v1/mos/push-lineup", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
  });

  const handleSaveConfig = () => {
    saveMutation.mutate({
      host: host.trim(),
      port: parseInt(port, 10),
      ncsID: ncsID.trim(),
      mosID: mosID.trim(),
      systemType,
    });
  };

  const isConnected = config?.isConnected ?? false;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Monitor className="w-6 h-6 text-orange-400" />
              MOS / ENPS Integration
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect to your newsroom automation system via MOS protocol.
            </p>
          </div>
          {/* Connection Status Indicator */}
          <div
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              isConnected
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            )}
          >
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Disconnected
              </>
            )}
          </div>
        </div>

        {/* Connection Setup */}
        <div className="glass-card p-6 space-y-5 animate-in">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            Connection Setup
          </h2>

          {config?.isConfigured && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Configured: {config.systemType} at {config.host}:{config.port}
            </div>
          )}

          {/* System Type Selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              System Type
            </label>
            <div className="flex gap-2">
              {(["ENPS", "INEWS", "OTHER"] as SystemType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSystemType(type)}
                  className={clsx(
                    "filter-btn px-4 py-2 text-sm",
                    systemType === type && "filter-btn-active"
                  )}
                >
                  {type === "ENPS"
                    ? "ENPS"
                    : type === "INEWS"
                    ? "iNews"
                    : "Other"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Host IP *
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="filter-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="10540"
                className="filter-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                NCS ID *
              </label>
              <input
                type="text"
                value={ncsID}
                onChange={(e) => setNcsID(e.target.value)}
                placeholder="ENPS.NEWSROOM"
                className="filter-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                MOS ID *
              </label>
              <input
                type="text"
                value={mosID}
                onChange={(e) => setMosID(e.target.value)}
                placeholder="BREAKINGNEWS.MOS"
                className="filter-input w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="filter-btn inline-flex items-center gap-1.5 text-sm"
            >
              {testMutation.isPending ? "Testing..." : "Test Connection"}
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={
                !host.trim() || !ncsID.trim() || !mosID.trim() || saveMutation.isPending
              }
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                (!host.trim() || !ncsID.trim() || !mosID.trim()) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </button>
            {saveMutation.isSuccess && (
              <span className="text-green-400 text-sm flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Saved
              </span>
            )}
          </div>

          {testResult && (
            <div
              className={clsx(
                "p-3 rounded-lg text-sm flex items-center gap-2",
                testResult.success
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              )}
            >
              {testResult.success ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Connection successful
                  {testResult.latencyMs !== undefined && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs bg-green-500/20 px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3" />
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  {testResult.message || "Connection failed"}
                </>
              )}
            </div>
          )}
        </div>

        {/* Push Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Push Rundown */}
          <div className="glass-card p-6 space-y-4 animate-in">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-gray-400" />
              Push Rundown
            </h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Rundown Name *
              </label>
              <input
                type="text"
                value={rundownName}
                onChange={(e) => setRundownName(e.target.value)}
                placeholder="5PM Breaking News"
                className="filter-input w-full"
              />
            </div>
            <button
              onClick={() =>
                pushRundownMutation.mutate({ rundownName: rundownName.trim() })
              }
              disabled={!rundownName.trim() || pushRundownMutation.isPending}
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2",
                !rundownName.trim() && "opacity-50 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
              {pushRundownMutation.isPending
                ? "Pushing..."
                : "Push to ENPS"}
            </button>
            {pushRundownMutation.isSuccess && (
              <p className="text-green-400 text-sm">Rundown pushed successfully!</p>
            )}
            {pushRundownMutation.isError && (
              <p className="text-red-400 text-sm">Failed to push rundown.</p>
            )}
          </div>

          {/* Push Lineup */}
          <div className="glass-card p-6 space-y-4 animate-in">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Tv className="w-5 h-5 text-gray-400" />
              Push Lineup
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Show Name *
                </label>
                <input
                  type="text"
                  value={showName}
                  onChange={(e) => setShowName(e.target.value)}
                  placeholder="Evening News"
                  className="filter-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Show Time *
                </label>
                <input
                  type="time"
                  value={showTime}
                  onChange={(e) => setShowTime(e.target.value)}
                  className="filter-input w-full"
                />
              </div>
            </div>
            <button
              onClick={() =>
                pushLineupMutation.mutate({
                  showName: showName.trim(),
                  showTime: showTime.trim(),
                })
              }
              disabled={
                !showName.trim() ||
                !showTime.trim() ||
                pushLineupMutation.isPending
              }
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2",
                (!showName.trim() || !showTime.trim()) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
              {pushLineupMutation.isPending
                ? "Pushing..."
                : "Push Lineup"}
            </button>
            {pushLineupMutation.isSuccess && (
              <p className="text-green-400 text-sm">Lineup pushed successfully!</p>
            )}
            {pushLineupMutation.isError && (
              <p className="text-red-400 text-sm">Failed to push lineup.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
