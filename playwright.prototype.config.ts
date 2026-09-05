import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PROTOTYPE_APP_URL;
if (!baseURL) throw new Error("PROTOTYPE_APP_URL is required; use pnpm acceptance:prototype");

export default defineConfig({
  testDir: "./apps/web/e2e/prototype",
  outputDir: `${process.env.PROTOTYPE_RESULT_DIR ?? "./test-results"}/prototype-artifacts`,
  fullyParallel: false,
  // One isolated database per acceptance run; serialize shared seeded review
  // fixtures so cross-browser decisions cannot race each other's versions.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["line"], ["json", { outputFile: `${process.env.PROTOTYPE_RESULT_DIR ?? "test-results"}/prototype-results.json` }], ["html", { outputFolder: `${process.env.PROTOTYPE_RESULT_DIR ?? "test-results"}/prototype-report`, open: "never" }]],
  use: { baseURL, locale: "en-GB", timezoneId: "Asia/Kolkata", screenshot: "on", trace: "on" },
  projects: [
    { name: "chromium-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "chromium-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
    { name: "chromium-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "chromium-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit-1440", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit-375", use: { ...devices["Desktop Safari"], viewport: { width: 375, height: 812 } } },
  ],
});
