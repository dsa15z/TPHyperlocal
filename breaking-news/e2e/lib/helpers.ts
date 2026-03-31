import { Page, expect } from "@playwright/test";

export const BASE_URL = process.env.BASE_URL || "https://tp-hyperlocal-4c5sigknv-dsa15z-projects.vercel.app";
export const API_URL = process.env.API_URL || "https://tphyperlocal-production.up.railway.app";

// Test credentials
export const TEST_USER = {
  email: "derekanderson@futurimedia.com",
  password: "test123456",
};

export interface PageReport {
  url: string;
  status: "ok" | "error" | "404" | "timeout";
  title: string;
  loadTimeMs: number;
  consoleErrors: string[];
  networkErrors: string[];
  interactiveElements: number;
  screenshots?: string;
}

export interface TestReport {
  timestamp: string;
  baseUrl: string;
  pagesVisited: PageReport[];
  totalPages: number;
  totalErrors: number;
  brokenLinks: string[];
  consoleErrors: Array<{ page: string; message: string }>;
  networkFailures: Array<{ page: string; url: string; status: number }>;
  formTests: Array<{ page: string; form: string; result: "pass" | "fail"; detail: string }>;
  workflowTests: Array<{ name: string; steps: string[]; result: "pass" | "fail"; detail: string }>;
}

/**
 * Login to the application and store the JWT token
 */
export async function login(page: Page, email?: string, password?: string): Promise<boolean> {
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Fill login form
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      await emailInput.fill(email || TEST_USER.email);
      await passwordInput.fill(password || TEST_USER.password);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);

      // Check if we're redirected away from login
      const currentUrl = page.url();
      return !currentUrl.includes("/login");
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Collect all console errors on a page
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * Collect network failures
 */
export function collectNetworkErrors(page: Page): Array<{ url: string; status: number }> {
  const errors: Array<{ url: string; status: number }> = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("favicon")) {
      errors.push({ url: response.url(), status: response.status() });
    }
  });
  return errors;
}

/**
 * Get count of interactive elements on the current page
 */
export async function countInteractiveElements(page: Page): Promise<number> {
  return page.locator("button, a[href], input, select, textarea, [role='button']").count();
}

/**
 * Get all nav links from sidebar
 */
export async function getNavLinks(page: Page): Promise<Array<{ href: string; label: string }>> {
  const links: Array<{ href: string; label: string }> = [];
  const navAnchors = page.locator("aside a[href]");
  const count = await navAnchors.count();

  for (let i = 0; i < count; i++) {
    const el = navAnchors.nth(i);
    const href = await el.getAttribute("href");
    const label = (await el.textContent())?.trim() || "";
    if (href && !href.startsWith("http")) {
      links.push({ href, label });
    }
  }
  return links;
}

/**
 * Take a screenshot with a descriptive name
 */
export async function screenshotPage(page: Page, name: string): Promise<string> {
  const path = `test-results/screenshots/${name.replace(/[^a-zA-Z0-9-]/g, "_")}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

/**
 * Wait for page to be fully loaded (no pending network requests)
 */
export async function waitForPageReady(page: Page): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // networkidle timeout is ok — SPA may keep polling
  }
}
