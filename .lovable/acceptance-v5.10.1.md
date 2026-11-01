# V5.10.1 — Partial implementation, 1 November 2026

## Root cause observed in source
FinancialCorrectionPanel always displayed both internal account selectors for every transaction type. The financial preview already required destination only for ledger movement types, so this was misleading form behaviour, not evidence that expense categorisation requires two accounts. Category-only changes continue through the separate protected category/metadata paths. No claim is made that every reported classification failure is resolved.

## Implemented
- Account fields now follow selected or homogeneous existing transaction type.
- Expense has payment account/card only. Incoming money has a single receiving account.
- Internal movement has destination; card settlement targets active credit cards, loan repayment targets supported loan/liability accounts.
- Existing loan repayment type exposes split fields without requiring a type change.
- Type switching clears incompatible local destination/split choices, never mutates confirmed records.
- Mixed existing types require separate review or an explicitly selected target type before preview.
- Existing exact financial impact, snapshot checks, confirmation, audit and undo remain authoritative.
- Added searchable recipient directory in owner preferences, all five recipient types, optional identifiers and owner-verified account details, organisation/category preferences and reviewed create/edit/archive. New-entry selection explicitly fills merchant/payee name only; no owned account or automatic classification is created. This is not a stable ledger payee-ID association.
- Combined category/workspace/organisation/activity review saves through one existing atomic metadata operation, preserving source money and excluding incompatible claims/splits/types.

## Not implemented / not verified
- User decision: keep shared storage unchanged. No new protected payee-linked financial save support will be added under this request; recipient management and existing classification previews remain available.
- Stable ledger payee associations, bulk external recipient save and third-party recoverable loan/advance treatment remain blocked on coordinated protected schema/API changes; the current shared database cannot be changed under this brief. Existing travel advances mean advances received, not loans issued, and must not be relabelled to fake support.
- The full 18-case acceptance demonstration and hosted save/reopen remain incomplete.
- Physical iPad/iPhone and cross-device checks are blocked: the new draft shares live data, no physical devices or real-device service is connected.
- No Cloud schema changes, sample Cloud records, financial edits, or production publication in this work.

## Evidence
- Latest full regression: 884 tests / 111 files passed; latest build log is build OK. Controlled recipient save/reopen and combined classification confirmation passed; production data was not used for writes.
- Local reconciliation suite: 44 checks passed, including disposable disk-backed PostgreSQL close/reopen and owner-isolated saved checkpoints.
- Full regression: 872 checks passed across 109 files. Two additional expense/destination regressions were then verified in the 10-check financial correction suite. Current app build log: build OK.
- Controlled component preview/cancel/confirm/undo passed; no actual Cloud correction was exercised.
- These are controlled tests, not a hosted or physical-device end-to-end claim.
- Signed-in browser: recipient form → preview → cancel verified at 1280×1800, 820×1180, 1180×820 and 402×874; no overflow or page errors. No hosted writes. Screenshots: /tmp/browser/payees/. Physical checks remain Blocked.

## Requested 18-case register
| Case | Status | Evidence / limitation |
| --- | --- | --- |
| UPI merchant payment | Partial | Existing one-account expense rules and explicit payee selection; no hosted payment written |
| NEFT external individual | Partial | Directory accepts individual without bank details; stable ledger association unavailable |
| Business supplier | Partial | Business directory entry and combined category/workspace preview |
| Own-account transfer | Pass (controlled) | Financial correction/ledger tests require two different active accounts, zero expenditure |
| AMEX dues | Pass (controlled) | Card-target filtering, impact/duplicate guards and correction SQL retry/undo |
| Personal expense | Pass (controlled) | Expense has no destination; original source and spending preserved |
| Business expense | Partial | Combined workspace/category guarded metadata; hosted acceptance not run |
| Official paid personally | Partial | Combined workspace/organisation; claim eligibility not granted automatically |
| Loan to another individual | Blocked | Outgoing receivable model and protected API not available under no-shared-change boundary |
| Recoverable advance issued | Blocked | Existing advances are received travel advances, not issued counterparty receivables |
| Incoming reimbursement | Partial | Existing dedicated workflow/ledger tests; not exposed as an unsupported correction |
| Unknown counterparty | Pass (controlled) | Blank unknown details retained; invalid unnamed directory entries rejected |
| Bulk category assignment | Pass (controlled) | Existing atomic metadata/category SQL and component preview/confirmation |
| Type change | Pass (controlled) | Type-aware fields and original-record-preserving correction tests |
| Save/reopen corrected transaction | Partial | Isolated SQL persistence/retry covered; hosted read-back unavailable |
| Inbox issue closure | Partial | Existing evidence-based review tests; no manual dismissal masquerades as resolution |
| No duplicate expenses | Pass (controlled) | Existing correction idempotency SQL and unchanged ledger on directory save |
| Account reconciliation | Partial | Local stored checkpoint reopen/owner isolation passes; real-device hosted run blocked |

No controlled Pass is a production or physical-device readiness claim.