"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  ChevronRight,
  MessageSquare,
  Mic2,
  Loader2,
  Volume2,
  User,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface WorkflowStage {
  id: string;
  name: string;
  slug: string;
  order: number;
  color: string;
  icon?: string;
  requiredRole: string;
  isInitial: boolean;
  isFinal: boolean;
}

interface EditorialComment {
  id: string;
  userId: string;
  content: string;
  action?: string;
  fromStage?: string;
  toStage?: string;
  createdAt: string;
}

interface AudioSpot {
  id: string;
  title: string;
  format: string;
  voiceId: string;
  status: string;
  audioBase64?: string;
  durationMs?: number;
  createdAt: string;
}

interface PublishedItem {
  id: string;
  platform: string;
  status: string;
  externalUrl?: string;
  publishedAt?: string;
}

export function WorkflowPanel({
  accountStoryId,
  currentStage,
  storyTitle,
}: {
  accountStoryId: string;
  currentStage: string;
  storyTitle: string;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [audioScript, setAudioScript] = useState("");
  const [audioVoice, setAudioVoice] = useState("alloy");
  const [publishPlatform, setPublishPlatform] = useState("twitter");
  const [activeSection, setActiveSection] = useState<
    "workflow" | "audio" | "publish"
  >("workflow");

  // Fetch workflow stages
  const { data: stagesData } = useQuery({
    queryKey: ["workflow-stages"],
    queryFn: () =>
      apiFetch<{ data: WorkflowStage[] }>("/api/v1/workflow/stages", {
        headers: getAuthHeaders(),
      }),
  });
  const stages: WorkflowStage[] = stagesData?.data || [];

  // Fetch editorial comments
  const { data: commentsData } = useQuery({
    queryKey: ["workflow-comments", accountStoryId],
    queryFn: () =>
      apiFetch<{ data: EditorialComment[] }>(
        `/api/v1/workflow/comments/${accountStoryId}`,
        { headers: getAuthHeaders() }
      ),
  });
  const comments: EditorialComment[] = commentsData?.data || [];

  // Fetch audio spots
  const { data: audioData } = useQuery({
    queryKey: ["workflow-audio", accountStoryId],
    queryFn: () =>
      apiFetch<{ data: AudioSpot[] }>(
        `/api/v1/workflow/audio/${accountStoryId}`,
        { headers: getAuthHeaders() }
      ),
  });
  const audioSpots: AudioSpot[] = audioData?.data || [];

  // Fetch published content
  const { data: publishedData } = useQuery({
    queryKey: ["workflow-published", accountStoryId],
    queryFn: () =>
      apiFetch<{ data: PublishedItem[] }>(
        `/api/v1/workflow/published/${accountStoryId}`,
        { headers: getAuthHeaders() }
      ),
  });
  const publishedItems: PublishedItem[] = publishedData?.data || [];

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: (data: { toStage: string; comment?: string }) =>
      apiFetch("/api/v1/workflow/transition", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ accountStoryId, ...data }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workflow-comments", accountStoryId],
      });
      queryClient.invalidateQueries({ queryKey: ["story"] });
      setComment("");
    },
  });

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch("/api/v1/workflow/comments", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ accountStoryId, content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workflow-comments", accountStoryId],
      });
      setComment("");
    },
  });

  // Audio generation mutation
  const audioMutation = useMutation({
    mutationFn: (data: { script: string; voice: string; format: string }) =>
      apiFetch("/api/v1/workflow/audio", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ accountStoryId, ...data }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workflow-audio", accountStoryId],
      });
      setAudioScript("");
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: (data: {
      platform: string;
      content: { title: string; body: string };
    }) =>
      apiFetch("/api/v1/workflow/publish", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ accountStoryId, ...data }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workflow-published", accountStoryId],
      });
    },
  });

  const currentStageObj = stages.find((s) => s.slug === currentStage);
  const nextStages = stages
    .filter((s) => s.order > (currentStageObj?.order ?? -1))
    .slice(0, 3);

  return (
    <div className="glass-card overflow-hidden">
      {/* Section tabs */}
      <div className="flex border-b border-surface-300/30">
        {(
          [
            { key: "workflow", label: "Workflow", icon: ArrowRight },
            {
              key: "audio",
              label: "Audio",
              icon: Volume2,
              count: audioSpots.length,
            },
            {
              key: "publish",
              label: "Publish",
              icon: Send,
              count: publishedItems.length,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={clsx(
              "flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
              activeSection === tab.key
                ? "text-accent border-b-2 border-accent"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {"count" in tab && tab.count ? (
              <span className="text-[10px] bg-surface-300 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {/* ── WORKFLOW TAB ── */}
        {activeSection === "workflow" && (
          <>
            {/* Stage pipeline visualization */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {stages.map((stage, i) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-1 flex-shrink-0"
                >
                  <div
                    className={clsx(
                      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                      stage.slug === currentStage
                        ? "ring-2 ring-offset-1 ring-offset-surface-100"
                        : stage.order < (currentStageObj?.order ?? 0)
                          ? "opacity-50"
                          : "opacity-70"
                    )}
                    style={{
                      backgroundColor:
                        stage.slug === currentStage
                          ? stage.color + "30"
                          : "transparent",
                      color: stage.color,
                      borderColor: stage.color,
                      border: "1px solid",
                    }}
                  >
                    {stage.name}
                  </div>
                  {i < stages.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Quick transition buttons */}
            {nextStages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {nextStages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() =>
                      transitionMutation.mutate({
                        toStage: stage.slug,
                        comment: comment || undefined,
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="filter-btn flex items-center gap-1.5 text-xs"
                    style={{
                      borderColor: stage.color + "50",
                      color: stage.color,
                    }}
                  >
                    <ArrowRight className="w-3 h-3" />
                    Move to {stage.name}
                  </button>
                ))}
              </div>
            )}

            {/* Comment thread */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <User className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-gray-400">
                      {c.action === "transition"
                        ? `Moved ${c.fromStage} → ${c.toStage}`
                        : ""}
                    </span>
                    <p className="text-gray-300">{c.content}</p>
                    <span className="text-gray-600 text-[10px]">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <div className="flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment or note..."
                className="filter-input flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    commentMutation.mutate(comment.trim());
                  }
                }}
              />
              <button
                onClick={() =>
                  comment.trim() && commentMutation.mutate(comment.trim())
                }
                disabled={!comment.trim() || commentMutation.isPending}
                className="filter-btn text-xs text-accent"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {/* ── AUDIO TAB ── */}
        {activeSection === "audio" && (
          <>
            <div className="space-y-3">
              <textarea
                value={audioScript}
                onChange={(e) => setAudioScript(e.target.value)}
                placeholder="Enter the script to convert to audio..."
                className="filter-input w-full h-20 resize-y text-sm"
              />
              <div className="flex items-center gap-3">
                <select
                  value={audioVoice}
                  onChange={(e) => setAudioVoice(e.target.value)}
                  className="filter-select text-xs"
                >
                  <option value="alloy">Alloy (neutral)</option>
                  <option value="echo">Echo (male)</option>
                  <option value="fable">Fable (storyteller)</option>
                  <option value="onyx">Onyx (deep male)</option>
                  <option value="nova">Nova (female)</option>
                  <option value="shimmer">Shimmer (warm female)</option>
                </select>
                <button
                  onClick={() =>
                    audioMutation.mutate({
                      script: audioScript,
                      voice: audioVoice,
                      format: "30s",
                    })
                  }
                  disabled={!audioScript.trim() || audioMutation.isPending}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                >
                  {audioMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Mic2 className="w-3 h-3" />
                  )}
                  Generate Audio
                </button>
              </div>
            </div>

            {/* Audio spots list */}
            {audioSpots.map((spot) => (
              <div
                key={spot.id}
                className="flex items-center gap-3 p-2 bg-surface-200/30 rounded-lg"
              >
                <div
                  className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    spot.status === "READY"
                      ? "bg-green-500/20 text-green-400"
                      : spot.status === "GENERATING"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                  )}
                >
                  {spot.status === "GENERATING" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-white">{spot.title}</span>
                  <span className="text-[10px] text-gray-500 block">
                    {spot.voiceId} &middot; {spot.format}
                  </span>
                </div>
                {spot.status === "READY" && spot.audioBase64 && (
                  <audio
                    controls
                    className="h-8"
                    src={`data:audio/mp3;base64,${spot.audioBase64}`}
                  />
                )}
              </div>
            ))}
          </>
        )}

        {/* ── PUBLISH TAB ── */}
        {activeSection === "publish" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                "twitter",
                "facebook",
                "linkedin",
                "youtube",
                "tiktok",
                "wordpress",
                "custom_webhook",
                "rss",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => setPublishPlatform(p)}
                  className={clsx(
                    "px-3 py-2 rounded-lg text-xs font-medium text-center transition-colors",
                    publishPlatform === p
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-surface-200/30 text-gray-400 hover:text-white"
                  )}
                >
                  {p
                    .replace("_", " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </button>
              ))}
            </div>

            <button
              onClick={() =>
                publishMutation.mutate({
                  platform: publishPlatform,
                  content: { title: storyTitle, body: storyTitle },
                })
              }
              disabled={publishMutation.isPending}
              className="w-full px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
            >
              {publishMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Publish to{" "}
              {publishPlatform
                .replace("_", " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>

            {/* Published items */}
            {publishedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-surface-200/30 rounded-lg text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                      item.status === "PUBLISHED"
                        ? "text-green-400 bg-green-500/10"
                        : item.status === "FAILED"
                          ? "text-red-400 bg-red-500/10"
                          : "text-yellow-400 bg-yellow-500/10"
                    )}
                  >
                    {item.status}
                  </span>
                  <span className="text-gray-300">{item.platform}</span>
                </div>
                {item.externalUrl && (
                  <a
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    View &rarr;
                  </a>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
