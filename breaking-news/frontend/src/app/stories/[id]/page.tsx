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
  GitMerge,
  GitBranch,
  ArrowUpRight,
  Link2,
  Star,
  BadgeCheck,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch, type SourcePost, updateAccountStory, activateAccountStory, type AccountStoryOverlay } from "@/lib/api";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { FirstDraftPanel } from "@/components/FirstDraftPanel";
import { StoryResearchPanel } from "@/components/StoryResearchPanel";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { StoryTimeline } from "@/components/StoryTimeline";
import { PredictionBadge } from "@/components/PredictionBadge";
import { FactCheckPanel } from "@/components/FactCheckPanel";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { TranslationPanel } from "@/components/TranslationPanel";
import { BreakingPackagePanel } from "@/components/BreakingPackagePanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
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
  compact,
}: {
  storyId: string;
  aiSummary: string | null;
  aiSummaryModel: string | null;
  aiSummaryAt: string | null;
  compact?: boolean;
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

  // Auto-poll: backend auto-generates AI summary on first view (fire-and-forget).
  // We just need to poll until it appears.
  const hasTriggered = useRef(false);
  useEffect(() => {
    if (!aiSummary && !hasTriggered.current) {
      hasTriggered.current = true;
      setIsGenerating(true);
      // Also trigger via the queue endpoint as a backup
      generateMutation.mutate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 3s while waiting for summary (backend generates on GET, takes 5-15s)
  useEffect(() => {
    if (!isGenerating) return;
    if (aiSummary) {
      setIsGenerating(false);
      return;
    }
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    }, 3000);
    // Stop polling after 30s (give up)
    const timeout = setTimeout(() => setIsGenerating(false), 30000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [isGenerating, aiSummary, storyId, queryClient]);

  const showLoading = isGenerating && !aiSummary;

  // Compact mode: just the regenerate button, no summary text (shown inline above)
  if (compact && aiSummary) {
    return (
      <div className="flex items-center gap-2">
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
          Regenerate AI Summary
        </button>
      </div>
    );
  }

  // Compact mode with no summary yet: show generating state
  if (compact && !aiSummary) {
    if (showLoading) {
      return (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
          Generating AI summary...
        </div>
      );
    }
    return null;
  }

  // Full mode (legacy — not used when compact=true)
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

  // Determine the best available text to show
  const strippedContent = stripHtml(source.content);
  const strippedTitle = stripHtml(source.title);
  const strippedFullArticle = source.full_article ? stripHtml(source.full_article) : null;

  // Detect if content is just the title repeated (common with Google News / Bing aggregators)
  const contentIsJustTitle =
    !strippedContent ||
    strippedContent.length < 50 ||
    strippedContent.toLowerCase().replace(/\s+/g, ' ').trim() ===
      strippedTitle.toLowerCase().replace(/\s+/g, ' ').trim();

  const rawText = expanded
    ? strippedFullArticle || strippedContent
    : contentIsJustTitle && strippedFullArticle
    ? strippedFullArticle
    : strippedContent;
  const displayText = rawText;

  const hasFullArticle = !!strippedFullArticle && strippedFullArticle.length > strippedContent.length;
  const hasMore = hasFullArticle || displayText.length > 400;

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
        {contentIsJustTitle && !strippedFullArticle ? (
          <div className="text-sm space-y-2">
            <p className="text-gray-500 italic">
              Full article text is being extracted from the original source...
            </p>
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent text-xs hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Read the full story at the original source
              </a>
            )}
          </div>
        ) : (
          <p
            className={clsx(
              "text-gray-300 text-sm leading-relaxed whitespace-pre-wrap",
              !expanded && "line-clamp-6"
            )}
          >
            {displayText}
          </p>
        )}

        {hasMore && !contentIsJustTitle && (
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

// ─── Account Workspace Bar ──────────────────────────────────────────────────

const ACCOUNT_STATUSES = [
  { value: "INBOX", label: "Inbox", color: "text-gray-400 bg-gray-500/10" },
  { value: "ASSIGNED", label: "Assigned", color: "text-blue-400 bg-blue-500/10" },
  { value: "IN_PROGRESS", label: "In Progress", color: "text-amber-400 bg-amber-500/10" },
  { value: "DRAFT_READY", label: "Draft Ready", color: "text-cyan-400 bg-cyan-500/10" },
  { value: "PUBLISHED", label: "Published", color: "text-green-400 bg-green-500/10" },
  { value: "KILLED", label: "Killed", color: "text-red-400 bg-red-500/10" },
];

function AccountWorkspaceBar({ accountStory, storyId }: { accountStory: AccountStoryOverlay; storyId: string }) {
  const queryClient = useQueryClient();
  const statusInfo = ACCOUNT_STATUSES.find((s) => s.value === accountStory.accountStatus) || ACCOUNT_STATUSES[0];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateAccountStory(storyId, data as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["story", storyId] }),
  });

  return (
    <div className="glass-card-strong p-3 flex items-center gap-3 flex-wrap">
      <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Your Workspace</span>
      <div className="h-4 w-px bg-surface-300/50" />

      {/* Status selector */}
      <select
        value={accountStory.accountStatus}
        onChange={(e) => mutation.mutate({ accountStatus: e.target.value })}
        className={clsx("px-2 py-1 rounded text-xs font-semibold border-0 cursor-pointer", statusInfo.color)}
      >
        {ACCOUNT_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Assigned to */}
      {accountStory.assignedTo && (
        <span className="text-xs text-gray-400">
          Assigned to: <span className="text-white">{accountStory.assignedTo}</span>
        </span>
      )}

      {/* AI content counts */}
      {(accountStory.aiDraftCount > 0 || accountStory.aiScriptCount > 0 || accountStory.aiVideoCount > 0) && (
        <>
          <div className="h-4 w-px bg-surface-300/50" />
          {accountStory.aiDraftCount > 0 && (
            <span className="text-xs text-cyan-400">{accountStory.aiDraftCount} draft{accountStory.aiDraftCount !== 1 ? "s" : ""}</span>
          )}
          {accountStory.aiScriptCount > 0 && (
            <span className="text-xs text-amber-400">{accountStory.aiScriptCount} script{accountStory.aiScriptCount !== 1 ? "s" : ""}</span>
          )}
          {accountStory.aiVideoCount > 0 && (
            <span className="text-xs text-purple-400">{accountStory.aiVideoCount} video{accountStory.aiVideoCount !== 1 ? "s" : ""}</span>
          )}
        </>
      )}

      {/* Covered timestamp */}
      {accountStory.coveredAt && (
        <>
          <div className="h-4 w-px bg-surface-300/50" />
          <span className="text-xs text-green-400">Covered {formatRelativeTime(accountStory.coveredAt)}</span>
        </>
      )}

      {/* Notes indicator */}
      {accountStory.notes && (
        <span className="text-xs text-gray-500" title={accountStory.notes}>Has notes</span>
      )}
    </div>
  );
}

// ─── Related Stories ──────────────────────────────────────────────────────

interface RelatedStory {
  id: string;
  title: string;
  status: string;
  category: string | null;
  locationName: string | null;
  compositeScore: number;
  sharedEntities: { name: string; type: string }[];
  sharedCount: number;
}

function RelatedStories({ storyId }: { storyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["related-stories", storyId],
    queryFn: () =>
      apiFetch<{ related: RelatedStory[] }>(
        `/api/v1/stories/${storyId}/related`
      ),
    enabled: !!storyId,
    refetchInterval: 60_000,
  });

  const related = data?.related;

  if (isLoading || !related || related.length === 0) return null;

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-white">
          Related Stories ({related.length})
        </h2>
      </div>

      <div className="space-y-3">
        {related.map((story) => (
          <div
            key={story.id}
            className="flex items-start justify-between gap-4 p-3 rounded-lg bg-surface-200/40 hover:bg-surface-200/60 transition-colors"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Link
                href={`/stories/${story.id}`}
                className="text-sm font-medium text-gray-200 hover:text-accent transition-colors line-clamp-2"
              >
                {story.title}
              </Link>
              <div className="flex flex-wrap gap-1.5">
                {story.sharedEntities.slice(0, 5).map((entity, i) => (
                  <span
                    key={`${entity.name}-${entity.type}-${i}`}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  >
                    {entity.name}
                  </span>
                ))}
                {story.sharedEntities.length > 5 && (
                  <span className="text-[10px] text-gray-500">
                    +{story.sharedEntities.length - 5} more
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <StatusBadge status={story.status} />
              <span className="text-xs text-gray-400 tabular-nums">
                {formatScore(story.compositeScore)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Accept as Lead Button ────────────────────────────────────────────────

function AcceptAsLeadButton({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => activateAccountStory(storyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["story", storyId] }),
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full px-4 py-3 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
    >
      {mutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      Accept as Lead
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function StoryDetailPage() {
  const params = useParams();
  const id = params.id as string;

  // Always scroll to top when navigating to a story
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

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

  const bVal = Math.round(story.breaking_score * 100);
  const tVal = Math.round(story.trending_score * 100);
  const cVal = Math.round(story.confidence_score * 100);
  const lVal = Math.round(story.locality_score * 100);
  const srcCount = story.source_count;

  const scores: {
    label: string;
    value: number;
    type: "breaking" | "trending" | "confidence" | "locality";
    tooltip: string;
  }[] = [
    {
      label: "Breaking Score",
      value: story.breaking_score,
      type: "breaking",
      tooltip: `Breaking: ${bVal}\nMeasures source velocity \u2014 how fast\nnew sources pick up the story\nSources in 15min window / recency decay`,
    },
    {
      label: "Trending Score",
      value: story.trending_score,
      type: "trending",
      tooltip: `Trending: ${tVal}\nMeasures growth rate \u2014 is the\nstory accelerating?\nCurrent sources vs past sources / growth %`,
    },
    {
      label: "Confidence Score",
      value: story.confidence_score,
      type: "confidence",
      tooltip: `Confidence: ${cVal}\nMeasures source diversity and trust\n${srcCount} source${srcCount !== 1 ? "s" : ""} \u00d7 avg trust score ${srcCount > 0 ? (cVal / Math.max(srcCount, 1)).toFixed(0) : "0"}`,
    },
    {
      label: "Locality Score",
      value: story.locality_score,
      type: "locality",
      tooltip: `Locality: ${lVal}\nMeasures relevance to local markets\nBased on location specificity\nand market keywords`,
    },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:gap-6">
          {/* ─── Left Sidebar (fixed width on desktop) ─── */}
          <aside className="w-full lg:w-[320px] lg:flex-shrink-0 space-y-4 mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-8 space-y-4">
              {/* Status + Category + Location */}
              <div className="glass-card p-4 space-y-3">
                <StatusBadge status={story.status} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-400 bg-surface-300/40 px-2 py-1 rounded">
                    <Tag className="w-3 h-3" />
                    {story.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400 bg-surface-300/40 px-2 py-1 rounded">
                    <MapPin className="w-3 h-3" />
                    {story.location}
                  </span>
                </div>
              </div>

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-3">
                {scores.map((score) => {
                  const colors = getScoreTypeColor(score.type);
                  const groupClass = `group/${score.type}`;
                  return (
                    <div
                      key={score.type}
                      className={clsx("glass-card p-3 space-y-2 relative", colors.bg, groupClass)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-gray-400">
                          {score.label}
                        </span>
                        <span
                          className={clsx(
                            "text-lg font-bold tabular-nums",
                            colors.text
                          )}
                        >
                          {formatScore(score.value)}
                        </span>
                      </div>
                      <div className="score-bar h-2">
                        <div
                          className={clsx("score-bar-fill", colors.bar)}
                          style={{
                            width: `${Math.min(score.value * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className={clsx(
                        "absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 transition-opacity pointer-events-none z-50 font-mono leading-relaxed",
                        score.type === "breaking" && "group-hover/breaking:opacity-100",
                        score.type === "trending" && "group-hover/trending:opacity-100",
                        score.type === "confidence" && "group-hover/confidence:opacity-100",
                        score.type === "locality" && "group-hover/locality:opacity-100",
                      )}>
                        {score.tooltip}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Composite score */}
              <div className="glass-card p-4 group/composite relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">
                    Composite Score
                  </span>
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {formatScore(story.composite_score)}
                  </span>
                </div>
                <div className="score-bar h-3">
                  <div
                    className="score-bar-fill bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                    style={{
                      width: `${Math.min(story.composite_score * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="absolute bottom-full left-0 mb-1 px-3 py-2 text-xs bg-gray-900 text-gray-200 rounded shadow-lg whitespace-pre opacity-0 group-hover/composite:opacity-100 transition-opacity pointer-events-none z-50 font-mono leading-relaxed">
                  {`Score: ${Math.round(story.composite_score * 100)}\n= Breaking (${bVal}) \u00d7 25% = ${(bVal * 0.25).toFixed(1)}\n+ Trending (${tVal}) \u00d7 20% = ${(tVal * 0.20).toFixed(1)}\n+ Confidence (${cVal}) \u00d7 15% = ${(cVal * 0.15).toFixed(1)}\n+ Locality (${lVal}) \u00d7 15% = ${(lVal * 0.15).toFixed(1)}`}
                </span>
              </div>

              {/* Verification status card */}
              {story.verificationStatus && story.verificationStatus !== 'UNVERIFIED' && (
                <div className="glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Verification</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Status</span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-xs font-semibold",
                      story.verificationStatus === 'VERIFIED' ? "text-blue-400 bg-blue-500/10" :
                      story.verificationStatus === 'SINGLE_SOURCE' ? "text-orange-400 bg-orange-500/10" :
                      story.verificationStatus === 'DISPUTED' ? "text-red-400 bg-red-500/10" :
                      "text-gray-400 bg-gray-500/10"
                    )}>
                      {story.verificationStatus === 'SINGLE_SOURCE' ? 'Single Source' : story.verificationStatus.charAt(0) + story.verificationStatus.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Sources</span>
                    <span className="text-xs text-gray-300 font-medium">{story.source_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Confidence</span>
                    <span className="text-xs text-gray-300 font-medium">{Math.round((story.verificationScore || 0) * 100)}%</span>
                  </div>
                  <div className="score-bar h-2">
                    <div
                      className={clsx(
                        "score-bar-fill",
                        story.verificationStatus === 'VERIFIED' ? "bg-blue-500" :
                        story.verificationStatus === 'SINGLE_SOURCE' ? "bg-orange-500" :
                        story.verificationStatus === 'DISPUTED' ? "bg-red-500" :
                        "bg-gray-500"
                      )}
                      style={{ width: `${Math.min((story.verificationScore || 0) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Source count + timestamps */}
              <div className="glass-card p-4 space-y-2 text-xs text-gray-500">
                <div className="flex items-center justify-between">
                  <span>Sources</span>
                  <span className="text-gray-300 font-medium">{story.source_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>First seen</span>
                  <span className="text-gray-400">{formatRelativeTime(story.first_seen)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last updated</span>
                  <span className="text-gray-400">{formatRelativeTime(story.last_updated)}</span>
                </div>
              </div>

              {/* Bookmark button */}
              {isAuthenticated() && (
                <div className="w-full">
                  <BookmarkButton storyId={id} />
                </div>
              )}
            </div>
          </aside>

          {/* ─── Main Content (scrollable) ─── */}
          <div className="flex-1 min-w-0 space-y-8">
            {/* Account workspace panel — shows derivative status */}
            {story.accountStory && (
              <AccountWorkspaceBar
                accountStory={story.accountStory}
                storyId={id}
              />
            )}

            {/* Editorial workflow panel */}
            {story.accountStory ? (
              <WorkflowPanel
                accountStoryId={story.accountStory.id}
                currentStage={story.accountStory.accountStatus || "lead"}
                storyTitle={story.title}
              />
            ) : isAuthenticated() ? (
              <AcceptAsLeadButton storyId={id} />
            ) : null}

            {/* Story header — shows account edits if present */}
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white leading-tight inline-flex items-start flex-wrap gap-1">
                {story.hasFamousPerson && story.famousPersonNames && story.famousPersonNames.length > 0 && (
                  <span className="inline-flex items-center group/famous relative mt-1">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <span className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/famous:opacity-100 transition-opacity pointer-events-none z-50 font-normal">
                      {story.famousPersonNames.join(', ')}
                    </span>
                  </span>
                )}
                <span>
                  {story.accountStory?.editedTitle || story.title}
                  {story.accountStory?.editedTitle && (
                    <span className="ml-2 text-xs text-accent font-normal">(edited)</span>
                  )}
                </span>
                {story.verificationStatus === 'VERIFIED' && (
                  <span className="inline-flex items-center group/verified relative mt-1">
                    <BadgeCheck className="w-5 h-5 text-blue-400" />
                    <span className="absolute bottom-full right-0 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/verified:opacity-100 transition-opacity pointer-events-none z-50 font-normal">
                      Verified ({Math.round((story.verificationScore || 0) * 100)}% confidence)
                    </span>
                  </span>
                )}
                {story.verificationStatus === 'SINGLE_SOURCE' && (
                  <span className="inline-flex items-center group/single relative mt-1">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <span className="absolute bottom-full right-0 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover/single:opacity-100 transition-opacity pointer-events-none z-50 font-normal">
                      Single source — not yet corroborated
                    </span>
                  </span>
                )}
              </h1>

              <p className="text-gray-400 text-lg leading-relaxed">
                {stripHtml(story.accountStory?.editedSummary || story.ai_summary || story.summary)}
              </p>
              {story.ai_summary_model && (
                <div className="text-[10px] text-gray-600">
                  Generated via {story.ai_summary_model}
                  {story.ai_summary_at && ` · ${formatRelativeTime(story.ai_summary_at)}`}
                </div>
              )}
            </div>

            {/* Merge trail — shows which stories were merged into this one */}
            {story.merged_from && story.merged_from.length > 0 && (
              <div className="glass-card p-3 space-y-2">
                <div className="text-xs text-gray-500 flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5" />
                  Merged from {story.merged_from.length} stories
                </div>
                <div className="flex flex-wrap gap-2">
                  {story.merged_from.map((m: any) => (
                    <span key={m.id} className="text-xs bg-surface-300/30 px-2 py-1 rounded text-gray-400">
                      {m.title?.substring(0, 50)}...
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up chain — parent story and follow-ups */}
            {(story.parentStory || (story.followUps && story.followUps.length > 0)) && (
              <div className="glass-card p-4 space-y-3">
                <div className="text-xs text-cyan-400 flex items-center gap-1.5 font-medium">
                  <GitBranch className="w-3.5 h-3.5" />
                  Story Thread
                </div>

                {/* Link to parent story */}
                {story.parentStory && (
                  <div className="flex items-start gap-2 pl-2 border-l-2 border-cyan-500/30">
                    <ArrowUpRight className="w-3 h-3 text-gray-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Follow-up to</span>
                      <Link
                        href={`/stories/${story.parentStory.id}`}
                        className="block text-sm text-gray-200 hover:text-accent transition-colors"
                      >
                        {story.parentStory.title}
                      </Link>
                      <span className="text-[10px] text-gray-600">
                        {story.parentStory.status} &middot; Score {Math.round(story.parentStory.compositeScore * 100)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Follow-ups list */}
                {story.followUps && story.followUps.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide pl-2">
                      {story.followUps.length} Follow-up{story.followUps.length > 1 ? 's' : ''}
                    </span>
                    {story.followUps.map((fu: any) => (
                      <div key={fu.id} className="flex items-start gap-2 pl-2 border-l-2 border-surface-300/50">
                        <GitBranch className="w-3 h-3 text-gray-600 mt-1 flex-shrink-0" />
                        <div>
                          <Link
                            href={`/stories/${fu.id}`}
                            className="text-sm text-gray-300 hover:text-accent transition-colors"
                          >
                            {fu.title}
                          </Link>
                          <span className="block text-[10px] text-gray-600">
                            {fu.status} &middot; {formatRelativeTime(fu.firstSeenAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI summary regenerate button (summary shown inline above) */}
            <AISummaryPanel
              storyId={id}
              aiSummary={story.ai_summary}
              aiSummaryModel={story.ai_summary_model}
              aiSummaryAt={story.ai_summary_at}
              compact
            />

            {/* One-click breaking package */}
            <BreakingPackagePanel storyId={id} />

            {/* Viral prediction */}
            <PredictionBadge storyId={id} />

            {/* AI First Drafts */}
            <FirstDraftPanel storyId={id} />

            {/* AI Story Research — deep dive with perspectives + talk tracks */}
            <StoryResearchPanel storyId={id} />

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

            {/* Related Stories */}
            <RelatedStories storyId={id} />

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
          </div>
        </div>
      </main>
    </div>
  );
}
