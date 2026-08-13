# Deployment order (manual, not executed)

1. Export/back up the live D1 database and deployed Worker source/config.
2. Verify the audited live contract still matches `CARE_DB` -> `care_records` -> ID `frannie`; do not copy or rename the care record.
3. Apply the D1 pairing migration.
4. Preserve the existing D1 binding `CARE_DB` and current `ALLOWED_ORIGINS`.
5. Preserve `CARE_ACCESS_KEY`; generate/store a separate offline `ADMIN_RECOVERY_TOKEN`.
6. Deploy the Worker and verify legacy `GET/PUT /v1/care`, invite creation, pairing, and revocation in staging or a controlled test.
7. Deploy the six frontend replacement files. Verify `Care -> Connection & activity -> Build CODEX-v3 / cache v35`.
8. Let each existing family device sync once so it exchanges the legacy credential for an `fd_` device credential.
9. Complete the iPhone sequence and two-device audit/sitter checks.
10. After every expected existing device has migrated and recovery is verified, remove `CARE_ACCESS_KEY` from the Worker.

Rollback: restore the previous Worker and D1 backup before rolling back the frontend. Never re-expose the legacy token in a link.
