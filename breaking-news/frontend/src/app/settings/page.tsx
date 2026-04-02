"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Lock, Mail, Shield, Bookmark,
  Plus, Trash2, Check, AlertCircle, Bell, BellOff,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch, fetchUserProfile } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

interface UserView { id: string; name: string; columns: any; filters: any; createdAt: string; updatedAt: string; }
interface ViewSub { id: string; viewId: string; viewName: string; email: string; frequency: string; maxStories: number; isActive: boolean; lastSentAt: string | null; }

const FREQUENCIES = [
  { value: "HOURLY", label: "Every hour" },
  { value: "TWICE_DAILY", label: "Twice daily" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "password" | "access" | "views" | "subscriptions">("profile");
  const { data: profile } = useQuery({ queryKey: ["user-profile"], queryFn: fetchUserProfile });

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "password" as const, label: "Password", icon: Lock },
    { id: "access" as const, label: "Access", icon: Shield },
    { id: "views" as const, label: "My Views", icon: Bookmark },
    { id: "subscriptions" as const, label: "Email Alerts", icon: Mail },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <User className="w-6 h-6 text-accent" /> My Settings
        </h1>
        <div className="flex gap-1 border-b border-surface-300/30 pb-px">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={clsx("flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors", tab === t.id ? "bg-surface-200/50 text-white border-b-2 border-accent" : "text-gray-500 hover:text-gray-300")}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
        <div className="glass-card p-6">
          {tab === "profile" && <ProfileTab profile={profile} />}
          {tab === "password" && <PasswordTab />}
          {tab === "access" && <AccessTab />}
          {tab === "views" && <ViewsTab />}
          {tab === "subscriptions" && <SubscriptionsTab />}
        </div>
      </main>
    </div>
  );
}

function ProfileTab({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile?.user?.displayName || "");
  const [phone, setPhone] = useState(profile?.user?.phone || "");
  const [tz, setTz] = useState(profile?.user?.timezone || "America/Chicago");
  const mut = useMutation({ mutationFn: (d: any) => apiFetch("/api/v1/user/settings/profile", { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify(d) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["user-profile"] }) });

  return (
    <div className="space-y-4 max-w-md">
      <div><label className="block text-sm text-gray-400 mb-1">Email</label><input type="email" value={profile?.user?.email || ""} disabled className="filter-input w-full opacity-60" /><p className="text-xs text-gray-600 mt-1">Contact your admin to change email.</p></div>
      <div><label className="block text-sm text-gray-400 mb-1">Display Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="filter-input w-full" /></div>
      <div><label className="block text-sm text-gray-400 mb-1">Phone</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="filter-input w-full" placeholder="+1 555-0123" /></div>
      <div><label className="block text-sm text-gray-400 mb-1">Timezone</label><select value={tz} onChange={(e) => setTz(e.target.value)} className="filter-select w-full">{["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix"].map(t => <option key={t} value={t}>{t.split("/")[1].replace("_"," ")}</option>)}</select></div>
      <button onClick={() => mut.mutate({ displayName: name, phone, timezone: tz })} disabled={mut.isPending} className="px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg">{mut.isPending ? "Saving..." : "Save Changes"}</button>
      {mut.isSuccess && <p className="text-green-400 text-sm flex items-center gap-1"><Check className="w-3 h-3" /> Saved</p>}
      {mut.isError && <p className="text-red-400 text-sm"><AlertCircle className="w-3 h-3 inline" /> {(mut.error as Error)?.message}</p>}
    </div>
  );
}

function PasswordTab() {
  const [cur, setCur] = useState(""); const [pwd, setPwd] = useState(""); const [confirm, setConfirm] = useState("");
  const mut = useMutation({ mutationFn: (d: any) => apiFetch("/api/v1/user/settings/password", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }), onSuccess: () => { setCur(""); setPwd(""); setConfirm(""); } });
  return (
    <div className="space-y-4 max-w-md">
      <div><label className="block text-sm text-gray-400 mb-1">Current Password</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="filter-input w-full" /></div>
      <div><label className="block text-sm text-gray-400 mb-1">New Password</label><input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="filter-input w-full" placeholder="Minimum 8 characters" /></div>
      <div><label className="block text-sm text-gray-400 mb-1">Confirm</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="filter-input w-full" />{confirm && pwd !== confirm && <p className="text-red-400 text-xs mt-1">Passwords don't match</p>}</div>
      <button onClick={() => mut.mutate({ currentPassword: cur, newPassword: pwd })} disabled={mut.isPending || pwd !== confirm || pwd.length < 8 || !cur} className={clsx("px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg", (pwd !== confirm || pwd.length < 8) && "opacity-50 cursor-not-allowed")}>{mut.isPending ? "Changing..." : "Change Password"}</button>
      {mut.isSuccess && <p className="text-green-400 text-sm"><Check className="w-3 h-3 inline" /> Password changed</p>}
      {mut.isError && <p className="text-red-400 text-sm"><AlertCircle className="w-3 h-3 inline" /> {(mut.error as Error)?.message}</p>}
    </div>
  );
}

function AccessTab() {
  const { data, isLoading } = useQuery({ queryKey: ["user-access"], queryFn: () => apiFetch<any>("/api/v1/user/settings/access", { headers: getAuthHeaders() }) });
  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Your account memberships and market access.</p>
      {(data?.accounts || []).map((a: any) => (
        <div key={a.accountId} className="rounded-lg bg-surface-200/30 p-4 space-y-2">
          <div className="flex items-center justify-between"><span className="text-white font-medium">{a.accountName}</span><span className={clsx("px-2 py-0.5 rounded text-xs font-semibold uppercase", a.role === 'OWNER' ? "text-amber-400 bg-amber-500/10" : a.role === 'ADMIN' ? "text-blue-400 bg-blue-500/10" : "text-gray-400 bg-gray-500/10")}>{a.role}</span></div>
          <div className="text-xs text-gray-500">Plan: {a.plan}</div>
          <div className="flex flex-wrap gap-1">{(a.markets || []).map((m: any) => <span key={m.id} className="px-2 py-0.5 rounded bg-surface-300/30 text-xs text-gray-300">{m.name}{m.state ? `, ${m.state}` : ""}</span>)}{(!a.markets || a.markets.length === 0) && <span className="text-xs text-gray-600">No markets</span>}</div>
        </div>
      ))}
    </div>
  );
}

function ViewsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["user-views"], queryFn: () => apiFetch<any>("/api/v1/user/views", { headers: getAuthHeaders() }) });
  const del = useMutation({ mutationFn: (id: string) => apiFetch(`/api/v1/user/views/${id}`, { method: "DELETE", headers: getAuthHeaders() }), onSuccess: () => qc.invalidateQueries({ queryKey: ["user-views"] }) });
  const views = data?.data || [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Your saved dashboard views. Save views from the Stories page.</p>
      {isLoading && <p className="text-gray-500">Loading...</p>}
      {views.length === 0 && !isLoading && <p className="text-gray-600 text-sm">No saved views yet.</p>}
      {views.map((v: UserView) => { const f = v.filters || {}; return (
        <div key={v.id} className="flex items-center justify-between rounded-lg bg-surface-200/30 p-3">
          <div className="min-w-0 flex-1"><div className="text-white font-medium text-sm">{v.name}</div><div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">{f.nlpPrompt && <span className="text-accent">AI: {f.nlpPrompt}</span>}{f.categories?.length > 0 && <span>Categories: {f.categories.join(", ")}</span>}{f.timeRange && <span>Time: {f.timeRange}</span>}</div></div>
          <button onClick={() => { if (confirm(`Delete "${v.name}"?`)) del.mutate(v.id); }} className="text-gray-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
      ); })}
    </div>
  );
}

function SubscriptionsTab() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [fViewId, setFViewId] = useState(""); const [fEmail, setFEmail] = useState(""); const [fFreq, setFFreq] = useState("DAILY"); const [fMax, setFMax] = useState(20);
  const { data: vd } = useQuery({ queryKey: ["user-views"], queryFn: () => apiFetch<any>("/api/v1/user/views", { headers: getAuthHeaders() }) });
  const { data: sd, isLoading } = useQuery({ queryKey: ["user-subscriptions"], queryFn: () => apiFetch<any>("/api/v1/user/subscriptions", { headers: getAuthHeaders() }) });
  const create = useMutation({ mutationFn: (d: any) => apiFetch("/api/v1/user/subscriptions", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-subscriptions"] }); setShow(false); } });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch(`/api/v1/user/subscriptions/${id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isActive }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["user-subscriptions"] }) });
  const del = useMutation({ mutationFn: (id: string) => apiFetch(`/api/v1/user/subscriptions/${id}`, { method: "DELETE", headers: getAuthHeaders() }), onSuccess: () => qc.invalidateQueries({ queryKey: ["user-subscriptions"] }) });
  const views = vd?.data || []; const subs = sd?.data || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-gray-400">Email digests of your saved views.</p><button onClick={() => setShow(!show)} className="px-3 py-1.5 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Subscribe</button></div>
      {show && (
        <div className="rounded-lg bg-surface-200/30 p-4 space-y-3 animate-in">
          <div><label className="block text-xs text-gray-400 mb-1">View</label><select value={fViewId} onChange={(e) => setFViewId(e.target.value)} className="filter-select w-full"><option value="">Select a view...</option>{views.map((v: UserView) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
          <div><label className="block text-xs text-gray-400 mb-1">Email</label><input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} className="filter-input w-full" placeholder="your@email.com" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">Frequency</label><select value={fFreq} onChange={(e) => setFFreq(e.target.value)} className="filter-select w-full">{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">Max Stories</label><input type="number" min={5} max={50} value={fMax} onChange={(e) => setFMax(parseInt(e.target.value))} className="filter-input w-full" /></div>
          </div>
          <button onClick={() => create.mutate({ viewId: fViewId, email: fEmail, frequency: fFreq, maxStories: fMax })} disabled={!fViewId || !fEmail || create.isPending} className="px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg">{create.isPending ? "Creating..." : "Create Subscription"}</button>
        </div>
      )}
      {isLoading && <p className="text-gray-500">Loading...</p>}
      {subs.length === 0 && !isLoading && !show && <p className="text-gray-600 text-sm">No subscriptions. Save a view first, then subscribe.</p>}
      {subs.map((s: ViewSub) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-200/30 p-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-white font-medium text-sm">{s.viewName}</span><span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold", s.isActive ? "text-green-400 bg-green-500/10" : "text-gray-500 bg-gray-500/10")}>{s.isActive ? "ACTIVE" : "PAUSED"}</span></div><div className="text-xs text-gray-500 mt-0.5">{s.email} · {FREQUENCIES.find(f => f.value === s.frequency)?.label} · Max {s.maxStories}{s.lastSentAt && ` · Last: ${new Date(s.lastSentAt).toLocaleDateString()}`}</div></div>
          <div className="flex items-center gap-1.5"><button onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })} className="p-1.5 text-gray-500 hover:text-white" title={s.isActive ? "Pause" : "Resume"}>{s.isActive ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}</button><button onClick={() => { if (confirm("Unsubscribe?")) del.mutate(s.id); }} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div>
        </div>
      ))}
    </div>
  );
}
