import { expect, test } from "@playwright/test";

test("login and primary navigation keep the browser document for every active persona", async ({ page, context }) => {
  const personas = [
    { name: /^Founder/, destination: "Work" },
    { name: /^Manager/, destination: "Work" },
    { name: /^Designer/, destination: "My Work" },
    { name: /^Temporary Designer/, destination: "My Work" },
    { name: /^Client · Riya/, destination: "My Projects" },
    { name: /^Client · Dev/, destination: "My Projects" },
  ];
  for (const persona of personas) {
    await context.clearCookies();
    await page.goto("/login");
    await page.evaluate(() => Object.assign(window, { andthennDocumentMarker: true }));
    await page.getByRole("button", { name: persona.name }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);
    if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: persona.destination }).click();
    await expect(page).toHaveURL(persona.destination === "My Projects" ? /\/projects$/ : /\/work$/);
    expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);
  }
});

test("project panels, file filters, and logout avoid document reloads", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Founder/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/projects");
  await page.evaluate(() => Object.assign(window, { andthennDocumentMarker: true }));
  const taskButton = page.locator("main section.surface tbody button").first();
  await taskButton.click();
  await expect(page.locator('aside[role="dialog"]')).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);
  await page.goBack();
  await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);

  if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Files" }).click();
  await expect(page.locator(".fixed.inset-0.z-50.lg\\:hidden")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search files" }).fill("Aster");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\/files\?q=Aster/);
  expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);

  if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: /Open profile menu/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => Object.hasOwn(window, "andthennDocumentMarker"))).toBe(true);
});
