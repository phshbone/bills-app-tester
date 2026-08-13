# Frannie Worker pairing repair

This Worker preserves the frontend's existing `GET/PUT /v1/care` response and optimistic `baseVersion` conflict contract, while replacing the shared family token with per-device credentials.

This package is aligned to the audited live binding and schema: D1 binding `CARE_DB`, database `frannie-care`, table `care_records`, singleton ID `frannie`, and existing legacy secret `CARE_ACCESS_KEY`. Apply `migrations/0001_device_pairing.sql`, set only the new `ADMIN_RECOVERY_TOKEN` secret, preserve the current origins, and deploy the Worker before the frontend.

The existing `CARE_ACCESS_KEY` is accepted only to read/write the care record and to exchange itself once per existing device at `POST /v1/devices/migrate`. Remove it after all existing family devices have migrated. New devices use single-use, expiring invite tokens. Only SHA-256 token hashes are stored in D1.

If no authorized device remains, an administrator holding the offline recovery secret can call `POST /v1/admin/recovery-invite` with `X-Admin-Recovery`. This deliberately does not expose recovery in the PWA.

The additive migration does not alter or copy the live `care_records` table. See `CLOUDFLARE-READONLY-AUDIT.md` and `DEPLOYMENT-ORDER.md` before any deployment.
