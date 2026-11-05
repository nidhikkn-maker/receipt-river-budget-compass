# Finish both documents, test on iPhone/iPad sizes, then publish

You've put these off for now, so they're not in this plan: choosing a live NSE/BSE price provider, the final ITR filing format, and the Mercedes GLS sanction letter.

A fresh line-by-line re-check of both documents found the gaps below. Items marked NEW were not on the earlier list. All of them get built in one continuous run, with no stops to ask "Continue".

## Part 1: Complete every remaining document item

### A. Documents and onboarding
1. Separate access for each company, enforced by the server (documents, search, linked records, exports).
2. Every important figure links back to its document, page and field, and on to the reports built from it.
3. Saving a document and everything it creates either all succeeds or all fails. The server enforces approvals, with an approval history that can't be edited.
4. NEW: Old schedules become real records: individual assets, loans and repayments, amounts owed to you and by you, and investment lots.
5. NEW: Full version history for property, loan, investment and depreciation records.
6. NEW: You can correct any suggestion before saving, and related documents are filled in from trusted records.
7. NEW: Complete approval process for adding new fields (check, test, then switch on).

### B. Reconciliation and accounting
8. NEW: Supplier and customer reconciliation with stable party identities, opening balances, currency, credit notes and invoice-level matching.
9. NEW: Each company's amount owed to another company is matched against the other company's records.
10. NEW: A loan can be created straight from its statement, then reconciled.
11. NEW: Balanced entries for buying, capitalising, impairing, revaluing, transferring and selling assets.
12. A complete opening trial balance, including fixed assets, accumulated depreciation and capital/reserves.

### C. Assets and depreciation
13. NEW: Warranty, insurance, maintenance, photo, disposal and valuation documents attach to the right asset automatically.
14. NEW: Scan an asset's QR code or barcode to record a physical check.
15. NEW: Depreciation policies with start dates, and tax-block rules that handle disposals and blocks that cease.
16. NEW: Monthly depreciation runs on a schedule, without opening the Assets page.

### D. Property and rent
17. NEW: Structured title and acquisition details, co-ownership shares backed by evidence, property insurance, tax and utility records, and multiple assets per property.
18. NEW: Lease escalation conditions and tax details.
19. NEW: Any rent receipt the app isn't sure about waits for your confirmation, and your decisions are saved.
20. NEW: Renewals, maintenance jobs, vendors, utilities, insurance and property tax as tracked tasks; improvements can be capitalised.
21. NEW: Rent owed, deposits held, improvements, GST and property loans are posted as real accounting entries.

### E. Investments and net worth (v6.1)
22. NEW: NSE and BSE kept separate for the same ISIN, with exchange and symbol editing.
23. NEW: Broker cash reconciled so it isn't counted twice alongside demat holdings.
24. NEW: Demat holdings valued by ownership share and by company.
25. NEW: Trading status for each holding, plus the actual time each price was fetched.
26. NEW: Mutual fund NAVs refresh automatically once published.
27. NEW: Loans use the latest verified outstanding amount, and each part of net worth shows its own "as of" date.
28. NEW: Full daily snapshots, including demat holdings and cash, with money in and out recorded correctly.
29. NEW: Alerts for corporate actions such as bonuses, splits and dividends.
30. NEW: Market open/closed and stale-price checks that account for exchange holidays.

### F. Tax, GST and rules
31. Income tax worked out separately for each company and tax regime: deductions, loss limits, capital gains and the final amount payable.
32. Full GST return content checked against the official layout, plus annual return preparation.
33. Every approved rule change is tested against the calculations it affects.
34. Closing a year freezes its evidence: ledger and source versions, reconciliations, approvals and rule versions. Reopening a year keeps the earlier snapshot.

## Part 2: Proof, and iPhone and iPad testing
- A full acceptance test pack: from document to ledger to report, plus access refusals and recovery from failures.
- I'll check every main page at iPhone size and at iPad size (upright and sideways), fix any layout problems, and save screenshots.
- After publishing, you test on your own devices with a short checklist: install to the Home Screen, Face ID, camera scan, opening offline, and a test notification.

## Part 3: Publish
- The full test suite, the build and a fresh security check must all pass first.
- Then I'll publish to ledgerline.biz. Scheduled jobs (closing prices, rule watch, depreciation, reminders) start running after this.

## Technical notes
- Migrations are additive only. Every new table gets owner-scoped RLS. Pure rules live in src/lib/books, each with tests. No new tabs.
- Update the checklist in Files with the final status of every line in v6.0 §1–72 and v6.1 §1–15, fixing stale entries (customer reconciliation, corporate-action quantities and opening WDV are already done).
- §71.22 ("eight financial-integrity checks") isn't listed in either document. Map it to the existing checks in financial-verification memory.
- If one reply runs out of room, the next one carries on from the checklist automatically.
