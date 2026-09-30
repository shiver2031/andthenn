import { expect, test, type Page } from "@playwright/test";

async function startTour(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Help & support" }).click();
  await page.getByRole("button", { name: "Start quick tour" }).click();
}

test("tour is optional, stays on Home, and can be replayed", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Founder/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await startTour(page);
  await expect(page.getByRole("dialog", { name: "Home" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Your first action" })).toContainText("Open intake");
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await startTour(page);
  await expect(page.getByRole("dialog", { name: "Home" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Client tour has an available first action and does not use saved walkthrough progress", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Client · Dev/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await (await page.request.get("/api/walkthrough")).json();
  await startTour(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Your first action" })).toContainText("shared files");
  await page.getByRole("button", { name: "Finish" }).click();
  const after = await (await page.request.get("/api/walkthrough")).json();
  expect(after.resumeStepKey).toBe(before.resumeStepKey);
  expect(after.optedOut).toBe(before.optedOut);
});
