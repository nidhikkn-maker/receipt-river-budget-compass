# P0-034 Statement Desk Undo: withdraw, reverse or correct (never delete)

Status: fixed locally on `phase3/completion`, pending lead verification. Database change is **proposed only**
(`.lovable/staged-sql/proposed/P16_statement_undo_withdraw.sql` + rollback), tested in isolated PGlite, never applied.

Rule (KK, approved): rows the upload created that never posted are withdrawn (recoverable); posted rows get the P7
linked reversal; rows reconciled since go through correction; rows the upload only matched lose that match.

Tests: `src/lib/failure-injection.test.ts` describe "P0-034 ..." (U1-U6: the real Statement Desk `buildPlan` → `applyUpload`
→ `undoUpload` → `undoStatement` server function → P7 + P16 SQL over PGlite, faults injected at the request boundary) and
`src/lib/p16-statement-undo-sql.test.ts` (direct SQL).

| # | Requirement | Test(s) |
|---|---|---|
| 1 | Preserve original files, receipts, references, audit history, actor, timestamp, reason | U1 (row byte-identical apart from the withdrawal; statement_ref kept; original document + stored file kept; withdrawal `by`/`at`/`reason`/`source`; `statement_upload_reversals` reason + actor); P16 SQL "posted → linked reversal; unposted → withdrawn ..." (receipts, statement_ref, source) |
| 2 | Undo only what the import created; never withdraw matched pre-existing entries | U1 (matched bill: only match cleared, not withdrawn); U3 (second upload's Undo leaves the first upload's rows untouched); P16 SQL "refusals" (forged manifest listing a pre-existing entry as created → refused) |
| 3 | Idempotent across repeat Undo, retries, interrupted operations | U1 (repeat Undo answers from the receipt, history stays one event); U2 (injected `fail` → nothing changed; injected `lose` → durable receipt confirms, one receipt); U5 (replay after Restore does not re-withdraw); P16 SQL replay `replayed: true` |
| 4 | Withdrawn entries excluded from balances, spending, net worth, reports | U1 (`figures`: ledgerView balance/spent/net worth, report-jobs `loadOwnerReportData`, assistant facts back to 8,800.00 / 1,200.00); U2-U6 per-account figures |
| 5 | Restore only through an authorised validated operation | U5 (forged PATCH → `P10_WITHDRAWAL_ONLY_BY_FUNCTION`; other user → `P10_NOT_FOUND`; owner Restore with reason → counts again, history `withdrawn, restored`) |
| 6 | Older backup restores cannot reactivate withdrawn entries | U5 (backup taken before Undo restored with the real `guardedRestore` → still withdrawn, figures unchanged) |
| 7 | P7/P10 posting backfills skip withdrawn records | U6 (activate books after Undo → 0 posting events for Undo-withdrawn rows, journal balanced); P16 SQL (no posting event for withdrawn rows) |
| 8 | Reordered statements, same-name files, identical legitimate transactions, interrupted imports | U3 (reversed line order → every line meets its withdrawn entry, nothing added; different file with the same name → new entries); U1 (two identical same-day 2,999.00 purchases → two entries, both withdrawn); U2 (import interrupted at the 3rd save → Undo withdraws exactly the 2 confirmed rows; re-import adds the 2 never-created lines once) |
| 9 | Direct database/API failure-injection tests in PGlite | U2/U4 (fail/lose injection, direct `reverse_statement_upload` RPC → `P16_RECONCILED`, closed period → `P16_CLOSED_PERIOD`, probe removed → app refuses with `UNDO_NEEDS_UPDATE`, no write); P16 SQL (internal function not callable; withdrawn manifest row → `P16_WITHDRAWN`; rollback → P10 `P10_WITHDRAW_ONLY` fail-closed) |
| 10 | Historical and source evidence intact | U1 (statement_ref `document:<original> · ...` kept on every withdrawn row; source document and file kept); U4 (refused Undo leaves every row byte-identical); P16 SQL (reversed original byte-identical; catalog-exact rollback; Undo-withdrawn rows survive the rollback) |

## Statement line claims (P9) decision

`statement_line_imports` claims are **kept**, never released by Undo. Statement Desk does not write them (its identity is
the stable line id `stableId(account, line, occurrence)`); the Inbox flow keeps them so a line already brought in stays
"already imported". A re-import after Undo meets the withdrawn entry by its stable id: `applyUpload` skips it and reports
it (`withdrawnLines`, "restore it from Withdrawn entries"), and the server refuses a save of a withdrawn entry's id
(`saveExpense`). So a re-import neither duplicates nor silently reactivates; Restore entry (owner, reason) is the only way
back. Tests: U2, U3.

## Also fixed

Identical same-day lines without a running balance produced the same Statement Desk id, so the second legitimate
purchase was silently dropped. `stableId` now numbers identical lines in file order (`|#n` from the second; the first
keeps its existing id, so earlier uploads keep their identities). Test: U1.

## Not done / open

- KK review of P16; hosted or staging dry run of P7 + P10 + P16 together (P16 requires both).
- Without P16 installed the app offers no Undo for uploads that created rows (capability `needs-update`), by design.
- The Inbox "Forget last upload" only forgets line claims; it never touches entries, so it has no Undo path to change.
