"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Play,
  Loader2,
  Clock,
  Copy,
  Check,
  Search,
  Film,
  Monitor,
  Radio,
  ChevronDown,
  ChevronUp,
  Hash,
  Music,
  Type,
  Layers,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VideoScene {
  sceneNumber: number;
  duration: number;
  visual: string;
  voiceover: string;
  graphicPrompt: string;
  lowerThird: string;
}

interface VideoProject {
  id: string;
  storyId: string;
  storyTitle: string;
  format: string;
  duration: number;
  status: "QUEUED" | "GENERATING" | "READY" | "FAILED";
  createdAt: string;
  title?: string;
  script?: string;
  scenes?: VideoScene[];
  musicSuggestion?: string;
  titleCard?: { headline: string; subhead: string };
  hashtags?: string[];
}

interface StoryOption {
  id: string;
  title: string;
  status: string;
  category: string;
  compositeScore: number;
}

type VideoFormat = "SOCIAL_CLIP" | "WEB_PACKAGE" | "BROADCAST_BROLL";

const FORMATS: { value: VideoFormat; label: string; icon: typeof Film; desc: string }[] = [
  { value: "SOCIAL_CLIP", label: "Social Clip", icon: Film, desc: "15-30s for social media" },
  { value: "WEB_PACKAGE", label: "Web Package", icon: Monitor, desc: "45-90s for website" },
  { value: "BROADCAST_BROLL", label: "Broadcast B-Roll", icon: Radio, desc: "20-45s for on-air" },
];

const FORMAT_COLORS: Record<string, string> = {
  SOCIAL_CLIP: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  WEB_PACKAGE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  BROADCAST_BROLL: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-gray-500/20 text-gray-400",
  GENERATING: "bg-yellow-500/20 text-yellow-400",
  READY: "bg-green-500/20 text-green-400",
  FAILED: "bg-red-500/20 text-red-400",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function VideoPage() {
  const queryClient = useQueryClient();
  const [storySearch, setStorySearch] = useState("");
  const [selectedStory, setSelectedStory] = useState<StoryOption | null>(null);
  const [format, setFormat] = useState<VideoFormat>("SOCIAL_CLIP");
  const [duration, setDuration] = useState(20);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search stories for selector
  const { data: storyResults } = useQuery({
    queryKey: ["video-story-search", storySearch],
    queryFn: () =>
      apiFetch<any>(`/api/v1/search?q=${encodeURIComponent(storySearch)}&limit=8`),
    enabled: storySearch.length >= 2,
  });

  // Fetch video projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["video-projects"],
    queryFn: () =>
      apiFetch<any>("/api/v1/video/projects", { headers: getAuthHeaders() }),
    refetchInterval: 10000,
  });

  // Fetch project detail when expanded
  const { data: projectDetail } = useQuery({
    queryKey: ["video-project-detail", expandedProject],
    queryFn: () =>
      apiFetch<any>(`/api/v1/video/projects/${expandedProject}`, {
        headers: getAuthHeaders(),
      }),
    enabled: !!expandedProject,
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (data: { storyId: string; format: VideoFormat; duration: number }) =>
      apiFetch<any>("/api/v1/video/generate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-projects"] });
      setSelectedStory(null);
      setStorySearch("");
    },
  });

  const storyOptions: StoryOption[] = (storyResults?.data?.stories || []).map((s: any) => ({
    id: s.id,
    title: s.editedTitle || s.title,
    status: s.status,
    category: s.category || "Unknown",
    compositeScore: s.compositeScore || 0,
  }));

  const projectList: VideoProject[] = projects?.data || [];

  const detail: VideoProject | null = projectDetail?.data || null;

  // ─── Clipboard helpers ──────────────────────────────────────────────────

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function copyAllProject(p: VideoProject) {
    const lines = [
      `TITLE: ${p.titleCard?.headline || p.title || p.storyTitle}`,
      `SUBHEAD: ${p.titleCard?.subhead || ""}`,
      "",
      "--- SCRIPT ---",
      p.script || "",
      "",
      "--- SCENES ---",
      ...(p.scenes || []).map(
        (s) =>
          `Scene ${s.sceneNumber} (${s.duration}s):\n  Visual: ${s.visual}\n  VO: ${s.voiceover}\n  Graphic: ${s.graphicPrompt}\n  Lower Third: ${s.lowerThird}`
      ),
      "",
      `MUSIC: ${p.musicSuggestion || "N/A"}`,
      `HASHTAGS: ${(p.hashtags || []).join(" ")}`,
    ];
    copyToClipboard(lines.join("\n"), `all-${p.id}`);
  }

  // ─── Duration range based on format ─────────────────────────────────────

  const durationRange: Record<VideoFormat, { min: number; max: number; default: number }> = {
    SOCIAL_CLIP: { min: 10, max: 30, default: 20 },
    WEB_PACKAGE: { min: 30, max: 90, default: 60 },
    BROADCAST_BROLL: { min: 15, max: 45, default: 30 },
  };

  function handleFormatChange(f: VideoFormat) {
    setFormat(f);
    setDuration(durationRange[f].default);
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Video className="w-6 h-6 text-purple-400" /> AI Video Generator
        </h1>

        {/* ─── Story Selector & Generator ─────────────────────────────── */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Generate Video Project</h2>

          {/* Story search */}
          <div className="relative">
            <label className="block text-xs text-gray-400 mb-1">Select Story</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={selectedStory ? selectedStory.title : storySearch}
                onChange={(e) => {
                  setStorySearch(e.target.value);
                  setSelectedStory(null);
                }}
                placeholder="Search for a story..."
                className="filter-input w-full pl-10"
              />
            </div>
            {storySearch.length >= 2 && !selectedStory && storyOptions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-surface-200 border border-surface-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {storyOptions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStory(s);
                      setStorySearch("");
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-surface-300 transition-colors border-b border-surface-300/50 last:border-0"
                  >
                    <div className="text-sm text-white font-medium truncate">{s.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{s.category}</span>
                      <span className="text-xs text-gray-600">|</span>
                      <span className="text-xs text-gray-500">{s.status}</span>
                      <span className="text-xs text-gray-600">|</span>
                      <span className="text-xs text-accent">Score: {(s.compositeScore * 100).toFixed(0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Format selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Format</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.value}
                    onClick={() => handleFormatChange(f.value)}
                    className={clsx(
                      "p-3 rounded-lg border text-left transition-all",
                      format === f.value
                        ? "border-accent bg-accent/10"
                        : "border-surface-300 bg-surface-200/50 hover:border-surface-400"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={clsx("w-4 h-4", format === f.value ? "text-accent" : "text-gray-400")} />
                      <span className={clsx("text-sm font-medium", format === f.value ? "text-white" : "text-gray-300")}>
                        {f.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration slider */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Duration: {duration}s
            </label>
            <input
              type="range"
              min={durationRange[format].min}
              max={durationRange[format].max}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full max-w-xs accent-accent"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={() =>
              selectedStory &&
              generateMutation.mutate({
                storyId: selectedStory.id,
                format,
                duration,
              })
            }
            disabled={!selectedStory || generateMutation.isPending}
            className={clsx(
              "px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg flex items-center gap-2",
              (!selectedStory || generateMutation.isPending) && "opacity-50 cursor-not-allowed"
            )}
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Generate Video Project
          </button>
          {generateMutation.isSuccess && (
            <p className="text-xs text-green-400">
              Video project queued. It will appear below when ready.
            </p>
          )}
          {generateMutation.isError && (
            <p className="text-xs text-red-400">
              Error: {(generateMutation.error as Error).message}
            </p>
          )}
        </div>

        {/* ─── Projects List ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Video Projects</h2>

          {projectsLoading ? (
            <div className="glass-card p-8 text-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading projects...
            </div>
          ) : projectList.length === 0 ? (
            <div className="glass-card p-8 text-center text-gray-500">
              No video projects yet. Generate one above.
            </div>
          ) : (
            projectList.map((project) => {
              const isExpanded = expandedProject === project.id;
              const d = isExpanded && detail ? detail : project;

              return (
                <div key={project.id} className="glass-card animate-in overflow-hidden">
                  {/* Project header */}
                  <button
                    onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-300/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Video className="w-5 h-5 text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-white font-medium truncate">
                          {project.storyTitle}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded text-xs border",
                              FORMAT_COLORS[project.format] || "bg-gray-500/20 text-gray-400"
                            )}
                          >
                            {project.format.replace("_", " ")}
                          </span>
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded text-xs",
                              STATUS_COLORS[project.status] || "bg-gray-500/20 text-gray-400"
                            )}
                          >
                            {project.status === "GENERATING" && (
                              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                            )}
                            {project.status}
                          </span>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {project.duration}s
                          </span>
                          <span className="text-xs text-gray-600">
                            {formatRelativeTime(project.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && d && d.status === "READY" && (
                    <div className="border-t border-surface-300 p-4 space-y-5">
                      {/* Title card preview */}
                      {d.titleCard && (
                        <div className="relative bg-gradient-to-br from-surface-300 to-surface-200 rounded-lg p-6 border border-surface-400 overflow-hidden">
                          <div className="absolute top-2 right-2 text-xs text-gray-600 flex items-center gap-1">
                            <Type className="w-3 h-3" /> Title Card
                          </div>
                          <h3 className="text-xl font-bold text-white leading-tight">
                            {d.titleCard.headline}
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {d.titleCard.subhead}
                          </p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {d.script && (
                          <button
                            onClick={() => copyToClipboard(d.script!, `script-${d.id}`)}
                            className="px-3 py-1.5 bg-surface-300 hover:bg-surface-400 text-sm text-gray-300 rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            {copiedId === `script-${d.id}` ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            Copy Script
                          </button>
                        )}
                        <button
                          onClick={() => copyAllProject(d as VideoProject)}
                          className="px-3 py-1.5 bg-surface-300 hover:bg-surface-400 text-sm text-gray-300 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          {copiedId === `all-${d.id}` ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Copy All
                        </button>
                      </div>

                      {/* Scene-by-scene storyboard */}
                      {d.scenes && d.scenes.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
                            <Layers className="w-4 h-4" /> Storyboard ({d.scenes.length} scenes)
                          </h4>
                          <div className="space-y-3">
                            {d.scenes.map((scene) => (
                              <div
                                key={scene.sceneNumber}
                                className="bg-surface-200 rounded-lg p-4 border border-surface-300"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-bold text-accent">
                                    SCENE {scene.sceneNumber}
                                  </span>
                                  <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {scene.duration}s
                                  </span>
                                </div>
                                {/* Duration bar */}
                                <div className="w-full h-1 bg-surface-400 rounded-full mb-3">
                                  <div
                                    className="h-full bg-accent/60 rounded-full"
                                    style={{
                                      width: `${Math.min(100, (scene.duration / (d.duration || 60)) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-gray-500 font-medium mb-1">Visual</p>
                                    <p className="text-gray-300">{scene.visual}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 font-medium mb-1">Voiceover</p>
                                    <p className="text-gray-300 italic">
                                      &ldquo;{scene.voiceover}&rdquo;
                                    </p>
                                  </div>
                                  {scene.graphicPrompt && (
                                    <div>
                                      <p className="text-xs text-gray-500 font-medium mb-1">
                                        Graphic Prompt
                                      </p>
                                      <p className="text-gray-400 text-xs font-mono bg-surface-300/50 rounded px-2 py-1">
                                        {scene.graphicPrompt}
                                      </p>
                                    </div>
                                  )}
                                  {scene.lowerThird && (
                                    <div>
                                      <p className="text-xs text-gray-500 font-medium mb-1">
                                        Lower Third
                                      </p>
                                      <p className="text-gray-300 bg-black/40 inline-block px-2 py-0.5 rounded text-xs">
                                        {scene.lowerThird}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full narration script */}
                      {d.script && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4" /> Full Narration Script
                          </h4>
                          <div className="bg-surface-200 rounded-lg p-4 border border-surface-300">
                            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {d.script}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Music & Hashtags */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {d.musicSuggestion && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                              <Music className="w-4 h-4" /> Music Suggestion
                            </h4>
                            <p className="text-sm text-gray-400 bg-surface-200 rounded-lg px-3 py-2 border border-surface-300">
                              {d.musicSuggestion}
                            </p>
                          </div>
                        )}
                        {d.hashtags && d.hashtags.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                              <Hash className="w-4 h-4" /> Hashtags
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {d.hashtags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-accent/10 text-accent text-xs rounded-full border border-accent/20"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pending state detail */}
                  {isExpanded && d && d.status !== "READY" && (
                    <div className="border-t border-surface-300 p-6 text-center">
                      {d.status === "QUEUED" || d.status === "GENERATING" ? (
                        <div className="space-y-2">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent" />
                          <p className="text-sm text-gray-400">
                            {d.status === "QUEUED"
                              ? "Waiting in queue..."
                              : "Generating video project..."}
                          </p>
                          <p className="text-xs text-gray-600">Auto-refreshing every 10s</p>
                        </div>
                      ) : (
                        <p className="text-sm text-red-400">
                          Generation failed. Try again.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
