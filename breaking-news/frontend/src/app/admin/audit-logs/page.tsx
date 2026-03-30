"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export default function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", offset],
    queryFn: () => apiFetch<any>(`/api/v1/admin/audit-logs?limit=${limit}&offset=${offset}`, { headers: getAuthHeaders() }),
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><ScrollText className="w-6 h-6 text-gray-400" /> Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Track all actions taken across the platform for compliance and debugging.</p>
        </div>

        {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading logs...</div>) : logs.length === 0 ? (
          <div className="glass-card p-12 text-center text-gray-500">No audit logs recorded yet.</div>
        ) : (
          <>
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Entity</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-surface-300/20 hover:bg-surface-200/30">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatRelativeTime(log.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{log.user?.displayName || log.user?.email || log.userId || "System"}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{log.action}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{log.entityType} <span className="text-gray-600">{log.entityId?.substring(0, 8)}...</span></td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{log.details ? JSON.stringify(log.details).substring(0, 60) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="filter-btn flex items-center gap-1 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Prev</button>
                <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total} className="filter-btn flex items-center gap-1 disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
