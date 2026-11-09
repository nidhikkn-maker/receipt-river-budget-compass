# Phase 3 posting inventory (V4 FND-01, first bullet), 2026-11-10

**Scope.** Every financial write path in the app and the database, the events they create, the derived reports that read them, and how the proposed P7 posting layer covers each one. Worktree `phase3/balanced-accounting` (from `a8a6a50`). Nothing was run against a hosted database.

**How this was built.**
- **App side:** `grep` of every `.from("expenses")` write and every RPC call under `src/` (tests excluded).
- **Database side:** the PGlite catalog after 0000–0088 + P1 + P2 + P4 + P5. Every `public` function whose source contains `INSERT INTO / UPDATE / DELETE FROM public.expenses` was listed (`src/test/tmp-p3` probe, since removed), together with every trigger on `expenses`, `finance_preferences`, `opening_postings` and `documents`.

**Single ledger.** `public.expenses` is the only economic-event ledger (DN-04 option A). P7 adds no second ledger. It posts the double entry of each `expenses` row through ONE function, `phase3_p7.write_batch`, fired by the `zz_p7_sync_postings` AFTER trigger. Because every path below ends in an `expenses` write, every path is covered without per-path code. The only exceptions are manual journals and reversals, which call the same `write_batch` directly.

## 1. App write paths (client → server/database)

| # | Path (file:line) | Database object reached | Economic event | Covered by P7 |
|---|---|---|---|---|
| A1 | `store.save` `src/lib/store.tsx:358` → `saveExpense` `src/lib/fx.functions.ts:66` (insert/upsert/update `expenses` at :116–:119) | `expenses` INSERT/UPDATE | New, edited or retried entry (stable `createId` = draft id / statement line id) | Yes, by trigger. Retries carry the same id and post once. Edits post a reversal plus a replacement (DN-P3-1). C11 server check added at `fx.functions.ts:74` |
| A2 | Offline queue `store.tsx:366` → later A1 | same as A1 | Entry saved offline | Yes (via A1) |
| A3 | `store.remove` `store.tsx:596` (formerly hard `DELETE` at :591) | `expenses` DELETE, or `reverse_ledger_entry` | Removal of an entry | **Changed.** Capability check: missing function or inactive owner = delete as today. Active owner = audited reversal (reason + step-up). The database refuses a posted delete (`P7_POSTED_ENTRY`) |
| A4 | `ExpenseDialog` delete `src/components/ExpenseDialog.tsx` (was :54 `confirm` + `remove`) | A3 | User removes an entry | **Changed.** Shows "Reverse entry" with a reason dialog when posting is active |
| A5 | `DuplicateCompare.drop` `src/components/DuplicateCompare.tsx:27` | A3 | Duplicate removal | **Changed.** Passes the reason "Duplicate of entry … (kept)" |
| A6 | `store.setScope/setTags` `store.tsx:610/614` | `expenses` UPDATE (metadata) | None (presentation) | Trigger re-derives; no new batch (DN-P3-11) |
| A7 | `store.setReimbursement/setAllocations/recordReimbursement` `store.tsx:642/648/658` | `expenses` UPDATE (allocations change category legs) | Re-classification | A reversal plus a replacement when the category split changes |
| A8 | `store.reconcile` `store.tsx:689` | `expenses.statement_ref/reconciled_at` | Statement evidence link | No new batch. The `statement_row` source is bound; a second binding is refused (`P7_DUPLICATE_SOURCE`) |
| A9 | `finance_operation` `store.tsx:676` (reimbursement, claim receipt, loan payment, commitment, EMI conversion, yearly bill) | 0011/0015 `finance_operation`, `receive_claim_receipt` INSERT/UPDATE | Money movements | Yes. The operation key stops a second entry, and the entry id stops a second posting (tested: claim receipt) |
| A10 | `correct_financial_entries` / `undo_financial_correction` `store.tsx:566/578` | 0041/0045 UPDATE | Corrections | A reversal plus a replacement per changed entry |
| A11 | `bulk_category_change` / `undo_category_change` / `move_expense_category` `store.tsx:542/553/535` | UPDATE | Category moves | A reversal plus a replacement (tested: `move_expense_category`) |
| A12 | `apply_review_metadata` / `undo_review_metadata` `store.tsx:587/590` | UPDATE (payee and other metadata) | None | No new batch |
| A13 | `confirm_transfer` / `cancel_transfer` `store.tsx:573/576` | UPDATE `transfer_counterpart_of`, `txn_type`, `to_account_id` | Transfer pairing | The counterpart's own posting is reversed. Its evidence binds to the debit's event, so the movement counts once (tested) |
| A14 | `manage_trip_expenses`, `link_activity_expenses` `store.tsx:618/625`, `ClaimExpenseDiscovery.tsx:22` | UPDATE (tags, trip) | None | No new batch |
| A15 | `post_opening_balances` / `undo_opening_balances` `store.tsx:499/512` | 0061: INSERT adjustment entries, then `opening_postings` | Opening balances | Posted as an `opening` batch only with a source document (DN-P3-3). The new `zz_p7_sync_opening` trigger is needed because the row arrives after the entries. **Undo of a posted opening is refused** (`P7_POSTED_ENTRY`): reverse it instead |
| A16 | Statement Desk `applyUpload` `src/lib/statement-pipeline/apply.ts:85` via `statements.tsx:229` (`apply`; button now at :718) → A1/A8 | A1, A8 | Statement rows | Yes. **C11**: approvals stamped per row, the old one-tap "Apply everything" removed |
| A17 | Statement atomic Undo `undo_statement_rows` `atomic-undo.functions.ts:46` (staged authority) | DELETE/UPDATE of rows | Upload undo | Pre-activation: unchanged. **After activation, deleting posted rows is refused**; Undo must become per-row reversal (listed in Remaining) |
| A18 | Historical import `post_import_rows_secure` `historical-import.functions.ts:64` | 0031/0037 INSERT (+ `import_posts` fingerprints) | Imported statement rows (explicitly reviewed) | Yes, by trigger. The fingerprint and `statement_row` source give one effect |
| A19 | `commit_document_intake_reviewed` `store.tsx:491` | document intake (no expense write in 0088) | Documents | Evidence only |
| A20 | `restore_finance_backup` `settings.tsx:118` | 0072 INSERT of missing rows | Restore | Pre-activation: unchanged. Active owner: restored new rows post as new events (keyed by entry id, so they never post twice); journals are never copied (DN-P3-9) |
| A21 | `start_demo_workspace` `auth.tsx:161` | INSERT demo rows | Guest demo data | Guests can never activate (DN-P3-14 B), so nothing posts |
| A22 | Demo cleanup cron `src/routes/api/public/jobs/cleanup-demos.ts:21` (service role) | DELETE guest rows | Cleanup | Unaffected (guest owners are never active) |
| A23 | `delete_my_finance_data` `delete-data.ts:27` | DELETE all owner rows (`ledgerline.erasing`) | Erasure | P7 rows cascade; all guards honour erasure (tested) |
| A24 | `change_accounting_period` `audit.tsx:73` | 0084: `finance_preferences` + `period_close_evidence` | Period close/reopen | **Changed** (DN-P3-13): active owners cannot close a period that has unposted, exception or awaiting-review entries; the evidence of every close and reopen carries a posting snapshot |
| A25 | Foundation journal UI `post_accounting_journal`, `set_accounting_review_grant`, `review_accounting_exception` `store.tsx:509/520/524` | Not installed anywhere (`accountingAvailable()` probes `accounting_journal_evidence`) | Manual journals | Stays fail-closed, as in production. The P7 replacement is `post_journal_batch` / `reverse_journal_batch`; the UI mapping is listed in Remaining |

## 2. Database write objects on `public.expenses` (0088 + P1 + P2 + P4 + P5 catalog)

| Object | Write | Security | P7 effect |
|---|---|---|---|
| `finance_operation(text,jsonb)` (+ P4 `__unguarded`) | INSERT | invoker | Trigger posts |
| `receive_claim_receipt(...)` | INSERT, UPDATE | invoker | Trigger posts the reimbursement as a contra-expense, never income |
| `post_import_rows(uuid,jsonb)`, `post_import_rows_secure(uuid,uuid,jsonb)` | INSERT, UPDATE | invoker/definer | Trigger posts |
| `post_opening_balances__unguarded` | INSERT | definer | Opening batch via `zz_p7_sync_opening` |
| `start_demo_workspace__unguarded` | INSERT | definer | Never active (guest) |
| `apply_review_metadata`, `bulk_category_change`, `cancel_transfer`, `confirm_transfer`, `correct_financial_entries`, `link_activity_expenses`, `manage_trip_expenses`, `move_expense_category`, `undo_category_change`, `undo_financial_correction`, `undo_review_metadata`, `reconcile_expense`, `review_expense` | UPDATE | definer/invoker | The trigger re-derives: unchanged, or a reversal plus a replacement |
| `commit_entity_backfill__unguarded`, `reassign_account_entity__unguarded` (P5) | UPDATE (`legal_entity_id` link only) | definer | Re-derives. An account moved to another entity reverses and replaces affected entries **only for entries the trigger touches**; re-sync for others is through preview/commit (DN-P3-12) |
| `delete_my_finance_data__unguarded` | DELETE (erasing) | definer | Cascade; guards honour erasure |
| `undo_opening_balances__unguarded` | DELETE | definer | Refused for posted openings |
| Triggers on `expenses` | `a_lock_period_owner`, `guard_closed_period` (P5 entity-aware), `validate_category_allocations`, `validate_finance_expense`, `zy_p5_link_legal_entity`, `zz_guard_shared_expense_edit`, `expenses_audit` (→ `transaction_audit`), `correction_revision_before_update`, `category_revision_before_update`, `clear_empty_category_history`, `guard_team_expense_edit` | | P7 adds `p7_guard_posted_delete` (BEFORE DELETE) and `zz_p7_sync_postings` (AFTER, last) |

**Other posting-like objects already applied.**
- `opening_postings` (0061): opening runs.
- `period_close_evidence` (0070/0084): close snapshots.
- `finance_operations` (0011): idempotency.
- `transfer_links` (statement pairing).
- `import_posts` / `statement_line_imports`: fingerprints.
- JSON `finance_preferences.data.books.{journals, assetEvents, closedPeriods, periodLog, rules}`, guarded by `guard_journals_rules` (P5 entity-aware).

P7 keeps all of them unchanged. Asset depreciation journals in JSON stay the asset register's own records. They are not posted by P7, and they are listed as residual in the plan.

## 3. Events and derived reports (read side; unchanged by P7)

| Report | Source | Notes |
|---|---|---|
| Balances, cash flow, net worth | `src/lib/ledger.ts` `accountBalance` (:82), `cashflow`, `position.ts` | Browser-side pure functions over `store.transactions`. Reversed entries leave `expenses`, so these stay correct with no change |
| Company statements | `src/lib/books/corporate-statements.ts`, `accounting-journal.ts`, `accounting-post.ts` | TypeScript double entry for companies. P7's derivation differs only where V3.1/DN-P3-2 require exceptions instead of `unclassified` lines |
| Reports Centre, PDFs, exports | `src/lib/reports.ts`, `report-jobs.server.ts` | Unchanged |
| Assistant / MCP facts | `assistant-facts.server.ts`, `src/lib/mcp/tools/*` | Read-only. RLS plus P4 assistant policies apply to the new tables |
| Period close evidence | `change_accounting_period` (0084) | Now includes postings for active owners |
| **New: P7 reconciliation** | `posting_reconciliation_report()` | Journal vs legacy ledger for each entity, account, currency and period. Every difference is listed with the entries that explain it; nothing is auto-fixed |

## 4. Gaps found during the inventory (inputs to the plan)

1. **Hard delete.** `store.tsx` (old :591) deleted `expenses` rows and their receipt files with no trace. P0-005a was not yet written at `/home/user/thapal-p0/docs/registers/implementation/`, so this was investigated directly. P7 now refuses deletes of posted entries and archives the full row on reversal.
2. **One-tap batch save.** `statements.tsx:710` saved `plan.totals.auto + accepted` in one tap, and `:711` "Accept all N asking items" bulk-ticked every suggestion. Both are removed (C11).
3. **Opening insert order.** `post_opening_balances` writes entries before their `opening_postings` row. A dedicated sync trigger handles it.
4. **Personal-only closed periods.** The legacy guard (P5 `p5_entry_closed`) cannot express a personal-only period. P7 uses identical semantics (tested) rather than diverging.
5. **Foundation UI.** The foundation journal and accountant UI call RPCs that exist nowhere. It remains fail-closed.
