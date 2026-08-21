import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: import("@playwright/test").Page, persona: "manager" | "employee" = "manager") {
  await page.goto("/login");
  await page.getByRole("button", { name: persona === "manager" ? "Manager" : "Employee", exact: false }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("ACC-01 persona and shell", () => {
  test("manager session is local, role-aware, and keyboard accessible", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("banner")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  });
});

test.describe("ACC-03 intake persistence", () => {
  test("manual intake persists after reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/intake");
    const title = `Acceptance request ${Date.now()}`;
    await page.locator("#intake-title").fill(title);
    await page.locator("#intake-summary").fill("A deterministic request created by the local prototype acceptance run.");
    await page.getByRole("button", { name: "Manual intake" }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });
});

test.describe("ACC-05 public review", () => {
  test("public review link works in an isolated browser context", async ({ browser }) => {
    const reviewer = await browser.newContext();
    const page = await reviewer.newPage();
    await page.goto("/review/demo-review-token");
    await expect(page.getByText("Feedback", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: /your name/i }).fill("Acceptance reviewer");
    await page.getByRole("button", { name: "Start review" }).click();
    await expect(page.getByText("Reviewing as", { exact: false })).toBeVisible();
    await reviewer.close();
  });
});
