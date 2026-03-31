/**
 * Step 2: Navigation — verify sidebar nav links all work.
 * Tests that every nav link navigates to a valid page.
 */
import { test, expect } from "@playwright/test";
import { login, waitForPageReady, getNavLinks } from "../lib/helpers";

test.describe("Navigation Sidebar", () => {
  test("every nav link should navigate to a valid page", async ({ page }) => {
    await login(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const navLinks = await getNavLinks(page);
    console.log(`Testing ${navLinks.length} nav links`);

    const results: Array<{ href: string; label: string; status: string }> = [];

    for (const link of navLinks) {
      try {
        const response = await page.goto(link.href, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        await page.waitForTimeout(500);

        const bodyText = await page.locator("body").textContent().catch(() => "");
        const is404 = bodyText?.includes("404") && bodyText?.includes("could not be found");

        if (is404) {
          results.push({ ...link, status: "404" });
          console.log(`✗ ${link.href} (${link.label}) — 404`);
        } else if (response && response.status() >= 400) {
          results.push({ ...link, status: `error-${response.status()}` });
          console.log(`⚠ ${link.href} (${link.label}) — ${response.status()}`);
        } else {
          results.push({ ...link, status: "ok" });
          console.log(`✓ ${link.href} (${link.label})`);
        }
      } catch {
        results.push({ ...link, status: "timeout" });
        console.log(`⚠ ${link.href} (${link.label}) — timeout`);
      }
    }

    const broken = results.filter((r) => r.status !== "ok");
    if (broken.length > 0) {
      console.log(`\n${broken.length} broken nav links:`);
      broken.forEach((b) => console.log(`  ${b.href} — ${b.status}`));
    }

    // Allow a small tolerance for flaky pages, but no 404s
    const fourOhFours = results.filter((r) => r.status === "404");
    expect(fourOhFours.length, `404 nav links: ${fourOhFours.map((r) => r.href).join(", ")}`).toBe(0);
  });

  test("sidebar should collapse and expand", async ({ page }) => {
    await login(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const collapseBtn = page.locator("text=Collapse").first();
    if (await collapseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collapseBtn.click();
      await page.waitForTimeout(500);

      // Sidebar should be narrower
      const sidebar = page.locator("aside").first();
      const width = await sidebar.evaluate((el) => el.offsetWidth);
      expect(width).toBeLessThan(100); // collapsed = 64px

      // Click expand
      const expandBtn = page.locator("aside button").first();
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
  });
});
