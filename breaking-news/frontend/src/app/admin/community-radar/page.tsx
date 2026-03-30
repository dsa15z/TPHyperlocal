"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Plus, Trash2, X, Globe } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const URL_TYPES = [
  { value: "FB_PAGE", label: "Facebook Page", placeholder: "https://facebook.com/YourStation" },
  { value: "FB_GROUP", label: "Facebook Group", placeholder: "https://facebook.com/groups/..." },
  { value: "TWITTER_LIST", label: "Twitter/X List", placeholder: "https://x.com/i/lists/..." },
  { value: "TWITTER_SEARCH", label: "Twitter/X Search", placeholder: "#HoustonNews OR Houston breaking" },
];

const PLATFORMS: Record<string, string> = { FB_PAGE: "FACEBOOK", FB_GROUP: "FACEBOOK", TWITTER_LIST: "TWITTER", TWITTER_SEARCH: "TWITTER" };

export default function CommunityRadarPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrlType, setFormUrlType] = useState("FB_PAGE");
  const [formUrl, setFormUrl] = useState("");
  const [formFreq, setFormFreq] = useState(120);

  // Note: This needs a backend route for community radar configs
  // For now, uses a local state approach until the API is built
  const { data, isLoading } = useQuery({
    queryKey: ["community-radar-configs"],
    queryFn: async () => {
      try {
        return await apiFetch<any>("/api/v1/admin/community-radar", { headers: getAuthHeaders() });
      } catch {
        return { data: [] };
      }
    },
  });

  const configs = data?.data || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Radio className="w-6 h-6 text-teal-400" /> Community Social Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-1">Monitor Facebook pages, groups, and Twitter for community conversations about your market.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Monitor</button>
        </div>

        {showForm && (
          <div className="glass-card-strong p-6 space-y-5 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Configure Social Monitor</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Monitor Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {URL_TYPES.map((ut) => (
                  <button key={ut.value} onClick={() => setFormUrlType(ut.value)} className={clsx("p-3 rounded-lg border text-left text-sm transition-all", formUrlType === ut.value ? "border-accent/50 bg-accent/10 text-white" : "border-surface-300/50 bg-surface-200/30 text-gray-400 hover:border-surface-300")}>
                    {ut.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Monitor Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Houston Community Group" className="filter-input w-full" /></div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">URL or Query *</label>
                <input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder={URL_TYPES.find((u) => u.value === formUrlType)?.placeholder} className="filter-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Check every {formFreq} min</label>
                <input type="range" min="30" max="480" step="30" value={formFreq} onChange={(e) => setFormFreq(Number(e.target.value))} className="w-full accent-accent mt-2" />
              </div>
            </div>

            <button disabled={!formName.trim() || !formUrl.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", (!formName.trim() || !formUrl.trim()) && "opacity-50")}>
              Add Monitor
            </button>
            <p className="text-xs text-gray-600">Social monitoring requires platform API credentials configured in API Keys.</p>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading monitors...</div>
        ) : configs.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Radio className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400">No social monitors configured.</p>
            <p className="text-gray-600 text-sm">Add Facebook pages, groups, or Twitter searches to monitor community conversations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((config: any) => (
              <div key={config.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-teal-400" />
                    <h3 className="text-white font-semibold">{config.name}</h3>
                    <span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{config.urlType}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-[400px]">{config.url}</p>
                </div>
                <button className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
