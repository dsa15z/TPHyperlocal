"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Play } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

const SHIFTS = ["Morning", "Afternoon", "Evening", "Overnight"];

export default function BriefingsPage() {
  const queryClient = useQueryClient();
  const [selectedShift, setSelectedShift] = useState("Morning");

  const { data, isLoading } = useQuery({
    queryKey: ["shift-briefings"],
    queryFn: () => apiFetch<any>("/api/v1/shift-briefings", { headers: getAuthHeaders() }),
    refetchInterval: 30_000,
  });

  const generateMutation = useMutation({
    mutationFn: (shiftName: string) =>
      apiFetch<any>("/api/v1/shift-briefing/generate", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ shiftName }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-briefings"] }),
  });

  const briefings = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-6 h-6 text-amber-400" /> Shift Briefings
          </h1>
          <div className="flex items-center gap-2">
            {SHIFTS.map((shift) => (
              <button key={shift} onClick={() => setSelectedShift(shift)} className={clsx("filter-btn text-xs", selectedShift === shift && "filter-btn-active")}>
                {shift}
              </button>
            ))}
            <button
              onClick={() => generateMutation.mutate(selectedShift)}
              disabled={generateMutation.isPending}
              className="px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg flex items-center gap-2"
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Generate {selectedShift}
            </button>
          </div>
        </div>

        {generateMutation.isSuccess && (
          <div className="text-sm text-green-400 animate-in">{generateMutation.data?.message}</div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading briefings...</div>
        ) : briefings.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No shift briefings generated yet.</p>
            <p className="text-gray-600 text-sm">Click Generate to create an AI-powered shift handoff briefing.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {briefings.map((b: any) => (
              <div key={b.id} className="glass-card p-6 animate-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-white">{b.shiftName} Shift Briefing</h2>
                    <span className="text-xs text-gray-500">{b.storyCount} stories &middot; {b.gapCount} gaps</span>
                  </div>
                  <span className="text-xs text-gray-600">{formatRelativeTime(b.generatedAt)} &middot; {b.model}</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {b.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
