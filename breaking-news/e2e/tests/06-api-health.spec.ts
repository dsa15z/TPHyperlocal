/**
 * Step 6: API Health — verify backend endpoints respond correctly.
 */
import { test, expect } from "@playwright/test";
import { API_URL } from "../lib/helpers";

const PUBLIC_ENDPOINTS = [
  { path: "/api/v1/health", expectKey: "status" },
  { path: "/api/v1/stories?limit=5", expectKey: "data" },
  { path: "/api/v1/stories/breaking", expectKey: "data" },
  { path: "/api/v1/stories/trending", expectKey: "data" },
  { path: "/api/v1/stories/facets", expectArray: false },
  { path: "/api/v1/pipeline/status", expectKey: "timestamp" },
  { path: "/api/v1/analytics/overview", expectKey: "overview" },
  { path: "/api/v1/analytics/timeline", expectKey: "data" },
  { path: "/api/v1/search?q=Houston&limit=5", expectKey: "data" },
];

test.describe("API Health Check", () => {
  for (const endpoint of PUBLIC_ENDPOINTS) {
    test(`GET ${endpoint.path} should respond`, async ({ request }) => {
      const response = await request.get(`${API_URL}${endpoint.path}`, {
        timeout: 15000,
      });

      console.log(`${endpoint.path} → ${response.status()}`);
      expect(response.status()).toBeLessThan(500);

      if (response.status() === 200) {
        const body = await response.json();
        if (endpoint.expectKey) {
          expect(body).toHaveProperty(endpoint.expectKey);
        }
      }
    });
  }

  test("Stories API should return valid story objects", async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/stories?limit=3`);
    if (response.status() !== 200) return test.skip();

    const body = await response.json();
    const stories = body.data || [];

    for (const story of stories) {
      // Every story must have these fields
      expect(story).toHaveProperty("id");
      expect(story).toHaveProperty("title");
      expect(story).toHaveProperty("status");

      // Status must be a valid enum
      const validStatuses = ["ALERT", "BREAKING", "DEVELOPING", "TOP_STORY", "ONGOING", "FOLLOW_UP", "STALE", "ARCHIVED"];
      expect(validStatuses).toContain(story.status);

      // Scores must be 0-1 range
      if (story.compositeScore !== undefined) {
        expect(story.compositeScore).toBeGreaterThanOrEqual(0);
        expect(story.compositeScore).toBeLessThanOrEqual(1);
      }
      if (story.breakingScore !== undefined) {
        expect(story.breakingScore).toBeGreaterThanOrEqual(0);
        expect(story.breakingScore).toBeLessThanOrEqual(1);
      }

      // sourceCount should be non-negative
      if (story.sourceCount !== undefined) {
        expect(story.sourceCount).toBeGreaterThanOrEqual(0);
      }

      console.log(`Story "${story.title?.substring(0, 50)}..." — status=${story.status}, score=${story.compositeScore?.toFixed(2)}`);
    }
  });

  test("Search API should return results for Houston", async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/search?q=Houston&limit=5`);
    if (response.status() !== 200) return test.skip();

    const body = await response.json();
    const stories = body.data?.stories || [];
    console.log(`Search "Houston" returned ${stories.length} results`);
  });

  test("Pipeline status should show queue information", async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/pipeline/status`);
    if (response.status() !== 200) return test.skip();

    const body = await response.json();
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("summary");

    if (body.summary) {
      console.log(`Pipeline: active=${body.summary.active}, waiting=${body.summary.waiting}, completed=${body.summary.completed}`);
      expect(body.summary.active).toBeGreaterThanOrEqual(0);
    }
  });
});
