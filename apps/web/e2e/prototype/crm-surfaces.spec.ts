import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("CRM role Homes, zero-project client search, project discussion and Client navigation", async ({ page, context }) => {
  await page.goto("/login"); await page.getByRole("button", { name: /^Founder/ }).click(); await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "My Work", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounts summary", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team availability and load" })).toBeVisible();
  await page.goto("/search?q=Northstar");
  await page.getByRole("link").filter({ hasText: "Client workspace" }).click();
  await expect(page).toHaveURL(/\/clients\//);
  await page.goto("/projects/28000000-0000-4000-8000-000000000001");
  const discussion = page.locator("#discussion");
  const body = `Project discussion ${Date.now()}`;
  await discussion.getByLabel("Comment", { exact: true }).fill(body);
  await discussion.getByRole("checkbox", { name: "Arjun Menon" }).check();
  await discussion.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(discussion.getByText(body, { exact: true })).toBeVisible();
  await page.reload(); await expect(discussion.getByText(body, { exact: true })).toBeVisible();
  await page.goto("about:blank"); await context.clearCookies(); await page.goto("/login"); await page.getByRole("button", { name: /^Designer/ }).click(); await expect(page).toHaveURL(/\/home$/);
  for (const name of ["Due Today", "Due Tomorrow", "Upcoming", "Waiting for Feedback"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goto("/notifications");
  const notification = page.locator("article").filter({ hasText: body });
  await notification.getByRole("link", { name: "Open item" }).click();
  await expect(page).toHaveURL(/\/projects\/.*#comment-/);
  await page.goto("about:blank"); await context.clearCookies(); await page.goto("/login"); await page.getByRole("button", { name: /^Client · Riya/ }).click(); await expect(page).toHaveURL(/\/home$/);
  await page.goto("/projects"); await page.getByRole("link", { name: /Aster/ }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);
  expect(await page.locator("#discussion").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((row) => ["serious", "critical"].includes(row.impact ?? ""))).toEqual([]);
});

test("cross-organization pages, search, exports, file bytes and forged task commands deny access", async ({ page }) => {
  await page.goto("/login"); await page.getByRole("button", { name: /^Founder/ }).click(); await expect(page).toHaveURL(/\/home$/);
  for (const path of ["/projects/48000000-0000-4000-8000-000000000001", "/tasks/4c000000-0000-4000-8000-000000000001", "/clients/43000000-0000-4000-8000-000000000001"]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  }
  expect((await page.request.get("/api/files/4e000000-0000-4000-8000-000000000001")).status()).toBe(404);
  await page.goto("/search?q=Foreign"); await expect(page.getByText("No authorized results match this search.")).toBeVisible();
  expect(await (await page.request.get("/api/reports/operational-export")).text()).not.toContain("Foreign confidential");
  await page.goto("/tasks/2c000000-0000-4000-8000-000000000001");
  const statusForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Update status", exact: true }) });
  const originalStatus = await statusForm.getByLabel("Execution status").inputValue();
  await statusForm.getByLabel("Execution status").selectOption("IN_PROGRESS");
  await statusForm.getByLabel(/Reason/).fill("Cross-organization attempt must fail");
  // Forge the serialized request, not a controlled input that hydration can restore.
  let forged = false;
  await page.route("**/tasks/2c000000-0000-4000-8000-000000000001", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postData() ?? "";
    expect(body).toContain("2c000000-0000-4000-8000-000000000001");
    forged = true;
    await route.continue({ postData: body.replaceAll("2c000000-0000-4000-8000-000000000001", "4c000000-0000-4000-8000-000000000001") });
  });
  await statusForm.getByRole("button", { name: "Update status", exact: true }).click();
  await expect(statusForm.getByRole("alert")).toContainText(/not found|unavailable/i);
  expect(forged).toBe(true);
  await page.reload();
  await expect(statusForm.getByLabel("Execution status")).toHaveValue(originalStatus);
});
