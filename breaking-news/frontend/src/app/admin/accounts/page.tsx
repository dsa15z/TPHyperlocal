"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Shield, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const ROLES = ["VIEWER", "EDITOR", "ADMIN", "OWNER"];
const ROLE_COLORS: Record<string, string> = {
  OWNER: "text-red-400 bg-red-500/10",
  ADMIN: "text-orange-400 bg-orange-500/10",
  EDITOR: "text-blue-400 bg-blue-500/10",
  VIEWER: "text-gray-400 bg-gray-500/10",
};

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EDITOR");

  const { data: accountData } = useQuery({
    queryKey: ["account"],
    queryFn: () => apiFetch<any>("/api/v1/admin/account", { headers: getAuthHeaders() }),
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["account-users"],
    queryFn: () => apiFetch<any>("/api/v1/admin/account/users", { headers: getAuthHeaders() }),
  });

  const inviteMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/account/users/invite", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-users"] }); setShowInvite(false); setInviteEmail(""); },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch<any>(`/api/v1/admin/account/users/${userId}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account-users"] }),
  });

  const account = accountData?.data || accountData || {};
  const users = usersData?.data || usersData || [];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Users className="w-6 h-6 text-indigo-400" /> Account & Team
            </h1>
            {account.name && <p className="text-sm text-gray-500 mt-1">{account.name} &middot; {account.plan} plan</p>}
          </div>
          <button onClick={() => setShowInvite(!showInvite)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><UserPlus className="w-4 h-4" /> Invite User</button>
        </div>

        {showInvite && (
          <div className="glass-card-strong p-6 space-y-4 animate-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Invite Team Member</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-400 mb-1">Email *</label><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="editor@newsroom.com" className="filter-input w-full" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="filter-select w-full">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole })} disabled={!inviteEmail.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", !inviteEmail.trim() && "opacity-50")}>
              {inviteMutation.isPending ? "Inviting..." : "Send Invite"}
            </button>
            {inviteMutation.isError && <p className="text-xs text-red-400">Failed to invite. User may need to register first.</p>}
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-12 text-center text-gray-500">Loading team...</div>
        ) : (
          <div className="glass-card divide-y divide-surface-300/30">
            {(Array.isArray(users) ? users : []).map((member: any) => (
              <div key={member.userId || member.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface-300 flex items-center justify-center text-white font-bold text-sm">
                    {(member.user?.displayName || member.user?.email || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm text-white">{member.user?.displayName || member.user?.email}</div>
                    <div className="text-xs text-gray-500">{member.user?.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={member.role}
                    onChange={(e) => updateRoleMutation.mutate({ userId: member.userId, role: e.target.value })}
                    className={clsx("px-2 py-1 rounded text-xs font-medium border-0", ROLE_COLORS[member.role] || "text-gray-400 bg-gray-500/10")}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <Shield className={clsx("w-4 h-4", member.role === "OWNER" ? "text-red-400" : "text-gray-600")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
