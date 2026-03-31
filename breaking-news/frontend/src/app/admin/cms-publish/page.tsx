"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileUp,
  Settings,
  CheckCircle,
  XCircle,
  Search,
  Send,
  ExternalLink,
  Globe,
  Server,
  Code,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type CMSType = "WORDPRESS" | "ARC" | "CUSTOM_REST";
type AuthType = "BASIC" | "BEARER" | "API_KEY";

interface CMSConfig {
  type: CMSType;
  baseUrl: string;
  authType: AuthType;
  isConfigured: boolean;
}

interface PublishedStory {
  id: string;
  storyId: string;
  storyTitle: string;
  cmsType: string;
  publishedAt: string;
  status: string;
  cmsUrl: string | null;
}

const CMS_TYPE_META: Record<CMSType, { label: string; icon: typeof Globe }> = {
  WORDPRESS: { label: "WordPress", icon: Globe },
  ARC: { label: "Arc Publishing", icon: Server },
  CUSTOM_REST: { label: "Custom REST API", icon: Code },
};

export default function CMSPublishPage() {
  const queryClient = useQueryClient();

  // Config form state
  const [cmsType, setCmsType] = useState<CMSType>("WORDPRESS");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("BEARER");
  const [credentials, setCredentials] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Publish form state
  const [storySearch, setStorySearch] = useState("");
  const [selectedStory, setSelectedStory] = useState<any>(null);
  const [titleOverride, setTitleOverride] = useState("");
  const [publishStatus, setPublishStatus] = useState<"draft" | "publish">("draft");

  // Fetch existing config
  const { data: config } = useQuery({
    queryKey: ["cms-config"],
    queryFn: () =>
      apiFetch<CMSConfig>("/api/v1/cms/config", { headers: getAuthHeaders() }),
  });

  // Fetch published history
  const { data: publishedRaw } = useQuery({
    queryKey: ["cms-published"],
    queryFn: () =>
      apiFetch<any>("/api/v1/cms/published", { headers: getAuthHeaders() }),
  });
  const published: PublishedStory[] = publishedRaw?.data || publishedRaw || [];

  // Search stories
  const { data: searchResults } = useQuery({
    queryKey: ["cms-story-search", storySearch],
    queryFn: () =>
      apiFetch<any>(
        `/api/v1/stories?limit=5&sort=compositeScore&order=desc${
          storySearch ? `&q=${encodeURIComponent(storySearch)}` : ""
        }`,
        { headers: getAuthHeaders() }
      ),
    enabled: storySearch.length > 0,
  });
  const searchStories = searchResults?.data || [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch<any>("/api/v1/cms/configure", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-config"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; message: string }>("/api/v1/cms/test", {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: (result) => setTestResult(result),
    onError: () =>
      setTestResult({ success: false, message: "Connection test failed" }),
  });

  const publishMutation = useMutation({
    mutationFn: (data: {
      storyId: string;
      title?: string;
      status?: string;
    }) =>
      apiFetch<any>("/api/v1/cms/publish", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-published"] });
      setSelectedStory(null);
      setTitleOverride("");
      setStorySearch("");
    },
  });

  const handleSaveConfig = () => {
    saveMutation.mutate({
      type: cmsType,
      baseUrl: baseUrl.trim(),
      authType,
      credentials: credentials.trim(),
    });
  };

  const handlePublish = () => {
    if (!selectedStory) return;
    publishMutation.mutate({
      storyId: selectedStory.id,
      title: titleOverride.trim() || undefined,
      status: publishStatus,
    });
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileUp className="w-6 h-6 text-indigo-400" />
            CMS Publishing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure your CMS connection and publish stories directly.
          </p>
        </div>

        {/* CMS Configuration */}
        <div className="glass-card p-6 space-y-5 animate-in">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            CMS Configuration
          </h2>

          {config?.isConfigured && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              Currently configured: {config.type} at {config.baseUrl}
            </div>
          )}

          {/* CMS Type Selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              CMS Type
            </label>
            <div className="flex gap-2">
              {(Object.keys(CMS_TYPE_META) as CMSType[]).map((type) => {
                const meta = CMS_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setCmsType(type)}
                    className={clsx(
                      "filter-btn flex items-center gap-2 px-4 py-2",
                      cmsType === type && "filter-btn-active"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Base URL *
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-site.com/wp-json/wp/v2"
                className="filter-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Auth Type
              </label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
                className="filter-input w-full"
              >
                <option value="BASIC">Basic Auth</option>
                <option value="BEARER">Bearer Token</option>
                <option value="API_KEY">API Key</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Credentials *
              </label>
              <input
                type="password"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                placeholder="Token or user:password"
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
              disabled={!baseUrl.trim() || !credentials.trim() || saveMutation.isPending}
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors",
                (!baseUrl.trim() || !credentials.trim()) &&
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
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {testResult.message}
            </div>
          )}
        </div>

        {/* Publish to CMS */}
        <div className="glass-card p-6 space-y-5 animate-in">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-gray-400" />
            Publish to CMS
          </h2>

          {/* Story Search */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Search Stories
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={storySearch}
                onChange={(e) => {
                  setStorySearch(e.target.value);
                  setSelectedStory(null);
                }}
                placeholder="Search by story title..."
                className="filter-input w-full pl-10"
              />
            </div>
            {storySearch && searchStories.length > 0 && !selectedStory && (
              <div className="mt-1 bg-surface-300/80 rounded-lg border border-surface-300/60 overflow-hidden">
                {searchStories.map((story: any) => (
                  <button
                    key={story.id}
                    onClick={() => {
                      setSelectedStory(story);
                      setStorySearch(story.editedTitle || story.title);
                      setTitleOverride(story.editedTitle || story.title);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-surface-300/50 transition-colors border-b border-surface-300/30 last:border-0"
                  >
                    <p className="text-white text-sm font-medium truncate">
                      {story.editedTitle || story.title}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {story.status} &middot; Score:{" "}
                      {(story.compositeScore ?? 0).toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedStory && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Title Override
                  </label>
                  <input
                    type="text"
                    value={titleOverride}
                    onChange={(e) => setTitleOverride(e.target.value)}
                    className="filter-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Publish Status
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPublishStatus("draft")}
                      className={clsx(
                        "filter-btn px-4 py-2 text-sm",
                        publishStatus === "draft" && "filter-btn-active"
                      )}
                    >
                      Draft
                    </button>
                    <button
                      onClick={() => setPublishStatus("publish")}
                      className={clsx(
                        "filter-btn px-4 py-2 text-sm",
                        publishStatus === "publish" && "filter-btn-active"
                      )}
                    >
                      Publish
                    </button>
                  </div>
                </div>
              </div>

              {/* Content Preview */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Content Preview
                </label>
                <div className="bg-surface-300/30 rounded-lg p-4 text-sm text-gray-300 max-h-40 overflow-y-auto">
                  {selectedStory.aiSummary ||
                    selectedStory.editedSummary ||
                    selectedStory.summary ||
                    "No content available"}
                </div>
              </div>

              <button
                onClick={handlePublish}
                disabled={publishMutation.isPending}
                className={clsx(
                  "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2",
                  publishMutation.isPending && "opacity-50 cursor-not-allowed"
                )}
              >
                <Send className="w-4 h-4" />
                {publishMutation.isPending
                  ? "Publishing..."
                  : "Publish to CMS"}
              </button>
              {publishMutation.isSuccess && (
                <span className="ml-3 text-green-400 text-sm">
                  Published successfully!
                </span>
              )}
              {publishMutation.isError && (
                <span className="ml-3 text-red-400 text-sm">
                  Publish failed. Check configuration.
                </span>
              )}
            </>
          )}
        </div>

        {/* Published History */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">
              Published History
            </h2>
          </div>
          {published.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FileUp className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-gray-400">No stories published to CMS yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Story Title
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      CMS Type
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Published
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      CMS URL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-surface-300/30 hover:bg-surface-300/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium max-w-[300px] truncate">
                        {item.storyTitle}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface-300/50 text-gray-300">
                          {item.cmsType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(item.publishedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "text-xs font-medium",
                            item.status === "publish"
                              ? "text-green-400"
                              : "text-yellow-400"
                          )}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.cmsUrl ? (
                          <a
                            href={item.cmsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-xs"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-600 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
