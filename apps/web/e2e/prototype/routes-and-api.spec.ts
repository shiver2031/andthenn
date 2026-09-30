import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, persona: "founder" | "manager" | "employee" | "temporary" | "clientA" | "clientB" = "manager") {
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/login");
  const names = { founder: /^Founder/, manager: /^Manager/, employee: /^Designer/, temporary: /^Temporary Designer/, clientA: /^Client · Riya/, clientB: /^Client · Dev/ };
  await page.getByRole("button", { name: names[persona] }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("ACC-02 and ACC-04 route/control responsiveness", () => {
  test("every manager route loads across required widths without browser errors or page overflow", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = ["/home", "/work", "/intake", "/intake?view=setups", "/intake?view=history", "/projects", "/clients", "/team", "/files", "/workload", "/reports", "/notifications", "/search?q=aster", "/admin"];
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
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
    await expect(async () => {
      await page.getByRole("button", { name: /Search tasks, projects, clients/i }).press("Enter");
      await expect(page.getByRole("dialog", { name: "Global search" })).toBeVisible();
    }).toPass({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });
});

test.describe("ACC-05 through ACC-08 API and authorization matrix", () => {
  test("Designer assigns Founder with visible provenance, discussion, and a deep-linked notification", async ({ page }) => {
    await signIn(page, "employee");
    await page.goto("/work?new=task");
    await expect(page.getByRole("dialog", { name: "Create and assign work" })).toBeVisible();
    const title = `Founder handoff ${Date.now()}`;
    await page.getByLabel("Task name").fill(title);
    await page.getByLabel("Brief").fill("Acceptance coverage for universal internal assignment and durable discussion.");
    await page.getByLabel("Primary owner").selectOption({ label: "Mira Shah · founder" });
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page).toHaveURL(/\/tasks\//);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Assigned by Arjun Menon", { exact: false })).toBeVisible();
    await page.getByLabel("Comment", { exact: true }).fill("Please review the handoff and confirm the next action.");
    await page.getByRole("checkbox", { name: "Mira Shah" }).check();
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByText("Comment posted.", { exact: true })).toBeVisible();

    await signIn(page, "founder");
    await page.goto("/notifications");
    const notification = page.locator("article").filter({ hasText: title }).first();
    await expect(notification).toBeVisible();
    await notification.getByRole("link", { name: "Open item" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const taskUrl = page.url();
    await page.getByLabel("Execution status").selectOption("BLOCKED");
    await page.getByRole("button", { name: "Update status", exact: true }).click();
    await expect(page.getByText("BLOCKED", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Request completion", exact: true }).click();
    await expect(page.getByRole("button", { name: "Update and withdraw request" })).toBeVisible();
    await page.getByLabel("Execution status").selectOption("IN_PROGRESS");
    await page.getByRole("button", { name: "Update and withdraw request" }).click();
    await expect(page.getByRole("button", { name: "Request completion", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Request completion", exact: true }).click();
    await signIn(page, "employee");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Confirm completion", exact: true }).click();
    await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
    await signIn(page, "founder");
    await page.goto(taskUrl);
    await page.getByLabel("Reason (required)").fill("The client requested a follow-up after closure.");
    await page.getByRole("button", { name: "Reopen task", exact: true }).click();
    await expect(page.getByText("IN PROGRESS", { exact: true })).toBeVisible();
  });

  test("Founder routes work and isolated Clients cannot cross project boundaries", async ({ page }) => {
    await signIn(page, "founder");
    for (const route of ["/intake", "/admin", "/commercial", "/accounts"]) expect((await page.goto(route))?.status(), route).toBe(200);

    await signIn(page, "manager");
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Accounts" })).toHaveCount(0);

    await signIn(page, "employee");
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Accounts" })).toHaveCount(0);

    await signIn(page, "clientA");
    await expect(page.getByRole("heading", { name: /Welcome back, Riya/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aster Afterhours / Monsoon", exact: true })).toBeVisible();
    await page.goto("/projects/28000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Aster Afterhours / Monsoon" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outputs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Final deliveries" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tasks" })).toHaveCount(0);
    await page.goto("/projects/28000000-0000-4000-8000-000000000002");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("Juniper product launch", { exact: true })).toHaveCount(0);

    await signIn(page, "clientB");
    await expect(page.getByText("Juniper product launch", { exact: true })).toBeVisible();
    await page.goto("/projects/28000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("Aster Afterhours / Monsoon", { exact: true })).toHaveCount(0);
  });

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

  test("malformed record URLs fail safely and file bytes enforce current role scope", async ({ page }) => {
    await signIn(page, "founder");
    for (const route of ["/projects/not-a-uuid", "/tasks/not-a-uuid", "/clients/not-a-uuid", "/projects?project=not-a-uuid"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    }
    const file = "/api/files/2e000000-0000-4000-8000-000000000001";
    expect((await page.request.get(file)).status()).toBe(200);
    await signIn(page, "clientB");
    expect((await page.request.get(file)).status()).toBe(404);
    await signIn(page, "temporary");
    expect((await page.request.get(file)).status()).toBe(404);
  });

  test("Client decisions persist and approved files remain isolated", async ({ page }, testInfo) => {
    await signIn(page, "clientA");
    await page.goto("/projects/28000000-0000-4000-8000-000000000001");
    const panel = page.getByRole("region", { name: "Client decisions" });
    await expect(panel).toBeVisible();
    await expect.poll(() => panel.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("client-review.png"), fullPage: true });
    await panel.getByLabel("Feedback", { exact: true }).fill("xx");
    await panel.getByRole("button", { name: "Send decision" }).click();
    await expect(panel.getByRole("alert")).toContainText("describe");
    await expect(panel.getByLabel("Feedback", { exact: true })).toHaveValue("xx");
    await panel.getByLabel("Feedback", { exact: true }).fill("Please refine the final transition before approval.");
    await panel.getByRole("button", { name: "Send decision" }).click();
    await expect(panel.getByRole("status")).toContainText("Changes sent");
    expect((await page.request.get("/api/files/2e000000-0000-4000-8000-000000000001")).status()).toBe(404);
    const preview = await panel.locator("video").getAttribute("src");
    expect((await page.request.get(preview!)).status()).toBe(200);
    await signIn(page, "manager"); await page.goto("/tasks/2c000000-0000-4000-8000-000000000001");
    await page.getByRole("button", { name: "Clear for Client review", exact: true }).click();
    await expect(page.getByText("Cleared for Client review. Client approval and delivery are still required.", { exact: true })).toBeVisible();
    await signIn(page, "clientA"); await page.goto("/home");
    await page.getByRole("region", { name: "Awaiting your review" }).getByRole("link", { name: /aster-afterhours/ }).click();
    await panel.getByLabel("Your decision").selectOption("APPROVE");
    await panel.getByRole("button", { name: "Send decision" }).click();
    await expect(panel.getByRole("status")).toContainText("Version approved");
    await page.goto("/home");
    await expect(page.getByRole("region", { name: "Awaiting your review" }).getByRole("link", { name: /aster-afterhours/ })).toHaveCount(0);
    expect((await page.request.get("/api/files/2e000000-0000-4000-8000-000000000001")).status()).toBe(404);
    await signIn(page, "manager"); await page.goto("/tasks/2c000000-0000-4000-8000-000000000001");
    await page.getByRole("button", { name: "Publish final delivery", exact: true }).click();
    await expect(page.getByText("Final delivery published.", { exact: true })).toBeVisible();
    await signIn(page, "clientA");
    await page.goto("/files");
    await expect(page.getByText("APPROVED FINAL", { exact: true })).toBeVisible();
    const download = page.getByRole("link", { name: /Aster launch master/ });
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^\/api\/files\//);
    expect((await page.request.get(href!)).status()).toBe(200);
    await signIn(page, "clientB");
    expect((await page.request.get(href!)).status()).toBe(404);
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
