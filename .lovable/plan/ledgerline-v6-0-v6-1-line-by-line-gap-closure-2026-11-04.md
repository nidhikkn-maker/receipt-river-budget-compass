# Ledgerline v6.0 + v6.1 — line-by-line gap closure

I re-read both documents line by line (v6.0: 72 sections, v6.1: 15 sections) and checked each line against the app. Below is everything that is **not yet done or only partly done**. Everything else (Statement Desk single intake, DocuRepo versions/duplicates/key details, demat completeness check, Companies & years with PAN/GSTIN checks, missing invoices, GSTR-2B check, assets with book/tax depreciation, rent check with deposits, tax draft, yearly tax rules, audit dashboard, receivables, mutual fund NAV lookup) is already in place and will not be rebuilt.

Design stays minimal: no new bottom tabs. New work goes into the existing pages (Statement Desk, DocuRepo, Companies & years, Property & assets, Investments in Wealth, Tax, Audit, Home).

## Gap register (what is still missing)

### Part A — Statement Desk (§2–4)
1. Upload buttons on Investments, Property & assets, Tax and Companies open Statement Desk **with that context pre-selected** (today they don't have an upload entry, or upload elsewhere).
2. A visible step trail per document: Upload → Identify → Extract → Validate → Match → Classify → Prepare → Confirm → Save → Reconcile → Audit, with a failed step shown and nothing half-saved.
3. Automatic type detection for every one of the 29 document kinds, routing each to its proper review (entity, audited accounts, asset invoice, deed, lease, GST return, etc.), not only bank/card/demat.

### Part B — DocuRepo (§6–11)
4. Each extracted fact keeps source page/section, original value, normalised value, confidence and verified/unverified status, with correction on the field.
5. One document linked to many records (asset, supplier, payment, loan, insurance, entity) without copying the file.
6. Automatic descriptive name "Entity / FY / Type / Identifier", keeping the original filename; logical folder views by entity, year and type.
7. Search filters by company, property, asset, tenant, supplier, registration number, financial year and amount.
8. Expiry/renewal reminders feeding the existing phone reminders; retention period per document type; controlled export (ZIP of chosen documents with a manifest).

### Part C — Entity onboarding (§12–16)
9. "Add entity → Upload documents": read incorporation certificate, PAN, GST certificate, MoA/AoA, LLP/partnership/trust deed and propose the profile (legal name, type, CIN/LLPIN, PAN, GSTINs, incorporation date, registered address, directors/partners/trustees, shareholding, activities, authorised persons) for review.
10. Re-uploads match the existing entity by PAN/CIN/GSTIN — never a duplicate company.
11. Unknown fields: mapped to an existing field if equivalent, otherwise kept as "extra facts" on the document and listed as a proposed field for your approval (no automatic new columns).

### Part D — Previous-year audited records (§17–20)
12. "Financial year onboarding" inside Tax: upload balance sheet, P&L, trial balance, cash flow, notes, auditor report, fixed asset register, depreciation, loan/receivable/payable/investment schedules, tax computation, GST reconciliation.
13. Proposed opening balances (bank, cash, investments, fixed assets, accumulated depreciation, capital & reserves, loans, receivables, payables, tax) compared with audited closing totals; differences shown, never forced; you confirm.
14. Year history: audit qualifications, filed returns, tax losses carried forward, kept read-only after later corrections.
15. Flag incomplete audited schedules without filling them in.

### Part E — Accounting & reconciliation (§22–25)
16. Reconciliation summary covering bank, card, loan, supplier, customer, investment, **intercompany** and GST in one place; every unresolved difference goes into the Financial Inbox.
17. Recognise tax payments and investment transactions in statements (not as expenses).

### Part F/G — Assets & depreciation (§26–34)
18. Asset invoice upload proposes the asset (owner, cost, dates, supplier, linked payment, warranty, insurance, category).
19. Lifecycle events: receipt, capitalisation, location/custodian change, maintenance, transfer, impairment/revaluation, disposal — each dated with documents.
20. Asset ID with QR code label, department field, missing/damaged report.
21. Book depreciation with useful life and residual value, **monthly** and annual; accumulated depreciation and net book value; tax WDV block-wise schedule with additions/disposals; book-vs-tax reconciliation.
22. Prepared depreciation journals posted only on your approval and only into open periods.
23. **Closed periods**: lock a financial year/month; locked periods cannot be edited (restricted, explicit approval to reopen).

### Part H — Property management (§35–41)
24. Its own "Property" section (inside Property & assets) with Owner → Property → Building → Floor → Unit.
25. Add property → Upload deed/registration/property tax/loan/insurance/valuation/utility bill and propose the record.
26. Lease upload proposes tenant, unit, period, rent, **escalation**, deposit, due date, **notice period**, payment terms, tax info.
27. Tenant ledger, renewals, escalation schedule, maintenance, utilities, vendors, property tax, capital improvements, occupancy report; one valuation shared with Asset register (no double counting).

### Part I — Investments (§42–44)
28. Holdings beyond shares: mutual funds, ETFs, gold (ETF / Sovereign Gold Bond / physical with weight and purity), bonds.
29. Recognise purchases, sales, dividends, redemptions, corporate actions and brokerage from ICICI Direct transaction statements.
30. Investment value in net worth with ownership, valuation date, source and verification status; no double counting of broker cash.

### Part J — Tax & GST (§45–48)
31. Tax profile and filing obligations per entity (individual, proprietorship, company, LLP, partnership, trust).
32. Tax computation using salary documents, rent, investment gains, loan interest, depreciation and filed returns — no invented deductions.
33. GSTIN-wise invoice register, GSTR-1 and GSTR-3B drafts, ITC review, GST payment matching, annual return summary, filing evidence stored in DocuRepo. Drafts only; filing needs your explicit approval outside the app.

### Part K — Regulatory intelligence (§49–51)
34. Versioned rule register: source link, publication and effective dates, affected entities/periods, old-vs-new comparison, validation tests, ambiguity flag, approval before activation; earlier years keep their old rules.
35. Read-only monitoring of official sources (Income Tax, CBIC/GST, MCA) that only proposes changes for approval.
36. Period-specific form drafts with kept historical form versions; a draft is never a filed return.

### Part L — Continuous audit (§52–54)
37. Audit checks added: unreconciled bank lines, duplicate transactions, depreciation differences, tax mismatches, GST exceptions, investment cost-basis gaps, intercompany differences.
38. Audit findings appear in the Financial Inbox grouped by entity, account, year, issue type and risk (no second queue).
39. Dashboard tiles: reconciled accounts, open exceptions, missing evidence, closed periods, draft reports, pending tax prep, unverified balances, required approvals.

### Part M/N — Automation & UX (§55–60)
40. Approval policy setting listing which actions are automatic, confirm-first and restricted.
41. iPad landscape list-and-detail on the new pages; bottom bar never covering actions.

### v6.1 — Live market data & net worth
42. Price model per security: exchange, status, last price, time, provider, live/delayed/end-of-day label, last refresh, stale flag; failures keep last value marked stale; never zero.
43. Mutual fund NAV with NAV date (existing lookup reused), refreshed when published.
44. Gold valued separately (ETF price vs SGB vs physical by weight × purity × configured rate).
45. Dynamic net worth = recognised assets − liabilities, ownership-aware, with freshness per component; **Home** summary card (net worth, portfolio, movement, liquid balances, liabilities, last update, freshness) tapping into Wealth.
46. Dated valuation snapshots (portfolio, net worth, allocation) that never create ledger entries.
47. Configurable alerts: big portfolio change, missing prices, stale NAV, corporate actions, quantity mismatch, unusual valuation.
48. **NSE/BSE share prices**: built against a provider slot; stays "price data required" until you approve a licensed provider.

### Part O/P — Verification & reports (§61–72)
49. All 22 mandatory tests (§71) and v6.1's 13 tests written as automated checks with sample documents.
50. The 18 deliverable reports (§72) produced as one "Implementation evidence" PDF/page, with screenshots on phone/iPad/desktop.

## Delivery order (one batch per message, each tested)
1. Closed periods + approval policy + Statement Desk context uploads and step trail (items 1–3, 23, 40)
2. DocuRepo provenance, links, naming, search, retention, export (4–8)
3. Entity onboarding from documents (9–11)
4. Financial year onboarding and opening balances (12–15)
5. Property module and lease extraction (24–27)
6. Asset lifecycle, QR, full depreciation engine and journals (18–22)
7. Investments breadth + net worth, snapshots, alerts, Home card (28–30, 42–47)
8. Tax profiles, GST registers/GSTR-1/3B drafts (31–33)
9. Regulatory intelligence register and form versions (34–36)
10. Reconciliation hub, audit checks into Inbox, dashboard tiles (16–17, 37–39)
11. Responsive pass, 35 tests, evidence report (41, 49–50)

## Still needs you
- Approval of a licensed NSE/BSE price provider (item 48).
- Production publishing stays off until you approve (both documents forbid it).

## Technical notes
- New database tables (closed_periods, entity documents/links, asset_events, properties/units/leases, rule_versions, valuation_snapshots, price_quotes) are owner-scoped with RLS; existing records are not altered. Because the documents require approval for shared-schema changes, each batch's migration is shown for your approval first.
- Extraction reuses the existing document AI extraction with kind-specific field lists; all money rules live as pure functions in src/lib with tests.
- Regulatory monitoring only fetches official pages and proposes changes; activation is manual.
