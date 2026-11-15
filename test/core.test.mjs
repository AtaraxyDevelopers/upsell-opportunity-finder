import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { config, example, analyze } from "../src/domain.mjs";
import { validateState, validDate, csv } from "../src/lib.mjs";

test("Example validates; calculations do not mutate inputs; empty workspaces work", () => {
  const snapshot = JSON.stringify(example);
  validateState(example, config);
  const report = analyze(example.records, example.settings, config.asOf);
  assert.equal(JSON.stringify(example), snapshot);
  assert.equal(report.rows.length, example.records.length);
  assert.equal(analyze([], example.settings, config.asOf).rows.length, 0);
});
test("Invalid dates, numbers, IDs, options and wrong project imports are rejected", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.throws(
    () => validateState({ ...example, project: "another-project" }, config),
    /Expected/,
  );
  assert.throws(
    () =>
      validateState(
        { ...example, records: [example.records[0], example.records[0]] },
        config,
      ),
    /unique/,
  );
  const numeric = config.fields.find((f) => f.type === "number");
  if (numeric)
    assert.throws(
      () =>
        validateState(
          {
            ...example,
            records: [{ ...example.records[0], [numeric.key]: -1 }],
          },
          config,
        ),
      /must be/,
    );
  const choice = config.fields.find((f) => f.type === "select");
  if (choice)
    assert.throws(
      () =>
        validateState(
          {
            ...example,
            records: [{ ...example.records[0], [choice.key]: "unknown" }],
          },
          config,
        ),
      /invalid option/,
    );
});
test("CSV quotes multiline content and neutralizes spreadsheet formulas", () => {
  const result = csv([{ name: "=SUM(1,2)", notes: 'two\nlines "quoted"' }]);
  assert.ok(result.includes("'=SUM"));
  assert.ok(result.includes('""quoted""'));
});
test("HTTP read, save, revision conflicts, validation, export and persisted restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), config.slug + "-"));
  const dataFile = join(dir, "workspace.json");
  let app;
  const start = async () => {
    app = createApp({ dataFile });
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
    return `http://127.0.0.1:${app.address().port}`;
  };
  const stop = () =>
    new Promise((resolve, reject) =>
      app.close((error) => (error ? reject(error) : resolve())),
    );
  try {
    let base = await start();
    assert.throws(() => createApp({ dataFile }), /locked/);
    const state = await (await fetch(base + "/api/workspace")).json();
    const put = (body, headers = {}) =>
      fetch(base + "/api/workspace", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Workspace-Token": state.token,
          ...headers,
        },
        body: JSON.stringify(body),
      });
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal(
      (
        await fetch(base + "/api/workspace", {
          headers: { Origin: "https://example.com" },
        })
      ).status,
      403,
    );
    const invalidHost = await new Promise((resolve, reject) => {
      get(
        base + "/api/workspace",
        { headers: { Host: "attacker.test" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ).on("error", reject);
    });
    assert.equal(invalidHost, 403);
    assert.equal(
      (await put(state, { "X-Workspace-Token": "wrong" })).status,
      403,
    );
    assert.equal(
      (
        await put({
          ...state,
          records: [{ ...state.records[0], id: "bad id" }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await fetch(base + "/api/report?date=2026-02-30")).status,
      400,
    );
    const changed = {
      ...state,
      records: [{ ...state.records[0], name: "Saved customer" }],
    };
    assert.equal((await put(changed)).status, 200);
    assert.equal((await put(changed)).status, 409);
    const exported = await (await fetch(base + "/api/export")).json();
    assert.equal(exported.records[0].name, "Saved customer");
    assert.equal("token" in exported, false);
    assert.equal((await fetch(base + "/api/export.csv")).status, 200);
    await stop();
    base = await start();
    assert.equal(
      (await (await fetch(base + "/api/workspace")).json()).records[0].name,
      "Saved customer",
    );
    assert.equal(JSON.parse(readFileSync(dataFile, "utf8")).records.length, 1);
  } finally {
    if (app?.listening) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
