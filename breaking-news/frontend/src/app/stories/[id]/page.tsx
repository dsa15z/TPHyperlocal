"use client";

import { useState, useRef, useEffect } from "react";
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
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch, type SourcePost } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { FirstDraftPanel } from "@/components/FirstDraftPanel";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { StoryTimeline } from "@/components/StoryTimeline";
import { PredictionBadge } from "@/components/PredictionBadge";
import { FactCheckPanel } from "@/components/FactCheckPanel";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { TranslationPanel } from "@/components/TranslationPanel";
import { BreakingPackagePanel } from "@/components/BreakingPackagePanel";
import { fetchStory } from "@/lib/api";
import {
  formatRelativeTime,
  formatScore,
  getScoreTypeColor,
} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreBadge } from "@/components/ScoreBadge";

const PLATFORM_ICONS: Record<string, string> = {
  twitter: "\ud835\udd4f",
  TWITTER: "\ud835\udd4f",
  reddit: "R",
  facebook: "f",
  FACEBOOK: "f",
  instagram: "IG",
  youtube: "YT",
  news: "N",
  rss: "RSS",
  RSS: "RSS",
  NEWSAPI: "API",
  GDELT: "G",
  LLM_OPENAI: "AI",
  LLM_CLAUDE: "AI",
  LLM_GROK: "AI",
  LLM_GEMINI: "AI",
  MANUAL: "M",
};

const PLATFORM_LABELS: Record<string, string> = {
  RSS: "RSS Feed",
  NEWSAPI: "NewsAPI",
  TWITTER: "X/Twitter",
  FACEBOOK: "Facebook",
  GDELT: "GDELT",
  LLM_OPENAI: "AI (OpenAI)",
  LLM_CLAUDE: "AI (Claude)",
  LLM_GROK: "AI (Grok)",
  LLM_GEMINI: "AI (Gemini)",
  MANUAL: "Manual Entry",
};

// ─── Bookmark Button ───────────────────────────────────────────────────────

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

// ─── AI Summary Panel ──────────────────────────────────────────────────────

function AISummaryPanel({
  storyId,
  aiSummary,
  aiSummaryModel,
  aiSummaryAt,
}: {
  storyId: string;
  aiSummary: string | null;
  aiSummaryModel: string | null;
  aiSummaryAt: string | null;
}) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>(`/api/v1/stories/${storyId}/summarize`, {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      // The worker processes async — start polling every 5s until summary appears
      setIsGenerating(true);
    },
  });

  // Auto-trigger: generate summary on first render if none exists
  const hasTriggered = useRef(false);
  useEffect(() => {
    if (!aiSummary && !hasTriggered.current) {
      hasTriggered.current = true;
      generateMutation.mutate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for the summary while generating (worker runs async, may take 5-15s)
  useEffect(() => {
    if (!isGenerating) return;
    if (aiSummary) {
      setIsGenerating(false);
      return;
    }
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    }, 5000);
    return () => clearInterval(interval);
  }, [isGenerating, aiSummary, storyId, queryClient]);

  const showLoading = isGenerating && !aiSummary;

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className={clsx("w-4 h-4 text-purple-400", showLoading && "animate-pulse")} />
          <h3 className="text-sm font-semibold text-white">AI Source Summary</h3>
          {showLoading && (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {aiSummaryAt && (
            <span className="text-[10px] text-gray-500">
              Generated {formatRelativeTime(aiSummaryAt)}
              {aiSummaryModel && ` via ${aiSummaryModel}`}
            </span>
          )}
          {aiSummary && (
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || isGenerating}
              className="filter-btn text-xs flex items-center gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
            >
              {generateMutation.isPending || isGenerating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Regenerate
            </button>
          )}
        </div>
      </div>

      {aiSummary && (
        <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
          {aiSummary}
        </p>
      )}
    </div>
  );
}

// ─── Utility: strip HTML tags from RSS content ─────────────────────────────

function stripHtml(html: string): string {
  // Remove HTML tags, decode common entities, and clean up whitespace
  return html
    .replace(/<br\s*\/?>/gi, "\n")           // <br> → newline
    .replace(/<\/p>/gi, "\n\n")              // </p> → double newline (paragraph break)
    .replace(/<\/?(div|section|article|header|footer|blockquote|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")                 // strip all remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")             // collapse excessive newlines
    .trim();
}

// ─── Source Card (expandable, full text, links) ────────────────────────────

function SourceCard({ source }: { source: SourcePost }) {
  const [expanded, setExpanded] = useState(false);

  const rawText = expanded
    ? source.full_article || source.content
    : source.content;
  const displayText = stripHtml(rawText);

  const hasMore = (source.full_article && source.full_article.length > source.content.length)
    || displayText.length > 400;

  return (
    <div className="glass-card p-4 space-y-3 animate-in">
      {/* Header: platform, author, time, link */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-surface-300 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
            {PLATFORM_ICONS[source.platform] || source.platform[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200 truncate">
                {source.author}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-300/60 text-gray-400 flex-shrink-0">
                {PLATFORM_LABELS[source.platform] || source.platform}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(source.published_at)}
            </span>
          </div>
        </div>

        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            Read Original
          </a>
        )}
      </div>

      {/* Source title if available */}
      {source.title && (
        <h4 className="text-sm font-semibold text-gray-200">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              {stripHtml(source.title)}
            </a>
          ) : (
            stripHtml(source.title)
          )}
        </h4>
      )}

      {/* Full content — no line clamp when expanded */}
      <div className="relative">
        <p
          className={clsx(
            "text-gray-300 text-sm leading-relaxed whitespace-pre-wrap",
            !expanded && "line-clamp-6"
          )}
        >
          {displayText}
        </p>

        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show full article
              </>
            )}
          </button>
        )}
      </div>

      {/* Engagement metrics */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-surface-300/30">
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
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

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
            {stripHtml(story.summary)}
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

        {/* AI consolidated summary of all sources */}
        <AISummaryPanel
          storyId={id}
          aiSummary={story.ai_summary}
          aiSummaryModel={story.ai_summary_model}
          aiSummaryAt={story.ai_summary_at}
        />

        {/* One-click breaking package */}
        <BreakingPackagePanel storyId={id} />

        {/* Viral prediction */}
        <PredictionBadge storyId={id} />

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

        {/* Collaborative editor */}
        <CollaborativeEditor
          storyId={id}
          initialTitle={story.title}
          initialSummary={story.summary}
        />

        {/* Fact checking */}
        <FactCheckPanel storyId={id} />

        {/* Translations */}
        <TranslationPanel storyId={id} />

        {/* Story development timeline */}
        <StoryTimeline storyId={id} />

        {/* Editorial annotations */}
        <AnnotationPanel storyId={id} />

        {/* Source posts — full text, links, expandable */}
        {story.sources && story.sources.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">
                Source Articles ({story.sources.length})
              </h2>
            </div>

            <div className="space-y-3">
              {story.sources.map((source) => (
                <SourceCard key={source.id} source={source} />
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
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(source.published_at)}
                          <span className="text-gray-600">|</span>
                          <span>{PLATFORM_LABELS[source.platform] || source.platform}</span>
                          <span className="text-gray-600">|</span>
                          <span>{source.author}</span>
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent/80 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Link</span>
                          </a>
                        )}
                      </div>
                      {source.title && (
                        <p className="text-gray-200 text-sm font-medium mb-1">
                          {stripHtml(source.title)}
                        </p>
                      )}
                      <p className="text-gray-300 text-sm line-clamp-2">
                        {stripHtml(source.content)}
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
