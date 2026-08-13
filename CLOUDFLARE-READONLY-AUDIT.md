# Live Cloudflare read-only audit

Audited August 13, 2026 through authenticated Cloudflare API reads. No Worker, setting, secret, route, database schema, or row was changed.

## Live resources

- Account: Phshbone@gmail.com's Cloudflare account
- Worker: `frannie-care`
- Worker URL used by frontend: `https://frannie-care.phshbone.workers.dev`
- Deployment source: API
- Compatibility date: `2026-08-10`
- Compatibility flag: `nodejs_compat`
- D1 binding: `CARE_DB`
- D1 database: `frannie-care`
- D1 UUID: `a8aa46e3-28c0-443b-8b63-acd2f8ecb77f`
- Existing secret binding: `CARE_ACCESS_KEY` (value was not retrieved or exposed)
- Allowed origins: `https://phshbone.github.io`, `http://127.0.0.1:8788`, `http://localhost:8788`

## Existing D1 contract

```sql
CREATE TABLE care_records (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
```

The live singleton record has ID `frannie`, version `119`, and a 5,878-byte JSON payload. The audit read reported zero rows written and `changed_db:false`.

## Proven destructive sanitizer

The deployed Worker accepts a frontend care object but reconstructs it using a fixed allowlist. It keeps profile name/age/size, Care arrays, and four sitter text fields. It drops these shared fields on every successful PUT:

- `profile.goal`
- `selected`
- `completed`
- `logs`
- `activityLog`
- `sitter.active`
- `sitter.activatedAt`
- `sitter.activatedBy`
- new device/session ownership fields

D1 metadata inspection confirms those keys are absent from the live JSON. `sitter.active` is absent and the remote activity count is zero. This is the first definitive loss point for both sitter persistence and Recent Shared Changes.

The current data does retain explicit item flags: nine feeding records exist, four are current; nine treatment records exist, one medication is current. No personal care text was read for this audit.

## Draft repair alignment

The draft Worker now preserves the complete normalized frontend object and continues using the existing:

- `CARE_DB` binding
- `CARE_ACCESS_KEY` legacy migration credential
- `care_records` table
- `frannie` record ID
- optimistic version conflict behavior
- response shape: `data`, `version`, `updatedAt`
- origin allowlist

The D1 migration is additive. It creates only `frannie_devices` and `frannie_invites` plus their indexes; it does not alter, rename, copy, or delete `care_records`.

## Remaining pre-deployment safeguards

1. Export the live Worker source/config and D1 database as rollback artifacts.
2. Apply the additive pairing migration in a staging copy first.
3. Run the packaged Worker regression suite against the aligned contract.
4. Create `ADMIN_RECOVERY_TOKEN` as a secret; retain the existing `CARE_ACCESS_KEY` during device migration.
5. Deploy Worker before frontend, then run two-device and installed-iPhone testing.
6. Remove `CARE_ACCESS_KEY` only after every intended existing device has exchanged it and recovery is proven.
