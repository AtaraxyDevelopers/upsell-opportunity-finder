import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config, analyze } from "../src/domain.mjs";
import { validateState, validDate } from "../src/lib.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  let input = resolve(root, "examples/workspace.json"),
    date = config.asOf,
    out;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const option = args[i],
      value = args[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${option}`);
    if (option === "--input") input = resolve(value);
    else if (option === "--date") date = value;
    else if (option === "--out") out = resolve(value);
    else throw new Error(`Unknown option ${option}`);
  }
  if (!validDate(date)) throw new Error("Use a real YYYY-MM-DD date");
  const data = validateState(JSON.parse(readFileSync(input, "utf8")), config);
  const report =
    JSON.stringify(analyze(data.records, data.settings, date), null, 2) + "\n";
  if (out) {
    writeFileSync(out, report, { flag: "wx" });
    console.log(`Created ${out}`);
  } else process.stdout.write(report);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
