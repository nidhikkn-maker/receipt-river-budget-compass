# Ledgerline v6.0 + v6.1 — closing every remaining gap

I re-read both documents line by line (v6.0 §1–72, v6.1 §1–15) and checked each line against the app. Most sections now have working screens, but many are only **partly** done. This plan finishes them. Nothing that already works will be rebuilt. No new bottom tabs. Nothing gets published without your approval.

Your choices are built in: **daily closing prices** from the official NSE and BSE daily price files (checked: both download fine), plus **statement prices** as a fallback. Each price is labelled with its date and never called "live". The app will check **official tax and GST websites every week**, and any change waits for your approval.

---

## Batch 1 — One way in, nothing half-saved (v6.0 §2–5, 7–8, 62)
- DocuRepo's own upload form opens Statement Desk with the right context already chosen, so there is only one upload point.
- Every document runs through Upload → Identify → Extract → Validate → Match → Classify → Prepare → Confirm → Save → Reconcile → Audit. The step it reached is saved, so a failed upload can be resumed or retried and never leaves half-saved records.
- Each extracted field keeps both the **value as read from the document** and the **cleaned-up value**, plus its page, quote and confidence. This lets every figure in a report be traced back to its source.
- One document can link to several records (company, person, property, loan, investment, entry).
- Originals marked as audit evidence can't be deleted while they're linked to records or a closed year.

## Batch 2 — Never fill gaps with guesses (v6.0 §1, 6, 15–16, 38, 46, 58–59)
- Unknown lease terms (due day, increase, deposit, notice, GST) stay blank and show up as "needs answer", instead of getting default values.
- Capital gains with no purchase date stay "unverified", instead of being treated as short-term.
- For any missing detail, the app first searches existing records, then related documents, then saved mappings, and only then asks you for the one missing item.
- Confirmation is asked only when identity or classification is uncertain. Companies are matched only on verified PAN, CIN or GSTIN numbers.
- New field names from documents are first matched to an existing field. Truly new ones wait in an approval list.

## Batch 3 — Companies and past years in full (v6.0 §13–14, 18–20, 63)
- Bank documents and earlier audited accounts can also propose a company profile. The financial year end and related companies are picked up from documents.
- Prior-year audited uploads bring in detailed figures: profit and loss, cash flow, notes, fixed assets, depreciation, loans, money owed to and by you, investments, tax and GST. Missing parts are flagged, never invented.
- Opening balances are compared account by account against your existing records for that company, not only bank totals. Corrections keep the original source available.

## Batch 4 — Assets and property in the main books (v6.0 §21, 26–41, 65–66)
- Approved monthly depreciation is posted as real entries in your main records, not in a separate book. It can only go into an open month, under your approval rules.
- Depreciation runs automatically each month and lists any exceptions.
- Purchase date, capitalisation date and put-to-use date are kept separately. Earlier years' written-down values come from the imported history.
- Asset life events have real effects: transfers change custodian and location; impairment or revaluation and disposal change book values; missing or damaged items get a status and a report.
- Maintenance records, photos, disposal papers and valuation reports attach to each asset. Asset invoices suggest the matching payment and follow your capitalisation rule.
- Property links to its loan, insurance, tax records, money owed, deposits and GST. Utility bills and insurance papers fill in property details.
- Each rent receipt is matched to just one lease, using account, amount, date, tenant and currency. Deposits are never counted as rent income. Renewals, collections, vendors and improvements get their own follow-ups.

## Batch 5 — Investments and net worth (v6.1 all; v6.0 §42–44)
- **Daily closing prices:** each evening after market close, the app reads the official NSE and BSE daily price files. Shares and ETFs are matched on ISIN, then exchange + symbol, never by name. Mutual fund NAVs refresh daily. Statement prices are used, and labelled, when no closing price exists.
- Prices are shown per holding with exchange, trading status, source, date and time, and an "end of day" or "statement" label. A failed refresh keeps the last value and marks it stale. Missing prices never become zero.
- Brokerage and statement holdings are combined into one list, so the same shares or brokerage cash are never counted twice.
- Net worth is fixed: bank and cash, investments, property, vehicles and other assets, money owed to you, minus actual loan balances. Your share of joint items is applied. Home and Wealth show the same figure, with an overall "as of" time and a freshness summary.
- History shows investment performance (adjusted for money added or withdrawn) and changes in how your money is split. Alerts cover corporate actions, a setting for unusual-difference thresholds, and quantity checks across all your brokerage accounts.
- Mutual fund statements, ETFs, gold, bonds and other investment documents get the same review-and-save path as demat statements. This includes dividends, redemptions, corporate actions and brokerage charges.

## Batch 6 — Tax, GST and weekly rule checks (v6.0 §45–51, 67)
- Tax workings use only each company's own entries, plus salary documents, tax statements and earlier returns.
- GST input tax credit counts only invoices that match your GSTR-2B. The filing scheme you pick (monthly or quarterly) sets the due dates. Annual return summaries are added.
- **Weekly rule check:** every week the app reads the official Income Tax, CBIC/GST and MCA pages. It records what changed, which companies and periods are affected, and test results. Nothing changes until you approve. Past calculations keep the rule that applied at the time.
- Draft returns follow the official file formats for each year, are checked before you see them, and are clearly marked as drafts. Filing itself stays manual.

## Batch 7 — Audit, approvals and screen layout (v6.0 §24, 52–57, 60, 64, 68)
- Ready-made reconciliations for suppliers, customers, investments, intercompany and GST.
- Audit checks for likely wrong categories, tax mismatches and differences between your companies. Each issue keeps its evidence and stays open until it's resolved.
- Readiness tiles count only checked data. The hard-coded "draft reports" count is removed.
- One approvals settings page covers asset capitalisation, tax treatment changes, past-year corrections, finalising accounts and closing periods.
- On iPad in landscape, a list on the left with details on the right. On phones, wide tables become cards and the bottom bar never covers buttons.

## Batch 8 — Proof (v6.0 §69–72, v6.1 §14–15)
- All 22 v6.0 test cases and all 13 v6.1 test cases as automated end-to-end tests, run on separate test data.
- An evidence pack in Files with the 20 reports named in §72, screenshots for phone, iPad and desktop, an exception register and a deployment-readiness report.

---

## What still needs you
- **Company-level access:** today every record belongs to you as the owner. To let staff see only certain companies, I'd add per-company access rights. Tell me if anyone else will use it.
- **iPhone/iPad checks** on your own devices.
- **Your approval** of the evidence pack before anything is published.

## Technical notes
- Batch 1: a new owner-scoped document-processing table for step state and resume, `originalValue` on extracted fields, and a delete guard (database trigger) for linked evidence originals.
- Batch 4: depreciation posts through the existing `finance_operation` transaction using a stable id per asset and month, with checks for closed periods.
- Batch 5: a protected scheduled job at about 18:30 IST downloads the NSE/BSE daily files on weekdays and stores close prices in a shared, read-only quotes table (ISIN, exchange, symbol, close, date, source). Holdings value from that table; a single list built from ISIN + account removes duplicates.
- Batch 6: a weekly scheduled job saves each official page's content and fingerprint, and the AI summarises the changes into rule proposals. Proposals are stored only. Batch jobs follow single-run locks and circuit-breaker rules.
- Each batch adds tests next to the existing ones, and the full test suite must pass before moving on.
