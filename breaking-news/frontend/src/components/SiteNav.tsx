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
  Users,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { useUser } from "./UserProvider";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  section?: "main" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    section: "main",
  },
  {
    href: "/admin/sources",
    label: "Data Feeds",
    icon: <Database className="w-4 h-4" />,
    section: "admin",
  },
  {
    href: "/admin/markets",
    label: "Markets",
    icon: <MapPin className="w-4 h-4" />,
    section: "admin",
  },
  {
    href: "/admin/credentials",
    label: "API Keys",
    icon: <KeyRound className="w-4 h-4" />,
    section: "admin",
  },
  {
    href: "/feeds",
    label: "RSS Feeds",
    icon: <Rss className="w-4 h-4" />,
    section: "main",
  },
  {
    href: "/settings",
    label: "News Profile",
    icon: <Settings className="w-4 h-4" />,
    section: "main",
  },
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
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold text-white tracking-tight">
                {dashboardTitle}
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
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
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
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
          <div className="flex items-center gap-1">
            {isLoggedIn && (
              <>
                <span className="text-xs text-gray-600 mr-2 hidden lg:inline">
                  Admin
                </span>
                {adminItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                        isActive
                          ? "text-white bg-surface-300/50"
                          : "text-gray-400 hover:text-white hover:bg-surface-300/30"
                      )}
                    >
                      {item.icon}
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {/* Live indicator */}
            <div className="ml-3 live-indicator">
              <span className="live-dot" />
              <span className="hidden sm:inline">LIVE</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
