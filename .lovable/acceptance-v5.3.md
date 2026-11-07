# V5.3 statement import acceptance — 1 November 2026

## Application changes completed
- Independent per-file account, currency and period review; detected CSV/Excel row dates do not claim full statement coverage. Remove-before-processing, explicit confirmation, file-size/type errors, hash-based repeated-file checks and durable saved batches.
- Upload → grouped review → explicit confirmation → reconciliation stages. Merchant, description format, category, workspace, type, direction, account, organisation, review status and recurring-pattern groups; quick exception filters; visible/all-filter selection; bulk preview; mark-for-review; detail sheets retain original narration.
- Central reusable rules: account, literal description-contains, debit/credit, source currency, inclusive original-amount bounds and priority; safe category/workspace/organisation/tags/type/reimbursable suggestions. Equal-priority conflicting mappings remain unresolved; no rule can grant approval or replace source money, date, account, destination, receipt/trip identity or duplicate override. Rules preview matching staged rows and conflict counts and never rewrite existing ledger records.
- Financial overview separates debits/credits and proposed expense, income, transfer, card settlement and unresolved amounts. Final confirmation includes account/period, separate transaction-type amounts, matched/excluded/pending counts. Results re-read persisted fingerprints after interruption.
- Overlapping statement warnings; on-demand reconciliation history and CSV, original/source arithmetic separate from confirmed debits/credits and ledger comparisons. No balancing entries are invented.

## Supplementary acceptance mapping
| # | Requirement | Evidence |
|---|---|---|
| 1 | Uncertain records not automatically approved | Empty initial selection, posting blockers, signed-in unreviewed-row confirmation disabled |
| 2 | Miscellaneous — check not verified | import-review.test.ts and shared posting blockers |
| 3 | Multiple transaction selection | Signed-in prior 52-row grouping flow; current bank/card select-all |
| 4 | Similar classification together | Prior three-row correction scope and recurring/group tests |
| 5 | Exclude exceptions | Reviewed atomic exclusion; card-side settlement excluded in bank/card acceptance |
| 6 | Bulk preview | Prior signed-in preview/audit/stale-snapshot scenario; current rule preview |
| 7 | Reusable rules persist | Current signed-in create/reload: description lunch, debit, INR, 100–500, priority 12, tags Office/Lunch |
| 8 | Confirmed records untouched | learning target exclusions and mapping whitelist; no ledger writes from rules |
| 9 | Amounts fit phone width | 402×725 synthetic bank/card and safe confirmation screenshots |
| 10 | Full narration accessible | Detail sheet source text preserved; prior long-narration check |
| 11 | No horizontal overflow | Seven themes × light/dark at 402×725 |
| 12 | Controls not lost beneath navigation | Scrolled signed-in phone interactions and separate bottom-sheet confirmation; physical iPhone still unverified |
| 13 | Separate final transaction types | Bank income ₹5,000, expense ₹250, transfer ₹1,000, card payment ₹1,500; card expense ₹2,000 and refund ₹200 |
| 14 | Correct transfers/settlements | Six saved entries: bank ₹12,250, card liability ₹300, cash ₹1,000; cashflow income ₹5,000, spent ₹2,050, net ₹2,950 |
| 15 | Retry is duplicate-free | Network-aborted first posting had zero entries, retry succeeded, both actual commands replayed with exactly six fingerprints/entries |
| 16 | Existing functionality | Full suite: 653 tests across 76 files; latest preview build checked |

## Additional main-document acceptance
- Source dates/amount/currency, statement account/direction and archived destination guards are tested in import-month-acceptance.test.ts; original private files remain linked to batches and Vault.
- Repeat-file and line fingerprints do not collapse legitimate same-day repeated payments.
- Multi-account two-file upload was exercised through the UI; both independent accounts read back correctly, all rows remained under review, no transactions were posted.
- Reconciliation history CSV was downloaded from the signed-in UI and checked for fixture rows and confirmed debit fields.
- Persistent PDF page chunks, owner leases/privacy and closed-page extraction were verified in earlier continuation; this session did not activate a live schedule or perform another paid AI extraction.
- Temporary accounts, statements, rules, files and posted acceptance entries were removed after testing.

## Not certified / external limits
- No publication or new paid-service activation was performed. Live unattended processing needs publication approval and a live schedule acceptance check.
- A real user statement and physical iPhone were not supplied/tested this session; synthetic data and Chromium phone emulation do not establish those results.
- INR ledger values cannot be directly compared with foreign-currency source balances. Foreign-currency statement arithmetic works; ledger reconciliation is explicitly unavailable and never marked reconciled. No rate is invented.
- Represented months and arithmetic matches do not certify contiguous historical coverage; actual complete statements and reviewed opening balances are still required.
- Email connections remain excluded at the user's request.
