import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteNav, MainContent } from "@/components/SiteNav";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { OnboardingTour } from "@/components/OnboardingTour";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Heartbeat } from "@/components/Heartbeat";
import { AIAssistant } from "@/components/AIAssistant";
import { PostHogProvider } from "@/components/PostHogProvider";
import { BreakingTicker } from "@/components/BreakingTicker";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TopicPulse — Breaking News Intelligence",
  description:
    "Real-time breaking news monitoring and intelligence for broadcast newsrooms.",
  manifest: "/manifest.json",
  themeColor: "#3B82F6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TopicPulse",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans bg-surface text-gray-100 antialiased min-h-screen`}
      >
        <Providers>
          <PostHogProvider>
          <SiteNav />
          <MainContent>{children}</MainContent>
          <KeyboardShortcuts />
          <OnboardingTour />
          <OnboardingWizard />
          <Heartbeat />
          <AIAssistant />
          <BreakingTicker />
          </PostHogProvider>
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
