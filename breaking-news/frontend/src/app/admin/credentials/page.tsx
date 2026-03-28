"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Key,
  Trash2,
  AlertCircle,
  Play,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import {
  fetchCredentials,
  createCredential,
  testCredential,
  deleteCredential,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

interface Credential {
  id: string;
  platform: string;
  name: string;
  apiKey: string;
  isActive: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  status?: "working" | "error" | "untested";
}

const PLATFORMS = [
  "twitter",
  "facebook",
  "reddit",
  "youtube",
  "telegram",
  "tiktok",
  "google",
  "openai",
];

export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  // Form state
  const [formPlatform, setFormPlatform] = useState("");
  const [formName, setFormName] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiSecret, setFormApiSecret] = useState("");
  const [formAccessToken, setFormAccessToken] = useState("");

  const { data: credentialsData, isLoading } = useQuery({
    queryKey: ["admin-credentials"],
    queryFn: fetchCredentials,
  });
  const credentials: Credential[] = (credentialsData as any)?.data || credentialsData || [];

  const createMutation = useMutation({
    mutationFn: createCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credentials"] });
      resetForm();
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credentials"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: testCredential,
    onSuccess: (result, id) => {
      setTestResults((prev) => ({ ...prev, [id]: result }));
      queryClient.invalidateQueries({ queryKey: ["admin-credentials"] });
    },
    onError: (_err, id) => {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, message: "Test request failed" },
      }));
    },
  });

  const resetForm = () => {
    setFormPlatform("");
    setFormName("");
    setFormApiKey("");
    setFormApiSecret("");
    setFormAccessToken("");
  };

  const handleCreate = () => {
    if (!formPlatform || !formName.trim() || !formApiKey.trim()) return;
    createMutation.mutate({
      platform: formPlatform,
      name: formName.trim(),
      apiKey: formApiKey.trim(),
      apiSecret: formApiSecret.trim() || undefined,
      accessToken: formAccessToken.trim() || undefined,
    });
  };

  const maskKey = (key: string): string => {
    if (!key || key.length <= 8) return "********";
    return key.slice(0, 4) + "****" + key.slice(-4);
  };

  const getStatusIndicator = (cred: Credential) => {
    const result = testResults[cred.id];
    if (result) {
      return result.success ? (
        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Working
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-red-400 text-xs">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Error
        </span>
      );
    }
    if (cred.lastError) {
      return (
        <span className="inline-flex items-center gap-1 text-red-400 text-xs">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Error
        </span>
      );
    }
    if (cred.lastUsedAt) {
      return (
        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Working
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
        <span className="w-2 h-2 rounded-full bg-gray-500" />
        Untested
      </span>
    );
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Key className="w-6 h-6 text-yellow-400" />
            API Credentials
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Credential
          </button>
        </div>
        {/* Add form */}
        {showForm && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Add New Credential
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Platform *
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                  className="filter-select w-full"
                >
                  <option value="">Select platform</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Credential name"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  API Key *
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="API key"
                  className="filter-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  API Secret
                </label>
                <input
                  type="password"
                  value={formApiSecret}
                  onChange={(e) => setFormApiSecret(e.target.value)}
                  placeholder="API secret (optional)"
                  className="filter-input w-full"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">
                  Access Token
                </label>
                <input
                  type="password"
                  value={formAccessToken}
                  onChange={(e) => setFormAccessToken(e.target.value)}
                  placeholder="Access token (optional)"
                  className="filter-input w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={
                  !formPlatform ||
                  !formName.trim() ||
                  !formApiKey.trim() ||
                  createMutation.isPending
                }
                className={clsx(
                  "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                  (!formPlatform ||
                    !formName.trim() ||
                    !formApiKey.trim() ||
                    createMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {createMutation.isPending ? "Adding..." : "Add Credential"}
              </button>
              {createMutation.isError && (
                <span className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Failed to add credential
                </span>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">
            Loading credentials...
          </div>
        ) : credentials.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Key className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No API credentials configured.</p>
            <p className="text-gray-600 text-sm">
              Add credentials to enable platform data collection.
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Platform
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      API Key
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Active
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Last Used
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Last Error
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((cred: Credential) => (
                    <tr
                      key={cred.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {getStatusIndicator(cred)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface-300/50">
                          {cred.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {cred.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {maskKey(cred.apiKey)}
                      </td>
                      <td className="px-4 py-3">
                        {cred.isActive ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-600" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {cred.lastUsedAt
                          ? formatRelativeTime(cred.lastUsedAt)
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-red-400/80 text-xs max-w-[200px] truncate">
                        {cred.lastError || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => testMutation.mutate(cred.id)}
                            disabled={testMutation.isPending}
                            className="filter-btn flex items-center gap-1 text-xs"
                            title="Test credential"
                          >
                            <Play className="w-3 h-3" />
                            Test
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Delete this credential? This cannot be undone."
                                )
                              ) {
                                deleteMutation.mutate(cred.id);
                              }
                            }}
                            className="filter-btn text-gray-500 hover:text-red-400"
                            title="Delete credential"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {testResults[cred.id] && (
                          <p
                            className={clsx(
                              "text-xs mt-1 text-right",
                              testResults[cred.id].success
                                ? "text-green-400"
                                : "text-red-400"
                            )}
                          >
                            {testResults[cred.id].message}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
