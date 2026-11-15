# Local API

Start the app with `npm start`, then run `node examples/api-client.mjs` from the repository root in a second terminal. It reads the sample report without modifying records. If you chose a custom port, pass its full URL as the first argument.

- `GET /api/workspace`: validated settings and records, current revision, form schema, and per-process write token.
- `GET /api/report?date=2026-11-15`: computed report.
- `GET /api/export`: JSON backup without tokens or revision.
- `GET /api/export.csv`: records CSV with formula-leading cells neutralized.
- `PUT /api/workspace`: complete replacement, requiring `Content-Type: application/json`, `X-Workspace-Token`, and the current `revision` in the body.

Status codes: 400 invalid input, 403 invalid host/origin/token, 409 stale revision, 413 body too large, 415 wrong content type. No CORS access is enabled. Use the printed 127.0.0.1 origin. Keep tokens out of logs.

For integrations, prefer generating a workspace JSON and importing it. This local API is not an Internet-facing service or a payment webhook endpoint.
