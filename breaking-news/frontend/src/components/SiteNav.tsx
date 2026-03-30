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
} from "lucide-react";
import clsx from "clsx";
import { useUser } from "./UserProvider";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  section?: "main" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  // Main nav
  { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, section: "main" },
  { href: "/bookmarks", label: "Bookmarks", icon: <Bookmark className="w-4 h-4" />, section: "main" },
  { href: "/pulses", label: "Pulses", icon: <Zap className="w-4 h-4" />, section: "main" },
  { href: "/show-prep", label: "Show Prep", icon: <Mic2 className="w-4 h-4" />, section: "main" },
  { href: "/rising", label: "Rising", icon: <TrendingUp className="w-4 h-4" />, section: "main" },
  { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, section: "main" },
  { href: "/feeds", label: "RSS Feeds", icon: <Rss className="w-4 h-4" />, section: "main" },
  { href: "/settings", label: "Profile", icon: <Settings className="w-4 h-4" />, section: "main" },
  // Admin nav
  { href: "/admin/sources", label: "Data Feeds", icon: <Database className="w-4 h-4" />, section: "admin" },
  { href: "/admin/markets", label: "Markets", icon: <MapPin className="w-4 h-4" />, section: "admin" },
  { href: "/admin/coverage", label: "Coverage", icon: <Target className="w-4 h-4" />, section: "admin" },
  { href: "/admin/voices", label: "Voices", icon: <MessageSquare className="w-4 h-4" />, section: "admin" },
  { href: "/admin/community-radar", label: "Social", icon: <Radio className="w-4 h-4" />, section: "admin" },
  { href: "/admin/widgets", label: "Widgets", icon: <Code className="w-4 h-4" />, section: "admin" },
  { href: "/admin/feature-flags", label: "Flags", icon: <Flag className="w-4 h-4" />, section: "admin" },
  { href: "/admin/audio-sources", label: "Audio", icon: <Mic className="w-4 h-4" />, section: "admin" },
  { href: "/admin/prompts", label: "Prompts", icon: <FileText className="w-4 h-4" />, section: "admin" },
  { href: "/admin/credentials", label: "Keys", icon: <KeyRound className="w-4 h-4" />, section: "admin" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { dashboardTitle, isLoggedIn } = useUser();

  const mainItems = NAV_ITEMS.filter((item) => item.section === "main");
  const adminItems = NAV_ITEMS.filter((item) => item.section === "admin");

  return (
    <nav className="border-b border-surface-300/50 bg-surface-50/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Brand + main nav */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <span className="text-lg font-bold text-white tracking-tight">
                {dashboardTitle}
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-0.5 overflow-x-auto">
              {mainItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                      isActive
                        ? "text-white bg-surface-300/50"
                        : "text-gray-400 hover:text-white hover:bg-surface-300/30"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: Admin nav */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {isLoggedIn && (
              <>
                <span className="text-[10px] text-gray-600 mr-1 hidden lg:inline">
                  Admin
                </span>
                {adminItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap",
                        isActive
                          ? "text-white bg-surface-300/50"
                          : "text-gray-400 hover:text-white hover:bg-surface-300/30"
                      )}
                    >
                      {item.icon}
                      <span className="hidden xl:inline">{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {isLoggedIn && <NotificationBell />}

            <div className="ml-2 live-indicator flex-shrink-0">
              <span className="live-dot" />
              <span className="hidden sm:inline">LIVE</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
