"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Newspaper,
  AlertTriangle,
  Users,
  Timer,
  ListOrdered,
  Mic2,
  Send,
  Video,
  FileText,
  TrendingUp,
  Bell,
  BarChart3,
  Bookmark,
  Zap,
  Radio,
  DollarSign,
  Network,
  Settings,
  Database,
  MapPin,
  Target,
  Tv,
  Globe,
  Shield,
  MessageSquare,
  Code,
  Brain,
  Webhook,
  Crown,
  Mail,
  ScrollText,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Plug,
  Wrench,
  ClipboardCheck,
  MonitorPlay,
  Share2,
  Rss,
  LogIn,
  User,
} from "lucide-react";
import clsx from "clsx";
import { useUser } from "./UserProvider";
import { useSidebar } from "./SidebarProvider";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

// ─── Types ─────────────────────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavLink[];
  /** If set, the group header itself is a link (no children shown) */
  directLink?: string;
  /** Section: "main" items always visible, "admin" requires login */
  section: "main" | "admin";
  /** Accent color for the group icon when active */
  accent?: string;
}

// ─── Navigation Structure ──────────────────────────────────────────────────
// Organized by newsroom workflow, not by technical function.

const NAV_GROUPS: NavGroup[] = [
  // ────────────────────────────────────────────────────────────────────────
  //  EDITORIAL — What's happening and what needs attention
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "stories",
    label: "Stories",
    icon: Newspaper,
    directLink: "/",
    items: [],
    section: "main",
  },
  {
    id: "alerts",
    label: "Alerts & Intel",
    icon: AlertTriangle,
    accent: "text-red-400",
    section: "main",
    items: [
      { href: "/beat-alerts", label: "Coverage & Competition", icon: Target },
      { href: "/alerts", label: "Public Alerts", icon: Bell },
      { href: "/predictions", label: "Predictions & Trends", icon: TrendingUp },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  NEWSROOM — Managing people and workflow
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "newsroom",
    label: "Newsroom",
    icon: Users,
    section: "main",
    items: [
      { href: "/assignments", label: "Assignments", icon: ClipboardCheck },
      { href: "/reporters", label: "Reporters", icon: Users },
      { href: "/deadlines", label: "Deadlines", icon: Timer },
      { href: "/briefings", label: "Shift Briefings", icon: FileText },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  SHOW PRODUCTION — Preparing for air
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "production",
    label: "Production",
    icon: Mic2,
    section: "main",
    items: [
      { href: "/show-prep", label: "Show Production", icon: Mic2 },
      { href: "/radio", label: "Audio Studio", icon: Radio },
      { href: "/video", label: "Video Studio", icon: MonitorPlay },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  PUBLISH — Getting content out the door
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "publish",
    label: "Publish",
    icon: Send,
    directLink: "/publish",
    items: [],
    section: "main",
  },

  // ────────────────────────────────────────────────────────────────────────
  //  INTELLIGENCE — Understanding what's happening in the market
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "intelligence",
    label: "Intelligence",
    icon: BarChart3,
    section: "main",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/stocks", label: "Market Movers", icon: DollarSign },
      { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    ],
  },

  // My Settings removed from sidebar — now accessible via profile dropdown in header

  // ════════════════════════════════════════════════════════════════════════
  //  ADMIN SECTION — Configuration, sources, integrations
  // ════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────
  //  SOURCES — Where data comes from
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "sources",
    label: "Sources & Data",
    icon: Database,
    section: "admin",
    items: [
      { href: "/admin/sources", label: "Data Feeds", icon: Database },
      { href: "/admin/markets", label: "Markets", icon: MapPin },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  COVERAGE & COMPETITION — Tracking competitors and gaps
  // ────────────────────────────────────────────────────────────────────────
  // Coverage & Competition removed — accessible via /beat-alerts tab bar

  // ────────────────────────────────────────────────────────────────────────
  //  INTEGRATIONS — Connecting to external systems
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    section: "admin",
    items: [
      { href: "/admin/cms-publish", label: "CMS Publishing", icon: Globe },
      { href: "/admin/mos-integration", label: "ENPS / iNews", icon: MonitorPlay },
      { href: "/admin/social-accounts", label: "Social Accounts", icon: Share2 },
      { href: "/admin/slack", label: "Delivery Channels", icon: MessageSquare },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  AI & CONTENT TOOLS — Customizing AI behavior
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "ai-tools",
    label: "AI & Content",
    icon: MessageSquare,
    section: "admin",
    items: [
      { href: "/admin/voices", label: "AI Config", icon: MessageSquare },
      { href: "/admin/knowledge", label: "Knowledge Base", icon: Brain },
      { href: "/admin/editor", label: "Review Queue", icon: ClipboardCheck },
      { href: "/admin/widgets", label: "Widgets", icon: Code },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  //  SYSTEM — Team, security, and platform configuration
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "system",
    label: "System",
    icon: Wrench,
    section: "admin",
    items: [
      { href: "/admin/accounts", label: "Team & Roles", icon: Users },
      { href: "/admin/superadmin", label: "Super Admin", icon: Crown },
      { href: "/admin/feature-flags", label: "Feature Flags", icon: Shield },
      { href: "/admin/dashboards", label: "Layouts", icon: Settings },
      { href: "/admin/credentials", label: "API Keys", icon: KeyRound },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

// ─── Profile Dropdown ──────────────────────────────────────────────────────

function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-surface-300/30 rounded-lg transition-colors"
      >
        <User className="w-4 h-4" />
        <ChevronDown className={clsx("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-100 border border-surface-300 rounded-lg shadow-xl w-48 py-1 animate-in">
          <Link href="/settings" onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-surface-200/50 hover:text-white transition-colors">
            <User className="w-3.5 h-3.5" /> My Profile
          </Link>
          <Link href="/settings" onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-surface-200/50 hover:text-white transition-colors">
            <Bell className="w-3.5 h-3.5" /> Email Alerts
          </Link>
          <Link href="/settings" onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-surface-200/50 hover:text-white transition-colors">
            <Shield className="w-3.5 h-3.5" /> Access & Roles
          </Link>
          <div className="border-t border-surface-300/30 my-1" />
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("bn_jwt_token");
                window.location.href = "/login";
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full text-left"
          >
            <LogIn className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export function SiteNav() {
  const pathname = usePathname();
  const { dashboardTitle, isLoggedIn } = useUser();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  // Track which groups are expanded — start empty to avoid hydration mismatch
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const isGroupActive = (group: NavGroup) => {
    if (group.directLink) return pathname === group.directLink;
    return group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  };

  const isItemActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const mainGroups = NAV_GROUPS.filter((g) => g.section === "main");
  const adminGroups = NAV_GROUPS.filter((g) => g.section === "admin");

  const renderGroup = (group: NavGroup, { disabled }: { disabled?: boolean } = {}) => {
    const active = !disabled && isGroupActive(group);
    const expanded = !disabled && expandedGroups.has(group.id);
    const Icon = group.icon;

    // Direct link (no submenu) — e.g., "Stories"
    if (group.directLink) {
      const linkContent = (
        <>
          <Icon className={clsx("w-4 h-4 flex-shrink-0", active && (group.accent || "text-accent"), disabled && "text-gray-700")} />
          {!collapsed && <span className="truncate">{group.label}</span>}
        </>
      );

      if (disabled) {
        return (
          <div key={group.id}>
            <div
              title={collapsed ? group.label : "Sign in to access"}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium",
                collapsed && "justify-center px-2",
                "text-gray-600 cursor-not-allowed border-l-2 border-transparent"
              )}
            >
              {linkContent}
            </div>
          </div>
        );
      }

      return (
        <div key={group.id}>
          <Link
            href={group.directLink}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? group.label : undefined}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              collapsed && "justify-center px-2",
              active
                ? "text-white bg-accent/15 border-l-2 border-accent"
                : "text-gray-300 hover:text-white hover:bg-surface-300/30 border-l-2 border-transparent"
            )}
          >
            {linkContent}
          </Link>
        </div>
      );
    }

    // Collapsible group with submenu
    return (
      <div key={group.id}>
        <button
          onClick={() => !disabled && toggleGroup(group.id)}
          title={collapsed ? group.label : disabled ? "Sign in to access" : undefined}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
            collapsed && "justify-center px-2",
            disabled
              ? "text-gray-600 cursor-not-allowed"
              : active
                ? "text-white"
                : "text-gray-400 hover:text-white hover:bg-surface-300/30"
          )}
        >
          <Icon className={clsx("w-4 h-4 flex-shrink-0", active && !disabled && (group.accent || "text-accent"), disabled && "text-gray-700")} />
          {!collapsed && (
            <>
              <span className="truncate flex-1 text-left">{group.label}</span>
              {!disabled && (
                <ChevronDown
                  className={clsx(
                    "w-3 h-3 flex-shrink-0 text-gray-600 transition-transform",
                    expanded && "rotate-180"
                  )}
                />
              )}
            </>
          )}
        </button>

        {/* Submenu items */}
        {expanded && !collapsed && !disabled && (
          <div className="mt-0.5 ml-4 pl-3 border-l border-surface-300/30 space-y-0.5">
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              const itemActive = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={itemActive ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-all",
                    itemActive
                      ? "text-white bg-accent/10"
                      : "text-gray-500 hover:text-gray-200 hover:bg-surface-300/20"
                  )}
                >
                  <ItemIcon className={clsx("w-3.5 h-3.5 flex-shrink-0", itemActive && "text-accent")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 h-12 bg-surface-50/90 backdrop-blur-md border-b border-surface-300/50 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-topicpulse.png" alt="TopicPulse" className="h-7 brightness-0 invert" />
          </Link>
          <div className="live-indicator">
            <span className="live-dot" />
            <span className="text-xs hidden sm:inline">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoggedIn && <NotificationBell />}
          {isLoggedIn ? (
            <ProfileDropdown />
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors font-medium"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
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
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {mainGroups.map((group) =>
            renderGroup(group, { disabled: !isLoggedIn && group.id !== "stories" })
          )}

          {isLoggedIn && (
            <>
              <div className="my-3 border-t border-surface-300/30" />
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Admin
                </div>
              )}
              {adminGroups.map((group) => renderGroup(group))}
            </>
          )}
        </nav>

        <div className="hidden lg:flex border-t border-surface-300/30 p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
