import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, persona: "manager" | "employee" | "temporary" = "manager") {
  await page.goto("/login");
  const names = { manager: /Manager/, employee: /^Employee/, temporary: /Temporary collaborator/ };
  await page.getByRole("button", { name: names[persona] }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("ACC-02 and ACC-04 route/control responsiveness", () => {
  test("every manager route loads across required widths without browser errors or page overflow", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = ["/home", "/intake", "/intake?view=setups", "/intake?view=history", "/projects", "/clients", "/commercial", "/workload", "/reports", "/notifications", "/search?q=aster", "/admin"];
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        const response = await page.goto(route, { waitUntil: "networkidle" });
        expect(response?.status(), `${route} at ${viewport.width}px`).toBe(200);
        await expect(page.locator("main")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} overflows at ${viewport.width}px`).toBeTruthy();
      }
    }
    expect(errors.filter((message) => !message.includes("due to access control checks."))).toEqual([]);
  });

  test("legacy proposals links resolve to the canonical intake setups view", async ({ page }) => {
    await signIn(page);
    await page.goto("/proposals");
    await expect(page).toHaveURL(/\/intake\?view=setups$/);
    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();
  });

  test("shell controls have a defined keyboard outcome", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /Search tasks, projects, clients/i }).press("Enter");
    await expect(page.getByRole("dialog", { name: "Global search" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });
});

test.describe("ACC-05 through ACC-08 API and authorization matrix", () => {
  test("unauthenticated and role-scoped endpoints fail closed", async ({ browser, baseURL }) => {
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    expect((await anonymousPage.request.post(`${baseURL}/api/uploads`, { data: {} })).status()).toBe(401);
    await anonymous.close();

    const temporary = await browser.newContext();
    const page = await temporary.newPage();
    await signIn(page, "temporary");
    expect(await page.evaluate(async () => (await fetch("/api/reports/operational-export")).status)).toBe(404);
    expect(await page.evaluate(async () => (await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })).status)).toBe(400);
    await temporary.close();
  });

  test("manager export and invalid upload validation have deterministic outcomes", async ({ page }) => {
    await signIn(page);
    const exportResponse = await page.evaluate(async () => {
      const response = await fetch("/api/reports/operational-export");
      return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
    });
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.type).toContain("text/csv");
    expect(exportResponse.text).toContain("section,id,name_or_task");
    expect(await page.evaluate(async () => (await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "invalid", filename: "bad.exe", contentType: "application/octet-stream", sizeBytes: -1, checksumSha256: "nope" }) })).status)).toBe(400);
    expect(await page.evaluate(async () => (await fetch("/api/review/not-a-token")).status)).toBe(404);
    expect(await page.evaluate(async () => (await fetch("/api/quote/not-a-token")).status)).toBe(404);
  });
});
