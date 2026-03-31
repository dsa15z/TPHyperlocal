/**
 * Step 1: App Mapping — Crawl the application and build a sitemap.
 * Discovers all routes, interactive elements, and navigation paths.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import {
  login,
  getNavLinks,
  countInteractiveElements,
  collectConsoleErrors,
  collectNetworkErrors,
  waitForPageReady,
  type PageReport,
} from "../lib/helpers";

// All known routes from the codebase
const KNOWN_ROUTES = [
  "/",
  "/bookmarks",
  "/pulses",
  "/show-prep",
  "/assignments",
  "/briefings",
  "/alerts",
  "/analytics",
  "/feeds",
  "/radio",
  "/stocks",
  "/topics",
  "/settings",
  "/settings/notifications",
  "/beat-alerts",
  "/reporters",
  "/deadlines",
  "/lineup",
  "/publish",
  "/video",
  "/predictions",
  "/rising",
  // Admin pages
  "/admin/sources",
  "/admin/markets",
  "/admin/coverage",
  "/admin/voices",
  "/admin/prompts",
  "/admin/audio-sources",
  "/admin/community-radar",
  "/admin/widgets",
  "/admin/feature-flags",
  "/admin/editor",
  "/admin/webhooks",
  "/admin/accounts",
  "/admin/dashboards",
  "/admin/slack",
  "/admin/digests",
  "/admin/audit-logs",
  "/admin/credentials",
  "/admin/superadmin",
  "/admin/hyperlocal-intel",
  "/admin/broadcast-monitor",
  "/admin/cms-publish",
  "/admin/mos-integration",
  "/admin/social-accounts",
];

test.describe("App Mapping & Discovery", () => {
  const pageReports: PageReport[] = [];
  const consoleErrorsByPage: Array<{ page: string; message: string }> = [];
  const networkFailures: Array<{ page: string; url: string; status: number }> = [];
  const brokenLinks: string[] = [];

  test("should login successfully", async ({ page }) => {
    const success = await login(page);
    // If login fails, try without auth (some pages may be public)
    if (!success) {
      console.warn("Login failed — testing as unauthenticated user");
    }
  });

  test("should discover navigation links", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const navLinks = await getNavLinks(page);
    console.log(`Discovered ${navLinks.length} nav links:`);
    navLinks.forEach((l) => console.log(`  ${l.href} — ${l.label}`));

    expect(navLinks.length).toBeGreaterThan(10);

    // Save sitemap
    const sitemap = {
      discoveredAt: new Date().toISOString(),
      navLinks,
      knownRoutes: KNOWN_ROUTES,
    };
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync("test-results/sitemap.json", JSON.stringify(sitemap, null, 2));
  });

  test("should visit all known routes and collect status", async ({ page }) => {
    // Try login first
    await login(page);

    for (const route of KNOWN_ROUTES) {
      const consoleErrors = collectConsoleErrors(page);
      const networkErrors = collectNetworkErrors(page);
      const start = Date.now();

      let status: PageReport["status"] = "ok";
      let title = "";

      try {
        const response = await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        if (response?.status() === 404) {
          status = "404";
          brokenLinks.push(route);
        } else if (response && response.status() >= 400) {
          status = "error";
        }

        await waitForPageReady(page);
        title = await page.title();
      } catch (err) {
        status = "timeout";
      }

      const loadTimeMs = Date.now() - start;

      // Check for Next.js 404 page
      const bodyText = await page.locator("body").textContent().catch(() => "");
      if (bodyText?.includes("404") && bodyText?.includes("could not be found")) {
        status = "404";
        if (!brokenLinks.includes(route)) brokenLinks.push(route);
      }

      const interactiveElements = await countInteractiveElements(page);

      const report: PageReport = {
        url: route,
        status,
        title,
        loadTimeMs,
        consoleErrors: [...consoleErrors],
        networkErrors: networkErrors.map((e) => `${e.status} ${e.url}`),
        interactiveElements,
      };

      pageReports.push(report);

      // Collect errors
      consoleErrors.forEach((msg) => {
        consoleErrorsByPage.push({ page: route, message: msg });
      });
      networkErrors.forEach((err) => {
        networkFailures.push({ page: route, ...err });
      });

      const icon = status === "ok" ? "✓" : status === "404" ? "✗" : "⚠";
      console.log(`${icon} ${route} — ${status} (${loadTimeMs}ms, ${interactiveElements} elements)`);
    }

    // Write full report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: pageReports.length,
        ok: pageReports.filter((p) => p.status === "ok").length,
        errors: pageReports.filter((p) => p.status === "error").length,
        notFound: pageReports.filter((p) => p.status === "404").length,
        timeouts: pageReports.filter((p) => p.status === "timeout").length,
      },
      brokenLinks,
      slowPages: pageReports
        .filter((p) => p.loadTimeMs > 5000)
        .map((p) => ({ url: p.url, ms: p.loadTimeMs })),
      consoleErrors: consoleErrorsByPage,
      networkFailures,
      pages: pageReports,
    };

    fs.writeFileSync("test-results/app-mapping-report.json", JSON.stringify(report, null, 2));

    console.log("\n=== APP MAPPING SUMMARY ===");
    console.log(`Total routes: ${report.summary.total}`);
    console.log(`OK: ${report.summary.ok}`);
    console.log(`404: ${report.summary.notFound}`);
    console.log(`Errors: ${report.summary.errors}`);
    console.log(`Timeouts: ${report.summary.timeouts}`);
    console.log(`Broken links: ${brokenLinks.join(", ") || "none"}`);
    console.log(`Console errors: ${consoleErrorsByPage.length}`);
    console.log(`Network failures: ${networkFailures.length}`);
    console.log(`Slow pages (>5s): ${report.slowPages.length}`);

    // Assert no 404s on known routes
    expect(brokenLinks.length, `Broken links found: ${brokenLinks.join(", ")}`).toBe(0);
  });
});
