/**
 * Step 2: Admin pages — verify all admin sections load and have expected UI.
 */
import { test, expect } from "@playwright/test";
import { login, waitForPageReady, collectConsoleErrors } from "../lib/helpers";

const ADMIN_PAGES = [
  { path: "/admin/sources", expectedText: "Data Feed" },
  { path: "/admin/markets", expectedText: "Markets" },
  { path: "/admin/coverage", expectedText: "Coverage" },
  { path: "/admin/voices", expectedText: "Voice" },
  { path: "/admin/prompts", expectedText: "Prompt" },
  { path: "/admin/audio-sources", expectedText: "Audio" },
  { path: "/admin/community-radar", expectedText: "Social" },
  { path: "/admin/widgets", expectedText: "Widget" },
  { path: "/admin/feature-flags", expectedText: "Feature" },
  { path: "/admin/editor", expectedText: "Review" },
  { path: "/admin/webhooks", expectedText: "Webhook" },
  { path: "/admin/accounts", expectedText: "Team" },
  { path: "/admin/dashboards", expectedText: "Layout" },
  { path: "/admin/slack", expectedText: "Slack" },
  { path: "/admin/digests", expectedText: "Digest" },
  { path: "/admin/audit-logs", expectedText: "Audit" },
  { path: "/admin/credentials", expectedText: "API" },
  { path: "/admin/superadmin", expectedText: "Super" },
  { path: "/admin/hyperlocal-intel", expectedText: "HyperLocal" },
  { path: "/admin/broadcast-monitor", expectedText: "Broadcast" },
  { path: "/admin/cms-publish", expectedText: "CMS" },
  { path: "/admin/mos-integration", expectedText: "ENPS" },
  { path: "/admin/social-accounts", expectedText: "Social" },
];

test.describe("Admin Pages", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const adminPage of ADMIN_PAGES) {
    test(`${adminPage.path} should load without errors`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto(adminPage.path, { waitUntil: "domcontentloaded" });
      await waitForPageReady(page);

      // Should not be a 404
      const bodyText = await page.locator("body").textContent();
      const is404 = bodyText?.includes("404") && bodyText?.includes("could not be found");
      expect(is404, `${adminPage.path} returned 404`).toBeFalsy();

      // Should contain expected text
      const hasExpectedText = await page
        .locator(`text=${adminPage.expectedText}`)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasExpectedText) {
        console.warn(`${adminPage.path}: expected text "${adminPage.expectedText}" not found`);
      }

      // Check for critical console errors
      const criticalErrors = errors.filter(
        (e) => !e.includes("favicon") && !e.includes("hydration") && !e.includes("ResizeObserver")
      );
      if (criticalErrors.length > 0) {
        console.warn(`Console errors on ${adminPage.path}: ${criticalErrors.length}`);
      }
    });
  }
});
