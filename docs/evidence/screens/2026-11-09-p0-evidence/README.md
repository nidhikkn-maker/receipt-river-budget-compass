# P0 financial-integrity evidence (9 November 2026)

Branch `p0/financial-integrity` (from `uix/screen-verification` 655cc9c). Local, isolated work only: no hosted services, no deploy, no commit.

## How the captures were made
- Dev server on 127.0.0.1:8081 with fixture Supabase settings (`https://fixture.supabase.invalid`). Every Supabase request was answered by Playwright with fixture rows, so no real records were used.
- Script: `scripts/browser/capture_p0_evidence.cjs` (`PHASE=before|after`), Chromium, devices iPhone 15 and iPad Pro 11. "Before" ran on the unchanged code (changes stashed); "after" ran on the fixed code.
- Failed reads return HTTP 500 with a PostgREST error body. (A 503 makes postgrest-js retry for a long time before it fails.)
- The statement Undo server function cannot reach a database from the dev server. The browser module is therefore replaced with one that answers exactly as the production server does when `statement_undo_receipts` / `undo_statement_rows` are missing. This is stated in the script header.
- Images are JPEG, longest side 720 px. `before-index.json` and `after-index.json` list the notes for each shot.

## Captures
| Finding | Before | After |
|---|---|---|
| P0-002 Statement Undo | `before-*-p0-002-statement-undo-offered.jpg`, `before-*-p0-002-statement-undo-pressed.jpg`: Undo is offered; pressing it shows "Safe Undo is awaiting database release approval" and leaves "Undo unfinished — retry to check remaining records and cleanup." | `after-*-p0-002-statement-undo-offered.jpg`: no Undo button; plain notice "Undo for statement uploads needs an approved database update…" |
| P0-003 Review History | `before-*-p0-003-review-history.jpg`: the restored batch is missing from history (Undo is not offered: not reproduced) | `after-*-p0-003-review-history.jpg`: restored batch listed as "Restored", with no Undo |
| P0-004 Demat holdings | `before-*-p0-004-demat-load-failed.jpg`: "No holdings yet" | `after-*-p0-004-demat-load-failed.jpg`: "Couldn't load your demat holdings." with Retry |
| P0-004 Report history | `before-*-p0-004-report-history-load-failed.jpg`: empty-history text | `after-*-p0-004-report-history-load-failed.jpg`: error with Retry |
| P0-017 Ledger read fails | `before-*-p0-007-home-load-failed.jpg` ("Nothing spent this month yet", "Nothing waiting for you"), `before-*-p0-007-transactions-load-failed.jpg` ("No expenses match these filters", ₹0.00 totals) | `after-*`: app-wide notice "Couldn't load your transactions. Nothing has been deleted…" with Retry, "Records not loaded yet", error in place of the empty list |

## Test evidence
- `repro-run-before-fix.txt`: all reproduction tests on the unchanged code (11 passed, each asserting the defective behaviour).
- `repro-store-load-failure.before.tsx.txt`, `repro-DematHoldings.before.tsx.txt`: the original reproduction sources. These two files were then turned into regression tests of the correct behaviour (`src/lib/store-load-failure.test.tsx`, `src/components/DematHoldings.load-error.test.tsx`).
- Database reproductions that stay as evidence: `src/lib/transaction-deletion.repro.test.ts` (P0-005a), `src/components/card-payment.repro.test.tsx` (P0-005b), `src/lib/statement-pipeline/statement-undo.repro.test.ts` (P0-002), `src/components/review-history.repro.test.ts` (P0-003).
- `regression-runs-after-fix.txt`: three runs of the touched and new tests after the fixes.

## Note on finding IDs (coordinator, 10 Nov 2026)
Two tracks numbered new findings in parallel. To keep IDs unique, this track's new findings were renumbered:
P0-007→P0-017, P0-008→P0-018, P0-009→P0-019, P0-010→P0-020, P0-011→P0-021, P0-012→P0-022, P0-013→P0-023.

The captured logs `repro-run-before-fix.txt` and `repro-store-load-failure.before.tsx.txt` are kept exactly as recorded, so they still use the original numbers.
