import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server.mjs";
import { config, example } from "../src/domain.mjs";
import { round, validateState } from "../src/lib.mjs";
async function withServer(run) {
  const app = createApp({ memory: true });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    await run(`http://127.0.0.1:${app.address().port}`);
  } finally {
    await new Promise((r) => app.close(r));
  }
}
test("Decimal half-cent rounding is consistent for positive and negative results", () => {
  assert.equal(round(10.075), 10.08);
  assert.equal(round(-10.075), -10.08);
  assert.equal(round(1.015), 1.02);
  assert.equal(round(1e-7), 0);
  assert.equal(round(1e16), 1e16);
});
test("Malformed JSON shapes return validation errors without losing data", async () =>
  withServer(async (base) => {
    const state = await (await fetch(base + "/api/workspace")).json();
    assert.equal(state.storage, "memory");
    for (const payload of [null, 42, [], { ...state, records: [null] }]) {
      const response = await fetch(base + "/api/workspace", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Workspace-Token": state.token,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /object/);
    }
    assert.deepEqual(
      (await (await fetch(base + "/api/export")).json()).records,
      example.records,
    );
  }));
test("Accepted saves remain exportable and oversized formatted backups preserve prior data", async () =>
  withServer(async (base) => {
    const state = await (await fetch(base + "/api/workspace")).json();
    let candidate;
    for (let count = 1000; count <= 10000; count += 1000) {
      const records = Array.from({ length: count }, (_, i) => {
        const r = {
          ...example.records[0],
          id: "record-" + i,
          name:
            "Customer with a descriptive business name " + i + "x".repeat(80),
        };
        if ("invoice" in r) r.invoice = "INV-" + i;
        if (r.orderId) r.orderId = "ORDER-" + i;
        if (config.slug === "booking-conversion-kit") r.status = "requested";
        return r;
      });
      candidate = {
        schemaVersion: 1,
        project: config.slug,
        settings: example.settings,
        records,
      };
      if (
        Buffer.byteLength(JSON.stringify(candidate, null, 2) + "\n") >
        2 * 1024 * 1024
      )
        break;
    }
    validateState(candidate, config);
    assert.ok(
      Buffer.byteLength(JSON.stringify(candidate, null, 2) + "\n") >
        2 * 1024 * 1024,
      "fixture exceeds formatted backup limit",
    );
    const body = JSON.stringify({ ...candidate, revision: state.revision });
    assert.ok(
      Buffer.byteLength(body) < 2 * 1024 * 1024,
      "compact request fits; pretty backup does not",
    );
    const response = await fetch(base + "/api/workspace", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Token": state.token,
      },
      body,
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /backup limit/);
    assert.deepEqual(
      (await (await fetch(base + "/api/export")).json()).records,
      example.records,
    );
  }));
