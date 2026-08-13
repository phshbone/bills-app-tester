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
- `MANUAL-IPHONE-TEST.md`
- `DEPLOYMENT-ORDER.md`

## Migration requirements

- Inspect/export the live Worker and D1 schema first.
- Preserve the live care JSON and version in the new `frannie_care` singleton contract, adapting table names in the Worker if the existing schema differs.
- Bind the existing D1 database as `DB`.
- Set exact `ALLOWED_ORIGINS`.
- Set `LEGACY_FAMILY_TOKEN` and `ADMIN_RECOVERY_TOKEN` with Worker secret storage, never source control.
- Keep the legacy secret only during controlled existing-device migration, then remove it.

## Deployment order

See `DEPLOYMENT-ORDER.md`. Backend migration/Worker comes before frontend. No files in this package have been deployed.

## Excluded

- `node_modules`
- secrets and permanent credentials
- unrelated prior report files
- deployment state/cache directories
