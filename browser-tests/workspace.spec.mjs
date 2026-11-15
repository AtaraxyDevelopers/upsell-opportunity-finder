import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { config, example } from "../src/domain.mjs";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: config.title, exact: true }),
  ).toBeVisible();
});
test("A first-time user can edit, save, reload and export a record", async ({
  page,
}) => {
  const row = page.locator('tr[data-id="' + example.records[0].id + '"]');
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .locator('#record-form [name="name"]')
    .fill("Browser-tested customer");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Saved for this temporary session.",
  );
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Browser-tested customer", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Export backup (JSON)", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(config.slug + ".json");
});
test("Accessibility and mobile layout", async ({ page }) => {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(page.locator('#record-form [name="name"]')).toBeFocused();
});
test("Invalid imports show an error and preserve the workspace", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...example, project: "wrong-project" }),
    ),
  });
  await expect(page.getByRole("status")).toContainText(
    "Expected schemaVersion",
  );
  await expect(page.locator("#results tbody tr")).toHaveCount(
    example.records.length,
  );
});
