# Credit-card balance view

## What you will see
- A new "Card balance" view for each credit card, opened from the card in Wealth/accounts and from Financial Inbox Statements.
- Header: opening outstanding, total spends, total payments and refunds, current outstanding, and credit limit used.
- A running timeline, newest first: each spend raises the outstanding amount and each payment lowers it, with the balance shown after every line.
- Each payment shows its paying account (for example IDFC Krupa) and a status badge:
  - **Reconciled**: matched to a confirmed statement line.
  - **Unreconciled**: no statement match yet, a missing paying account, or a statement credit that has no matching ledger payment.
- An "Unreconciled payments" banner with a count and total. Tapping it filters the list. Each flagged row has a "Review" button that opens the existing statement review or entry, then brings you back here.
- Month filter and a statement-period selector, laid out for phone and iPad.

## Rules
- Only saved card payments, spends and refunds count. Nothing is posted, paired or changed automatically.
- Payments reduce what you owe and never count as income. Refunds reduce what you owe and are labelled separately.
- Reconciled status comes only from saved statement evidence, never from having opened an item.
- Amounts in other currencies use the saved converted values, with the original currency shown alongside.

## Technical details
- New pure module `src/lib/card-balance.ts` with `cardLedger(account, txns, statementRows)`. It returns running-balance lines, totals and a reconciliation status for each payment. It reuses `accountBalance` and `matchScore` from the ledger and expense logic and uses no new matching heuristics.
- New component `CardBalanceView.tsx` and route `src/routes/_authenticated/cards.$accountId.tsx` with its own head(). Links are added from WealthPanels and StatementInbox.
- Tests in `card-balance.test.ts`, one per rule:
  - A ₹50,000 payment lowers ₹75,000 owed to ₹25,000.
  - A payment never counts as income.
  - A payment without a statement match is flagged.
  - A statement credit without a ledger payment is flagged.
  - The running balance matches `accountBalance`.
- No database or schema changes and no publishing.
