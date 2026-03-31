"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface Tab {
  href: string;
  label: string;
}

interface PageTabBarProps {
  tabs: Tab[];
}

/**
 * Shared tab bar that appears at the top of related pages.
 * Uses Next.js Link for navigation — each tab is a separate route
 * but they look and feel like tabs within one page.
 */
export function PageTabBar({ tabs }: PageTabBarProps) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "filter-btn text-sm",
              isActive && "filter-btn-active"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Tab Groups ────────────────────────────────────────────────────────────

export const PUBLISH_TABS: Tab[] = [
  { href: "/publish", label: "Packages" },
  { href: "/video", label: "Video Studio" },
];

export const COMPETITION_TABS: Tab[] = [
  { href: "/beat-alerts", label: "Active Gaps" },
  { href: "/admin/coverage", label: "Coverage Feeds" },
  { href: "/admin/broadcast-monitor", label: "Competitors" },
];

export const PRODUCTION_TABS: Tab[] = [
  { href: "/lineup", label: "Lineup" },
  { href: "/show-prep", label: "Show Prep" },
  { href: "/show-prep/rundown", label: "Rundown" },
];

export const SOURCES_TABS: Tab[] = [
  { href: "/admin/sources", label: "All Sources" },
  { href: "/admin/audio-sources", label: "Audio" },
  { href: "/admin/community-radar", label: "Social Monitor" },
  { href: "/feeds", label: "RSS Feeds" },
];
