import { expect, test, type Page } from "@playwright/test";

const appRoutes = [
  ["/home", "Good morning, Maya."],
  ["/intake", "Intake control"],
  ["/proposals", "Proposals"],
  ["/projects", "Projects"],
  ["/projects/aster", "Monsoon Stories"],
  ["/tasks/hero-film", "Hero film — edit V2"],
  ["/workload", "Workload"],
  ["/clients", "Clients & brands"],
  ["/commercial", "Commercial"],
  ["/reports", "Reports"],
  ["/notifications", "Notifications"],
  ["/admin", "Administration"],
  ["/search?q=Aster", "Search"],
  ["/review/demo-token", "Feedback"],
] as const;

async function expectNoBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      errors.push(message.text());
    }
  });
  return async () => expect(errors, errors.join("\n")).toEqual([]);
}

async function expectButtonEffect(page: Page, accessibleName: string) {
  const matchingButtons = page.getByRole("button", { name: accessibleName, exact: true });
  const button = matchingButtons.first();
  await expect(button).toBeVisible();
  const before = await page.locator("body").evaluate((body) => ({
    text: body.textContent,
    url: location.href,
    dialogs: body.querySelectorAll('[role="dialog"]').length,
  }));
  await button.click();
  const after = await page.locator("body").evaluate((body) => ({
    text: body.textContent,
    url: location.href,
    dialogs: body.querySelectorAll('[role="dialog"]').length,
  }));
  expect(after, `“${accessibleName}” produced no observable UI or navigation result`).not.toEqual(before);
}

test.describe("route, runtime, and responsive coverage", () => {
  for (const [route, heading] of appRoutes) {
    test(`${route} renders its implemented surface`, async ({ page }) => {
      const assertNoErrors = await expectNoBrowserErrors(page);
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      if (route.startsWith("/review/")) {
        await expect(page.getByText("Aster House · Monsoon Stories", { exact: true })).toBeVisible();
      } else {
        await expect(page.locator("main h1").getByText(heading, { exact: true })).toBeVisible();
      }
      const horizontalOverflow = await page.locator("html").evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      );
      expect(horizontalOverflow, `${route} overflows horizontally at the configured viewport`).toBe(false);
      await assertNoErrors();
    });
  }
});

test.describe("application startup and global shell", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed shell interactions run once on desktop.");
  });

  test("root redirects to the manager home", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Good morning, Maya." })).toBeVisible();
  });

  test("global search opens from the header and closes", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "Search tasks, projects, clients… ⌘ K" }).click();
    await expect(page.getByRole("dialog", { name: "Global search" })).toBeVisible();
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(page.getByRole("dialog", { name: "Global search" })).toBeHidden();
  });

  test("global search query and result selection work end to end", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "Search tasks, projects, clients… ⌘ K" }).click();
    await page.getByRole("textbox", { name: "Search" }).fill("Hero film");
    await page.getByRole("button", { name: "Hero film — edit V2 Task · Due today" }).click();
    await expect(page).toHaveURL(/\/tasks\//);
  });

  for (const control of ["New", "Help & support", "MS Maya Shah Manager"]) {
    test(`${control} has an observable result`, async ({ page }) => {
      await page.goto("/home");
      await expectButtonEffect(page, control);
    });
  }
});

test.describe("login and authentication entry", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed login interactions run once on desktop.");
  });

  test("Google Workspace sign-in begins an authentication flow", async ({ page }) => {
    await page.goto("/login");
    await expectButtonEffect(page, "Continue with Google Workspace");
  });

  test("temporary collaborator sign-in opens a credential flow", async ({ page }) => {
    await page.goto("/login");
    await expectButtonEffect(page, "Temporary collaborator sign in");
  });
});

test.describe("intake workbench", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed intake interactions run once on desktop.");
  });

  test("selecting, claiming, and releasing an intake item updates state", async ({ page }) => {
    await page.goto("/intake");
    await page.getByRole("button", { name: /New pitch: Northstar Hotels/ }).click();
    await expect(page.getByRole("button", { name: "Claim item" })).toBeVisible();
    await page.getByRole("button", { name: "Claim item" }).click();
    await expect(page.getByRole("button", { name: "Claimed by you" })).toBeVisible();
    await page.getByRole("button", { name: "Claimed by you" }).click();
    await expect(page.getByRole("button", { name: "Claim item" })).toBeVisible();
  });

  for (const control of [
    "Manual intake",
    "All sources",
    "Oldest first",
    "Monsoon_Brief.pdf 2.8 MB",
    "Voice note · 01:24 Transcribed",
    "Convert to project task",
    "New proposal",
    "Save draft",
  ]) {
    test(`${control} completes its visible action`, async ({ page }) => {
      await page.goto("/intake");
      await expectButtonEffect(page, control);
    });
  }
});

test.describe("proposal, project, and task flows", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed delivery interactions run once on desktop.");
  });

  for (const [route, control] of [
    ["/proposals", "New proposal"],
    ["/proposals", "Review proposal"],
    ["/proposals", "Reject"],
    ["/projects", "New project"],
    ["/projects/aster", "Team"],
    ["/projects/aster", "More project actions"],
    ["/projects/aster", "Overview"],
    ["/projects/aster", "Files"],
    ["/projects/aster", "Commercial"],
    ["/projects/aster", "Timeline"],
    ["/projects/aster", "Due date"],
    ["/projects/aster", "Assignee"],
    ["/projects/aster", "Search tasks"],
    ["/projects/aster", "Add task"],
    ["/tasks/hero-film", "Move to client review"],
    ["/tasks/hero-film", "Upload version"],
    ["/tasks/hero-film", "Comment"],
  ] as const) {
    test(`${route}: ${control} has an observable result`, async ({ page }) => {
      await page.goto(route);
      if (control === "Comment") {
        await page.getByPlaceholder("Write an internal comment…").fill("E2E discussion note");
      }
      await expectButtonEffect(page, control);
    });
  }

  test("project board and list views toggle", async ({ page }) => {
    await page.goto("/projects/aster");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByText("Task", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByRole("heading", { name: "In production" })).toBeVisible();
  });

  test("project search filters the implemented project collection", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("textbox", { name: "Search projects" }).fill("Juniper");
    await expect(page.getByRole("link", { name: /Juniper/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Aster/ })).toHaveCount(0);
  });

  test("dynamic project routes render the requested project", async ({ page }) => {
    await page.goto("/projects/juniper");
    await expect(page.getByRole("heading", { level: 1, name: "Juniper — Founder Film" })).toBeVisible();
  });
});

test.describe("clients, workload, commercial, reports, notifications, and admin", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed operations interactions run once on desktop.");
  });

  for (const [route, control] of [
    ["/clients", "Add client"],
    ["/commercial", "New quotation"],
    ["/commercial", "Export"],
    ["/reports", "Export CSV"],
    ["/notifications", "Mark all read"],
    ["/workload", "Filters"],
    ["/workload", "Export"],
    ["/admin", "Invite person"],
    ["/admin", "People & permissions 5 permanent · 2 temporary Healthy"],
    ["/admin", "Integrations Gmail · WhatsApp · Storage 2 connected"],
    ["/admin", "Security & retention 365d raw · 7y audit Compliant"],
  ] as const) {
    test(`${route}: ${control} has an observable result`, async ({ page }) => {
      await page.goto(route);
      await expectButtonEffect(page, control);
    });
  }

  test("client search filters the implemented client table", async ({ page }) => {
    await page.goto("/clients");
    await page.getByRole("textbox", { name: "Search clients" }).fill("Juniper");
    await expect(page.getByRole("button", { name: /Juniper/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Aster/ })).toHaveCount(0);
  });

  test("workload date navigation changes the visible week", async ({ page }) => {
    await page.goto("/workload");
    const week = page.getByText("03–07 August 2026", { exact: true });
    await page.locator("button").filter({ has: page.locator("svg.lucide-chevron-right") }).click();
    await expect(week).not.toBeVisible();
  });

  test("workload cell opens source task detail", async ({ page }) => {
    await page.goto("/workload");
    const cell = page.getByTitle("Maya Shah: 6 hours");
    await expect(cell).toBeVisible();
    const before = page.url();
    await cell.click();
    expect(page.url(), "The workload cell did not open its source tasks or navigate to detail").not.toBe(before);
  });
});

test.describe("public review portal", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Detailed review interactions run once on desktop.");
  });

  test("video play/pause and comment markers update state", async ({ page }) => {
    await page.goto("/review/demo-token");
    await page.getByRole("button", { name: "Play video" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Open comment 2" }).click();
    await expect(page.getByRole("button", { name: /Karan Singh/ })).toHaveClass(/border-violet/);
  });

  for (const control of [
    "Copy share link",
    "Download version",
    "More",
    "Fullscreen",
    "Reviewing as Rhea Kapoor rhea@asterhouse.in",
    "Draw on frame",
  ]) {
    test(`${control} completes its visible action`, async ({ page }) => {
      await page.goto("/review/demo-token");
      await expectButtonEffect(page, control);
    });
  }

  test("submitting review feedback persists and clears the composer", async ({ page }) => {
    await page.goto("/review/demo-token");
    const composer = page.getByRole("textbox", { name: "Add a comment" });
    await composer.fill("Automated review feedback");
    await page.getByRole("button", { name: "Send comment" }).click();
    await expect(composer).toHaveValue("");
    await expect(page.getByText("Automated review feedback", { exact: true })).toBeVisible();
  });
});

test.describe("HTTP boundary", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "HTTP boundary checks run once.");
  });

  test("health endpoint is live", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "andthenn-web" });
  });

  test("demo review token is version-pinned", async ({ request }) => {
    const response = await request.get("/api/review/demo-token");
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version: "V2", status: "ACTIVE" });
  });

  test("invalid review comment is rejected", async ({ request }) => {
    const response = await request.post("/api/review/demo-token", { data: { body: "missing required fields" } });
    expect(response.status()).toBe(400);
  });

  test("unconfigured WhatsApp webhook fails visibly", async ({ request }) => {
    const response = await request.post("/api/webhooks/whatsapp", { data: {} });
    expect(response.status()).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "WhatsApp is not configured" });
  });
});
