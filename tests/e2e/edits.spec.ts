import { expect, test } from "@playwright/test";

// Demo mode keeps data in memory for the dev server's lifetime, so each test uses unique values.
test.describe.configure({ mode: "serial" });

test("edit a transaction in the drawer, then undo from history", async ({ page }, info) => {
  const note = `e2e note ${info.project.name} ${Date.now()}`;
  await page.goto("/transactions");
  await page.locator("button", { hasText: "Chipotle" }).first().click();
  await page.getByLabel("Notes").fill(note);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Transaction saved")).toBeVisible();
  await page.goto(`/transactions?q=${encodeURIComponent(note)}`);
  await expect(page.getByText("1 transactions")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByText("Undone")).toBeVisible();
  await page.goto(`/transactions?q=${encodeURIComponent(note)}`);
  await expect(page.getByText("No transactions found")).toBeVisible();
});

test("create a tag and a rule that tags existing matches", async ({ page }, info) => {
  const name = `Coffee ${info.project.name.slice(0, 3)}${Date.now() % 10000}`;
  await page.goto("/tags");
  await page.getByLabel("New tag name").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Tag name" }).and(page.locator(`[value="${name}"]`))).toBeVisible();
  await page.getByLabel("Pattern").fill("starbucks");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Rule added")).toBeVisible();
  await expect(page.locator("code", { hasText: "starbucks" }).first()).toBeVisible();
});
