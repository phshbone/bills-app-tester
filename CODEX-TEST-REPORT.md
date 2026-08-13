# Frannie Codex test report

## PROVEN

- JavaScript syntax passes for `app.js`, `shared-care-core.js`, `shared-care.js`, `sw.js`, and `worker/src/worker.js`.
- 27 executable state/structure assertions pass: sitter merge persistence, owner/session fields, multiple current medications/foods, append-only audit union, all-current sitter filters, session-only checklist, secure invite and recovery URLs, compact connection controls, explicit medication status, separated treatment actions, iPhone modal cleanup, and PWA asset/cache alignment.
- 24 simulated Worker assertions pass: live health compatibility, valid invite, reusable and replaceable recovery links, same-name device retirement, sitter ownership handoff, complete shared-state persistence, stale-version conflict, revocation, and administrative recovery.
- No permanent family or device credential is included in source, HTML, or the invite URL implementation.

Command: `npm test`

## SIMULATED

- Device A activation merged against stale Device B state remains active.
- Multiple current medications and feeding records survive normalization/merge independently.
- Local and remote audit entries remain exactly once after conflict merge.
- Pairing, invite consumption, conflict, revocation, and recovery run against an in-memory D1-compatible test double.

## STATICALLY CHECKED

- `setNextActivity -> onLocalPersist -> addActivity -> Store.save -> extract -> merge -> applyShared -> renderActivityLog` remains connected.
- Active sitter editing and ending require the owner device; viewing does not.
- Cache `v37` and query versions (`app/styles 33`, shared scripts 17) agree.
- Old caches are deleted; core files use network-first with cached fallback.
- Pairing tokens are temporary; device credentials stay in local storage and D1 stores only hashes.
- No Cloudflare deployment, live D1 mutation, Worker setting change, or secret creation was performed.

## REAL-DEVICE TEST REQUIRED

- Safari invite -> Add to Home Screen -> standalone PWA token handoff.
- Kill/reopen installed iPhone PWA and caretaker alert reappearance.
- iOS WebKit modal/checklist behavior and absence of black surface/freeze.
- Service-worker update arrival on an already installed PWA.
- Two physical devices synchronizing against the deployed Worker/D1.
- Existing connected device credential migration against the live legacy Worker secret.

## Result

Automated/simulated checks: **39 passed**. Syntax checks: **5 passed**. Real-device checks remain mandatory and are not claimed as passed.
