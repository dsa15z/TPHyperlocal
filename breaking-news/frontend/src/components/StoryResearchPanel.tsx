"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
  Target,
  Users,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Link2,
  GraduationCap,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface ResearchData {
  deepBackground: string;
  keyFacts: string[];
  perspectives: Array<{
    viewpoint: string;
    position: string;
    arguments: string[];
    talkTrack: string;
  }>;
  forArguments: string[];
  againstArguments: string[];
  questionsToAsk: string[];
  relatedTopics: string[];
  expertSources: string[];
  _parseError?: boolean;
}

interface ResearchResponse {
  data: {
    id: string;
    storyId: string;
    research: ResearchData;
    model: string;
    tokens: number;
    createdAt: string;
  } | null;
  message?: string;
}

export function StoryResearchPanel({ storyId }: { storyId: string }) {
  const [expanded, setExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkedQuestions, setCheckedQuestions] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["story-research", storyId],
    queryFn: () =>
      apiFetch<ResearchResponse>(`/api/v1/stories/${storyId}/research`, {
        headers: getAuthHeaders(),
      }),
    refetchInterval: 10_000,
  });

  const researchMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>(`/api/v1/stories/${storyId}/research`, {
        method: "POST",
        headers: getAuthHeaders(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-research", storyId] });
    },
  });

  // Auto-generate research on mount if none exists
  useEffect(() => {
    if (data && !data.data && !isLoading && !researchMutation.isPending) {
      researchMutation.mutate();
    }
  }, [data, isLoading]);

  const research = data?.data?.research;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleQuestion = (idx: number) => {
    setCheckedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-lg font-semibold text-white hover:text-blue-300 transition-colors"
        >
          <Search className="w-5 h-5 text-blue-400" />
          AI Story Research
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        <button
          onClick={() => researchMutation.mutate()}
          disabled={researchMutation.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {researchMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {research ? "Re-Research" : "Research"}
        </button>
      </div>

      {!expanded && (
        <p className="text-xs text-gray-500">
          Click to expand deep research, perspectives, and investigative questions.
        </p>
      )}

      {expanded && (
        <>
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center gap-3 p-6 glass-card-strong">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm text-gray-400">Loading research...</span>
            </div>
          )}

          {/* Pending state */}
          {!isLoading && !research && researchMutation.isPending && (
            <div className="flex items-center gap-3 p-6 glass-card-strong">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm text-gray-400">
                Generating deep research... This may take 15-30 seconds.
              </span>
            </div>
          )}

          {/* No data yet */}
          {!isLoading && !research && !researchMutation.isPending && (
            <div className="p-6 glass-card-strong text-center">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No research generated yet. Click "Research" to start.
              </p>
            </div>
          )}

          {/* Research results */}
          {research && (
            <div className="space-y-4">
              {/* Deep Background */}
              <div className="glass-card-strong p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  Deep Background
                </h3>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {research.deepBackground}
                </div>
              </div>

              {/* Key Facts */}
              {research.keyFacts && research.keyFacts.length > 0 && (
                <div className="glass-card-strong p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    Key Facts
                  </h3>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    {research.keyFacts.map((fact, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        {fact}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Perspectives */}
              {research.perspectives && research.perspectives.length > 0 && (
                <div className="glass-card-strong p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    Perspectives
                  </h3>
                  <div className="grid gap-3">
                    {research.perspectives.map((p, i) => (
                      <div
                        key={i}
                        className="border border-surface-300/30 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-purple-300">
                            {p.viewpoint}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{p.position}</p>
                        {p.arguments && p.arguments.length > 0 && (
                          <ul className="space-y-1 ml-3">
                            {p.arguments.map((arg, j) => (
                              <li
                                key={j}
                                className="text-xs text-gray-400 list-disc"
                              >
                                {arg}
                              </li>
                            ))}
                          </ul>
                        )}
                        {p.talkTrack && (
                          <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wider">
                                Talk Track
                              </span>
                              <button
                                onClick={() =>
                                  handleCopy(p.talkTrack, `talk-${i}`)
                                }
                                className="text-gray-500 hover:text-white transition-colors"
                              >
                                {copiedId === `talk-${i}` ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-gray-300 italic">
                              {p.talkTrack}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* For / Against */}
              {((research.forArguments && research.forArguments.length > 0) ||
                (research.againstArguments &&
                  research.againstArguments.length > 0)) && (
                <div className="glass-card-strong p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-white">
                    For / Against
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* For */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <ThumbsUp className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs font-medium text-green-400 uppercase tracking-wider">
                          Supporting
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {(research.forArguments || []).map((arg, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-300 pl-3 border-l-2 border-green-500/40"
                          >
                            {arg}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Against */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
                          Opposing
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {(research.againstArguments || []).map((arg, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-300 pl-3 border-l-2 border-red-500/40"
                          >
                            {arg}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Questions to Ask */}
              {research.questionsToAsk &&
                research.questionsToAsk.length > 0 && (
                  <div className="glass-card-strong p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-cyan-400" />
                      Investigative Questions
                    </h3>
                    <ul className="space-y-2">
                      {research.questionsToAsk.map((q, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <button
                            onClick={() => toggleQuestion(i)}
                            className={clsx(
                              "mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                              checkedQuestions.has(i)
                                ? "bg-cyan-600 border-cyan-500"
                                : "border-gray-600 hover:border-gray-400"
                            )}
                          >
                            {checkedQuestions.has(i) && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </button>
                          <span
                            className={clsx(
                              "text-xs",
                              checkedQuestions.has(i)
                                ? "text-gray-500 line-through"
                                : "text-gray-300"
                            )}
                          >
                            {q}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Related Topics & Expert Sources */}
              <div className="grid grid-cols-2 gap-4">
                {research.relatedTopics &&
                  research.relatedTopics.length > 0 && (
                    <div className="glass-card-strong p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-orange-400" />
                        Related Topics
                      </h3>
                      <ul className="space-y-1">
                        {research.relatedTopics.map((t, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-400 flex items-center gap-1.5"
                          >
                            <span className="w-1 h-1 rounded-full bg-orange-400 flex-shrink-0" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {research.expertSources &&
                  research.expertSources.length > 0 && (
                    <div className="glass-card-strong p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-teal-400" />
                        Expert Sources
                      </h3>
                      <ul className="space-y-1">
                        {research.expertSources.map((s, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-400 flex items-center gap-1.5"
                          >
                            <span className="w-1 h-1 rounded-full bg-teal-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>

              {/* Metadata */}
              {data?.data && (
                <p className="text-[10px] text-gray-600 text-right">
                  Generated by {data.data.model} | {data.data.tokens} tokens |{" "}
                  {new Date(data.data.createdAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
