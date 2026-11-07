# V5.9 corrections and V5.9.1 account-status investigation

## Implemented account/type corrections
- Inbox selection can correct source account, receiving account and expense/income/refund/transfer/card payment/loan repayment/investment type.
- Exact record before/after preview includes account balance deltas (liability changes labelled owed), income/spending deltas, saved original currency/amount/rate and source reference.
- Explicit confirmation calls a dedicated atomic owner-scoped operation; nothing saves at selection or preview. Every edit increments a correction revision. One stale record aborts the entire batch. An operation ID replays safely without duplicate changes.
- Amounts, original amounts, FX, dates, narration, receipts, statement provenance, category and responsibility are not rewritten. Statement matching is reset and must be rechecked.
- Claimed, split and trip-linked type changes, incompatible/archived accounts, linked payment-method account changes, special workflow records and possible opposite-side duplicates are blocked for individual review.
- Original-currency principal/interest is required for a loan repayment, preserving stored-INR ledger calculations.
- Persistent owner-readable history includes before/after snapshots. Undo has its own explicit confirmation, checks every current revision, and restores all rows atomically. Later edits block restoration.
- Approved shared schema addition: migration 0041 adds one revision column, protected correction history, and apply/undo functions. No existing financial row was corrected in Cloud. Nothing was published.

## Root cause of account-status inconsistency
The old Accounts check read only ledger `reconciledAt` and manual statement-balance preference dates. It never read historical import batches, reviewed source balances, posting fingerprints or confirmed statement period. A click timestamp could make an account Current even without a statement balance; saved import/source review could be ignored. The single status conflated freshness with verification.

## New status rules
- Import processing uses saved batch lifecycle; `Imported` means successfully extracted into staging, not necessarily posted. Parsed/posted/exact-duplicate/unresolved counts are shown separately.
- Statement freshness uses reviewed actual period end and the account's configured thresholds. Upload and reconciliation click dates never freshen coverage. Missing reviewed period evidence stays Unknown.
- Balance Verified requires a reviewed reliable closing value matching the saved closing value and calculated INR ledger at the same cutoff. Missing balances remain Not Verified; foreign-currency comparison remains unavailable.
- Reconciled requires source opening/closing verification, correct liability arithmetic, both ledger cutoff balances matching, all statement rows matched to existing owner-visible ledger IDs with correct date/amount/currency/account direction, and no unaccounted ledger rows. Approval/exclusion alone never establishes a match. Financial corrections invalidate prior matches.
- Independent counts: total accounts, current statements, reconciled accounts, verified balances, requiring attention.
- Status is derived from persisted evidence and current ledger, not stored labels that can become stale. Polls every 20 seconds while visible and refreshes on focus/reconnect, with stale-response protection; failed evidence reads hide certification instead of showing an empty success.

## Observed before/after, read-only signed-in preview
Seven owner-visible configured accounts. The earlier supplied screenshot reported one Current and six Needs Review. New preview: 0 current statements, 0 reconciled accounts, 0 verified balances, 7 requiring attention.

| Owner-visible account | Saved historical import | Reconciliation now | Balance / freshness |
|---|---|---|---|
| IDFC Krupa | None linked in current import staging | Not Started | Not Verified / Unknown |
| HDFC Krupa | None linked | Not Started | Not Verified / Unknown |
| IDFC KR ENTERPRISES | One successfully parsed, dated batch; original source unchecked | Requires Review | Not Verified / Unknown |
| IDFC KRNA PVT LTD | None linked | Not Started | Not Verified / Unknown |
| IDFC MOVAC | One successfully parsed, dated batch; original source unchecked | Requires Review | Not Verified / Unknown |
| AMEX | None linked | Not Started | Not Verified / Unknown |
| HDFC CORPORATE ACCOUNT | None linked | Not Started | Not Verified / Unknown |

Historical ledger entries may have older statement references without retained import batches. They are preserved; their filenames never invent verified account coverage. All seven require actual confirmed source evidence before certification.

## Verification
- Isolated in-memory PostgreSQL executes the exact applied migration SQL: save/read-back, replay, undo, later-edit rejection, all-or-nothing rollback, owner isolation/RLS, payload abuse, target/claim checks and anonymous rejection.
- Controlled UI copy: choose type/account → preview → cancel (zero writes) → preview → explicit confirmation → read changed treatment → preview undo → confirm → original treatment read back. No Cloud writes.
- Pure ledger impact tests verify exact spending and liability changes, FX preservation and principal/interest proportions.
- Signed-in live preview: 40 selected records opened a financial preview with exact deltas and source references; Cancel used, never Confirm. Seven-account counts, details and 402px layout verified; no page errors or horizontal overflow.
- Initial correction full regression: 796 checks passed across 95 files. Continuation: 827 passing checks across 99 files, including fifteen controlled document scenarios; final test-only type fix verified separately. Completeness guards prevent offsetting unaccounted ledger entries or reset correction matches from certifying reconciliation.
- Cloud correction history remains empty. No transactions, files or historical opening balances were changed or duplicated by testing.

## Continuation completed
- New CSV and Excel processing extracts only explicitly labelled bank/account headers. Scanned PDF schema preserves bank/identifier/quote/page independently from balances and narration; existing staged rows/decisions are not overwritten or re-extracted.
- A dedicated account + coverage review shows source clues, ambiguous or mismatched candidates, explicit missing-identifier confirmation, original references and actual statement coverage. Identity and coverage have an exact preview and separate explicit save; source balances are not required to confirm coverage.
- Wrong-account imports are never reassigned. An explicitly confirmed source copy creates an unapproved import for a different owned active account or reuses an identical existing import. Original ledger/posting history stays intact.
- A protected server function reads owner records, computes the same tested rules, hashes canonical batch/account/row/post/ledger-revision snapshots and writes an immutable checkpoint. The database locks and verifies the exact snapshots before storing the result; ordinary clients cannot write or fabricate checkpoint results.
- Checkpoints include actual server timestamps. UI only certifies a saved checkpoint whose evidence still matches current records; later edits invalidate certification. Source review dates and upload times are not reconciliation dates.
- Independent statement identity validation now guards both server posting and the atomic import-post trigger. This additive shared-backend guard can also block old published posting code until statement identity is confirmed in preview; no deployed frontend was changed.
- Refresh listens for local completion events as well as visible polling, focus and reconnect. Reconciliation history reads the same saved-check evidence instead of trusting fingerprint-only arithmetic. Failed/incomplete repeated uploads reopen existing review and explain retry instead of silently duplicating batches.
- Exact migration 0042 and 0043 tests: owner confirmation persists, stale/unrelated writes denied, source/ledger unchanged, checkpoint replay idempotent, owner-only reads, ordinary checkpoint forgery denied, and unconfirmed atomic posting rejected.
- Controlled UI: preview/cancel causes no write, explicit identity/coverage save callback followed by independent saved-check callback and Requires Review read-back. Signed-in real preview opens/cancels evidence confirmation, accounts page reads back, desktop and 402px show no horizontal overflow or page errors; screenshots under /tmp/browser/v591.

## Remaining external validation, not certified complete
- Exact duplicates can match durable fingerprints or linked duplicate IDs; excluded rows remain unresolved. Paired movements are not merged automatically and need a separate reviewed model.
- Existing shared Cloud financial apply/undo and true cross-device persistence are not tested with writes because isolation is unavailable. The exact SQL and UI flow pass controlled isolated tests; this is not hosted end-to-end write acceptance.
- All fifteen document scenarios have controlled regression coverage (including simulated second-device canonical hashes), not actual cross-device Cloud acceptance. Representative statements/copies of all seven actual accounts, actual iPhone tests and hosted end-to-end writes remain blocked by missing safe test storage/source evidence.
- AI schema/prompt extraction for new scanned statements is implemented; actual provider output and missed rows were not exercised in this turn. No full production-readiness claim.
- Published frontend is unchanged. Approved additive shared schema changes: 0042 adds source identity/review, owner-readable immutable checkpoints and protected functions; 0043 adds an atomic posting identity guard. No financial records or historical balances were updated.