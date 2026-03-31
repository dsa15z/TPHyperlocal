"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import { ColumnCustomizer } from "@/components/ColumnCustomizer";
import { useTableColumns } from "@/hooks/useTableColumns";

const AUDIT_COLUMNS = [
  { id: "time", label: "Time", width: 140, defaultWidth: 140, minWidth: 100 },
  { id: "user", label: "User", width: 150, defaultWidth: 150, minWidth: 100 },
  { id: "action", label: "Action", width: 120, defaultWidth: 120, minWidth: 80 },
  { id: "entity", label: "Entity", width: 120, defaultWidth: 120, minWidth: 80 },
  { id: "details", label: "Details", width: 300, defaultWidth: 300, minWidth: 150 },
];

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const limit = 30;
  const offset = (page - 1) * limit;
  const { columns: auditColumns, updateColumns: setAuditColumns, visibleColumns } = useTableColumns("audit-logs", AUDIT_COLUMNS);
  const isCol = (id: string) => visibleColumns.some(c => c.id === id);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => apiFetch<any>(`/api/v1/admin/audit-logs?limit=${limit}&offset=${offset}`, { headers: getAuthHeaders() }),
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><ScrollText className="w-6 h-6 text-gray-400" /> Audit Logs</h1>
            <p className="text-sm text-gray-500 mt-1">Track all actions taken across the platform for compliance and debugging.</p>
          </div>
          <ColumnCustomizer columns={auditColumns} onChange={setAuditColumns} allColumns={AUDIT_COLUMNS} />
        </div>

        {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading logs...</div>) : logs.length === 0 ? (
          <div className="glass-card p-12 text-center text-gray-500">No audit logs recorded yet.</div>
        ) : (
          <>
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-300/50">
                    {isCol("time") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>}
                    {isCol("user") && <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>}
                    {isCol("action") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>}
                    {isCol("entity") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Entity</th>}
                    {isCol("details") && <th className="text-left px-4 py-3 text-gray-400 font-medium">Details</th>}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-surface-300/20 hover:bg-surface-200/30">
                      {isCol("time") && <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatRelativeTime(log.createdAt)}</td>}
                      {isCol("user") && <td className="px-4 py-3 text-gray-300 text-xs">{log.user?.displayName || log.user?.email || log.userId || "System"}</td>}
                      {isCol("action") && <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-surface-300/60 text-gray-400">{log.action}</span></td>}
                      {isCol("entity") && <td className="px-4 py-3 text-gray-400 text-xs">{log.entityType} <span className="text-gray-600">{log.entityId?.substring(0, 8)}...</span></td>}
                      {isCol("details") && <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{log.details ? JSON.stringify(log.details).substring(0, 60) : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              shown={logs.length}
              total={total}
              page={page}
              totalPages={Math.max(1, Math.ceil(total / limit))}
              onPageChange={setPage}
            />
          </>
        )}
      </main>
    </div>
  );
}
