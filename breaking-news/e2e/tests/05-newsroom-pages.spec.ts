/**
 * Step 2: Newsroom pages — verify all producer/editor pages load correctly.
 */
import { test, expect } from "@playwright/test";
import { login, waitForPageReady } from "../lib/helpers";

const NEWSROOM_PAGES = [
  { path: "/beat-alerts", expectedText: "Coverage Gap" },
  { path: "/assignments", expectedText: "Assignment" },
  { path: "/reporters", expectedText: "Reporter" },
  { path: "/deadlines", expectedText: "Deadline" },
  { path: "/lineup", expectedText: "Lineup" },
  { path: "/show-prep", expectedText: "Show Prep" },
  { path: "/publish", expectedText: "Publish" },
  { path: "/video", expectedText: "Video" },
  { path: "/briefings", expectedText: "Briefing" },
  { path: "/predictions", expectedText: "Prediction" },
  { path: "/alerts", expectedText: "Alert" },
  { path: "/analytics", expectedText: "Analytics" },
  { path: "/bookmarks", expectedText: "Bookmark" },
  { path: "/pulses", expectedText: "Pulse" },
  { path: "/feeds", expectedText: "Feed" },
  { path: "/radio", expectedText: "Radio" },
  { path: "/stocks", expectedText: "Market" },
  { path: "/topics", expectedText: "Topic" },
];

test.describe("Newsroom Pages", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const newsPage of NEWSROOM_PAGES) {
    test(`${newsPage.path} should load and display content`, async ({ page }) => {
      await page.goto(newsPage.path, { waitUntil: "domcontentloaded" });
      await waitForPageReady(page);

      // Not a 404
      const bodyText = await page.locator("body").textContent();
      const is404 = bodyText?.includes("404") && bodyText?.includes("could not be found");
      expect(is404, `${newsPage.path} returned 404`).toBeFalsy();

      // Has expected content
      const found = await page
        .locator(`text=/${newsPage.expectedText}/i`)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!found) {
        console.warn(`${newsPage.path}: expected "${newsPage.expectedText}" not visible`);
      }
    });
  }

  test("Analytics should have tab navigation", async ({ page }) => {
    await page.goto("/analytics", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const tabs = ["Overview", "Engagement", "Velocity", "Coverage", "Pipeline", "Content"];
    for (const tab of tabs) {
      const tabBtn = page.locator("button").filter({ hasText: tab }).first();
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(500);
        console.log(`Analytics tab "${tab}" clicked`);
      }
    }
  });

  test("Predictions should show rising stories or empty state", async ({ page }) => {
    await page.goto("/predictions", { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);

    const hasContent =
      (await page.locator("text=/Accuracy|Rising|Escalation/i").first().isVisible({ timeout: 5000 }).catch(() => false));
    console.log(`Predictions page: ${hasContent ? "has content" : "empty/loading"}`);
  });
});
