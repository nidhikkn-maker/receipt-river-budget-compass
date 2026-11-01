# Combined plan: V5.10.3 classification and safe transfers, card balance, trip cancel/delete

Everything stays in preview. No live publishing, no automatic edits to past records, and no fake statement lines.

## Decisions needed before building
1. Earlier you chose **"Keep shared storage unchanged"** and **"don't link two matching transactions as one."** V5.10.3 asks for both: a recipient directory, loans and advances to outside people, and one transfer record linking two statement lines. Approving this plan replaces those earlier choices. A new storage addition is needed, and it comes with a backup and an undo path.
2. Deleting a trip only removes its links. Your entries are never deleted.

## Phase 1: Correct the classification form (Priority 1)
- A first question, "What is this transaction?", with 13 types: Expense, Income, Transfer between my accounts, Payment to third party, Card bill payment, Loan given, Loan received, Advance given, Advance received, Refund, Reimbursement, Investment, and Other.
- Each type shows only the fields it needs. An Expense asks for Paid from, merchant or payee, category, workspace, organisation, trip (optional), reimbursable, notes and bill. It never asks for a receiving bank account.
- Finding and fixing why saving fails in the Financial Inbox: required fields, account mapping, and type changes. Each error message says exactly what to fix.
- Once a save succeeds, the issue clears from the pending count. Ticking a checkbox or a failed save never clears an issue.

## Phase 2: Recipients and payees
- New section: Settings, then Financial Setup, then Recipients & Payees. It covers individuals, merchants, businesses and organisations, with optional UPI ID, bank details, default category and organisation.
- Recipients stay separate from your own accounts. They become selectable for Expense, Third-party payment, Loan given and Advance given.

## Phase 3: Safe internal transfers
- One transfer record links the debit line and the credit line. Both original statement lines stay as they are, and no extra money movement is created.
- Statuses: Proposed, Awaiting source, Awaiting destination, Partially matched, Matched, Reconciled, Conflict, Cancelled.
- Matching uses account, direction, currency, date, reference and narration, never amount alone. Ambiguous or conflicting matches always ask you.
- One-sided transfers wait for the other statement. When you upload it later, the match is suggested for you to confirm.
- A preview shows both lines and their effect: income and spend unchanged, and both account balances. Then you press Confirm transfer.
- Pressing confirm again does nothing extra, and a failed save rolls back completely.
- Transfers between different currencies keep both amounts, the rate and any fees.

## Phase 4: Cards, loans and advances
- Card bill payment: the bank goes down, the card balance owed goes down, and no expense is added.
- **Card balance view** for each card: opening amount owed, spends, payments and refunds, and current amount owed. A running timeline shows the balance after each line. Each payment shows the account it came from, plus a Reconciled or Unreconciled badge. An "Unreconciled payments" banner leads to Review, and Review returns you to this view.
- Loans and advances given or received go through the existing loan and advance calculations, never counted as ordinary spend or income. Repayments link to the original record.

## Phase 5: Bulk actions and the past-records audit
- Bulk selection: individual, all visible, all matching, merchant group, clear. Bulk actions: change type, category, organisation, account, recipient, internal transfer, mark card payment. Every bulk action goes through Review & Apply with a preview first.
- A **read-only audit from April 2026**: transfers counted as spend or income, duplicate transfers, double links, unmatched sides, wrong accounts, balance gaps, and missing currency details. The report shows masked accounts, how confident each finding is, and its money effect. You pick which corrections to apply, and each is previewed first.

## Phase 6: Trip cancel and delete
- The trip page's More menu, and each row in All trips, get Cancel trip, Restore trip and Delete trip.
- Cancel shows what it affects first, with an option to mark unpaid bookings cancelled. No entries are removed.
- Delete requires typing the trip name and only unlinks entries. It is blocked while a claim is submitted or an advance is unsettled.

## Phase 7: Layouts, progress and checks
- On iPhone: compact cards and a guided type picker. On iPad: list on the left, details on the right, in both orientations. On desktop: a table with a side panel and keyboard control.
- Clear progress messages: Analysing, Searching for match, Checking records, Saving, Failed with Retry.
- Tests for all 28 scenarios and the five required demonstrations, run on isolated test copies. Then a security review and a completion report.

## Technical details
- Additive migration: a `payees` table, a `transfers` table (owner RLS, unique links per statement line, status enum) and RPCs `confirm_transfer` / `cancel_transfer`. These use row locks, idempotency keys, revision checks and audit snapshots, following the pattern of the existing `finance_operation` and `apply_review_metadata`. A rollback script ships alongside.
- Pure modules: `classification-form.ts` (fields and validation per type), `transfer-match.ts` (evidence scoring, ambiguity refusal), `transfer-audit.ts` (read-only findings), `card-balance.ts`, `trip-lifecycle.ts`.
- PGlite isolated tests for the RPCs. Vitest for the pure rules, including a ₹4,500 expense with no destination, a ₹50,000 transfer that leaves income and spend unchanged, a ₹2,50,000 AMEX payment that reduces the amount owed with no expense added, and a ₹25,000 loan recorded as receivable.
