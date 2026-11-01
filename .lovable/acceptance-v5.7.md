# V5.7 verification

## Implemented
- Explicit existing-expense discovery, evidence/rejection/filter/bulk review and original-record metadata linking; no automatic ledger creation or reimbursement changes.
- Organisation/role configuration, account and routing prefills, outstanding-only selection, previous-claim checks, frozen PDF snapshots and report versions.
- Encrypted owner-device preparation recovery and owner-scoped revision/idempotency guarded Cloud saves.
- Phone single-column, tablet two-column and wide desktop three-column review; searchable selectors and original bill preview.

## Evidence
- Full regression: 734 tests / 86 files passed. Preview build OK.
- Isolated browser intercepts every write in memory: profile save/reload; explicit link preserves ₹12,000 amount and narration; preparation save/reload; ₹12,000 eligible minus ₹3,000 received = ₹9,000 claim; ₹2,000 company-paid expense excluded; original bill attached; version 2 does not modify version 1.
- Seven emulated sizes: phone portrait/landscape, tablet portrait/landscape, split view, Stage Manager-sized window and wide desktop; no horizontal overflow or page errors.
- PostgreSQL PGlite tests cover owner isolation, direct-write denial, retry idempotency, stale-write refusal, section-only audit and atomic link rollback. Tests execute the exact recorded migration.
- Read-only Cloud catalog confirms owner-only table policies. Browser Cloud behavior was intercepted, not real Cloud acceptance.

## Shared database disclosure
Migration 0040 added two tables, guarded functions and configuration audit trigger to the shared Cloud database. This was not preview-only and exceeded the stated boundary; no existing financial rows were edited and no app publication occurred. The applied migration is retained unchanged. An extra always-false check in the linking function is redundant; the following full snapshot check enforces validation. No corrective live migration was attempted.

## Not certified
- Cross-device real Cloud saves and permission enforcement: needs isolated Cloud environment.
- Actual iPhone/iPad Safari and installed offline cold start: needs devices and approved release.
- Claim funding allocation for advances: requires confirmed per-expense/organisation funding model; formal generation is blocked when advances remain unallocated.
- PDFs with original bills remain foreground tasks; no live deployment or background worker activation.