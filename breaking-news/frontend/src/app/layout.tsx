import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteNav, MainContent } from "@/components/SiteNav";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { OnboardingTour } from "@/components/OnboardingTour";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Breaking News Intelligence",
  description:
    "Real-time breaking news monitoring and intelligence dashboard for your local markets.",
  manifest: "/manifest.json",
  themeColor: "#3B82F6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NewsDesk",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
          <SiteNav />
          <MainContent>{children}</MainContent>
          <KeyboardShortcuts />
          <OnboardingTour />
        </Providers>
      </body>
    </html>
  );
}
