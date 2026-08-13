# Deployment order (manual, not executed)

1. Export/back up the live D1 database and deployed Worker source/config.
2. Compare the live care table/columns with `worker/migrations/0001_device_pairing.sql`. Adapt the replacement Worker to the live singleton care table or copy the existing JSON/version into `frannie_care`.
3. Apply the D1 pairing migration.
4. Configure the existing D1 binding as `DB` and the exact PWA origin as `ALLOWED_ORIGINS`.
5. Store the existing family write token as `LEGACY_FAMILY_TOKEN`; generate/store a separate offline `ADMIN_RECOVERY_TOKEN`.
6. Deploy the Worker and verify legacy `GET/PUT /v1/care`, invite creation, pairing, and revocation in staging or a controlled test.
7. Deploy the six frontend replacement files. Verify `Care → Connection & activity → Build CODEX-v3 · cache v35`.
8. Let each existing family device sync once so it exchanges the legacy credential for an `fd_` device credential.
9. Complete the iPhone sequence and two-device audit/sitter checks.
10. After every expected existing device has migrated and recovery is verified, remove `LEGACY_FAMILY_TOKEN` from the Worker.

Rollback: restore the previous Worker and D1 backup before rolling back the frontend. Never re-expose the legacy token in a link.
