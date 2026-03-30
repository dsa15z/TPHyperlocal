"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Copy, Check, Loader2, Send } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const SECTIONS = [
  { key: "broadcastScript", label: "Broadcast Script", icon: "📺" },
  { key: "socialPost", label: "Social Post", icon: "📱" },
  { key: "pushTitle", label: "Push Title", icon: "🔔" },
  { key: "pushBody", label: "Push Body", icon: "🔔" },
  { key: "webSummary", label: "Web Summary", icon: "🌐" },
  { key: "bulletPoints", label: "Bullet Points", icon: "📋" },
  { key: "graphicPrompt", label: "Graphic Prompt", icon: "🎨" },
];

export function BreakingPackagePanel({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["breaking-packages", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/breaking-packages`),
    refetchInterval: 10_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/breaking-package`, {
      method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["breaking-packages", storyId] }),
  });

  const packages = data?.data || [];
  const latest = packages[0];
  const loggedIn = isAuthenticated();

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-400" />
          One-Click Breaking Package
        </h2>
        {loggedIn && (
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
          >
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {generateMutation.isPending ? "Generating..." : "Generate Package"}
          </button>
        )}
      </div>

      {generateMutation.isSuccess && !latest && (
        <p className="text-xs text-green-400 animate-in">Package is being generated... refresh in a moment.</p>
      )}

      {!latest ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">
          Click &quot;Generate Package&quot; to create a complete breaking news package: broadcast script, social post, push notification, web summary, and graphic prompt — all in one click.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>{formatRelativeTime(latest.createdAt)}</span>
            <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold",
              latest.status === "PUBLISHED" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
            )}>{latest.status}</span>
          </div>

          {SECTIONS.map((section) => {
            const content = latest[section.key];
            if (!content) return null;
            return (
              <div key={section.key} className="glass-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                    <span>{section.icon}</span> {section.label}
                  </span>
                  <button onClick={() => handleCopy(content, section.key)} className="text-xs text-gray-500 hover:text-white flex items-center gap-1">
                    {copiedKey === section.key ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{content}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
