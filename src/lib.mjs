// Shift decimal text rather than multiplying the binary float: 10.075 -> 10.08.
// Half-cent ties round away from zero, including negative business results.
export const round = (n) => {
  if (!Number.isFinite(n)) throw new Error("Expected a finite number");
  const [coefficient, exponent = "0"] = String(Math.abs(n)).split("e");
  const shifted = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
  const [rounded, power = "0"] = String(shifted).split("e");
  return Number(`${rounded}e${Number(power) - 2}`) * Math.sign(n);
};
export const sum = (values) => round(values.reduce((a, b) => a + b, 0));
export const ratio = (a, b) => (b === 0 ? null : round((a / b) * 100));
export const days = (later, earlier) =>
  (Date.parse(later) - Date.parse(earlier)) / 86400000;
export const money = (n) =>
  n === null ? "Not available" : round(n).toFixed(2);
export const metric = (label, value, detail = "") => ({ label, value, detail });
export const notice = (id, message, severity = "info") => ({
  id,
  message,
  severity,
});
export const field = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  ...extra,
});
export const select = (key, label, options) =>
  field(key, label, "select", { options });
export const num = (key, label, extra = {}) =>
  field(key, label, "number", { min: 0, max: 100000000, ...extra });
export const pct = (key, label) => num(key, label, { max: 100 });
export const date = (key, label) => field(key, label, "date");
export const flag = (key, label) => field(key, label, "boolean");

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export function validateObject(value, fields, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  const result = {};
  for (const f of fields) {
    const v = value[f.key];
    if (f.type === "boolean") {
      if (typeof v !== "boolean")
        throw new Error(`${f.label} must be true or false`);
    } else if (f.type === "number") {
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < f.min ||
        v > f.max ||
        (f.integer && !Number.isInteger(v))
      )
        throw new Error(
          `${f.label} must be ${f.integer ? "an integer" : "a number"} from ${f.min} to ${f.max}`,
        );
    } else {
      if (
        typeof v !== "string" ||
        v.length > (f.maxLength ?? 2000) ||
        (!f.optional && !v.trim())
      )
        throw new Error(
          `${f.label} is required (maximum ${f.maxLength ?? 2000} characters)`,
        );
      if (f.type === "select" && !f.options.includes(v))
        throw new Error(`${f.label} has an invalid option`);
      if (f.type === "date" && v && !validDate(v))
        throw new Error(`${f.label} must be a real YYYY-MM-DD date`);
      if (
        f.type === "datetime-local" &&
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)
      )
        throw new Error(`${f.label} must be YYYY-MM-DDTHH:mm (UTC)`);
      if (
        f.type === "datetime-local" &&
        (!validDate(v.slice(0, 10)) ||
          Number(v.slice(11, 13)) > 23 ||
          Number(v.slice(14, 16)) > 59)
      )
        throw new Error(`${f.label} must be a real UTC date and time`);
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        throw new Error(`${f.label} must be an email address`);
      if (f.type === "url" && v) {
        let url;
        try {
          url = new URL(v);
        } catch {
          throw new Error(`${f.label} must be an absolute HTTPS URL`);
        }
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error(
            `${f.label} must be an HTTPS URL without credentials`,
          );
      }
    }
    result[f.key] = typeof v === "string" ? v.trim() : v;
  }
  return result;
}

export function validateState(input, config) {
  if (
    !input ||
    typeof input !== "object" ||
    input.schemaVersion !== 1 ||
    input.project !== config.slug
  )
    throw new Error(`Expected schemaVersion 1 and project ${config.slug}`);
  const settings = validateObject(input.settings, config.settings, "Settings");
  if (!Array.isArray(input.records) || input.records.length > 10000)
    throw new Error("Records must be an array of at most 10,000 records");
  const ids = new Set();
  const records = input.records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw new Error("Every record must be an object");
    if (
      typeof record.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) ||
      ids.has(record.id)
    )
      throw new Error(
        "Record IDs must be unique, 1–80 letters, digits, hyphens or underscores",
      );
    ids.add(record.id);
    return {
      id: record.id,
      ...validateObject(record, config.fields, "Record"),
    };
  });
  config.validate?.(records, settings);
  return { schemaVersion: 1, project: config.slug, settings, records };
}

export function csv(records) {
  if (!records.length) return "";
  const keys = Object.keys(records[0]);
  const escape = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@-]/, (s) => "'" + s)
      .replaceAll('"', '""') +
    '"';
  return (
    [keys, ...records.map((r) => keys.map((k) => r[k]))]
      .map((row) => row.map(escape).join(","))
      .join("\r\n") + "\r\n"
  );
}
