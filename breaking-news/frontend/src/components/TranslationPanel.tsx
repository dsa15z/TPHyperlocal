"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Languages, Loader2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const LANGUAGES = [
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "zh", name: "Chinese" },
  { code: "pt", name: "Portuguese" },
  { code: "vi", name: "Vietnamese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
];

export function TranslationPanel({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["translations", storyId],
    queryFn: () => apiFetch<any>(`/api/v1/stories/${storyId}/translations`),
    refetchInterval: 10_000,
  });

  const translateMutation = useMutation({
    mutationFn: (lang: string) =>
      apiFetch<any>(`/api/v1/stories/${storyId}/translate`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ targetLanguage: lang }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["translations", storyId] }),
  });

  const translations = data?.data || [];
  const translatedLangs = new Set(translations.map((t: any) => t.targetLanguage));

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <Languages className="w-5 h-5 text-teal-400" />
        Translations
      </h2>

      {/* Language buttons */}
      <div className="flex flex-wrap gap-2">
        {LANGUAGES.map((lang) => {
          const exists = translatedLangs.has(lang.code);
          return (
            <button
              key={lang.code}
              onClick={() => !exists && translateMutation.mutate(lang.code)}
              disabled={translateMutation.isPending}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                exists
                  ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
                  : "border-surface-300/50 text-gray-400 hover:text-white hover:border-surface-300"
              )}
            >
              {translateMutation.isPending && translateMutation.variables === lang.code
                ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                : null}
              {lang.name} ({lang.code})
              {exists && " ✓"}
            </button>
          );
        })}
      </div>

      {/* Translated content */}
      {translations.length > 0 && (
        <div className="space-y-3">
          {translations.map((t: any) => (
            <div key={t.id} className="glass-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-teal-500/15 text-teal-400 font-medium">
                  {LANGUAGES.find((l) => l.code === t.targetLanguage)?.name || t.targetLanguage}
                </span>
                <span className="text-xs text-gray-600">{t.model} &middot; {formatRelativeTime(t.createdAt)}</span>
              </div>
              <h3 className="text-white font-semibold">{t.translatedTitle}</h3>
              {t.translatedSummary && <p className="text-sm text-gray-300">{t.translatedSummary}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
