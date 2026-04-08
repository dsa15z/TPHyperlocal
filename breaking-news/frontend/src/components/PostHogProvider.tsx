"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

let posthog: any = null;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog) return;

    // @ts-ignore — posthog-js may not be installed yet
    import("posthog-js" as any).then((mod: any) => {
      posthog = mod.default;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: false, // We track manually below
        loaded: (ph: any) => {
          if (process.env.NODE_ENV === "development") ph.debug();
        },
      });
    }).catch(() => {});
  }, []);

  // Track page views
  useEffect(() => {
    if (posthog) posthog.capture("$pageview", { $current_url: pathname });
  }, [pathname]);

  return <>{children}</>;
}
