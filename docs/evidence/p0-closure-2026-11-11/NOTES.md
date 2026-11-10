# P0 closure — Track A (financial integrity) progress notes, 10–11 Nov 2026

Worktree /home/user/thapal-p3c, branch phase3/completion fast-forwarded to integration/phase2-3-p0 (c397e1b). Nothing committed or pushed.
PGlite only; never a hosted DB.

## 1. RB-STM-01 (P0-027 residual) — DONE (tests green)
KK binding: "Use stable source identity including account/workspace scope and content evidence, not filename alone."
- Before: `statementLineRef(file, line, fp)` = `file · date · description · dir amount[ · #n]` — no account, and the file name
  was part of P7's statement_row source key. Before-run: rb-stm-01.before.txt (2c: P7_DUPLICATE_SOURCE for account B; 2d: the
  line's reference collided with the same line already posted in another account by test 2/3, so statement_ref stayed NULL).
- Fix: `statementLineSourceRef(fingerprint)` (src/lib/statement-fingerprint.ts) derived ONLY from the fingerprint:
  `Statement line · <date> · <dir> <amount> · <ref N | normalised narration>[ · #n] · account <account id>`.
  File name not an input. Scope: P7 keys sources per owner; account id is a global uuid that fixes its entity/workspace
  (copying the editable entity assignment into the key would make it unstable). Over-long narration shortened with a hash suffix.
- Old refs: never rewritten — registerStatementDrafts reads the references entries already hold (one batched read, fails closed
  before any save) and keeps them; `statementRefOrigin` keeps inbox.ts wording for both formats.
- Residual: none known. File name still kept in statement_line_imports.file_label (display only).

## 2. RB-LED-01 (P0-005a unposted path) — DONE (tests green; P10 proposed only)
KK binding: Withdraw only for unposted AND unreconciled entries; posted -> Reverse, reconciled -> correction; enforced server-side.
- Representation: expenses.receipt_details.withdrawal {state, at, by, reason, history[]} (src/lib/withdrawal.ts). Works on
  today's schema; every UPDATE bumps correction_revision so revision-checked flows (Statement Undo, corrections) refuse.
- Single reader path: ledgerView drops withdrawnAt rows; txnFromRow/LEDGER_COLUMNS, store (LITE alias + full rows),
  report-jobs, assistant-facts, statement-checkpoint, MCP list-transactions (filtered), push (txnFromRow on select *).
- Server authority: src/lib/withdrawal.server.ts changeWithdrawal + withdrawal.functions.ts setEntryWithdrawal: P10 RPC when
  installed, else the same checks (owner, reason, posted via posting_events, reconciled_at/statement_ref, reversal history,
  linked transfer, idempotent repeat) + revision-checked update. saveExpense refuses edits of withdrawn entries and keeps the
  history on edits of restored ones.
- store.remove: reverse (P7 posted) or withdraw (reason); no DELETE, no storage remove. UI: "Withdraw entry"/"Restore entry"
  with reason (ConfirmDialog); reconciled entries are offered Edit (correction) only; Withdrawn list on /expenses.
- Statement Desk Undo (atomic-undo.ts) refuses when an upload entry is withdrawn.
- P10 SQL (+rollback): withdraw_entry/restore_entry, p10_guard_withdrawal, p10_withdraw_only (DELETE), no TRUNCATE,
  undo_opening_balances (P4's __unguarded body when P4 is installed, wrapper kept) withdraws. p10-withdrawal-sql.test.ts 3/3.
- New defects registered: P0-032 (cross-account restore kept source ids inside statement references; fixed), P0-033 (older same-account backup reinstates a withdrawn entry; closed by P10, pre-P10 gap), P0-034 (staged/P7 Statement Undo deletes never-posted rows; fails closed under P10, KK decision pending).
- Why receipt_details and not columns (design): it exists on today's schema, so the app is safe BEFORE any SQL; readers already
  select receipt_details (narrow alias receipt_details->withdrawal); one source of truth during rollout (same reasoning as P9 for
  recordArchive). P10 makes it database-enforced. Columns (withdrawn_at/by/reason) were considered and rejected for that reason.
- Consistent with decision 1: the user never physically removes a record; reversal stays the path for posted entries.
- Before-run: rb-led-01.before.txt (removeEntry temporarily = c397e1b store.remove: W1 fails with DELETE sent / P10 refusal).
- Found by the API tests: P10's guard trigger first ran as the caller and hit "permission denied for schema phase3_p10" on every
  signed-in INSERT on the full stack; fixed (SECURITY DEFINER, nested IF) before reporting.
- API-level tests (PostgREST-shaped requests as the signed-in user over PGlite, real server function handler): failure-injection
  W1-W3 (pre-P10 and P10), W4 (P1..P9 and P1..P9+P10); SQL-level: p10-withdrawal-sql.test.ts.
- Open: R-P10-1 (P7 backfill must leave withdrawn entries unposted; P7 does not read the withdrawal today); P0-034.

## 3. Cross-account restore integrity — DONE
- New test backup-restore-sql.test.ts "cross-account restore integrity": hand-calculated balances (HDFC Savings 1,059,216.50,
  HDFC Visa due 16,600.00, KR Current 111,694.92, Fixed assets 112,000.00, USD wallet 0), net worth 1,266,311.42, loan
  outstanding 950,000.00, claims outstanding 0.00, equal on B's restored copy; zero A row ids in B (verbatim archives excepted);
  statement refs (line and document) and Statement Desk evidence/undo refs follow B's rows; recordArchive ids follow rows;
  withdrawal history kept; A byte-identical; a failed restore (invalid last row) leaves A and B unchanged.
- Defect found and fixed: P0-032 (before: p0-032-restore-refs.before.txt). backup-remap.ts embedded rules for
  expenses.statement_ref and statementUploads[].evidence[].ref / undoRows[].ref; fixture statement_ref carries a document id.
- "duplicateReview.matchedIds": no such stored field exists in the codebase (matchedIds is computed in
  account-statement-status.ts from import rows); nothing to remap. P9 entry_ids: statement_line_imports is not backed up
  (BACKUP_EXCLUDED_TABLES), so nothing is restored; a re-import into B relies on duplicate review (possibleDuplicates).
- P0-033 recorded (older same-account backup reinstates a withdrawn entry on today's schema; P10 keeps it).

## 4. Register — p0_defects.tsv: P0-005a, P0-027 updated; P0-032, P0-033, P0-034 added (11 columns, 33 rows).

## 5. P0-023 repeated backup restore + P0-033 + R-P10-1 — DONE (11 Nov, after ff to 50fdc0d)
- Note: the register's P0-023 row was about undo_financial_correction replay; KK's decision is about backup restore. Backup
  restore is implemented; correction-undo replay remains UI-mitigated (flagged to lead).
- App: src/lib/restore-guard.ts guardedRestore (Settings → Restore). Fingerprint = SHA-256 of the planned payload without staged
  paths / restoreHistory. P11 present → restore_finance_backup_checked decides; else history in owner preferences
  (restoreHistory, written inside the same restore). Repeat → previously_restored, nothing written; "Restore again" needs a
  reason; recorded. P0-033: stored withdrawals win (withdrawn row kept as stored; restored row keeps its history).
- P11 SQL (+rollback): backup_restore_receipts (append-only for clients), restore_finance_backup_checked, phase3_p11
  payload_fingerprint / keep_withdrawals, check injected into the current restore_finance_backup (P4 step-up kept);
  rollback restores the saved definition, refuses while receipts exist unless approved.
- Finding: with P10 alone, a direct restore that re-stages receipt paths onto a withdrawn entry fails closed (P10_WITHDRAWN);
  guardedRestore avoids it by keeping the stored row.
- R-P10-1: P7 derive_entry skips withdrawn entries (one guarded line in P7_balanced_posting.sql). W5 before/after.
- Before-runs: p0-023-033-restore.before.txt, r-p10-1-backfill.before.txt.
