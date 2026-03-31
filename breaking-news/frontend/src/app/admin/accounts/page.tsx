"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Shield,
  X,
  Plus,
  Building2,
  ChevronRight,
  ArrowLeft,
  Check,
  Loader2,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type Tab = "team" | "tenants";

export default function TeamAccessPage() {
  const [activeTab, setActiveTab] = useState<Tab>("team");

  // Check if user has superadmin flag
  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<any>("/api/v1/admin/account", { headers: getAuthHeaders() }),
  });
  const isSuperAdmin = meData?.data?.isSuperAdmin || meData?.isSuperAdmin || false;

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-400" /> Team & Access
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage team members, roles, and tenant access controls.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-300/30">
          <button
            onClick={() => setActiveTab("team")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "team"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <Users className="w-4 h-4 inline mr-1.5" />
            Team
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab("tenants")}
              className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === "tenants"
                  ? "border-accent text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              )}
            >
              <Shield className="w-4 h-4 inline mr-1.5" />
              Tenants
            </button>
          )}
        </div>

        {activeTab === "team" && <TeamTab />}
        {activeTab === "tenants" && isSuperAdmin && <TenantsTab />}
      </main>
    </div>
  );
}

/* ─── Team Tab ───────────────────────────────────────────────────────────── */

const ROLES = ["VIEWER", "EDITOR", "ADMIN", "OWNER"];
const ROLE_COLORS: Record<string, string> = {
  OWNER: "text-red-400 bg-red-500/10",
  ADMIN: "text-orange-400 bg-orange-500/10",
  EDITOR: "text-blue-400 bg-blue-500/10",
  VIEWER: "text-gray-400 bg-gray-500/10",
};

function TeamTab() {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {account.name && <p className="text-sm text-gray-500">{account.name} &middot; {account.plan} plan</p>}
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
    </div>
  );
}

/* ─── Tenants Tab (SuperAdmin only) ──────────────────────────────────────── */

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  maxMarkets: number;
  maxSources: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantUser {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  userActive: boolean;
  lastLoginAt: string | null;
  joinedAt: string;
}

interface ModulePermission {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface PermissionsData {
  permissions: Record<string, Record<string, ModulePermission>>;
  roleNames: Record<string, string>;
  modules: string[];
}

const saHeaders = () => ({ ...getAuthHeaders(), "Content-Type": "application/json" });

async function fetchTenants() {
  return apiFetch<any>("/api/v1/admin/rbac/tenants", { headers: getAuthHeaders() });
}
async function createTenantApi(data: { name: string; plan: string }) {
  return apiFetch<any>("/api/v1/admin/rbac/tenants", { method: "POST", headers: saHeaders(), body: JSON.stringify(data) });
}
async function updateTenant(id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${id}`, { method: "PATCH", headers: saHeaders(), body: JSON.stringify(data) });
}
async function fetchTenantUsers(id: string) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${id}/users`, { headers: getAuthHeaders() });
}
async function inviteUserToTenant(tenantId: string, email: string, role: string) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${tenantId}/invite`, { method: "POST", headers: saHeaders(), body: JSON.stringify({ email, role }) });
}
async function changeUserRole(tenantId: string, userId: string, role: string) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${tenantId}/users/${userId}`, { method: "PATCH", headers: saHeaders(), body: JSON.stringify({ role }) });
}
async function removeUser(tenantId: string, userId: string) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${tenantId}/users/${userId}`, { method: "DELETE", headers: saHeaders() });
}
async function fetchTenantPermissions(id: string) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${id}/permissions`, { headers: getAuthHeaders() });
}
async function updateTenantPermissions(id: string, permissions: Record<string, Record<string, ModulePermission>>) {
  return apiFetch<any>(`/api/v1/admin/rbac/tenants/${id}/permissions`, { method: "PATCH", headers: saHeaders(), body: JSON.stringify({ permissions }) });
}

const SA_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
const PLANS = ["free", "pro", "enterprise"] as const;
const CRUD = ["read", "create", "update", "delete"] as const;

const PLAN_COLORS: Record<string, string> = {
  free: "text-gray-400 bg-gray-500/10 border-gray-500/30",
  pro: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  enterprise: "text-amber-400 bg-amber-500/10 border-amber-500/30",
};

const SA_ROLE_COLORS: Record<string, string> = {
  OWNER: "text-amber-300 bg-amber-500/10",
  ADMIN: "text-red-300 bg-red-500/10",
  EDITOR: "text-blue-300 bg-blue-500/10",
  VIEWER: "text-gray-300 bg-gray-500/10",
};

function TenantsTab() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"users" | "permissions">("users");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Create tenant form
  const [formName, setFormName] = useState("");
  const [formPlan, setFormPlan] = useState<string>("free");

  // Invite user form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("VIEWER");

  // Queries
  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ["superadmin-tenants"],
    queryFn: fetchTenants,
  });
  const tenants: Tenant[] = tenantsData?.data || [];

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["superadmin-tenant-users", selectedTenantId],
    queryFn: () => fetchTenantUsers(selectedTenantId!),
    enabled: !!selectedTenantId && view === "detail",
  });
  const tenantUsers: TenantUser[] = usersData?.data || [];

  const { data: permsData, isLoading: permsLoading } = useQuery({
    queryKey: ["superadmin-tenant-permissions", selectedTenantId],
    queryFn: () => fetchTenantPermissions(selectedTenantId!),
    enabled: !!selectedTenantId && view === "detail" && detailTab === "permissions",
  });
  const permsConfig: PermissionsData | null = permsData?.data || null;

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => createTenantApi({ name: formName, plan: formPlan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenants"] });
      setShowCreateForm(false);
      setFormName("");
      setFormPlan("free");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateTenant(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin-tenants"] }),
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteUserToTenant(selectedTenantId!, inviteEmail, inviteRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-users", selectedTenantId] });
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteRole("VIEWER");
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => changeUserRole(selectedTenantId!, userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-users", selectedTenantId] }),
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) => removeUser(selectedTenantId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-users", selectedTenantId] }),
  });

  const updatePermsMutation = useMutation({
    mutationFn: (permissions: Record<string, Record<string, ModulePermission>>) => updateTenantPermissions(selectedTenantId!, permissions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-permissions", selectedTenantId] }),
  });

  const handlePermToggle = (role: string, mod: string, action: string) => {
    if (!permsConfig) return;
    const current = { ...permsConfig.permissions };
    const rolePerms = { ...current[role] };
    const modPerms = { ...rolePerms[mod] };
    (modPerms as any)[action] = !(modPerms as any)[action];
    rolePerms[mod] = modPerms;
    current[role] = rolePerms;
    updatePermsMutation.mutate(current);
  };

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  const openTenant = (id: string) => {
    setSelectedTenantId(id);
    setView("detail");
    setDetailTab("users");
  };

  return (
    <div className="space-y-6">
      {/* Sub-header for detail view */}
      {view === "detail" && (
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">{selectedTenant?.name || "Tenant"}</h2>
            <p className="text-xs text-gray-500">{selectedTenant?.plan} plan | {selectedTenant?.slug}</p>
          </div>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {view === "list" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Manage all tenant accounts, users, and permissions across the platform.</p>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Tenant
            </button>
          </div>

          {/* Create Tenant Form */}
          {showCreateForm && (
            <div className="glass-card-strong p-6 space-y-4 animate-in">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">New Tenant</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Account Name *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. KHOU-TV Houston" className="filter-input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Plan</label>
                  <select value={formPlan} onChange={(e) => setFormPlan(e.target.value)} className="filter-input w-full">
                    {PLANS.map((p) => (<option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => createMutation.mutate()} disabled={!formName.trim() || createMutation.isPending} className="px-4 py-2 bg-accent hover:bg-accent-dim disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                </button>
              </div>
            </div>
          )}

          {/* Tenants Table */}
          {tenantsLoading ? (
            <div className="flex items-center gap-3 p-8 glass-card-strong justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm text-gray-400">Loading tenants...</span>
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-8 glass-card-strong text-center">
              <Building2 className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No tenants yet. Create one above.</p>
            </div>
          ) : (
            <div className="glass-card-strong overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-300/30">
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Tenant</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Plan</th>
                    <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Users</th>
                    <th className="text-center text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                    <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Created</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b border-surface-300/10 hover:bg-surface-200/20 transition-colors cursor-pointer" onClick={() => openTenant(t.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <div>
                            <div className="text-sm font-medium text-white">{t.name}</div>
                            <div className="text-[10px] text-gray-500">{t.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border", PLAN_COLORS[t.plan] || PLAN_COLORS.free)}>{t.plan}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-gray-300 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> {t.userCount}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: t.id, isActive: !t.isActive }); }} className="inline-flex items-center">
                          {t.isActive ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-500 inline" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ DETAIL VIEW ═══ */}
      {view === "detail" && selectedTenantId && (
        <>
          {/* Detail Tabs */}
          <div className="flex gap-1 border-b border-surface-300/30">
            <button
              onClick={() => setDetailTab("users")}
              className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                detailTab === "users" ? "border-accent text-white" : "border-transparent text-gray-500 hover:text-gray-300"
              )}
            >
              <Users className="w-4 h-4 inline mr-1.5" />
              Users
            </button>
            <button
              onClick={() => setDetailTab("permissions")}
              className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                detailTab === "permissions" ? "border-accent text-white" : "border-transparent text-gray-500 hover:text-gray-300"
              )}
            >
              <Shield className="w-4 h-4 inline mr-1.5" />
              Permissions
            </button>
          </div>

          {/* Users Tab */}
          {detailTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Team Members</h2>
                <button onClick={() => setShowInviteForm(!showInviteForm)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded-lg transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Invite User
                </button>
              </div>

              {showInviteForm && (
                <div className="glass-card-strong p-4 space-y-3 animate-in">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-xs text-gray-400 mb-1">Email *</label>
                      <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className="filter-input w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Role</label>
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="filter-input w-full">
                        <option value="VIEWER">Viewer</option>
                        <option value="EDITOR">Editor</option>
                        <option value="ADMIN">Admin</option>
                        <option value="OWNER">Owner</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail.trim() || inviteMutation.isPending} className="px-4 py-2 bg-accent hover:bg-accent-dim disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors w-full">
                        {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Invite"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {usersLoading ? (
                <div className="flex items-center gap-3 p-6 glass-card-strong justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span className="text-sm text-gray-400">Loading users...</span>
                </div>
              ) : (
                <div className="glass-card-strong overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-300/30">
                        <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">User</th>
                        <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Role</th>
                        <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                        <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Last Login</th>
                        <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantUsers.map((u) => (
                        <tr key={u.id} className="border-b border-surface-300/10">
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-white">{u.displayName || u.email.split("@")[0]}</div>
                              <div className="text-[10px] text-gray-500">{u.email}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select value={u.role} onChange={(e) => changeRoleMutation.mutate({ userId: u.userId, role: e.target.value })} className={clsx("text-xs font-medium px-2 py-1 rounded", SA_ROLE_COLORS[u.role] || SA_ROLE_COLORS.VIEWER)}>
                              <option value="OWNER">Owner</option>
                              <option value="ADMIN">Admin</option>
                              <option value="EDITOR">Editor</option>
                              <option value="VIEWER">Viewer</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx("text-xs", u.isActive && u.userActive ? "text-green-400" : "text-red-400")}>
                              {u.isActive && u.userActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeUserMutation.mutate(u.userId)} className="text-gray-500 hover:text-red-400 transition-colors" title="Remove from tenant">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Permissions Tab */}
          {detailTab === "permissions" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Permission Matrix</h2>
              <p className="text-xs text-gray-500">
                Configure what each role can do. OWNER always has full access (not editable). Changes save automatically.
              </p>

              {permsLoading || !permsConfig ? (
                <div className="flex items-center gap-3 p-6 glass-card-strong justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span className="text-sm text-gray-400">Loading permissions...</span>
                </div>
              ) : (
                <div className="glass-card-strong overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-surface-300/30">
                        <th className="text-left text-gray-500 font-medium px-3 py-2 sticky left-0 bg-surface-100 min-w-[140px]">Module</th>
                        {SA_ROLES.map((role) => (
                          <th key={role} colSpan={4} className="text-center text-gray-500 font-medium px-1 py-2 border-l border-surface-300/20">
                            <span className={clsx("px-2 py-0.5 rounded text-[10px]", SA_ROLE_COLORS[role])}>{permsConfig.roleNames?.[role] || role}</span>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-surface-300/20">
                        <th className="sticky left-0 bg-surface-100" />
                        {SA_ROLES.map((role) =>
                          CRUD.map((action) => (
                            <th key={`${role}-${action}`} className={clsx("text-center text-[9px] text-gray-600 font-normal px-1 py-1", action === "read" && "border-l border-surface-300/20")}>
                              {action.charAt(0).toUpperCase()}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(permsConfig.modules || []).map((mod) => (
                        <tr key={mod} className="border-b border-surface-300/10 hover:bg-surface-200/10">
                          <td className="px-3 py-1.5 text-gray-300 font-mono sticky left-0 bg-surface-100">{mod}</td>
                          {SA_ROLES.map((role) =>
                            CRUD.map((action) => {
                              const perm = permsConfig.permissions?.[role]?.[mod]?.[action as keyof ModulePermission] ?? false;
                              return (
                                <td key={`${role}-${mod}-${action}`} className={clsx("text-center px-1 py-1.5", action === "read" && "border-l border-surface-300/20")}>
                                  <button
                                    onClick={() => handlePermToggle(role, mod, action)}
                                    className={clsx(
                                      "w-4 h-4 rounded border inline-flex items-center justify-center transition-colors",
                                      perm ? "bg-accent/80 border-accent" : "border-gray-600 hover:border-gray-400"
                                    )}
                                  >
                                    {perm && <Check className="w-2.5 h-2.5 text-white" />}
                                  </button>
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-[10px] text-gray-600 border-t border-surface-300/20">
                    R = Read, C = Create, U = Update, D = Delete
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
