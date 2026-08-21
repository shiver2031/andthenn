import { defineConfig, devices } from "@playwright/test";

const viewports = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
};

export default defineConfig({
  testDir: "./apps/web/e2e",
  outputDir: "./test-results/artifacts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
    ["html", { outputFolder: "test-results/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @andthenn/web build && NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3000 node --env-file-if-exists=.env.local apps/web/.next/standalone/apps/web/server.js",
    url: "http://localhost:3000/api/health/ready",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: viewports.mobile } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: viewports.tablet } },
    { name: "laptop-1024", use: { ...devices["Desktop Chrome"], viewport: viewports.laptop } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: viewports.desktop } },
  ],
});
