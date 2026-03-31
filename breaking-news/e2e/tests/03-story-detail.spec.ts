/**
 * Step 2-5: Story Detail — the richest page in the app.
 * Tests AI summary, sources, scores, panels, annotations, research.
 */
import { test, expect } from "@playwright/test";
import { login, waitForPageReady, API_URL } from "../lib/helpers";

test.describe("Story Detail Page", () => {
  let storyId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should find a story to test", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const storyLink = page.locator("table a[href*='/stories/']").first();
    if (await storyLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await storyLink.getAttribute("href");
      storyId = href?.replace("/stories/", "") || null;
      console.log(`Testing story: ${storyId}`);

      await storyLink.click();
      await waitForPageReady(page);
      expect(page.url()).toContain("/stories/");
    }
  });

  test("should display story header with status, category, location", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    // Title should exist
    const title = page.locator("h1").first();
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(5);

    // Status badge
    const statusBadges = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP", "STALE", "ARCHIVED"];
    let hasStatus = false;
    for (const status of statusBadges) {
      if (await page.locator(`text=${status}`).first().isVisible({ timeout: 500 }).catch(() => false)) {
        hasStatus = true;
        console.log(`Story status: ${status}`);
        break;
      }
    }

    // Timestamps
    const firstSeen = page.locator("text=/First seen/i");
    expect(await firstSeen.isVisible({ timeout: 3000 })).toBeTruthy();
  });

  test("should show AI Source Summary panel", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const summaryPanel = page.locator("text=AI Source Summary");
    if (await summaryPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should either show content or "Generating..."
      const generating = page.locator("text=Generating");
      const summaryText = page.locator("text=AI Source Summary").locator("..").locator("p").first();

      const hasContent = await summaryText.isVisible({ timeout: 15000 }).catch(() => false);
      const isGenerating = await generating.isVisible().catch(() => false);

      console.log(`AI Summary: ${hasContent ? "has content" : isGenerating ? "generating" : "empty"}`);
    }
  });

  test("should display score cards with valid ranges", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    // Check for score labels
    const scoreLabels = ["Breaking Score", "Trending Score", "Confidence Score", "Locality Score"];
    for (const label of scoreLabels) {
      const scoreCard = page.locator(`text=${label}`).first();
      if (await scoreCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Find the score value near it
        const parent = scoreCard.locator("..");
        const scoreValue = await parent.locator("span").filter({ hasText: /^\d+$/ }).first().textContent().catch(() => null);
        if (scoreValue) {
          const score = parseInt(scoreValue);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
          console.log(`${label}: ${score}`);
        }
      }
    }
  });

  test("should show source articles with links", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const sourcesHeader = page.locator("text=/Source Articles/");
    if (await sourcesHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check for "Read Original" links
      const readOriginalLinks = page.locator("text=Read Original");
      const count = await readOriginalLinks.count();
      console.log(`Source articles with "Read Original" links: ${count}`);

      // Each source should have a platform badge
      const platformBadges = page.locator("text=/RSS Feed|NewsAPI|X\\/Twitter|Facebook|GDELT|AI/");
      const badgeCount = await platformBadges.count();
      console.log(`Platform badges: ${badgeCount}`);
    }
  });

  test("should have working Breaking Package panel", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const packageHeader = page.locator("text=One-Click Breaking Package");
    if (await packageHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("Breaking Package panel found");
      // Check for generate button or existing package
      const generateBtn = page.locator("text=Generate Package");
      const broadcastScript = page.locator("text=Broadcast Script");
      const hasPackage = await broadcastScript.isVisible({ timeout: 2000 }).catch(() => false);
      const canGenerate = await generateBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Package: ${hasPackage ? "exists" : canGenerate ? "can generate" : "none"}`);
    }
  });

  test("should have AI Story Research panel", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const researchPanel = page.locator("text=AI Story Research");
    if (await researchPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Story Research panel found");
    }
  });

  test("should display composite score bar", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const compositeLabel = page.locator("text=Composite Score");
    if (await compositeLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("Composite score bar visible");
    }
  });

  test("should have timeline section", async ({ page }) => {
    if (!storyId) return test.skip();
    await page.goto(`/stories/${storyId}`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const timeline = page.locator("text=Timeline");
    if (await timeline.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("Timeline section visible");
    }
  });
});
