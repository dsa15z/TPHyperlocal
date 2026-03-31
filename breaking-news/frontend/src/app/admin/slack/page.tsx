"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, MessageSquareMore, Webhook, Mail, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

type Tab = "slack" | "webhooks" | "digests";

export default function DeliveryChannelsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("slack");

  return (
    <div className="min-h-screen">
      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell className="w-6 h-6 text-purple-400" /> Delivery Channels
          </h1>
          <p className="text-sm text-gray-500 mt-1">Configure how breaking news alerts are delivered to your team and external systems.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-300/30">
          <button
            onClick={() => setActiveTab("slack")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "slack"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <MessageSquareMore className="w-4 h-4 inline mr-1.5" />
            Slack
          </button>
          <button
            onClick={() => setActiveTab("webhooks")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "webhooks"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <Webhook className="w-4 h-4 inline mr-1.5" />
            Webhooks
          </button>
          <button
            onClick={() => setActiveTab("digests")}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "digests"
                ? "border-accent text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <Mail className="w-4 h-4 inline mr-1.5" />
            Email Digests
          </button>
        </div>

        {activeTab === "slack" && <SlackTab />}
        {activeTab === "webhooks" && <WebhooksTab />}
        {activeTab === "digests" && <DigestsTab />}
      </main>
    </div>
  );
}

/* ─── Slack Tab ──────────────────────────────────────────────────────────── */

const STATE_OPTIONS = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING"];

function SlackTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formChannel, setFormChannel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formStates, setFormStates] = useState<string[]>(["ALERT", "BREAKING"]);

  const { data, isLoading } = useQuery({
    queryKey: ["slack-integrations"],
    queryFn: () => apiFetch<any>("/api/v1/admin/slack", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/slack", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["slack-integrations"] }); setShowForm(false); setFormChannel(""); setFormUrl(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/slack/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["slack-integrations"] }),
  });

  const integrations = data?.data || [];
  const toggleState = (st: string) => setFormStates((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Send breaking news alerts to Slack channels automatically.</p>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Channel</button>
      </div>

      {showForm && (
        <div className="glass-card-strong p-6 space-y-4 animate-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Connect Slack Channel</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-400 mb-1">Channel Name *</label><input type="text" value={formChannel} onChange={(e) => setFormChannel(e.target.value)} placeholder="#breaking-news" className="filter-input w-full" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Webhook URL *</label><input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="filter-input w-full" /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Trigger on States</label>
            <div className="flex flex-wrap gap-2">
              {STATE_OPTIONS.map((st) => (<button key={st} onClick={() => toggleState(st)} className={clsx("filter-btn text-xs px-3 py-1.5", formStates.includes(st) && "filter-btn-active")}>{st.replace("_", " ")}</button>))}
            </div>
          </div>
          <button onClick={() => createMutation.mutate({ channelId: formChannel.replace("#", ""), channelName: formChannel, webhookUrl: formUrl.trim(), states: formStates })} disabled={!formChannel.trim() || !formUrl.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm rounded-lg", (!formChannel.trim() || !formUrl.trim()) && "opacity-50")}>Connect</button>
        </div>
      )}

      {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading...</div>) : integrations.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3"><MessageSquareMore className="w-10 h-10 text-gray-600 mx-auto" /><p className="text-gray-400">No Slack channels connected.</p></div>
      ) : (
        <div className="space-y-3">
          {integrations.map((intg: any) => (
            <div key={intg.id} className="glass-card p-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{intg.channelName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {(intg.states || []).map((st: string) => (<span key={st} className="px-2 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{st}</span>))}
                  <span className={clsx("text-xs", intg.isActive ? "text-green-400" : "text-gray-500")}>{intg.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <button onClick={() => { if (confirm("Remove?")) deleteMutation.mutate(intg.id); }} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Webhooks Tab ───────────────────────────────────────────────────────── */

const EVENT_OPTIONS = ["ALERT", "BREAKING", "TOP_STORY", "NEW_STORY"];

function WebhooksTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["BREAKING"]);

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch<any>("/api/v1/admin/webhooks", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/webhooks", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["webhooks"] }); setShowForm(false); setFormName(""); setFormUrl(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/webhooks/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const webhooks = data?.data || data || [];
  const toggleEvent = (ev: string) => setFormEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Send real-time story events to external URLs. Payloads are signed with HMAC.</p>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Webhook</button>
      </div>

      {showForm && (
        <div className="glass-card-strong p-6 space-y-4 animate-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">New Webhook</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-400 mb-1">Name *</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Slack Integration" className="filter-input w-full" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Endpoint URL *</label><input type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://hooks.slack.com/..." className="filter-input w-full" /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Trigger Events</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((ev) => (
                <button key={ev} onClick={() => toggleEvent(ev)} className={clsx("filter-btn text-xs px-3 py-1.5", formEvents.includes(ev) && "filter-btn-active")}>{ev.replace("_", " ")}</button>
              ))}
            </div>
          </div>
          <button onClick={() => createMutation.mutate({ name: formName.trim(), url: formUrl.trim(), events: formEvents })} disabled={!formName.trim() || !formUrl.trim() || formEvents.length === 0} className={clsx("px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg", (!formName.trim() || !formUrl.trim()) && "opacity-50")}>
            {createMutation.isPending ? "Creating..." : "Create Webhook"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="glass-card p-12 text-center text-gray-500">Loading...</div>
      ) : (Array.isArray(webhooks) ? webhooks : []).length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <Webhook className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-gray-400">No webhooks configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(Array.isArray(webhooks) ? webhooks : []).map((wh: any) => (
            <div key={wh.id} className="glass-card p-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{wh.name}</h3>
                <p className="text-xs text-gray-500 mt-1 truncate max-w-[400px]">{wh.url}</p>
                <div className="flex items-center gap-2 mt-2">
                  {(wh.events || []).map((ev: string) => (
                    <span key={ev} className="px-2 py-0.5 rounded text-[10px] bg-surface-300/60 text-gray-400">{ev}</span>
                  ))}
                  {wh.lastDeliveredAt && <span className="text-xs text-gray-600">Last: {formatRelativeTime(wh.lastDeliveredAt)}</span>}
                </div>
              </div>
              <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(wh.id); }} className="filter-btn text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Email Digests Tab ──────────────────────────────────────────────────── */

const FREQUENCIES = ["HOURLY", "TWICE_DAILY", "DAILY", "WEEKLY"];

function DigestsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formFreq, setFormFreq] = useState("DAILY");

  const { data, isLoading } = useQuery({
    queryKey: ["digests"],
    queryFn: () => apiFetch<any>("/api/v1/admin/digests", { headers: getAuthHeaders() }),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiFetch<any>("/api/v1/admin/digests", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(d) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["digests"] }); setShowForm(false); setFormEmail(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/digests/${id}`, { method: "DELETE", headers: getAuthHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["digests"] }),
  });

  const subs = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Automated email summaries of top stories delivered on a schedule.</p>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg"><Plus className="w-4 h-4" /> Add Subscription</button>
      </div>

      {showForm && (
        <div className="glass-card-strong p-6 space-y-4 animate-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">New Digest</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-400 mb-1">Email *</label><input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="editor@newsroom.com" className="filter-input w-full" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Frequency</label>
              <select value={formFreq} onChange={(e) => setFormFreq(e.target.value)} className="filter-select w-full">
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <button onClick={() => createMutation.mutate({ email: formEmail.trim(), frequency: formFreq })} disabled={!formEmail.trim()} className={clsx("px-5 py-2 bg-accent text-white text-sm rounded-lg", !formEmail.trim() && "opacity-50")}>Subscribe</button>
        </div>
      )}

      {isLoading ? (<div className="glass-card p-12 text-center text-gray-500">Loading...</div>) : subs.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3"><Mail className="w-10 h-10 text-gray-600 mx-auto" /><p className="text-gray-400">No digest subscriptions.</p></div>
      ) : (
        <div className="glass-card divide-y divide-surface-300/30">
          {subs.map((sub: any) => (
            <div key={sub.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-sm text-white">{sub.email}</div>
                <div className="text-xs text-gray-500">{sub.frequency.replace("_", " ")} &middot; {sub.timezone} {sub.lastSentAt && `\u00b7 Last: ${formatRelativeTime(sub.lastSentAt)}`}</div>
              </div>
              <button onClick={() => { if (confirm("Remove?")) deleteMutation.mutate(sub.id); }} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
