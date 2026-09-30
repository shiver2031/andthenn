import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function login(page: Page, persona: string) {
  await page.goto("/login"); await page.context().clearCookies();
  await page.getByRole("button", { name: new RegExp(`^${persona}`) }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const internal = ["Founder", "Manager", "Designer"];

test("CRM header 1: four roles share the application with distinct visibility", async ({ page }) => {
  for (const role of [...internal, "Client · Riya"]) {
    await login(page, role);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open team discussion" })).toHaveCount(role.startsWith("Client") ? 0 : 1);
  }
});

test("CRM header 2: Founder company metrics, health, attention, team, own work and accounts", async ({ page }) => {
  await login(page, "Founder");
  for (const label of ["Active projects", "Open Tasks", "Due This Week", "Overdue tasks"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  for (const label of ["On track", "At risk", "Blocked", "Waiting", "Needs Attention", "My Work", "Team availability and load", "Accounts summary"]) await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await page.goto("/accounts"); await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  for (const label of ["Paid revenue", "Recorded expenses", "Invoiced"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
});

test("CRM header 3: Manager daily groups, team and finance denial", async ({ page }) => {
  await login(page, "Manager");
  for (const label of ["Tasks Due Today", "Client Feedback", "Pending Approvals", "Project groups"]) await expect(page.getByRole("region", { name: label, exact: true })).toBeVisible();
  for (const label of ["Active", "At Risk", "Delayed", "Waiting for Client", "My Work", "Team availability and load"]) await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await page.goto("/accounts"); await expect(page).toHaveURL(/\/home$/);
});

test("CRM header 4: Designer focused queues and private management denial", async ({ page }) => {
  await login(page, "Designer");
  for (const label of ["Due Today", "Due Tomorrow", "Upcoming", "Waiting for Feedback"]) await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: "Completed" })).toBeVisible();
  for (const path of ["/accounts", "/team", "/clients", "/admin"]) { await page.goto(path); await expect(page).toHaveURL(/\/home$/); }
  await page.goto("/tasks/2c000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "Internal discussion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload a version" })).toBeVisible();
});

test("CRM header 6: My Tasks is accessible to every current internal role with task provenance", async ({ page }) => {
  for (const role of internal) {
    await login(page, role); await page.goto("/work?view=mine");
    await expect(page.getByRole("navigation", { name: "Work views" })).toBeVisible();
  }
  await login(page, "Designer"); await page.goto("/work?view=mine");
  const row = page.locator('main a[href^="/tasks/"]').first();
  await expect(row).toContainText("Assigned by"); await expect(row).toContainText("Due"); await expect(row).toContainText("priority");
});

test("CRM header 8: every current internal role can follow Assigned By Me", async ({ page }) => {
  for (const role of internal) {
    await login(page, role); await page.goto("/work?view=assigned");
    await expect(page.getByRole("link", { name: /Assigned by me/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  }
});

test("CRM header 11: assignee persists each open execution status", async ({ page }) => {
  await login(page, "Designer"); await page.goto("/work?new=task&project=28000000-0000-4000-8000-000000000001");
  await page.getByLabel("Task name", { exact: true }).fill(`Status audit ${Date.now()}`);
  await page.getByLabel("Primary owner").selectOption({ label: "Arjun Menon · designer" });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  for (const status of ["IN_PROGRESS", "WAITING", "BLOCKED", "OPEN"]) {
    await page.getByLabel("Execution status").selectOption(status);
    await page.getByRole("button", { name: "Update status", exact: true }).click();
    await expect(page.getByText(status.replaceAll("_", " "), { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel("Execution status")).toHaveValue(status);
  }
});

test("CRM header 13: all internal Homes expose Needs Attention and the full queue", async ({ page }) => {
  for (const role of internal) {
    await login(page, role); await expect(page.getByRole("heading", { name: "Needs Attention", exact: true })).toBeVisible();
    await page.goto("/work?view=attention"); await expect(page.getByRole("main")).toBeVisible();
  }
});

test("CRM header 15: Founder company perspective differs from Manager daily operations", async ({ page }) => {
  await login(page, "Founder"); await expect(page.getByText("Company overview", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounts summary" })).toBeVisible();
  await login(page, "Manager"); await expect(page.getByText("Today’s work", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tasks Due Today", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounts summary" })).toHaveCount(0);
});

test("CRM header 16: verify current team separation and record future-role limitation", async ({ page }, info) => {
  await login(page, "Founder"); await page.goto("/team");
  await expect(page.getByRole("main").getByText("Mira Shah", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Rohan Bose", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Arjun Menon", { exact: true }).first()).toBeVisible();
  const model = await readFile("packages/domain/src/model.ts", "utf8");
  expect(model).toContain('["FOUNDER", "MANAGER", "DESIGNER", "CLIENT"]');
  info.annotations.push({ type: "gap", description: "Only current role separation verified; future-role onboarding/permission configuration is not established." });
});

test("CRM header 17: exact role-specific main navigation", async ({ page }) => {
  const roles: [string, string[]][] = [["Founder", ["Home", "Work", "Clients", "Team", "Files", "Accounts"]], ["Manager", ["Home", "Work", "Clients", "Team", "Files"]], ["Designer", ["Home", "My Work", "Files"]], ["Client · Riya", ["Home", "My Projects", "Files"]]];
  for (const [role, labels] of roles) {
    await login(page, role);
    if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
    await expect(nav.getByRole("link")).toHaveCount(labels.length);
    for (const label of labels) await expect(nav.getByRole("link", { name: new RegExp(`^${label}( |$)`) })).toBeVisible();
  }
});

test("CRM header 18: shared schema and authorization foundation", async () => {
  const schema = await readFile("packages/db/src/schema.ts", "utf8");
  for (const table of ["tasks", "projects", "memberships"]) expect(schema).toMatch(new RegExp(`pgTable\\(\\s*"${table}"`));
  const auth = await readFile("packages/domain/src/authorization.ts", "utf8");
  expect(auth).toContain("FOUNDER");
  const actions = await readFile("apps/web/app/(erp)/actions.ts", "utf8");
  expect(actions).toContain("createTask");
});

test("CRM header 12: original assigner changes deadline and reassigns with retained provenance", async ({ page }) => {
  await login(page, "Designer"); await page.goto("/work?new=task&project=28000000-0000-4000-8000-000000000001");
  const title = `Assigner audit ${Date.now()}`;
  await page.getByLabel("Task name", { exact: true }).fill(title);
  await page.getByLabel("Primary owner").selectOption({ label: "Mira Shah · founder" });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  const taskUrl = page.url(), taskId = taskUrl.split("/").pop()!;
  const projectHref = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
  await page.goto(`/projects?project=${projectHref!.split("/").pop()}&task=${taskId}`);
  await expect(page.getByLabel("Due date")).toBeEnabled();
  const due = await page.getByLabel("Due date").inputValue();
  const earlier = new Date(due); earlier.setDate(earlier.getDate() - 1);
  const changedDue = `${earlier.getFullYear()}-${String(earlier.getMonth()+1).padStart(2,"0")}-${String(earlier.getDate()).padStart(2,"0")}T${due.split("T")[1]}`;
  await page.getByLabel("Due date").fill(changedDue);
  await page.getByLabel("Primary owner").selectOption({ label: "Rohan Bose" });
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects\?project=[^&]+$/);
  await expect(page.locator("tr").filter({ has: page.getByRole("button", { name: title, exact: true }) }).getByText("Rohan Bose · owner")).toBeVisible();
  await page.goto(taskUrl); await expect(page.getByText("Assigned by Arjun Menon", { exact: false })).toBeVisible();
  await page.goto(`/projects?project=${projectHref!.split("/").pop()}&task=${taskId}`);
  await expect(page.getByLabel("Due date")).toHaveValue(changedDue);
  await expect(page.getByLabel("Primary owner").locator("option:checked")).toHaveText("Rohan Bose");
  await login(page, "Manager"); await page.goto("/notifications");
  await expect(page.locator("article").filter({ hasText: title })).toContainText("Arjun Menon assigned you:");
});
