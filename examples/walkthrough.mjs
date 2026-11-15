import assert from "node:assert/strict";
import { config, example, analyze } from "../src/domain.mjs";
import { validateState } from "../src/lib.mjs";
// Flag a customer concern before proposing an upgrade.
// This changes a copy of fictional data; no files or external services are changed.
const workspace = structuredClone(example);
Object.assign(workspace.records[0], { healthy: false });
const valid = validateState(workspace, config);
const report = analyze(valid.records, valid.settings, config.asOf);
const actual = report.metrics.find(
  (metric) => metric.label === "Suitable opportunities",
).value;
assert.equal(actual, 0);
console.log("Suitable opportunities: " + actual);
