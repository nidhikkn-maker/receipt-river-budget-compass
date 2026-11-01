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

## Not implemented / not verified
- Reusable external recipient directory, payee associations, bulk external recipient save and third-party loan/advance treatment are still open requirements. They must not be simulated by internal destination accounts.
- The full 18-case acceptance demonstration and hosted save/reopen remain incomplete.
- Physical iPad/iPhone and cross-device checks are blocked: the new draft shares live data, no physical devices or real-device service is connected.
- No Cloud schema changes, sample Cloud records, financial edits, or production publication in this work.

## Evidence
- Local reconciliation suite: 44 checks passed, including disposable disk-backed PostgreSQL close/reopen and owner-isolated saved checkpoints.
- Initial classification suite: 15 checks passed, including controlled component preview/cancel/confirm/undo; additional financial regressions run with the full suite.
- These are controlled tests, not a hosted or physical-device end-to-end claim.