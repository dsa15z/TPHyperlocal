"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  MessageCircle,
  Heart,
  Share2,
  Clock,
  MapPin,
  Tag,
  Bookmark,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { FirstDraftPanel } from "@/components/FirstDraftPanel";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { StoryTimeline } from "@/components/StoryTimeline";
import { fetchStory } from "@/lib/api";
import {
  formatRelativeTime,
  formatScore,
  getScoreTypeColor,
} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreBadge } from "@/components/ScoreBadge";

const PLATFORM_ICONS: Record<string, string> = {
  twitter: "𝕏",
  reddit: "R",
  facebook: "f",
  instagram: "IG",
  youtube: "YT",
  news: "N",
  rss: "RSS",
};

function BookmarkButton({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => apiFetch<any>("/api/v1/bookmarks", { headers: getAuthHeaders() }),
  });

  const isBookmarked = (data?.data || []).some((b: any) => b.storyId === storyId);

  const addMutation = useMutation({
    mutationFn: () => apiFetch<any>("/api/v1/bookmarks", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ storyId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => apiFetch<void>(`/api/v1/bookmarks/${storyId}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  return (
    <button
      onClick={() => isBookmarked ? removeMutation.mutate() : addMutation.mutate()}
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
        isBookmarked
          ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
          : "bg-surface-200 text-gray-400 border border-surface-300 hover:text-white"
      )}
    >
      <Bookmark className={clsx("w-4 h-4", isBookmarked && "fill-yellow-400")} />
      {isBookmarked ? "Bookmarked" : "Bookmark"}
    </button>
  );
}

export default function StoryDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: story, isLoading, isError, error } = useQuery({
    queryKey: ["story", id],
    queryFn: () => fetchStory(id),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Clock className="w-5 h-5 animate-spin mr-2" />
        Loading story...
      </div>
    );
  }

  if (isError || !story) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-4">
        <p className="text-red-400">
          {error instanceof Error ? error.message : "Story not found"}
        </p>
        <Link href="/" className="text-accent hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const scores: {
    label: string;
    value: number;
    type: "breaking" | "trending" | "confidence" | "locality";
  }[] = [
    { label: "Breaking Score", value: story.breaking_score, type: "breaking" },
    { label: "Trending Score", value: story.trending_score, type: "trending" },
    {
      label: "Confidence Score",
      value: story.confidence_score,
      type: "confidence",
    },
    { label: "Locality Score", value: story.locality_score, type: "locality" },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Story header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={story.status} />
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Tag className="w-3 h-3" />
              {story.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              {story.location}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-white leading-tight">
            {story.title}
          </h1>

          <p className="text-gray-400 text-lg leading-relaxed">
            {story.summary}
          </p>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              First seen: {formatRelativeTime(story.first_seen)}
            </span>
            <span>
              Last updated: {formatRelativeTime(story.last_updated)}
            </span>
            <span>{story.source_count} sources</span>
          </div>

          {/* Bookmark button */}
          {isAuthenticated() && <BookmarkButton storyId={id} />}
        </div>

        {/* AI First Drafts */}
        <FirstDraftPanel storyId={id} />

        {/* Score cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {scores.map((score) => {
            const colors = getScoreTypeColor(score.type);
            return (
              <div
                key={score.type}
                className={clsx("glass-card p-4 space-y-3", colors.bg)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400">
                    {score.label}
                  </span>
                  <span
                    className={clsx(
                      "text-2xl font-bold tabular-nums",
                      colors.text
                    )}
                  >
                    {formatScore(score.value)}
                  </span>
                </div>
                <div className="score-bar h-3">
                  <div
                    className={clsx("score-bar-fill", colors.bar)}
                    style={{
                      width: `${Math.min(score.value * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Composite score */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">
              Composite Score
            </span>
            <span className="text-3xl font-bold text-white tabular-nums">
              {formatScore(story.composite_score)}
            </span>
          </div>
          <div className="score-bar h-4">
            <div
              className="score-bar-fill bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{
                width: `${Math.min(story.composite_score * 100, 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Story development timeline */}
        <StoryTimeline storyId={id} />

        {/* Editorial annotations */}
        <AnnotationPanel storyId={id} />

        {/* Source posts */}
        {story.sources && story.sources.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Source Posts ({story.sources.length})
            </h2>

            <div className="space-y-3">
              {story.sources.map((source) => (
                <div
                  key={source.id}
                  className="glass-card p-4 space-y-3 animate-in"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Platform icon */}
                      <span className="w-8 h-8 rounded-lg bg-surface-300 flex items-center justify-center text-xs font-bold text-gray-300">
                        {PLATFORM_ICONS[source.platform.toLowerCase()] ||
                          source.platform[0]?.toUpperCase()}
                      </span>
                      <div>
                        <span className="text-sm font-medium text-gray-200">
                          {source.author}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          on {source.platform}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(source.published_at)}
                      </span>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 hover:text-accent transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm leading-relaxed line-clamp-4">
                    {source.content}
                  </p>

                  {/* Engagement metrics */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {source.engagement.likes.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Share2 className="w-3 h-3" />
                      {source.engagement.shares.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {source.engagement.comments.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timeline */}
        {story.sources && story.sources.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Timeline</h2>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-surface-300" />
              {[...story.sources]
                .sort(
                  (a, b) =>
                    new Date(a.published_at).getTime() -
                    new Date(b.published_at).getTime()
                )
                .map((source) => (
                  <div key={source.id} className="relative flex items-start gap-4">
                    <div className="absolute left-[-15px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface" />
                    <div className="flex-1 glass-card p-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(source.published_at)}
                        <span className="text-gray-600">|</span>
                        <span>{source.platform}</span>
                        <span className="text-gray-600">|</span>
                        <span>{source.author}</span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-2">
                        {source.content}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
