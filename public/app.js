const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
let workspace,
  config,
  token,
  editing = null,
  report,
  busy = false;
function message(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
}
function fields(container, definitions, values = {}) {
  container.replaceChildren();
  for (const f of definitions) {
    const label = el("label", f.label);
    const input = document.createElement(
      f.type === "select" ? "select" : "input",
    );
    input.name = f.key;
    if (f.type === "select")
      for (const option of f.options) {
        const item = el("option", option);
        item.value = option;
        input.append(item);
      }
    else input.type = f.type === "boolean" ? "checkbox" : f.type;
    if (f.type === "number") {
      input.min = f.min;
      input.max = f.max;
      input.step = f.integer ? "1" : "any";
    }
    if (f.type === "boolean") input.checked = values[f.key] ?? false;
    else
      input.value =
        values[f.key] ??
        (f.type === "number"
          ? f.min
          : f.type === "date"
            ? $("asOf").value
            : f.type === "select"
              ? f.options[0]
              : "");
    if (!f.optional && f.type !== "boolean") input.required = true;
    input.maxLength = f.maxLength ?? 2000;
    label.append(input);
    container.append(label);
  }
}
function values(form, definitions) {
  return Object.fromEntries(
    definitions.map((f) => {
      const input = form.elements.namedItem(f.key);
      return [
        f.key,
        f.type === "boolean"
          ? input.checked
          : f.type === "number"
            ? Number(input.value)
            : input.value,
      ];
    }),
  );
}
async function save(next) {
  if (busy) throw new Error("A save is in progress. Please wait.");
  busy = true;
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Token": token,
      },
      body: JSON.stringify({ ...next, revision: workspace.revision }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    workspace = result;
    await refresh();
    message("Saved on this computer.");
  } finally {
    busy = false;
  }
}
async function refresh() {
  const response = await fetch(
    "/api/report?date=" + encodeURIComponent($("asOf").value),
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  report = result;
  $("metrics").replaceChildren(
    ...report.metrics.map((m) => {
      const card = el("article", undefined, "metric");
      card.append(
        el("h3", m.label),
        el("strong", m.value ?? "Not available"),
        el("p", m.detail),
      );
      return card;
    }),
  );
  $("notices").replaceChildren(
    ...report.notices.map((n) => el("p", n.message, "notice " + n.severity)),
  );
  renderRows();
}
function renderRows() {
  const head = $("results").querySelector("thead"),
    body = $("results").querySelector("tbody");
  const keys = report.columns;
  const header = el("tr");
  for (const key of keys) {
    const th = el("th", key);
    th.scope = "col";
    header.append(th);
  }
  header.append(el("th", "Actions", "row-actions"));
  head.replaceChildren(header);
  body.replaceChildren();
  const query = $("search").value.toLowerCase();
  const rows = report.rows.filter((row) =>
    Object.values(row).some((v) => String(v).toLowerCase().includes(query)),
  );
  $("empty").hidden = rows.length !== 0;
  for (const row of rows) {
    const tr = el("tr");
    tr.dataset.id = row.id;
    for (const key of keys) tr.append(el("td", row[key] ?? "—"));
    const actions = el("td", undefined, "row-actions");
    const button = (label, run) => {
      const b = el("button", label, "secondary");
      b.type = "button";
      b.addEventListener("click", () =>
        Promise.resolve()
          .then(run)
          .catch((e) => message(e.message, true)),
      );
      actions.append(b);
    };
    button("Edit", () => {
      editing = row.id;
      fields(
        $("record-fields"),
        config.fields,
        workspace.records.find((r) => r.id === row.id),
      );
      $("editor-title").textContent = "Edit record";
      $("record-form").querySelector("input,select").focus();
    });
    const record = workspace.records.find((r) => r.id === row.id);
    const availableActions = (config.actions ?? []).filter(
      (action) =>
        Object.entries(action.when ?? {}).every(([key, allowed]) =>
          allowed.includes(record[key]),
        ) &&
        Object.entries(action.whenRow ?? {}).every(([key, allowed]) =>
          allowed.includes(row[key]),
        ),
    );
    for (const action of availableActions)
      button(action.label, async () => {
        const records = workspace.records.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...Object.fromEntries(
                  Object.entries(action.patch).map(([k, v]) => [
                    k,
                    v === "$date" ? $("asOf").value : v,
                  ]),
                ),
              }
            : r,
        );
        await save({ ...workspace, records });
      });
    if (config.document) button("Export quote", () => exportQuote(row.id));
    button("Delete", async () => {
      if (
        confirm(
          "Delete this record? Export a backup first if you need to keep it.",
        )
      ) {
        await save({
          ...workspace,
          records: workspace.records.filter((r) => r.id !== row.id),
        });
        if (editing === row.id) clearForm();
      }
    });
    tr.append(actions);
    body.append(tr);
  }
}
function clearForm() {
  editing = null;
  $("editor-title").textContent = "Add record";
  fields($("record-fields"), config.fields);
}
function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function exportQuote(id) {
  const r = workspace.records.find((r) => r.id === id),
    s = workspace.settings;
  const total =
    r.quantity * r.unitPrice * (1 - r.discount / 100) * (1 + r.tax / 100);
  const subject = encodeURIComponent(`Quote acceptance: ${r.id}`);
  const body = encodeURIComponent(
    `I would like to accept quote ${r.id} for ${r.name}. Total: ${total.toFixed(2)} ${s.currency}. Please confirm availability and next steps.`,
  );
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote ${escapeHtml(r.id)}</title><style>body{font:18px/1.6 system-ui;max-width:760px;margin:50px auto;padding:25px;color:#17243b}h1{color:#1759bf}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #ddd}a{color:#1759bf}</style><h1>${escapeHtml(s.businessName)}</h1><h2>Quotation ${escapeHtml(r.id)}</h2><p>Prepared for ${escapeHtml(r.name)}</p><p>${escapeHtml(r.description)}</p><table><tr><td>Quantity × unit price</td><td>${r.quantity} × ${r.unitPrice.toFixed(2)} ${escapeHtml(s.currency)}</td></tr><tr><td>Discount / tax</td><td>${r.discount}% / ${r.tax}%</td></tr><tr><td>Total</td><td><strong>${total.toFixed(2)} ${escapeHtml(s.currency)}</strong></td></tr></table><p>Valid through ${escapeHtml(r.validUntil)} (UTC).</p><p>${escapeHtml(s.terms)}</p><a href="mailto:${escapeHtml(s.replyEmail)}?subject=${subject}&body=${body}">Request acceptance by email</a><p>This opens an email draft. The supplier confirms acceptance separately; this page does not process payments.</p></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = el("a");
  a.href = url;
  a.download = `quote-${id}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(
    "Quote exported. Send the HTML file to your customer or host it on your own website.",
  );
}
async function init() {
  const response = await fetch("/api/workspace");
  if (!response.ok) throw new Error("Unable to load workspace");
  const data = await response.json();
  config = data.config;
  token = data.token;
  workspace = data;
  document.title = config.title + " · Ataraxy Developers";
  $("title").textContent = config.title;
  $("description").textContent = config.description;
  $("scope").textContent = config.scope;
  $("method").textContent = config.method;
  $("repository").href = "https://github.com/AtaraxyDevelopers/" + config.slug;
  $("asOf").value = config.asOf;
  fields($("settings-fields"), config.settings, workspace.settings);
  clearForm();
  await refresh();
  $("record-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const record = {
        id: editing ?? crypto.randomUUID(),
        ...values(e.target, config.fields),
      };
      const records = editing
        ? workspace.records.map((r) => (r.id === editing ? record : r))
        : [...workspace.records, record];
      await save({ ...workspace, records });
      clearForm();
    } catch (error) {
      message(error.message, true);
    }
  });
  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await save({ ...workspace, settings: values(e.target, config.settings) });
    } catch (error) {
      message(error.message, true);
    }
  });
  $("cancel").addEventListener("click", clearForm);
  $("search").addEventListener("input", renderRows);
  $("asOf").addEventListener("change", () =>
    refresh().catch((e) => message(e.message, true)),
  );
  $("today").addEventListener("click", () => {
    $("asOf").value = new Date().toISOString().slice(0, 10);
    refresh().catch((e) => message(e.message, true));
  });
  $("print").addEventListener("click", () => print());
  $("clear").addEventListener("click", async () => {
    if (confirm("Clear every record? Export a JSON backup first."))
      try {
        await save({ ...workspace, records: [] });
        clearForm();
      } catch (e) {
        message(e.message, true);
      }
  });
  $("import").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Maximum import size is 2 MB");
      const data = JSON.parse(await file.text());
      if (confirm("Replace this workspace with the imported backup?")) {
        await save(data);
        fields($("settings-fields"), config.settings, workspace.settings);
        clearForm();
      }
    } catch (error) {
      message(error.message, true);
    } finally {
      e.target.value = "";
    }
  });
}
init().catch((e) => message(e.message, true));
