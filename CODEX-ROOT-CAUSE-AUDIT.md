# Frannie Codex root-cause audit

Build: `CODEX-v3 / cache v35`  
Source: supplied BTR-v2.2 ZIP, audited August 12, 2026

## 1. Sitter active state is lost

Exact cause: `synchronize()` applied `sitterActiveIntent` to the merged in-memory object, then stored that corrected object as `syncMeta.base` before the remote record had acknowledged it. If the response still contained `active:false`, the next pass compared local `true` with the already-corrected base `true`, concluded there was no local change, performed another pull, and could restore remote `false`. The lifecycle alert patches could not repair a value already overwritten by synchronization.

Affected code: `shared-care.js`, `synchronize()`, `sitterActiveIntent`, `applyShared()`.

Repair: an intent that differs from the returned server value is immediately written using the returned version. Only the acknowledged response becomes the new sync base. Activation metadata now includes a session ID and device owner ID.

Regression risk: conflict handling and focus selection share this machinery. Both are covered by the same acknowledged-intent write path.

## 2. Sitter ownership

Exact cause: authorization was based on `activatedBy` versus the editable display name. A second device could use the same name and pass the owner check; changing names also coupled presentation to authorization.

Affected code: `shared-care-core.js` sitter schema; `shared-care.js` `canEndSitter()`, activation, active-draft save, identity editing.

Repair: new sessions store `activatedByDeviceId` and `sessionId`. Only the activating device can edit/end an active session. Display name remains descriptive. Legacy sessions without a device ID retain the old name check solely as an upgrade escape hatch. The backend supplies per-device IDs and an offline administrative recovery invite.

Regression risk: a device activated before credential migration may own the session by its local installation ID. The owner check accepts that installation ID as well as the later server device ID.

## 3. Multiple current medications

Cause in older data: medication currentness was historically inferred. The supplied app already had per-record `active` flags and did not deactivate peers when adding/editing a medication.

Affected code: `app.js` `normalizeTreatments()`, `saveTreatment()`, `renderTreatments()`; `shared-care.js` `sitterSections()`.

Repair/preservation: explicit booleans remain authoritative; migration is independently evaluated per medication; sitter output filters all `Medication` records with `active === true`.

Regression risk: legacy records without a flag require a one-time date-based migration. Once written, no newest/array-position inference is used.

## 4. Multiple current foods/treats/supplements

Exact upgrade risk: the prior migration made only the newest unflagged item in each category current, conflicting with the locked multiple-current model and mishandling partially upgraded arrays.

Affected code: `app.js`, `normalizeFeedingItems()`; `shared-care.js`, `sitterSections()`.

Repair: every explicit flag is preserved. A legacy `feedingItems` record missing the flag migrates to current because legacy history is held separately in `feedingHistory`. Sitter output includes every `active === true` feeding record, including several in one category.

Regression risk: a malformed old build that placed historical items in `feedingItems` will initially show them as current; the explicit toggle can correct them without deleting history.

## 5. Recent Shared Changes

Definitive first loss point: the deployed Cloudflare Worker reconstructs each successful PUT through a fixed allowlist. It drops `activityLog`, `selected`, `completed`, `logs`, `profile.goal`, and the sitter activation/ownership fields before writing D1. The live D1 record confirms those keys are absent. Separately, an activity created during an in-flight sync did not independently require another pass, so it could remain local until a later action.

Affected code: `shared-care.js` `onLocalPersist()`, `addActivity()`, `synchronize()`, `renderActivityLog()`; `shared-care-core.js` `mergeActivityLog()`.

Repair/preservation: the aligned Worker stores the complete normalized frontend object rather than rebuilding it through an allowlist. `addActivity()` saves and renders immediately and schedules or flags another sync. Entries now also contain `deviceId`. Merge remains append-only, de-duplicated by ID, newest-first.

Why earlier repairs appeared ineffective: the live Worker deleted the repaired fields on every write. Actions made by an older cached script also could not create records retroactively, and a sync-only scheduling fix could not populate old missing events. Cache v35 coherently versions all live scripts.

Regression risk: the record is capped at 100 entries by the existing design. That is retention, not an administrative deletion UI.

## 6. Temporary sitter checklist

Exact cause: `renderSitterView()` replaces checkbox markup during sync/rerender. Without state outside the markup, checked properties disappear.

Affected code: `shared-care.js`, `sitterChecklistChecks`, `sitterHtml()`, delegated change handler.

Repair: stable row keys map to an in-memory `Set`; rerenders restore checks. No checklist data enters `state`, local storage, backup, or sync payload. A fresh app process resets it.

Regression risk: editing the underlying text changes the row key and appropriately resets that changed row.

## 7. Black screen / intermittent modal freeze

Cause/risk: the app shell is already a fixed, independently scrolling surface. Modal functions repeatedly mutating body overflow added unnecessary WebKit layout/compositing changes; previous forced transform/repaint workarounds increased the same risk.

Affected code: `app.js` video modal; `shared-care.js` sitter, alert, and pairing modals; `styles.css` fixed app shell.

Repair: modals only toggle their `open` class. No modal path mutates body overflow or forces transforms/repaints. Existing no-backdrop-filter rules for sitter/pairing overlays remain.

Regression risk: genuine installed-iPhone WebKit behavior cannot be proven in desktop automation.

## 8. Pairing/security

Exact cause: the old setup link placed the permanent shared family bearer token in `?connect=`, public frontend state, cookies, and copied URLs. It could not be made single-use by frontend lifecycle code.

Affected code: `shared-care.js`; new `worker/` files and D1 migration.

Repair: invite URLs carry only `fi_` one-time tokens. The Worker atomically consumes a valid unexpired invite and returns a random `fd_` device credential. Only credential hashes are stored in D1. Device revocation is enforced server-side. Existing devices exchange the legacy credential for a device credential. A separately held Worker secret can create a recovery invite if all devices are lost.

Regression risk: the deployed Worker and D1 were audited read-only. The replacement now uses the live `CARE_DB` binding, `care_records` table, `frannie` record ID, response shape, and optimistic version contract. Deployment still requires backups, the additive pairing migration, and controlled staging/device tests.
