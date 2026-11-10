# Cross-module consistency check (Track D, 10 Nov 2026)

Test: `src/lib/cross-module-consistency.test.ts`. A single set of raw database rows (fixture only) is read by the ledger engine, Home and assistant facts (`readAssistantFacts`), the report builder (`loadOwnerReportData` + `buildReportDoc`) and the bank account detail page. Every expected figure is a hand-calculated constant, with the working shown in the test.

| Check | Hand figure | Before the fixes | After |
|---|---|---|---|
| Ledger balances, cash flow, net worth | Savings ₹1,01,500; card ₹0; loan ₹4,82,000; income ₹50,000; spent ₹20,500 | pass | pass |
| Reversal keeps the original; net zero (Shopping ₹0) | original ₹3,000 kept, reversal −₹3,000 | pass | pass |
| Loan principal/interest (₹25,000 = ₹18,000 + ₹7,000) | outstanding ₹4,82,000 in assistant and loan report | pass | pass |
| Card bill payment creates no expense | gross expenses ₹25,500; card owed ₹0 | pass | pass |
| Part-paid claim ₹20,000 / ₹12,000 received | ₹8,000 outstanding; income stays ₹50,000 | pass | pass |
| Archived, undisposed ₹2,00,000 FD stays in net worth | assets ₹3,12,000; net −₹1,70,000 | **FAIL**: Home/assistant/Wealth report gave assets ₹1,12,000 (FD dropped), while the Reports trend still counted it | pass |
| Bank account detail = ledger; reconciled ₹1,50,000 | ₹1,01,500 / ₹1,50,000 | pass (one failure was the test reading reconciliation through `txnFromRow`, which carries no reconciliation date and is used by no reconciliation reader; corrected in the test) | pass |
| Cash/accrual labelled with basis and period | "Basis: Cash … Period …" on personal reports; "Basis: Accrual (working company statements)" on company statements | **FAIL**: no basis printed anywhere | pass |

Fixes: `position.ts`, `intelligence.ts` and the Wealth report (`report-centre.ts`) now value archived accounts in net worth; the Wealth report lists a non-zero archived account as "(archived)". `CASH_BASIS_LINE` is added to every personal report's filter lines; company statements state their accrual basis.
