import { expect, test } from "@playwright/test";

const ROUTES: [string, RegExp][] = [
  ["/", /Dashboard/],
  ["/chat", /Ask about your money/],
  ["/transactions", /Transactions/],
  ["/accounts", /Accounts/],
  ["/bills", /Bills/],
  ["/tags", /Tags/],
  ["/claims", /Claims/],
  ["/documents", /Documents/],
  ["/insights", /Insights/],
  ["/settings", /Settings/],
];

test.describe("every page renders in demo mode", () => {
  for (const [path, heading] of ROUTES) {
    test(path, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test("command palette navigates", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut is desktop only");
  test.setTimeout(90_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a page or action…").fill("Accounts");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/accounts$/);
});

test("mobile drawer opens the nav", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
});
