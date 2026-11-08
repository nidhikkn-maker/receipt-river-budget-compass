# Corporate Accounting Milestone 1 — annual isolated results

## Disposition
**PARTIAL, not functionally accepted. No requirement IDs closed.** V60-0013, V60-0026 and V60-0023 remain PARTIAL. V60-0066/0082 remain BLOCKED; V60-0058/0716 unchanged. Accounting/database subjourney passes, but it is not the requested complete document-upload-to-close acceptance.

## Newly working functionality
- Cash journals cannot clear the company close preview until statement reconciliation metadata exists. Metadata updates leave accounting values and originals immutable; staged-only SQL independently refuses unresolved corporate workings and unreconciled cash.
- Mixed loan journal repayments classify exact principal as financing and exact interest as operating only when both sum to the bank payment; no extra payment.
- Frozen source evidence includes retained statement originals. Audit ZIP adds twelve statutory head roll-forwards and explicit required-disclosure/professional-review manifest; supporting CSV adds classification basis, review status and source page/quote. No invented ageing, maturity or deferred-tax figures.
- Milestone 2 started: loan matching now uses complete literal printed reference/name boundaries, rejecting reference prefixes, punctuation-as-patterns and ambiguous multiple identities. Saved/reloaded financed-asset/loan/investment journey remains next work.

## Synthetic company and expected-versus-calculated INR
Meridian Engineering Ltd, FY 2025-26, twelve months. 117 immutable journals,135 unique canonical entries; real CSV parser extracts65 bank rows.117 retained synthetic originals in checksum-bound ZIP. Opening banks600,000; plant300,000; customer118,000; prepaid24,000; loan200,000; supplier59,000; GST18,000; equity765,000. Annual sales1,200,000; materials480,000; operations240,000; interest24,000; depreciation44,400; insurance24,000; corrected accrual1,000; reviewed synthetic tax provision100,000. Loan disbursal100,000 and principal repayment60,000; plant acquisition120,000; tax advance30,000. GST purchases/sales/setoff/payments and internal bank transfer retained.

| Figure | Expected | Calculated | Difference |
|---|---:|---:|---:|
| Trial Balance debit | 2,353,000 | 2,353,000 | 0 |
| Trial Balance credit | 2,353,000 | 2,353,000 | 0 |
| Profit after synthetic tax provision | 286,600 | 286,600 | 0 |
| Assets | 1,439,600 | 1,439,600 | 0 |
| Liabilities | 388,000 | 388,000 | 0 |
| Equity including profit | 1,051,600 | 1,051,600 | 0 |
| Operating cash flow | 426,000 | 426,000 | 0 |
| Investing cash flow | -120,000 | -120,000 | 0 |
| Financing cash flow | 40,000 | 40,000 | 0 |
| Closing cash | 946,000 | 946,000 | 0 |

Balance equation and cash equation zero; customer closing118,000, supplier59,000, loan240,000, plant375,600. Synthetic tax provision is an explicit test input, not certified applicable tax computation.

## Executed evidence
26 distinct targeted tests across nine files passed (annual acceptance, foundation, settlement, authority, cash review, corporate statements, audit pack and loan source matching; annual rerun required by changed controls). Actual Reports Centre /report-centre isolated browser: generate→interrupted PDF history→encrypted reload→retry→frozen CSV/XLSX/PDF/JSON→audit ZIP including new schedules passed; one upload/history, no page errors. Screenshot inspected. This browser dataset is separate from annual database dataset, not the full connected annual UI journey.
Annual database: source-preserving reversal/replacement; lost committed reply/restart/same-request retry and no duplicate IDs; owner/other-owner denial, verified accountant review and revoked denial; unresolved INR500 difference refuses close with zero saved close evidence; resolved local close/restart/replay retains one evidence record and prevents subsequent posting.
Initial annual test failed because DATE adapter used a locale string; corrected exact ISO conversion. Loan interest classification and immutable-journal reconciliation restrictions were corrected. Browser initially failed because old fixture lacked accountingAvailable; updated test adapter, final browser passed. Temporary test type errors corrected; harness reports build OK. No unresolved executed test failures.

## Exact remaining acceptance gaps
- Opening/invoice originals are written synthetic schedule files; their journal legs are supplied test classifications, not current automatic AI extraction. The bank CSV is generated from canonical synthetic movements, so it is **not independent statement accuracy evidence**.
- Reconciliation uses disposable metadata adapter updates, not the complete existing statement correction RPC/real route/authoritative independently sourced bank comparison. A retained line ID alone cannot establish verified original accuracy.
- No same annual browser journey from actual financial upload/extraction to canonical posting, reconciliation, frozen-report history, accountant session and close. Report browser and annual database tests must not be combined into a full-flow pass.
- Full statutory ageing, maturity/security, shares/related parties, contingent liabilities, deferred tax and official filing applicability/schema/professional approval remain absent or require explicit source facts. Roll-forwards are working schedules only.
- Frozen annual report-history interruption comparisons and multi-invoice/FX/overpayment allocation remain incomplete; separate-account hosted originals, recovery and deployment activation remain unverified.
- Staged corporate close SQL validates supplied workings plus saved cash reconciliation, **not independent server recomputation of every corporate figure/source difference**. No authority installed in Cloud. No production readiness claim.

## Revision and restrictions
Read-only checkout at verification: a66effbd66cf27e8c81017b21871de52688dce30 on edit/edt-6462995d-4190-4c9a-887b-63bc3d7c11b5; subsequent edits may receive managed commits. User-supplied GitHub f59fbde/main-ahead evidence retained; no independent deployment identity, so hosted/GitHub parity unverified. No live records, production migrations, protection activation, publishing or UIX edits.

## Credits
Workspace snapshots866.16→858.57,7.59-credit decline measured so far; later charges excluded. No credit purchase; reserve remains available.
