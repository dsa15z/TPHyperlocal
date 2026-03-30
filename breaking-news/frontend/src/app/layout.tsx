import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteNav, MainContent } from "@/components/SiteNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Breaking News Intelligence",
  description:
    "Real-time breaking news monitoring and intelligence dashboard for your local markets.",
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
        </Providers>
      </body>
    </html>
  );
}
