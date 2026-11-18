// Playwright settings: how the browser tests run.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,               // one test at a time, so they're easy to follow
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },  // a typical phone screen
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",             // the same timezone as Kamala
    screenshot: "only-on-failure",
    trace: "retain-on-failure",             // a step-by-step recording when a test fails
  },

  // Start a separate backend just for testing, on port 3100 with its own throwaway database,
  // so tests never touch the database you use by hand on port 3000.
  webServer: {
    command: "node scripts/start-test-server.js",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
