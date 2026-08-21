import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PROTOTYPE_APP_URL;
if (!baseURL) throw new Error("PROTOTYPE_APP_URL is required; use pnpm acceptance:prototype");

export default defineConfig({
  testDir: "./apps/web/e2e/prototype",
  outputDir: "./test-results/prototype-artifacts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["line"], ["json", { outputFile: "test-results/prototype-results.json" }], ["html", { outputFolder: "test-results/prototype-report", open: "never" }]],
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "chromium-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit-1440", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
});
