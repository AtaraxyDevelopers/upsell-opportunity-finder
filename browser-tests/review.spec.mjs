import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { config, example } from "../src/domain.mjs";
async function reset(page) {
  await page.evaluate(async (example) => {
    const state = await (await fetch("/api/workspace")).json();
    const result = await fetch("/api/workspace", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Token": state.token,
      },
      body: JSON.stringify({ ...example, revision: state.revision }),
    });
    if (!result.ok) throw new Error(await result.text());
  }, example);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#results tbody tr").first()).toBeVisible();
  await reset(page);
  await page.reload();
  await expect(page.locator("#results tbody tr")).toHaveCount(2);
});
test.afterEach(async ({ page }) => {
  await reset(page);
});
test("First-time setup: clear samples, add a record, reload and restore a backup", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  const pending = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Export backup (JSON)", exact: true })
    .click();
  const backup = readFileSync(await (await pending).path());
  await page
    .getByRole("button", { name: "Clear all records", exact: true })
    .click();
  await expect(page.locator("#results tbody tr")).toHaveCount(0);
  for (const f of config.fields) {
    if (f.optional) {
      await expect(page.locator(`#record-form [name="${f.key}"]`)).toHaveValue(
        "",
      );
      continue;
    }
    const input = page.locator(`#record-form [name="${f.key}"]`),
      value = example.records[0][f.key];
    if (f.type === "boolean") await input.setChecked(value);
    else if (f.type === "select") await input.selectOption(value);
    else await input.fill(String(value));
  }
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator("#results tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#results tbody tr")).toHaveCount(1);
  await page.locator("#import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(page.locator("#results tbody tr")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#results tbody tr")).toHaveCount(2);
});
test("Temporary storage is explicit and the selected report date survives reload and print", async ({
  page,
}) => {
  await expect(page.locator("#storage-mode")).toContainText("Temporary demo");
  await page.locator("#asOf").fill("2027-01-01");
  await page.locator("#asOf").dispatchEvent("change");
  await expect(page.locator("#report-caption")).toContainText("2027-01-01");
  await page.reload();
  await expect(page.locator("#asOf")).toHaveValue("2027-01-01");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#report-caption")).toBeVisible();
});
test("Conflicting tabs preserve the newer save and let the user download the unsaved draft", async ({
  page,
  context,
}) => {
  await page
    .locator("#results tbody tr")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator('#record-form [name="name"]').fill("My unsaved draft");
  const other = await context.newPage();
  await other.goto("/");
  await other
    .locator("#results tbody tr")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await other.locator('#record-form [name="name"]').fill("Newer tab change");
  await other.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(other.getByRole("status")).toContainText("Saved");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Download your draft");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download record draft" }).click();
  const draft = JSON.parse(readFileSync(await (await pending).path(), "utf8"));
  expect(draft.records.some((r) => r.name === "My unsaved draft")).toBe(true);
  expect("token" in draft).toBe(false);
  expect("revision" in draft).toBe(false);
  await other.reload();
  await expect(
    other.getByRole("cell", { name: "Newer tab change", exact: true }),
  ).toBeVisible();
  await other.close();
});
if (config.actions.length)
  test("A row action cannot silently replace an open edit", async ({
    page,
  }) => {
    await page
      .locator("#results tbody tr")
      .first()
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    let chosen;
    for (const action of config.actions) {
      const b = page
        .getByRole("button", { name: action.label, exact: true })
        .first();
      if (await b.count()) {
        chosen = b;
        break;
      }
    }
    expect(chosen).toBeTruthy();
    await chosen.click();
    await expect(page.getByRole("status")).toContainText(
      "Save your edit or clear the form",
    );
    await expect(page.locator("#editor-title")).toHaveText("Edit record");
  });
