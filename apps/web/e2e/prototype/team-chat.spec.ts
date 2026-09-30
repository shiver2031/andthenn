import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({ actionTimeout: 15000 });

async function login(page: Page, persona: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${persona}`) }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("CRM header 9: team chat exchanges persistent messages, refreshes, mentions and isolates Clients", async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  await login(page, "Designer");
  await page.getByRole("button", { name: "Open team discussion" }).click();
  const panel = page.getByRole("dialog", { name: "Team discussion", exact: true });
  await panel.getByLabel("Project", { exact: true }).selectOption("28000000-0000-4000-8000-000000000001");
  await expect(panel.getByLabel("Comment", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Project", { exact: true })).not.toContainText("Foreign confidential");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await login(other, "Manager");
    await other.getByRole("button", { name: "Open team discussion" }).click();
    const recipientPanel = other.getByRole("dialog", { name: "Team discussion", exact: true });
    await recipientPanel.getByLabel("Project", { exact: true }).selectOption("28000000-0000-4000-8000-000000000001");
    const body = `@Rohan Please review the chat update ${Date.now()}`;
    await panel.getByLabel("Comment", { exact: true }).fill(body);
    await panel.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(panel.getByText(body, { exact: true })).toBeVisible();
    await expect(recipientPanel.getByText(body, { exact: true })).toBeVisible({ timeout: 15000 });
    const reply = `@Arjun Reviewed this update ${Date.now()}`;
    await recipientPanel.getByLabel("Comment", { exact: true }).fill(reply);
    await recipientPanel.getByLabel("Reply to").selectOption({ label: `Arjun Menon: ${body.slice(0,70)}` });
    await recipientPanel.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(panel.getByText(reply, { exact: true })).toBeVisible({ timeout: 15000 });
    await panel.getByLabel("Comment", { exact: true }).fill("Unsent draft survives refresh");
    await panel.getByRole("button", { name: "Refresh discussion" }).click();
    await expect(panel.getByLabel("Comment", { exact: true })).toHaveValue("Unsent draft survives refresh");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((row) => ["serious", "critical"].includes(row.impact ?? ""))).toEqual([]);
    await page.screenshot({ path: info.outputPath("team-discussion.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open team discussion" })).toBeFocused();
    await page.reload(); await page.getByRole("button", { name: "Open team discussion" }).click();
    await panel.getByLabel("Project", { exact: true }).selectOption("28000000-0000-4000-8000-000000000001");
    await expect(panel.getByText(body, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/notifications");
    await expect(page.locator("article").filter({ hasText: reply })).toContainText("Rohan Bose mentioned you");
    await other.keyboard.press("Escape"); await other.goto("/notifications");
    await expect(other.locator("article").filter({ hasText: body })).toContainText("Arjun Menon mentioned you");
  } finally { await otherContext.close(); }
  await page.goto("about:blank"); await page.context().clearCookies(); await login(page, "Client · Riya");
  await expect(page.getByRole("button", { name: "Open team discussion" })).toHaveCount(0);
});
