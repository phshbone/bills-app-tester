# Frannie Worker pairing repair

This Worker preserves the frontend's existing `GET/PUT /v1/care` response and optimistic `baseVersion` conflict contract, while replacing the shared family token with per-device credentials.

Deployment requires the existing D1 binding details. Apply `migrations/0001_device_pairing.sql`, set `LEGACY_FAMILY_TOKEN` and `ADMIN_RECOVERY_TOKEN` as Worker secrets, set the exact PWA origin in `ALLOWED_ORIGINS`, and deploy the Worker before the frontend.

The legacy secret is accepted only to read/write the care record and to exchange itself once per existing device at `POST /v1/devices/migrate`. Remove `LEGACY_FAMILY_TOKEN` after all existing family devices have migrated. New devices use single-use, expiring invite tokens. Only SHA-256 token hashes are stored in D1.

If no authorized device remains, an administrator holding the offline recovery secret can call `POST /v1/admin/recovery-invite` with `X-Admin-Recovery`. This deliberately does not expose recovery in the PWA.

Before deployment, compare the live Worker's current care table with `frannie_care`. If the existing table uses another name/schema, copy its singleton JSON record and current version into `frannie_care`; do not deploy over live data without that migration check.
