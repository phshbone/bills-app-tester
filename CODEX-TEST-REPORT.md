# Frannie Codex test report

## PROVEN

- JavaScript syntax passes for `app.js`, `shared-care-core.js`, `shared-care.js`, `sw.js`, and `worker/src/worker.js`.
- 18 executable state/structure assertions pass: sitter merge persistence, owner/session fields, two simultaneous medications, two same-category current foods, append-only audit union, audit de-duplication, all-current sitter filters, session-only checklist, no credential in invite URL, simplified modal state, and PWA asset/cache alignment.
- 12 simulated Worker assertions pass: valid invite, device credential issuance, used invite rejection, invalid invite rejection, authenticated write/read contract, stale-version conflict, revocation, rejected revoked credential, and administrative recovery invite.
- No permanent family or device credential is included in source, HTML, or the invite URL implementation.

Command: `npm test`

## SIMULATED

- Device A activation merged against stale Device B state remains active.
- Multiple current medications and feeding records survive normalization/merge independently.
- Local and remote audit entries remain exactly once after conflict merge.
- Pairing, invite consumption, conflict, revocation, and recovery run against an in-memory D1-compatible test double.

## STATICALLY CHECKED

- `setNextActivity → onLocalPersist → addActivity → Store.save → extract → merge → applyShared → renderActivityLog` remains connected.
- Active sitter editing and ending require the owner device; viewing does not.
- Cache `v35` and query versions (`app/styles 31`, shared scripts 15) agree.
- Old caches are deleted; core files use network-first with cached fallback.
- Pairing tokens are temporary; device credentials stay in local storage and D1 stores only hashes.
- No deployment, live D1 mutation, GitHub write, or secret creation was performed.

## REAL-DEVICE TEST REQUIRED

- Safari invite → Add to Home Screen → standalone PWA token handoff.
- Kill/reopen installed iPhone PWA and caretaker alert reappearance.
- iOS WebKit modal/checklist behavior and absence of black surface/freeze.
- Service-worker update arrival on an already installed PWA.
- Two physical devices synchronizing against the deployed Worker/D1.
- Existing connected device credential migration against the live legacy Worker secret.

## Result

Automated/simulated checks: **30 passed**. Syntax checks: **5 passed**. Real-device checks remain mandatory and are not claimed as passed.
