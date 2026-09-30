import { expect, test } from "@playwright/test";

test("two stale task editors cannot both overwrite execution state", async ({ page, context }) => {
  await page.goto("/login"); await page.getByRole("button", { name: /^Founder/ }).click(); await expect(page).toHaveURL(/\/home$/);
  await page.goto("/work?new=task");
  await page.getByLabel("Task name").fill(`Concurrent task ${Date.now()}`);
  await page.getByLabel("Primary owner").selectOption({ label: "Mira Shah · founder" });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  const other = await context.newPage(); await other.goto(page.url());
  await page.getByLabel("Execution status").selectOption("BLOCKED");
  await other.getByLabel("Execution status").selectOption("IN_PROGRESS");
  await Promise.all([page.getByRole("button", { name: "Update status", exact: true }).click(), other.getByRole("button", { name: "Update status", exact: true }).click()]);
  await expect.poll(async () => (await page.getByText("Task updated.", { exact: true }).count()) + (await other.getByText("Task updated.", { exact: true }).count())).toBe(1);
  await expect.poll(async () => (await page.getByRole("alert").filter({ hasText: /changed|refresh/i }).count()) + (await other.getByRole("alert").filter({ hasText: /changed|refresh/i }).count())).toBe(1);
  await page.reload(); await other.reload();
  expect(await page.getByLabel("Execution status").inputValue()).toBe(await other.getByLabel("Execution status").inputValue());
  await other.close();
});

test("self-assigned work requires an independent reviewer and simultaneous confirmations commit once", async ({ page, context }) => {
  await page.goto("/login"); await page.getByRole("button", { name: /^Founder/ }).click(); await expect(page).toHaveURL(/\/home$/);
  await page.goto("/work?new=task");
  await page.getByLabel("Task name").fill(`Independent confirmation ${Date.now()}`);
  await page.getByLabel("Primary owner").selectOption({ label: "Mira Shah · founder" });
  await page.getByRole("button", { name: "Create task", exact: true }).click(); await expect(page).toHaveURL(/\/tasks\//);
  const taskUrl = page.url();
  await page.getByRole("button", { name: "Request completion", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update and withdraw request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm completion", exact: true })).toHaveCount(0);
  await page.goto("about:blank"); await context.clearCookies(); await page.goto("/login"); await page.getByRole("button", { name: /^Manager/ }).click(); await expect(page).toHaveURL(/\/home$/);
  await page.goto(taskUrl); const other = await context.newPage(); await other.goto(taskUrl);
  await page.locator("form").filter({ has: page.getByRole("button", { name: "Confirm completion", exact: true }) }).getByPlaceholder("Explain the decision").fill("Independent review of self-assigned work.");
  await other.locator("form").filter({ has: other.getByRole("button", { name: "Confirm completion", exact: true }) }).getByPlaceholder("Explain the decision").fill("Independent review of self-assigned work.");
  await Promise.all([page.getByRole("button", { name: "Confirm completion", exact: true }).click(), other.getByRole("button", { name: "Confirm completion", exact: true }).click()]);
  await expect.poll(async () => (await page.getByText("COMPLETED", { exact: true }).count()) + (await other.getByText("COMPLETED", { exact: true }).count())).toBe(1);
  await expect.poll(async () => (await page.getByRole("alert").filter({ hasText: /changed|waiting|refresh/i }).count()) + (await other.getByRole("alert").filter({ hasText: /changed|waiting|refresh/i }).count())).toBe(1);
  await page.reload(); await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible(); await other.close();
});
