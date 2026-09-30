import { expect, test, type Page } from "@playwright/test";
test.use({ actionTimeout: 15000 });

async function login(page: Page, persona: string) {
  await page.goto("about:blank"); await page.context().clearCookies(); await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${persona}`) }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("CRM F2/F7 role dashboards and explicit Manager finance permission", async ({ page }, info) => {
  await login(page, "Founder");
  for (const name of ["Open Tasks", "Due This Week"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Project health", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("founder-home.png"), fullPage: true });
  await page.goto("/team");
  const manager = page.locator("article").filter({ hasText: "Rohan Bose" });
  await manager.getByRole("button", { name: "Grant finance access" }).click();
  await expect(manager.getByRole("status")).toHaveText("Finance access granted.");
  try {
    await login(page, "Manager");
    for (const name of ["Tasks Due Today", "Client Feedback", "Pending Approvals", "Project groups"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("manager-home.png"), fullPage: true });
    await page.goto("/accounts"); await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await page.goto("/team"); await expect(page.getByRole("button", { name: /finance access/ })).toHaveCount(0);
  } finally {
    await login(page, "Founder"); await page.goto("/team");
    await manager.getByRole("button", { name: "Remove finance access" }).click();
    await expect(manager.getByRole("status")).toHaveText("Finance access removed.");
  }
  await login(page, "Manager"); await page.goto("/accounts"); await expect(page).toHaveURL(/\/home$/);
});

test("CRM F3/F4/F5 all internal assignment directions notify with context and clear completed approvals", async ({ page }) => {
  test.setTimeout(240_000);
  const people = [
    { role: "Founder", name: "Mira Shah", option: "Mira Shah · founder" },
    { role: "Manager", name: "Rohan Bose", option: "Rohan Bose · manager" },
    { role: "Designer", name: "Arjun Menon", option: "Arjun Menon · designer" },
  ];
  for (const assigner of people) for (const owner of people.filter((person) => person !== assigner)) {
    await login(page, assigner.role); await page.goto("/work?new=task");
    const name = `CRM final ${assigner.role} to ${owner.role} ${Date.now()}`;
    await page.getByLabel("Task name", { exact: true }).fill(name);
    await page.getByLabel("Primary owner").selectOption({ label: owner.option });
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page).toHaveURL(/\/tasks\//); const taskUrl = page.url();
    await login(page, owner.role); await page.goto("/notifications");
    const note = page.locator("article").filter({ hasText: name });
    await expect(note).toContainText(`${assigner.name} assigned you:`);
    await expect(note).toContainText("Due:"); await expect(note).toContainText("Priority:");
    await note.getByRole("link", { name: "Open item" }).click(); await expect(page).toHaveURL(taskUrl);
    const body = `@${assigner.name} Please confirm ${name}`;
    await page.getByLabel("Comment", { exact: true }).fill(body);
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(page.getByText("Comment posted.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Request completion", exact: true }).click();
    await expect(page.getByRole("button", { name: "Update and withdraw request", exact: true })).toBeVisible();
    await login(page, assigner.role); await page.goto("/notifications");
    const mention = page.locator("article").filter({ hasText: body });
    await expect(mention).toContainText(`${owner.name} mentioned you`);
    await mention.getByRole("link", { name: "Open item" }).click();
    await page.getByRole("button", { name: "Confirm completion", exact: true }).click();
    await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
    await page.goto("/home");
    if (assigner.role !== "Designer") {
      const myWork = page.locator("section").filter({ has: page.getByRole("heading", { name: "My Work", exact: true }) });
      await expect(myWork.getByRole("link").filter({ hasText: name })).toHaveCount(0);
      await page.reload(); await expect(myWork.getByRole("link").filter({ hasText: name })).toHaveCount(0);
    }
  }
});

test("CRM F5 plain-text project and version-feedback mentions persist and deep-link", async ({ page }) => {
  await login(page, "Designer");
  const taskUrl = "/tasks/2c000000-0000-4000-8000-000000000001";
  for (const [url, versionFeedback] of [["/projects/28000000-0000-4000-8000-000000000001", false], [taskUrl, true]] as const) {
    await login(page, "Designer"); await page.goto(url);
    const discussion = versionFeedback ? page.locator("section[aria-labelledby=discussion-title]") : page.locator("#discussion");
    const message = `@Rohan inline ${versionFeedback ? "version feedback" : "project discussion"} ${Date.now()}`;
    await discussion.getByLabel("Comment", { exact: true }).fill(message);
    if (versionFeedback) await discussion.getByLabel("Feedback version").selectOption({ index: 1 });
    await discussion.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(discussion.getByText("Comment posted.")).toBeVisible();
    await page.reload(); await expect(discussion.getByText(message, { exact: true })).toBeVisible();
    await login(page, "Manager"); await page.goto("/notifications");
    const note = page.locator("article").filter({ hasText: message });
    await expect(note).toContainText("Arjun Menon mentioned you");
    await note.getByRole("link", { name: "Open item" }).click();
    await expect(page).toHaveURL(new RegExp(`${url}#comment-`));
  }
});
