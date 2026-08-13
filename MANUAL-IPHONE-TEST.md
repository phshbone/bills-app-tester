# Manual iPhone test sequence

1. **Update/build:** Open the installed app online. In Care -> Manage connection & activity confirm `Build CODEX-v3.1 / cache v36`. If not, stop and resolve the update.
2. **Pairing:** On an authorized device choose Share one-time invite. Open it on a new iPhone, add to Home Screen if needed, enter only a name/initials, and tap Enter Frannie. Confirm invalid, expired, and already-used copies fail.
3. **Sitter persistence:** On Device A activate directions, sync, close/swipe away the PWA, reopen, and confirm the caretaker alert and End action remain. View/dismiss the alert and confirm active remains true.
4. **Ownership:** On Device B confirm directions are viewable but editing/ending is blocked. On Device A edit active directions and end them; confirm false on both. Confirm changing a display name does not transfer ownership.
5. **Medications:** Add A current, add B current, edit B, sync both devices, mark A inactive, and confirm B stays current while A remains in history.
6. **Feeding:** Add two current items in one category plus items in other categories. Confirm every current item appears in sitter, inactive items do not, and history remains.
7. **Audit:** Make exactly one Care edit. Confirm exactly one immediate entry with person, device-backed identity, date/time, and description. Sync Device B and confirm exactly one copy survives repeated sync/conflict.
8. **Checklist/modal:** Enable the temporary checklist, check several rows, wait for sync/rerender, and confirm checks remain during that app session. Close/reopen sitter and video modals repeatedly; confirm no black surface or frozen controls. Kill/reopen and confirm the temporary checklist resets.
9. **Reopen/update:** Reopen offline once to confirm the shell loads, then online to confirm synchronization and build stamp. Revoke/disconnect a test device and confirm its old credential can no longer write. Pair it again only with a new invite.
