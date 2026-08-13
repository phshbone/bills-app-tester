# Frannie complete release manifest

Build: `CODEX-v3.3 / cache v38`

This release combines the complete official Frannie Trainer presentation with the newer repaired shared-care application. It does not contain a recovery key, device credential, invite token, Cloudflare secret, or database export.

## Install at the website root

- `index.html`
- `styles.css`
- `app.js`
- `shared-care-core.js`
- `shared-care.js`
- `frannies-training-update.js`
- `manifest.json`
- `sw.js`
- `assets/frannie-background.webp`
- `assets/frannie-photo.webp`
- `assets/icon-192.png`
- `assets/icon-512.png`

These files are one coordinated frontend build. Do not upload only `index.html` or only the JavaScript files.

## Cloudflare Worker source and support files

- `worker/src/worker.js`
- `worker/migrations/0001_device_pairing.sql`
- `worker/migrations/0002_reusable_recovery_links.sql`
- `worker/README.md`
- `worker/wrangler.example.toml`
- `worker/wrangler.production.jsonc`

## Verification and handoff material

- `package.json`
- `tests/regression.mjs`
- `tests/worker-regression.mjs`
- `MANUAL-IPHONE-TEST.md`
- `CODEX-TEST-REPORT.md`
- `CODEX-ROOT-CAUSE-AUDIT.md`
- `DEPLOYMENT-ORDER.md`
- `CLOUDFLARE-READONLY-AUDIT.md`

Do not remove or replace the live Cloudflare D1 database when publishing this frontend. The database is outside this ZIP and remains intact.
