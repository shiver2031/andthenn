import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("login is light, accessible, and keyboard-operable at every viewport", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome to AndThenn." })).toBeVisible();
  const buttons = page.getByRole("button");
  await expect(buttons).toHaveCount(7);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: info.outputPath("login-after.png"), fullPage: true });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^Founder/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page.getByText("Company overview", { exact: true })).toBeVisible();
});

test("login stays scrollable on short screens and at 200 percent zoom", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await page.goto("/login");
  await page.getByRole("button", { name: /^Expired temporary/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: /^Expired temporary/ })).toBeInViewport();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /^Expired temporary/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("login-short-zoom.png"), fullPage: true });
});

test("expired persona cannot enter the workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Expired temporary/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome to AndThenn." })).toBeVisible();
  const protectedResponse = await page.request.get("/home", { maxRedirects: 0 });
  expect(protectedResponse.status()).toBeGreaterThanOrEqual(300);
  expect(protectedResponse.status()).toBeLessThan(400);
  expect(protectedResponse.headers().location).toContain("/login");
});
