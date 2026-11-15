import test from "node:test";
import assert from "node:assert/strict";
import { config, example, analyze } from "../src/domain.mjs";
import { validateState } from "../src/lib.mjs";
test("Documented sample results match independently specified expectations", () => {
  const report = analyze(example.records, example.settings, config.asOf);
  for (const [label, value] of [
    ["Suitable opportunities", 1],
    ["Potential monthly uplift", "50.00"],
    ["Customer concerns", 1],
  ])
    assert.equal(
      report.metrics.find((m) => m.label === label).value,
      value,
      label,
    );
});
test("Business edge cases", () => {
  (function edge(records, s, analyze) {
    assert.equal(
      analyze([{ ...records[0], plan: "scale" }], s).metrics[0].value,
      0,
    );
    assert.equal(
      analyze([{ ...records[0], status: "declined" }], s).metrics[0].value,
      0,
    );
  })(example.records, example.settings, analyze, validateState);
});
