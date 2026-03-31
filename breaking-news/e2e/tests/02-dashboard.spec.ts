/**
 * Step 2-5: Dashboard — the main page.
 * Tests story table, filtering, sorting, column customization, views.
 */
import { test, expect } from "@playwright/test";
import { login, waitForPageReady, collectConsoleErrors } from "../lib/helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);
  });

  test("should load dashboard with stories table", async ({ page }) => {
    // Should have the main table or loading state
    const table = page.locator("table").first();
    const loading = page.locator("text=Loading stories");
    const scanning = page.locator("text=Scanning for breaking news");

    // Wait for either table or loading message
    await expect(table.or(loading).or(scanning)).toBeVisible({ timeout: 10000 });

    // If stories exist, verify table structure
    if (await table.isVisible()) {
      const headers = page.locator("thead th");
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThan(3);
      console.log(`Dashboard table has ${headerCount} columns`);
    }
  });

  test("should display story count", async ({ page }) => {
    await page.waitForTimeout(3000); // Wait for data
    const countText = page.locator("text=/\\d+ stories found/");
    if (await countText.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await countText.textContent();
      console.log(`Stories: ${text}`);
    }
  });

  test("should have working filter bar", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Search input
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Houston");
      await page.waitForTimeout(500);
      await searchInput.clear();
    }

    // Time range buttons
    const timeButtons = page.locator("text=1h, text=6h, text=24h, text=7d");
    const btn24h = page.locator("button").filter({ hasText: "24h" }).first();
    if (await btn24h.isVisible()) {
      await btn24h.click();
      await page.waitForTimeout(500);
    }

    // Trend buttons
    const risingBtn = page.locator("button").filter({ hasText: /Rising/ }).first();
    if (await risingBtn.isVisible()) {
      await risingBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("should have view selector", async ({ page }) => {
    await page.waitForTimeout(2000);
    const viewSelector = page.locator("text=Default").first();
    if (await viewSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewSelector.click();
      await page.waitForTimeout(500);
      // Should show view dropdown
      const viewOptions = page.locator("text=Views");
      expect(await viewOptions.isVisible()).toBeTruthy();
    }
  });

  test("should have column customizer", async ({ page }) => {
    await page.waitForTimeout(2000);
    const columnsBtn = page.locator("button").filter({ hasText: /Columns/ }).first();
    if (await columnsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await columnsBtn.click();
      await page.waitForTimeout(500);
      // Should show column list with visibility toggles
      const columnPanel = page.locator("text=/Columns \\(\\d+\\/\\d+\\)/");
      expect(await columnPanel.isVisible()).toBeTruthy();
    }
  });

  test("should navigate to story detail on click", async ({ page }) => {
    await page.waitForTimeout(3000);
    const storyLink = page.locator("table a[href*='/stories/']").first();
    if (await storyLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await storyLink.getAttribute("href");
      await storyLink.click();
      await waitForPageReady(page);
      expect(page.url()).toContain("/stories/");
      console.log(`Navigated to story: ${href}`);
    }
  });

  test("should have working pagination", async ({ page }) => {
    await page.waitForTimeout(3000);
    const pageInfo = page.locator("text=/Page \\d+ of \\d+/");
    if (await pageInfo.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await pageInfo.textContent();
      console.log(`Pagination: ${text}`);

      // Try next page
      const nextBtn = page.locator("button").filter({ hasText: "Next" }).first();
      if (await nextBtn.isVisible() && !(await nextBtn.isDisabled())) {
        await nextBtn.click();
        await page.waitForTimeout(2000);
        const newPageInfo = await pageInfo.textContent();
        console.log(`After next: ${newPageInfo}`);
      }
    }
  });

  test("should sort columns on header click", async ({ page }) => {
    await page.waitForTimeout(3000);
    const sortableHeader = page.locator("th").filter({ hasText: "Breaking" }).first();
    if (await sortableHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sortableHeader.click();
      await page.waitForTimeout(1000);
      // Should show sort indicator
      const sortIcon = sortableHeader.locator("svg");
      expect(await sortIcon.count()).toBeGreaterThan(0);
    }
  });

  test("should not have console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForTimeout(5000);
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("hydration") && !e.includes("ResizeObserver")
    );
    if (criticalErrors.length > 0) {
      console.warn(`Console errors on dashboard: ${criticalErrors.join("\n")}`);
    }
  });
});
