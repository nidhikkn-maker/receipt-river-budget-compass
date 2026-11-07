# Plain-language coverage (non-accountant UIX)

Status as of this batch. Nothing here is marked done without the evidence named. Internal identifiers, database fields, exports and statutory/tax labels are intentionally unchanged.

## How this was audited
- Heuristic scan of visible JSX text and capitalised string literals in `src/routes/_authenticated/*.tsx` and `src/components/**/*.tsx` for: contra, debit, reconcile/reconciliation, posting/posted, accrual, payable, receivable, suspense, unallocated, allocation, capitalisation, depreciation, provenance, opening balance, liabilities, input credit, audit trail, settlement, ledger (excluding the brand name).
- Limits: dynamic strings built in `src/lib/*` (toasts, inbox reasons, review statuses) are only partly covered; the scan counts candidate lines, not confirmed user-visible jargon. Debit/credit and statutory terms may legitimately remain inside **Accounting details** and exports.

## Shared building blocks
- `src/lib/plain-language.ts` — copy dictionary, context-sensitive movement wording (own-account move only when both sides are your accounts), status guidance, statement stages, Canvas narrative, Indian date format. 12 tests.
- `src/lib/first-use-guide.ts` + `/start` — My money / Family / Business and six example journeys (receipt, own-account move, card bill, bank statement, asset, getting paid back). 5 tests.
- `AccountingDetails` (expert disclosure), `StageStrip` (Received → Reading → Organised → Needs your review → Saved, driven only by real status).

## Route checklist

| Route | Status | Evidence / what changed | Candidate jargon lines left in route file |
|---|---|---|---|
| /account-reconciliation | Converted in source, not screenshot-checked | Check my balances + Accounting details | 0 |
| /allocation | Converted in source, not screenshot-checked | Plan where income goes | 0 |
| /assets | Converted in source, not screenshot-checked | Things I own; value-change wording | 3 |
| /assistant | No flagged terms in route file (components not reviewed) | — | 0 |
| /assistants | No flagged terms in route file (components not reviewed) | — | 0 |
| /audit | Not reviewed yet | — | 6 |
| /brief | No flagged terms in route file (components not reviewed) | — | 0 |
| /budgets | No flagged terms in route file (components not reviewed) | — | 0 |
| /cards.$accountId | Converted in source, not screenshot-checked | Card charge vs card payment explained | 2 |
| /claim-submission | No flagged terms in route file (components not reviewed) | — | 0 |
| /classification-rules | No flagged terms in route file (components not reviewed) | — | 0 |
| /company-spending | No flagged terms in route file (components not reviewed) | — | 0 |
| /connections | No flagged terms in route file (components not reviewed) | — | 0 |
| /dashboard | Rendered-checked (fixture data) | Today with Getting started link — 390/1180/1440 px, no overflow | 0 |
| /drafts | No flagged terms in route file (components not reviewed) | — | 0 |
| /entities | No flagged terms in route file (components not reviewed) | — | 0 |
| /expenditure-statement | No flagged terms in route file (components not reviewed) | — | 0 |
| /expenses | Converted in source, not screenshot-checked | Renamed Activity; receipt browser cases pass | 0 |
| /family | No flagged terms in route file (components not reviewed) | — | 0 |
| /forecast | No flagged terms in route file (components not reviewed) | — | 0 |
| /forex-reconcile | No flagged terms in route file (components not reviewed) | — | 0 |
| /gst-check | No flagged terms in route file (components not reviewed) | — | 0 |
| /historical-import | No flagged terms in route file (components not reviewed) | — | 0 |
| /inbox | Rendered-checked (fixture data) | 3 groups, plain counts, tabs — 390/1180/1440 px, no overflow | 0 |
| /new | Rendered-checked (fixture data) | Canvas narrative (I found… / I think… / matching payment) — 390/1180/1440 px, no overflow | 0 |
| /offline-receipts | No flagged terms in route file (components not reviewed) | — | 0 |
| /patterns | No flagged terms in route file (components not reviewed) | — | 0 |
| /payment-methods | Not reviewed yet | — | 2 |
| /plan | No flagged terms in route file (components not reviewed) | — | 0 |
| /receivables | Not reviewed yet | — | 1 |
| /reconcile | No flagged terms in route file (components not reviewed) | — | 0 |
| /records-check | No flagged terms in route file (components not reviewed) | — | 0 |
| /reimbursement-settings | No flagged terms in route file (components not reviewed) | — | 0 |
| /report-centre | No flagged terms in route file (components not reviewed) | — | 0 |
| /report-status | No flagged terms in route file (components not reviewed) | — | 0 |
| /reports | Converted in source, not screenshot-checked | Position headings; export labels unchanged | 0 |
| /review | Converted in source, not screenshot-checked | Monthly review labels | 0 |
| /route | No flagged terms in route file (components not reviewed) | — | 0 |
| /rules | No flagged terms in route file (components not reviewed) | — | 0 |
| /search | No flagged terms in route file (components not reviewed) | — | 0 |
| /settings | Not reviewed yet | — | 1 |
| /shared | No flagged terms in route file (components not reviewed) | — | 0 |
| /start | Rendered-checked (fixture data) | Guide: 3 choices, 6 journeys, Family filter — 390/1180/1440 px, no overflow | 0 |
| /statement-accounts | No flagged terms in route file (components not reviewed) | — | 0 |
| /statement-crosscheck | No flagged terms in route file (components not reviewed) | — | 0 |
| /statements | Converted in source, not screenshot-checked | Stage strip, batch narrative, Undo wording; 14 Statement Desk browser cases pass | 1 |
| /strategy | No flagged terms in route file (components not reviewed) | — | 0 |
| /sync-queue | No flagged terms in route file (components not reviewed) | — | 0 |
| /tax | Converted in source, not screenshot-checked | Everyday layer + Accounting details; statutory labels kept | 3 |
| /transaction-review | No flagged terms in route file (components not reviewed) | — | 0 |
| /transfers | Converted in source, not screenshot-checked | Own-account moves explained | 1 |
| /travel-inbox | No flagged terms in route file (components not reviewed) | — | 0 |
| /trips.$tripId | Converted in source, not screenshot-checked | Who paid / paid back / settled | 0 |
| /trips.index | No flagged terms in route file (components not reviewed) | — | 0 |
| /trips | No flagged terms in route file (components not reviewed) | — | 0 |
| /upload-requests | No flagged terms in route file (components not reviewed) | — | 0 |
| /vault | No flagged terms in route file (components not reviewed) | — | 0 |
| /wealth | Rendered-checked (fixture data) | What I own / owe / total position + Accounting details — 390/1180/1440 px, no overflow | 0 |

## Shared components still containing candidate jargon

| Component | Candidate lines |
|---|---|
| trip/TripBudget.tsx | 15 |
| DocumentIntake.tsx | 9 |
| HistoricalBalanceVerification.tsx | 9 |
| books/AssetBooks.tsx | 7 |
| AccountStatementStatus.tsx | 5 |
| StatementEvidenceReview.tsx | 3 |
| books/TaxCentre.tsx | 3 |
| ClaimOrganisationAllocation.tsx | 2 |
| FinancialReview.tsx | 2 |
| ImportReconciliationHistory.tsx | 2 |
| InboxLegacyTools.tsx | 2 |
| StatementReconciliationSummary.tsx | 2 |
| books/MarketPanel.tsx | 2 |
| books/OpeningBalances.tsx | 2 |
| books/PropertyPanel.tsx | 2 |
| AccountForm.tsx | 1 |
| FundPortfolio.tsx | 1 |
| InvestmentReview.tsx | 1 |
| StatementEntry.tsx | 1 |
| StatementInbox.tsx | 1 |
| WealthPanels.tsx | 1 |
| books/DepreciationInboxCard.tsx | 1 |
| books/GstAdvances.tsx | 1 |
| trip/TripExpenseActions.tsx | 1 |

## Negative checks in place
- Own-account transfer is described as a move, never spending (plain-language tests).
- Card bill payment is explained as paying off earlier charges, not new spending (plain-language + guide tests).
- Missing evidence: Canvas says what it couldn't find and asks for confirmation instead of sounding certain.
- Three unmatched statement lines produce "I couldn't match these 3 payments".

## Not done yet (honest status)
- Components listed above, Audit, Payment methods, Receivables, Settings, DocuRepo and Business book screens still need wording passes.
- Toasts and validation messages built in `src/lib` not yet rewritten app-wide.
- No hosted or real-device check; all screenshots use isolated fixture data.
- Tamil/Hindi translations are not delivered; only text compatibility is preserved.
- Layperson-ready is **not** claimed.
