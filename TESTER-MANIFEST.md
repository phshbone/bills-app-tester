# CODEX-v3 tester package manifest

## Replace on the frontend

- `index.html`
- `styles.css`
- `app.js`
- `shared-care-core.js`
- `shared-care.js`
- `sw.js`

Unchanged assets referenced by the service worker (`manifest.json`, `frannies-training-update.js`, and `assets/`) were not present in the supplied ZIP and are not fabricated here. Preserve their deployed copies.

## New backend files

- `worker/src/worker.js`
- `worker/migrations/0001_device_pairing.sql`
- `worker/wrangler.example.toml`
- `worker/README.md`

## New verification/documentation files

- `package.json`
- `tests/regression.mjs`
- `tests/worker-regression.mjs`
- `CODEX-ROOT-CAUSE-AUDIT.md`
- `CODEX-TEST-REPORT.md`
- `CLOUDFLARE-READONLY-AUDIT.md`
- `MANUAL-IPHONE-TEST.md`
- `DEPLOYMENT-ORDER.md`

## Migration requirements

- Export the audited live Worker and D1 database before deployment.
- Preserve the live `care_records` table, its `frannie` singleton record, JSON, and version.
- Keep the existing D1 binding `CARE_DB`.
- Set exact `ALLOWED_ORIGINS`.
- Preserve `CARE_ACCESS_KEY` and set `ADMIN_RECOVERY_TOKEN` with Worker secret storage, never source control.
- Keep the legacy secret only during controlled existing-device migration, then remove it.

## Deployment order

See `DEPLOYMENT-ORDER.md`. Backend migration/Worker comes before frontend. No files in this package have been deployed.

## Excluded

- `node_modules`
- secrets and permanent credentials
- unrelated prior report files
- deployment state/cache directories
