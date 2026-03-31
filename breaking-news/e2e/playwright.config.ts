import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "https://tp-hyperlocal-4c5sigknv-dsa15z-projects.vercel.app";
const API_URL = process.env.API_URL || "https://tphyperlocal-production.up.railway.app";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false, // Sequential for stateful tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "./test-results/report.json" }],
    ["list"],
  ],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    extraHTTPHeaders: {
      "x-test-run": "playwright",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
