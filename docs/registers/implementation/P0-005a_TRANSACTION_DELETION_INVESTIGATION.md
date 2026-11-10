# P0-005a — Transaction deletion: investigation

Date: 9 November 2026 · Branch `p0/financial-integrity` (from `uix/screen-verification` 655cc9c) · Local isolated work only.
Status: **Reproduced - open (track: Phase 3 accounting).** Deletion behaviour was **not changed**, as instructed.

## 1. Summary

Deleting a ledger entry is a **hard delete**. The row leaves `public.expenses` permanently. Nothing reverses it and no tombstone or reason is kept. The only trace is one `transaction_audit` row that records the amount, date, type and title. Balances, reports and net worth change straight away, with no explanation. Several linked records are left pointing at the deleted entry. Receipt image files are erased from storage. Inside the app, the only way to get the entry back is a full restore of a backup taken before the delete.

Two safeguards do work:
- The closed-period guard blocks deletes inside a closed period.
- The owner cannot edit or remove the audit row.

Evidence: `src/lib/transaction-deletion.repro.test.ts` (4 tests, isolated PGlite with every applied migration 0000–0088, run as the signed-in owner under RLS with the exact statement the app sends). The run log is in `docs/evidence/screens/2026-11-09-p0-evidence/repro-run-before-fix.txt`.

## 2. Every delete path found

| Path | Code | Confirmation | What it does |
|---|---|---|---|
| Transaction detail → Delete | `src/components/ExpenseDialog.tsx:54-55` → `store.remove` `src/lib/store.tsx:591-594` | Browser `window.confirm("Delete this expense and its receipts?")`. The same wording appears for income, transfers and card payments. | `DELETE FROM expenses WHERE id=…`, then removes the receipt files from the `receipts` bucket. The storage result is not checked. |
| Duplicate pair → "Same — keep A/B" | `src/components/DuplicateCompare.tsx:27` → `store.remove` | In-app panel with a tick-box acknowledgement | Same hard delete and file removal |
| Undo opening balances | `store.undoOpening` → RPC `undo_opening_balances` (`drizzle/migrations/0061…sql:48-59`) | Button, no dialog | `DELETE FROM expenses WHERE id = ANY(txn_ids)`; sets `opening_postings.undone_at` |
| Statement Desk Undo (not installed) | `atomic-undo.functions.ts` → staged `undo_statement_rows` (`.lovable/staged-sql/statement-atomic-undo.sql`) | — | Would hard-delete posted rows. Today it fails because the function is missing (P0-002). The non-atomic fallback in `apply.ts:192-197` (`api.remove` per row) is not reachable from the UI, because `statements.tsx` always passes `atomicUndo`. |
| Delete all my data | `delete_my_finance_data()` (latest `0058_migration.sql`) | Typed in-app confirmation | Erases everything owned by the account (intended account erasure; out of scope here) |
| Demo clean-up cron | `src/routes/api/public/jobs/cleanup-demos.ts:21` | — | Service role deletes guest demo rows only |
| Team member with Finance or Manager role | RLS policy `"Team expenses: delete"` (`0066_role_access.sql:79`) using `can_access_expense(…, 'delete_expenses')` | — | Off by default (`role_permissions` seeds `delete_expenses=false`). Once an admin turns it on, a team member can hard-delete another person's entry with no step-up and no reason, and the audit row does not record who did it (test 4). |
| Offline queue → Discard | `sync-queue.tsx:91` → `discardPending` | In-app dialog | Removes an entry that never reached the cloud. It is not a ledger delete, but the entry is lost for good. |

No import rollback path deletes ledger rows. Historical import has no undo.

## 3. What the database does on `DELETE FROM expenses` (applied schema)

Triggers on `public.expenses` (introspected from PGlite):
- `a_lock_period_owner` (BEFORE): locks the owner's preferences row.
- `guard_closed_period` (BEFORE, `0058`): **blocks** a delete dated inside `books.closedPeriods`. Verified: "Entries dated 2026-04-10 are in a closed period".
- `expenses_audit` (AFTER, `0009` `log_transaction_change`): inserts **one** `transaction_audit` row: `action='deleted'`, `changes = {amount, expense_date, txn_type}`, `summary = title`. Its `owner_id` is the entry owner, and there is **no actor column**.
- `clear_empty_category_history` (AFTER, `0016`): when the owner's **last** entry is deleted, **all** of that owner's `category_batches` (bulk-category undo history) are deleted.
- No soft-delete column, no reversal row, no `finance_operations` record.

Foreign keys to `expenses(id)`:
- `expense_history.expense_id` **ON DELETE CASCADE**: approval and notes history is destroyed.
- `documents.transaction_id` **ON DELETE SET NULL**: the bill or statement document survives but is silently unlinked.
- `loans.source_transaction_id` **ON DELETE SET NULL**: the loan survives with its principal unchanged, but the link to its funding entry is lost.

Columns that reference entries **without** a foreign key, which are left dangling (verified):
- `import_posts.transaction_id`: the statement line stays marked "posted", so re-importing the statement will not bring the entry back.
- `expense_drafts.transaction_id`: the draft stays `status='saved'`, pointing at nothing.
- `transfer_links.debit_id / credit_id`: the link stays `linked`. If the debit side is deleted, the receiving side keeps `transfer_counterpart_of`. The ledger skips counterparts (`src/lib/ledger.ts:86`), so **the money disappears from the destination account's balance** (test 2: wallet ₹2,000 → ₹0).
- `category_batches.entries`, `financial_corrections.entries`, `opening_postings.txn_ids`: undo and evidence history refers to a missing row.
- `finance_preferences.data.statementUploads[].posted`: upload history still lists the entry as posted.
- `expenses.reimbursement.receipts[].txnId` (claim → money-back entry): if the money-back entry is deleted, the claim still shows the amount as received with no ledger entry behind it. If the claim is deleted, the reimbursement entry is orphaned.
- `period_operation_authority.transaction_id`, `preference_approvals.transaction_id`: references are left unchecked.

## 4. Lost permanently vs recoverable

| Item | After delete |
|---|---|
| Ledger row (account, to-account, category, split allocations, merchant, description, tags, payee, entity, trip, FX rate and original amount, statement match, reconciliation time, revisions) | **Lost.** Not in the database. |
| Amount (INR), date, type, title | Kept in `transaction_audit`. This is not enough to re-create the entry. |
| Who deleted, when, why | When only. No actor (even for team deletes), no reason. |
| Receipt files (`receipts` bucket) | **Erased** by `store.remove`. If removal fails, the files are orphaned without notice. |
| Approval history (`expense_history`) | **Erased** (CASCADE). |
| Linked documents | Kept, unlinked. |
| Bulk-category undo history | Kept, but dangling; **wiped entirely** when the last entry is deleted. |
| Device snapshot | Overwritten on the next refresh. Before the P0-017 fix, also by a failed refresh. |
| ZIP backup | Recoverable **only** if the person exported a backup earlier and restores it. No in-app path restores one deleted entry. |

## 5. Effect on balances and reports

Balances are derived from entries (`ledger.ts`), never stored. A delete changes account balances, net worth, cash flow, budgets, category reports, claims outstanding, card due amounts and statement reconciliation **immediately and without any explanatory entry**. Test 1 shows the bank balance rising by ₹1,200 with no reversal. Saved monthly reviews detect the change only through their data hash (stale flag). Saved report PDFs keep the old figures with no record of why the books moved. Closed periods are protected.

## 6. Requirements Phase 3 must satisfy (from the 14 P3 decisions, `docs/registers/master/p3_decisions.csv`)

1. **No physical delete of posted entries (DN-P3-10, DN-P3-1).** Remove `DELETE` on `expenses` for `authenticated` (including the team policy), and replace Delete with a *reverse and replace* operation. That operation creates a dated reversal linked to the original, keeps the original immutable, and records the reason, actor and time.
2. **Source evidence is never erased (DN-P3-10).** Receipt files and linked documents stay. `expense_history` must not cascade. `store.remove`'s storage removal must go.
3. **Closed periods (DN-P3-4, DN-P3-8).** A reversal of an entry in a closed period lands in the open period, or goes through an approved prior-period or controlled reopening flow. The period check must be entity-aware for both old and new posting paths.
4. **Linked records stay consistent.** A reversal must handle transfer links and counterparts (both sides reversed together or the link explicitly cancelled), loan funding links, claim receipts, draft links, `import_posts`, upload history and correction or undo history. Nothing may be silently converted or orphaned. Unresolved items become To-do or reconciliation exceptions (DN-P3-2).
5. **Reconciliation metadata only (DN-P3-11).** Unmatching or clearing a statement match must not change the amount, owner, date, GL or currency without a reversal.
6. **Atomic and idempotent.** Each reversal is one database transaction with a stable request id (same pattern as `finance_operation` or `confirm_transfer`), so a retry cannot double-reverse.
7. **Actor-attributed audit.** The audit trail must record the actor (owner or team member), reason and full before-image, not just amount, date, type and title.
8. **Undo flows use reversal.** Opening-balance undo, statement Undo (`undo_statement_rows`, staged) and duplicate removal must become reversals. The staged statement Undo SQL must be re-reviewed against DN-P3-10 before approval, because it currently hard-deletes.
9. **Team and guest limits (DN-P3-7, DN-P3-14).** Team members and guests cannot delete. Corrections by team members, if allowed, are reversal-only and attributed.
10. **Legacy conversion first (DN-P3-1).** Existing hard-deleted entries cannot be recovered. Phase 3 starts from the current state and must not invent balancing lines for them (DN-P3-2).
11. **Interim UI (until Phase 3).** Replace `window.confirm` with an in-app confirmation that states the consequences (balances change, receipts are erased, links are lost) and uses the correct type name. This is a UI change only and still awaits KK's go-ahead.

## 7. New findings raised from this investigation

These are recorded in `p0_defects.tsv` as "Identified - awaiting KK confirmation":
- Deleting one side of a confirmed transfer removes the money from the other account's balance (dangling counterpart).
- Deleting the owner's last entry wipes all bulk-category undo history.
- The audit row has no actor, so a team-member delete (once permitted) cannot be attributed.
