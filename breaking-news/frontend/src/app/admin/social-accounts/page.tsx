"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Share2,
  CheckCircle,
  XCircle,
  Send,
  Twitter,
  Facebook,
  Instagram,
  Clock,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface SocialAccount {
  id: string;
  platform: "twitter" | "facebook" | "instagram";
  accountName: string;
  status: "connected" | "disconnected" | "expired";
  lastUsedAt: string | null;
}

interface PostHistoryItem {
  id: string;
  platform: string;
  content: string;
  postedAt: string;
  success: boolean;
  error: string | null;
}

const PLATFORM_META: Record<
  string,
  { label: string; icon: typeof Twitter; color: string; bgColor: string }
> = {
  twitter: {
    label: "X / Twitter",
    icon: Twitter,
    color: "text-sky-400",
    bgColor: "bg-sky-400/10",
  },
  facebook: {
    label: "Facebook",
    icon: Facebook,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-400",
    bgColor: "bg-pink-400/10",
  },
};

export default function SocialAccountsPage() {
  const queryClient = useQueryClient();

  // Post form state
  const [postText, setPostText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Fetch accounts
  const { data: accountsRaw, isLoading: accountsLoading } = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () =>
      apiFetch<any>("/api/v1/social/accounts", { headers: getAuthHeaders() }),
  });
  const accounts: SocialAccount[] = accountsRaw?.data || accountsRaw || [];

  // Post history (derive from accounts query or separate endpoint)
  const { data: historyRaw } = useQuery({
    queryKey: ["social-post-history"],
    queryFn: () =>
      apiFetch<any>("/api/v1/social/accounts?includeHistory=true", {
        headers: getAuthHeaders(),
      }),
  });
  const postHistory: PostHistoryItem[] =
    historyRaw?.history || historyRaw?.data?.history || [];

  // Publish mutations
  const publishMutation = useMutation({
    mutationFn: async (data: { text: string; platforms: string[] }) => {
      const results = await Promise.allSettled(
        data.platforms.map((platform) =>
          apiFetch<any>(`/api/v1/social/publish/${platform}`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ text: data.text }),
          })
        )
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0 && failures.length === results.length) {
        throw new Error("All posts failed");
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-history"] });
      setPostText("");
      setSelectedPlatforms([]);
    },
  });

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Connected
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            Disconnected
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Share2 className="w-6 h-6 text-emerald-400" />
            Social Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage connected social accounts and publish directly from the
            platform.
          </p>
        </div>

        {/* Connected Accounts */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">
              Connected Accounts
            </h2>
          </div>
          {accountsLoading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Share2 className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-gray-400">No social accounts connected.</p>
              <p className="text-gray-600 text-sm">
                Configure API credentials in the Credentials page to enable
                social publishing.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-300/30">
              {accounts.map((account) => {
                const meta = PLATFORM_META[account.platform] || {
                  label: account.platform,
                  icon: Share2,
                  color: "text-gray-400",
                  bgColor: "bg-gray-400/10",
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={account.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-surface-300/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={clsx(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          meta.bgColor
                        )}
                      >
                        <Icon className={clsx("w-5 h-5", meta.color)} />
                      </div>
                      <div>
                        <h3 className="text-white font-medium text-sm">
                          {account.accountName}
                        </h3>
                        <p className="text-gray-500 text-xs">{meta.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      {getStatusBadge(account.status)}
                      <span className="text-gray-600 text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {account.lastUsedAt
                          ? new Date(account.lastUsedAt).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Platform status summary for unconfigured platforms */}
          {accounts.length > 0 && (
            <div className="px-6 py-3 bg-surface-300/20 border-t border-surface-300/30">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                {["twitter", "facebook", "instagram"].map((platform) => {
                  const hasAccount = accounts.some(
                    (a) => a.platform === platform
                  );
                  const meta = PLATFORM_META[platform];
                  const Icon = meta.icon;
                  return (
                    <span
                      key={platform}
                      className="flex items-center gap-1.5"
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}:
                      {hasAccount ? (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-gray-500" />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick Post */}
        <div className="glass-card p-6 space-y-4 animate-in">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-gray-400" />
            Quick Post
          </h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Post Content
            </label>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="Write your post..."
              rows={3}
              className="filter-input w-full resize-none"
            />
            <p className="text-right text-[10px] text-gray-600 mt-1">
              {postText.length} / 280 characters
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Publish To
            </label>
            <div className="flex gap-2">
              {(["twitter", "facebook", "instagram"] as const).map(
                (platform) => {
                  const meta = PLATFORM_META[platform];
                  const Icon = meta.icon;
                  const isSelected = selectedPlatforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      onClick={() => togglePlatform(platform)}
                      className={clsx(
                        "filter-btn flex items-center gap-2 px-4 py-2 text-sm",
                        isSelected && "filter-btn-active"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {meta.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                publishMutation.mutate({
                  text: postText.trim(),
                  platforms: selectedPlatforms,
                })
              }
              disabled={
                !postText.trim() ||
                selectedPlatforms.length === 0 ||
                publishMutation.isPending
              }
              className={clsx(
                "px-5 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2",
                (!postText.trim() || selectedPlatforms.length === 0) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
              {publishMutation.isPending ? "Posting..." : "Post"}
            </button>
            {publishMutation.isSuccess && (
              <span className="text-green-400 text-sm flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Posted successfully
              </span>
            )}
            {publishMutation.isError && (
              <span className="text-red-400 text-sm flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Some posts failed
              </span>
            )}
          </div>
        </div>

        {/* Post History */}
        <div className="glass-card overflow-hidden animate-in">
          <div className="px-6 py-4 border-b border-surface-300/50">
            <h2 className="text-lg font-semibold text-white">Post History</h2>
          </div>
          {postHistory.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Clock className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-gray-400">No posts yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-300/30">
              {postHistory.map((post) => {
                const meta = PLATFORM_META[post.platform] || {
                  label: post.platform,
                  icon: Share2,
                  color: "text-gray-400",
                  bgColor: "bg-gray-400/10",
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={post.id}
                    className="px-6 py-4 hover:bg-surface-300/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center shrink-0 mt-0.5",
                            meta.bgColor
                          )}
                        >
                          <Icon
                            className={clsx("w-4 h-4", meta.color)}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm line-clamp-2">
                            {post.content}
                          </p>
                          {post.error && (
                            <p className="text-red-400/80 text-xs mt-1">
                              {post.error}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {post.success ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-gray-600 text-xs whitespace-nowrap">
                          {new Date(post.postedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
