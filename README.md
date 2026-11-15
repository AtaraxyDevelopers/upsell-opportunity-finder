# Upsell Opportunity Finder

[![CI](https://github.com/AtaraxyDevelopers/upsell-opportunity-finder/actions/workflows/ci.yml/badge.svg)](https://github.com/AtaraxyDevelopers/upsell-opportunity-finder/actions/workflows/ci.yml)
[MIT license](LICENSE) · Built by [Ataraxy Developers](https://ataraxydevelopers.com)

Find relevant upgrades using transparent customer fit rules.

A local planning workspace. Review suggestions before acting; no automatic messages or financial transactions.

![Example business workspace](docs/workspace.png)

## What you can do

- Add, edit, search and remove records through the browser.
- Adjust the business settings and report date; inspect calculations and suggested next steps.
- Save data locally across restarts; export a JSON backup or spreadsheet-safe CSV.
- Import a validated JSON workspace and run the same calculations from the command line.

## Get started

Prerequisites: **Node.js 22 or 24** (includes npm), a modern browser, and optionally Git. No API keys, paid services, database installation or runtime npm dependencies are needed. Development dependencies are used only for browser tests.

Clone:

```sh
git clone https://github.com/AtaraxyDevelopers/upsell-opportunity-finder.git
cd upsell-opportunity-finder
npm ci
npm test
npm run example
npm start
```

Or choose **Code → Download ZIP** on GitHub, extract the archive, open a terminal inside the extracted folder containing `package.json`, and run the commands beginning with `npm ci`. ZIP users do not need Git. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

Open **http://127.0.0.1:4423** exactly as printed. Use this address instead of `localhost`; host validation is intentional. Stop with **Ctrl+C**. If the port is busy, use `npm start -- --port 4623` and open the printed address.

The first run loads fictional sample records. It does not contact those businesses. The report initially uses **2026-11-15** so the example is repeatable; click **Use today** for current planning. Edit a row, click **Save record**, and reload to verify persistence. When ready, export a backup, choose **Clear all records**, and enter your own records.

## Reproduce the example

```sh
npm run example
node scripts/analyze.mjs --input examples/workspace.json --date 2026-11-15 --out report.json
```

Expected summary:

| Metric                   | Value |
| ------------------------ | ----- |
| Suitable opportunities   | 1     |
| Potential monthly uplift | 50.00 |
| Customer concerns        | 1     |

The command writes UTF-8 JSON. `--out` refuses to overwrite an existing file; choose another filename on subsequent runs. Running without `--out` prints JSON. Unknown flags, invalid dates and invalid data exit with a nonzero status.

## How the calculation works

Suggest the next plan when capacity reaches the threshold or a starter customer needs reporting. Satisfaction and contact permission are required. Potential uplift is monthly list-price difference, not earned revenue.

Money uses two decimal places and one consistent currency per workspace. This is a planning tool, not an accounting ledger, tax engine, automated credit decision system, or guarantee of business results. Review the inputs and assumptions before acting. Zero-denominator rates show N/A rather than an invented percentage. Dates are UTC calendar dates.

## Data format

See [examples/workspace.json](examples/workspace.json) for a complete importable file. It contains `schemaVersion: 1`, `project: "upsell-opportunity-finder"`, `settings`, and `records`. Every record needs a unique `id` (letters, digits, hyphens or underscores). Numeric fields must be JSON numbers, flags must be booleans, and dates must be real `YYYY-MM-DD` dates.

| Field            | Meaning                   | Type / allowed values                              |
| ---------------- | ------------------------- | -------------------------------------------------- |
| `name`           | Customer / business name  | text                                               |
| `email`          | Customer email            | email                                              |
| `plan`           | Current plan              | select: starter, growth, scale                     |
| `utilization`    | Current capacity used (%) | number                                             |
| `needsReporting` | Needs advanced reporting  | boolean                                            |
| `healthy`        | Customer is satisfied     | boolean                                            |
| `consent`        | Permission for offers     | boolean                                            |
| `status`         | Opportunity status        | select: unreviewed, discussing, accepted, declined |

Import replaces the current workspace after confirmation; export a backup first. The entire import is validated before any existing data is changed. Maximum import size: 2 MB / 10,000 records. CSV is for export; JSON is the lossless import and backup format.

## Storage, backup and restore

Saved data lives at `data/workspace.json`, relative to the project folder, and is excluded from Git. Each save writes a temporary file before replacing the data file. Only one process may use a data file at a time; stale tabs are rejected instead of overwriting newer edits.

Use **Export backup (JSON)** and **Import backup** for backup and restore. You can also stop the app, copy the data file to a safe location, and restore it while stopped. To choose another location:

```sh
npm start -- --data ./data/another-workspace.json
```

For a temporary demo that writes no customer data:

```sh
npm start -- --memory
```

If a crash leaves `workspace.json.lock`, first make sure no instance is running against that file, then remove only the corresponding `.lock` file and restart. An invalid data file is reported; it is never silently replaced with sample data.

## Test

```sh
npm test
npm run browser:install
npm run test:browser
```

The Node tests check documented calculations, business edge cases, invalid imports, HTTP controls, persistence and stale-write protection. Playwright tests exercise editing, saving, reload, downloads, invalid imports, mobile layout and automated WCAG checks. Browser tests use a separate port and temporary in-memory data. Automated accessibility checks are useful coverage, not a claim of complete accessibility certification. CI runs Node tests and examples on Windows, macOS and Linux with Node 22 and 24, plus Chromium tests on Linux.

## Extend or integrate

The pure `analyze(records, settings, asOf)` function is in [src/domain.mjs](src/domain.mjs). Validate external data with `validateState` from [src/lib.mjs](src/lib.mjs) before calling it. [docs/API.md](docs/API.md) describes the local HTTP interface and a runnable client example.

This release is deliberately a single-user local app. Public hosting, shared-team authentication, scheduled email delivery and vendor integrations require additional implementation. See [SECURITY.md](SECURITY.md) before changing the deployment model.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), report reproducible issues with synthetic data, and keep customer records out of public issues. MIT licensed; you may use, modify and redistribute the software under the license terms.
