# Reconciliation storage and device acceptance

## Boundaries
- The main preview and both open drafts use the live Cloud database, confirmed through the surface listing and the new draft creation result on 1 November 2026.
- Creating a draft did not create isolated hosted storage. Never save synthetic financial records through those surfaces.
- Local test storage is disposable disk-backed PostgreSQL (PGlite) under the OS temporary directory. It has synthetic accounts, evidence and checkpoints only, no Cloud connection or credentials, and is removed after testing.
- Run `bash scripts/check-reconciliation-isolated.sh` for evidence confirmation, protected checkpoint persistence/reopen, owner isolation and calculation/confirmation coverage.
- These checks are not hosted end-to-end, cross-device, or physical Safari acceptance.

## Physical-device prerequisites — Blocked
1. A separately confirmed hosted test environment, with its own database, private files, authentication and test-only HTTPS URL. An owner account inside the live database is not equivalent to an isolated environment.
2. Physical iPad and iPhone access, or an authorised real-device testing service. None is connected to this workspace.
3. Synthetic test account and original sample statement only; no real financial records copied.
4. Do not publish or enable paid services to meet these prerequisites without explicit approval.

## Physical-device run sheet — Not run
Record device model, iOS/iPadOS version, Safari version, test URL, tester, UTC time, steps, expected result, actual result and redacted evidence for each check.

| Check | Expected | Status |
| --- | --- | --- |
| iPhone Safari: sign in and open Account Reconciliation | Test owner only; no live records | Blocked |
| Confirm statement identity and coverage separately | Selected account and original period retained; no balance adjustment | Blocked |
| Cancel preview then confirm reviewed evidence | Cancellation saves nothing; confirmation saves only approved evidence | Blocked |
| Run and save reconciliation check | Missing evidence remains unverified; complete source/ledger match yields expected result | Blocked |
| Close Safari, reopen and sign in | Same saved result, hash and original check timestamp | Blocked |
| iPad reads the iPhone's saved check | Same evidence/result, without duplicate checkpoint | Blocked |
| Change evidence on iPad while iPhone has an old preview | Stale save rejected; reload shows newer evidence | Blocked |
| Interrupt connection during save, reconnect and retry | Visible failure; retry creates no duplicate | Blocked |
| Sign in as unrelated test owner | Other owner's statement, file and checkpoint inaccessible | Blocked |
| iPad portrait/landscape, Split View and Stage Manager | Controls and confirmation usable without overlap | Blocked |
| iPad hardware keyboard/trackpad; iPhone touch/keyboard | Selection, focus, scrolling and buttons usable | Blocked |

Retain honest Blocked/Partial results until observed on real devices. Viewport screenshots cannot upgrade these results to Pass.