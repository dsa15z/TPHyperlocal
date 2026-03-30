"use client";

import { Radio } from "lucide-react";

export default function CommunityRadarPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Radio className="w-6 h-6 text-teal-400" /> Community Radar
          </h1>
          <p className="text-sm text-gray-500 mt-1">Monitor social media for community sentiment and engagement. Configure Facebook pages, groups, Twitter lists, and search terms.</p>
        </div>
        <div className="glass-card p-12 text-center space-y-3">
          <Radio className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-gray-400">Community Radar is ready for configuration.</p>
          <p className="text-gray-600 text-sm">Configure Facebook and Twitter sources to monitor community conversations about your market.</p>
          <p className="text-xs text-gray-600 mt-4">Backend API available at <code className="text-gray-400">/api/v1/admin/community-radar</code></p>
        </div>
      </main>
    </div>
  );
}
