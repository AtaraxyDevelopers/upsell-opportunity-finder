import { round, sum, ratio, days, money, metric, notice } from "./lib.mjs";
export const config = {
  slug: "upsell-opportunity-finder",
  title: "Upsell Opportunity Finder",
  description: "Find relevant upgrades using transparent customer fit rules.",
  scope:
    "A local planning workspace. Review suggestions before acting; no automatic messages or financial transactions.",
  method:
    "Suggest the next plan when capacity reaches the threshold or a starter customer needs reporting. Satisfaction and contact permission are required. Potential uplift is monthly list-price difference, not earned revenue.",
  port: 4423,
  asOf: "2026-11-15",
  fields: [
    {
      key: "name",
      label: "Customer / business name",
      type: "text",
    },
    {
      key: "email",
      label: "Customer email",
      type: "email",
    },
    {
      key: "plan",
      label: "Current plan",
      type: "select",
      options: ["starter", "growth", "scale"],
    },
    {
      key: "utilization",
      label: "Current capacity used (%)",
      type: "number",
      min: 0,
      max: 100,
    },
    {
      key: "needsReporting",
      label: "Needs advanced reporting",
      type: "boolean",
    },
    {
      key: "healthy",
      label: "Customer is satisfied",
      type: "boolean",
    },
    {
      key: "consent",
      label: "Permission for offers",
      type: "boolean",
    },
    {
      key: "status",
      label: "Opportunity status",
      type: "select",
      options: ["unreviewed", "discussing", "accepted", "declined"],
    },
  ],
  settings: [
    {
      key: "currency",
      label: "Currency code (one currency per workspace)",
      type: "text",
      maxLength: 3,
    },
    {
      key: "threshold",
      label: "Capacity trigger (%)",
      type: "number",
      min: 0,
      max: 100,
    },
    {
      key: "growthPrice",
      label: "Growth monthly price",
      type: "number",
      min: 0,
      max: 100000000,
    },
    {
      key: "starterPrice",
      label: "Starter monthly price",
      type: "number",
      min: 0,
      max: 100000000,
    },
    {
      key: "scalePrice",
      label: "Scale monthly price",
      type: "number",
      min: 0,
      max: 100000000,
    },
  ],
  actions: [
    {
      label: "Mark discussing",
      patch: {
        status: "discussing",
      },
      when: {
        status: ["unreviewed"],
        healthy: [true],
        consent: [true],
      },
    },
    {
      label: "Mark declined",
      patch: {
        status: "declined",
      },
      when: {
        status: ["unreviewed", "discussing"],
      },
    },
  ],
  document: false,
};
config.validate = function validate(records, s) {
  if (s.growthPrice < s.starterPrice || s.scalePrice < s.growthPrice)
    throw new Error("Plan prices must increase or stay equal by tier");
};
export const example = {
  schemaVersion: 1,
  project: "upsell-opportunity-finder",
  settings: {
    currency: "USD",
    threshold: 80,
    starterPrice: 50,
    growthPrice: 100,
    scalePrice: 200,
  },
  records: [
    {
      id: "customer-1",
      name: "Maple Studio",
      email: "buyer@example.com",
      plan: "starter",
      utilization: 90,
      needsReporting: true,
      healthy: true,
      consent: true,
      status: "unreviewed",
    },
    {
      id: "customer-2",
      name: "River Foods",
      email: "team@example.com",
      plan: "growth",
      utilization: 95,
      needsReporting: false,
      healthy: false,
      consent: true,
      status: "unreviewed",
    },
  ],
};
export function analyze(records, s) {
  const rows = records.map((r) => {
    const suitable =
      r.healthy &&
      r.consent &&
      r.plan !== "scale" &&
      ["unreviewed", "discussing"].includes(r.status) &&
      (r.utilization >= s.threshold ||
        (r.plan === "starter" && r.needsReporting));
    return {
      id: r.id,
      Customer: r.name,
      "Current plan": r.plan,
      Suggestion: suitable
        ? r.plan === "starter"
          ? "growth"
          : "scale"
        : "No offer suggested",
      "Potential monthly uplift": money(
        suitable
          ? r.plan === "starter"
            ? s.growthPrice - s.starterPrice
            : s.scalePrice - s.growthPrice
          : 0,
      ),
      Reason: !r.healthy
        ? "Resolve customer concerns first"
        : !r.consent
          ? "No offer permission"
          : suitable
            ? "Capacity or reporting fit"
            : "No matching open opportunity",
    };
  });
  return {
    metrics: [
      metric(
        "Suitable opportunities",
        rows.filter((r) => r.Suggestion !== "No offer suggested").length,
      ),
      metric(
        "Potential monthly uplift",
        money(sum(rows.map((r) => Number(r["Potential monthly uplift"])))),
        s.currency,
      ),
      metric("Customer concerns", records.filter((r) => !r.healthy).length),
    ],
    notices: [],
    columns: [
      "Customer",
      "Current plan",
      "Suggestion",
      "Potential monthly uplift",
      "Reason",
    ],
    rows,
  };
}
