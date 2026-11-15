# Security

This release is a single-user, loopback-only workspace. It is not a hosted multi-tenant service. Do not expose it through a tunnel or reverse proxy without adding authentication, authorization, TLS, rate limiting and a deployment review.

Business records live in `data/workspace.json` after the first save. This folder is ignored by Git. Exported files can contain customer information; protect them and keep backups. The app sends no telemetry or automatic email.

Mutations require a per-process token, same-origin requests and the current revision. Host validation blocks DNS rebinding; imports are validated and bounded to 2 MB. Text is rendered without HTML interpolation. These controls do not protect against someone with access to your operating-system account.

For a sensitive vulnerability, use [GitHub private vulnerability reporting](https://github.com/AtaraxyDevelopers/upsell-opportunity-finder/security/advisories/new). If unavailable, use the [company contact page](https://ataraxydevelopers.com/contact/) to arrange a private report. Do not post exploit details or customer data publicly.
