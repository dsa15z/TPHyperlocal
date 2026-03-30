"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Rss,
  Settings,
  KeyRound,
  MapPin,
  Target,
  Bookmark,
  Radio,
  Zap,
  Mic2,
  Flag,
  Code,
  MessageSquare,
  BarChart3,
  FileText,
  TrendingUp,
  Mic,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Webhook,
  Users,
  ClipboardCheck,
  LayoutGrid,
  Bell,
  Mail,
  ScrollText,
  MessageSquareMore,
  Network,
} from "lucide-react";
import clsx from "clsx";
import { useUser } from "./UserProvider";
import { useSidebar } from "./SidebarProvider";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  section: "main" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, section: "main" },
  { href: "/rising", label: "Rising", icon: <TrendingUp className="w-4 h-4" />, section: "main" },
  { href: "/bookmarks", label: "Bookmarks", icon: <Bookmark className="w-4 h-4" />, section: "main" },
  { href: "/pulses", label: "Smart Pulses", icon: <Zap className="w-4 h-4" />, section: "main" },
  { href: "/show-prep", label: "Show Prep", icon: <Mic2 className="w-4 h-4" />, section: "main" },
  { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, section: "main" },
  { href: "/feeds", label: "RSS Feeds", icon: <Rss className="w-4 h-4" />, section: "main" },
  { href: "/topics", label: "Topic Clusters", icon: <Network className="w-4 h-4" />, section: "main" },
  { href: "/settings", label: "News Profile", icon: <Settings className="w-4 h-4" />, section: "main" },
  { href: "/settings/notifications", label: "Alert Settings", icon: <Bell className="w-4 h-4" />, section: "main" },
  // Admin
  { href: "/admin/sources", label: "Data Feeds", icon: <Database className="w-4 h-4" />, section: "admin" },
  { href: "/admin/markets", label: "Markets", icon: <MapPin className="w-4 h-4" />, section: "admin" },
  { href: "/admin/coverage", label: "Coverage Gaps", icon: <Target className="w-4 h-4" />, section: "admin" },
  { href: "/admin/voices", label: "AI Voices", icon: <MessageSquare className="w-4 h-4" />, section: "admin" },
  { href: "/admin/prompts", label: "Prompts", icon: <FileText className="w-4 h-4" />, section: "admin" },
  { href: "/admin/audio-sources", label: "Audio Sources", icon: <Mic className="w-4 h-4" />, section: "admin" },
  { href: "/admin/community-radar", label: "Social Monitor", icon: <Radio className="w-4 h-4" />, section: "admin" },
  { href: "/admin/widgets", label: "Widgets", icon: <Code className="w-4 h-4" />, section: "admin" },
  { href: "/admin/feature-flags", label: "Feature Flags", icon: <Flag className="w-4 h-4" />, section: "admin" },
  { href: "/admin/editor", label: "Review Queue", icon: <ClipboardCheck className="w-4 h-4" />, section: "admin" },
  { href: "/admin/webhooks", label: "Webhooks", icon: <Webhook className="w-4 h-4" />, section: "admin" },
  { href: "/admin/accounts", label: "Team", icon: <Users className="w-4 h-4" />, section: "admin" },
  { href: "/admin/dashboards", label: "Layouts", icon: <LayoutGrid className="w-4 h-4" />, section: "admin" },
  { href: "/admin/slack", label: "Slack", icon: <MessageSquareMore className="w-4 h-4" />, section: "admin" },
  { href: "/admin/digests", label: "Email Digests", icon: <Mail className="w-4 h-4" />, section: "admin" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: <ScrollText className="w-4 h-4" />, section: "admin" },
  { href: "/admin/credentials", label: "API Keys", icon: <KeyRound className="w-4 h-4" />, section: "admin" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { dashboardTitle, isLoggedIn } = useUser();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  const mainItems = NAV_ITEMS.filter((i) => i.section === "main");
  const adminItems = NAV_ITEMS.filter((i) => i.section === "admin");

  const navLink = (item: NavItem) => {
    const isActive =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? item.label : undefined}
        className={clsx(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group",
          collapsed && "justify-center px-2",
          isActive
            ? "text-white bg-accent/15 border-l-2 border-accent"
            : "text-gray-400 hover:text-white hover:bg-surface-300/30 border-l-2 border-transparent"
        )}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 h-12 bg-surface-50/90 backdrop-blur-md border-b border-surface-300/50 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/" className="text-lg font-bold text-white tracking-tight">
            {dashboardTitle}
          </Link>
          <div className="live-indicator">
            <span className="live-dot" />
            <span className="text-xs hidden sm:inline">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn && <NotificationBell />}
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-12 bottom-0 left-0 z-40 bg-surface-50 border-r border-surface-300/50 transition-all duration-200 flex flex-col",
          "hidden lg:flex",
          collapsed ? "w-16" : "w-56",
          mobileOpen && "!flex w-64"
        )}
      >
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {!collapsed && (
            <div className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              Newsroom
            </div>
          )}
          {mainItems.map(navLink)}

          {isLoggedIn && (
            <>
              <div className="my-3 border-t border-surface-300/30" />
              {!collapsed && (
                <div className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Admin
                </div>
              )}
              {adminItems.map(navLink)}
            </>
          )}
        </nav>

        <div className="hidden lg:flex border-t border-surface-300/30 p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-white hover:bg-surface-300/30 rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className={clsx(
      "pt-12 min-h-screen transition-all duration-200",
      collapsed ? "lg:pl-16" : "lg:pl-56"
    )}>
      {children}
    </div>
  );
}
