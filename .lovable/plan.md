# Ledgerline v6: one simple app for everything in v6.0 and v6.1

This plan covers every section of both documents (v6.0 sections 1–72 and the final instructions, plus v6.1 sections 1–15). Section numbers are shown in brackets so you can check that nothing is missing. Parts that already exist are reused and only changed where a new requirement needs it.

## 1. A simpler, more modern app

The app has grown to around 45 pages. v6 reorganises them into **five places**, each with a clean, quiet look in the existing deep blue and gold.

```text
Bottom bar:   Home  |  Money  |  ( + Upload )  |  Inbox  |  More
More:         Wealth  ·  Tax & Audit  ·  DocuRepo  ·  Settings
```

| Place | What lives there (existing pages folded in) |
|---|---|
| **Home** | Net worth card (v6.1 §11), what needs you today, upcoming payments |
| **Money** | Ledger, expenses, accounts, cards, loans, transfers, budgets, plan, trips, claims, reports |
| **+ Upload** | Statement Desk: the one way to add anything, from a receipt photo to a sale deed [§2–4, §58] |
| **Inbox** | Every exception, review and approval in one queue [§24, §53] |
| **Wealth** | Investments and Demat, Assets, Property, Net worth history |
| **Tax & Audit** | Entities, Financial Year Onboarding, Income Tax, GST, Rules, Audit readiness |
| **DocuRepo** | Every original document (the existing vault, renamed) |

- Inside each place there is one short list and a detail view. On iPad there are list and detail side by side; on iPhone, compact cards with the confirm buttons always reachable and never hidden behind the bottom bar [§60].
- Old page links keep working and redirect to their new place.
- No visual rebuild of working screens: the same parts move into the simpler layout.

## 2. What already exists and is reused [§61 Phase 1]

Phase 1 is a written check of the existing app. It already covers: Statement Desk (bank, card, loan, forex), the shared ledger and new-entry screen, the Inbox, the Document Vault, receipts, loans and EMI matching, transfers, mutual fund prices, Wealth, reimbursements, the eight financial checks, offline use and backups. Each of these is extended, never duplicated: one ledger and one Inbox [§21, §53].

## 3. Statement Desk: the single intake [§2, §3, §4]

- Accepts every document in your list: bank and card statements, incorporation documents, PAN and GST registration, audited financial statements, trial balances, tax returns, GST returns, invoices, receipts, contracts, investment and ICICI Direct statements, demat holdings, mutual fund statements, loan statements, property deeds, lease agreements, insurance, asset purchase invoices, depreciation schedules, utility bills, maintenance documents, and other financial and legal records.
- It recognises the type itself and asks only when it isn't sure.
- Every document follows the same steps: Upload → Identify → Read → Check → Match → Sort → Prepare records → Confirm where needed → Save → Undo. Each step is recorded, and a failed step never leaves half-made records.
- An Upload button in Wealth, Property, Assets or Tax opens Statement Desk set up for that place. There is no second upload screen.

## 4. DocuRepo [§5–11]

- **Storage [§5]:** More → DocuRepo stores every processed document, with access controls. It replaces separate document stores.
- **Classification [§6]:** documents are sorted automatically by type, legal entity, person, organisation, financial year, period, account, asset, property, investment, loan, transaction, tax registration, expiry or renewal, and amounts. The app asks only when it isn't sure.
- **Extracted values [§7]:** names, addresses, registration IDs, dates, amounts, tax, account references, asset details, contract terms, payment terms, interest, depreciation, holdings and financial statement values. Each keeps its source, page, value as printed, cleaned value, how sure the reading is, and whether you've checked it.
- **Links [§8]:** one document links to many records, for example invoice → asset, supplier, payment, loan, insurance, depreciation, organisation and tax. The file is never stored twice.
- **Naming [§9]:** files get automatic names (Entity / Year / Type / ID). The original file and filename are kept, and you can view them in folders without a fixed structure.
- **Search [§10]:** plain-language search by company, property, asset, account, transaction, date, amount, year, type, registration number, merchant, tenant or supplier. Results respect each entity's permissions.
- **Lifecycle [§11]:** version history, replacements (the original is never erased), expiry and renewal reminders, duplicate detection, audit evidence, retention rules and controlled export.

## 5. Entities from documents [§12–16]

- **Setup [§12, §13]:** Tax & Audit → Add Entity → Upload Documents. There is no blank form. Accepted documents: Certificate of Incorporation, PAN, GST certificate, MoA, AoA, LLP agreement, partnership deed, trust deed, registration certificates, bank documents and prior-year audited statements.
- **Proposed profile [§14]:** legal name, type, registration numbers, PAN, GSTINs, incorporation date, address, directors, partners or trustees, shareholding, financial year, tax registrations, related entities, activities and authorised persons. You review it instead of typing it.
- **New fields [§15]:** a field the app doesn't hold yet goes onto an existing field where one fits. Otherwise it is proposed as a new field, tested, and added only with your approval. Fields are never created automatically from random text.
- **Matching later documents [§16]:** later documents match an existing entity by verified IDs, so a spelling difference never creates a duplicate company.

## 6. Previous years [§17–20]

- **Import [§17, §18]:** Tax & Audit → Financial Year Onboarding, for several years. It reads balance sheets, P&L, trial balances, cash flow statements, notes, auditor reports, fixed asset registers, depreciation schedules, loan schedules, receivables, payables, investment schedules, tax computations and GST reconciliations.
- **Opening balances [§19]:** proposed opening balances for bank, cash, investments, fixed assets, accumulated depreciation, capital and reserves, loans, receivables, payables, tax and other balances. They are compared with the audited closing values, and no balancing figure is ever forced.
- **History [§20]:** statements, audit qualifications, opening and closing balances, filed returns, tax losses and carry-forwards, depreciation, investments, property and loan balances. The source data stays readable even after later corrections.

## 7. Automated accounting [§21–25]

- **One ledger [§21]:** the existing ledger and new-entry screen are reused. There is no second ledger for tax, assets, property or investments.
- **Recognition [§22]:** the app recognises income, expenses, transfers, card payments, loans, investment trades, asset purchases, rent, security deposits, tax payments and reimbursements. A debit is never assumed to be an expense, and a credit never assumed to be income.
- **Matching [§23]:** matches use account, date, amount, direction, reference, merchant, counterparty, currency, document and saved rules, never amount alone. The existing rules are extended.
- **Reconciliations [§24]:** bank, card and loan reconciliations exist already. Supplier, customer, investment, intercompany and GST reconciliations are new. Every difference goes to the Inbox.
- **Missing invoices [§25]:** a bank line without an invoice still counts toward the bank balance. Whether a document exists is tracked separately from how the line is classified, and a missing invoice raises a tax, approval or audit flag.

## 8. Investments and Demat, including the completeness check [§42–44, your request]

- **Holdings [§42]:** ICICI Direct statements, stocks, mutual funds, ETFs, gold, bonds and other investments, all imported through Statement Desk with the originals in DocuRepo.
- **Demat Statement Review card:**

| Check | Status |
|---|---|
| Demat account | Identified |
| Stock holdings | Extracted |
| Portfolio valuation | Price data required |
| Purchase history | Check completeness |
| Capital gains | Pending verification |
| Original document | Stored in DocuRepo |

- **Missing purchase history:** the card offers **"Upload ICICI Direct Transaction Statement or Capital Gains Statement"**. That file goes through the same Statement Desk, links to existing holdings by ISIN, and fills in the missing dates, quantities and costs without creating a duplicate security. Bought − sold must equal the holding. Gains are marked verified only when both documents agree.
- **Recognised automatically [§43]:** holdings, buys, sells, dividends, redemptions, corporate actions, brokerage, cost basis where there is evidence, and values where a trusted source exists. Costs and prices are never made up.
- **Net worth details [§44]:** each holding shows owner, valuation date, source and checked status. Broker cash and duplicate holdings are never counted twice.

## 9. Live market data and dynamic net worth (v6.1 §1–15)

- **Prices [§2]:** NSE and BSE shares, ETFs, listed bonds, mutual fund NAVs and currencies from an authorised provider, following its licence and caching rules. There is no scraping.
- **Security matching [§3]:** securities are matched by ISIN, exchange, symbol, instrument type and fund codes, never by name alone.
- **Valuation [§4]:**
  - Holding value = checked quantity × price.
  - Portfolio = holdings + investment-account cash.
  - Each type of instrument uses its own valuation rule, and nothing is counted twice across statements.
- **Status [§5]:** each security shows exchange, trading status, last price, price date and time, last refresh and a staleness marker. Delayed prices or the previous close are never labelled live.
- **Refresh [§6]:** prices update during market hours as often as the provider allows, and keep the closing price after hours. If a fetch fails, the last good price is kept and marked stale, never shown as zero.
- **Mutual fund NAV [§7]:** the existing daily NAV source is reused, refreshed when a new NAV is published, and shown with its NAV date.
- **Gold [§8]:** Gold ETFs, Sovereign Gold Bonds and physical gold are valued separately. Physical gold uses your chosen method, purity and weight, never the ETF price.
- **Net worth [§9, §10]:**
  - Net worth = recognised assets − recognised liabilities, by legal ownership.
  - Market-valued assets, bank-verified cash and manually valued assets are labelled differently.
  - A freshness summary shows the date behind each part, and net worth is never called fully live unless every part is.
- **Home card [§11]:** net worth, portfolio value and its movement, liquid balances, liabilities, last update and freshness. Tapping it opens Wealth.
- **History [§12]:** dated snapshots of the portfolio, net worth, performance and allocation. Snapshots never create ledger entries.
- **Alerts [§13]:** big portfolio moves, missing prices, stale NAVs, corporate actions, quantity differences and unusual values. Each can be switched on or off in the existing notification settings.
- **Tests [§14] and limits [§15]:** all 13 v6.1 tests are covered. The app never invents prices, never changes purchase costs, and never places trades.
- **Needs your decision:** which price provider to use for NSE and BSE. Some charge a fee.

## 10. Asset Management and depreciation [§26–34]

- **Module [§26]:** Wealth → Assets, linked to the ledger.
- **Registration [§27]:** an invoice is enough to set up an asset. The app reads the asset, legal owner, cost, dates, supplier, linked payment, warranty and insurance, suggests a category, and prepares the asset record and accounting links. Capitalisation follows your approved policy.
- **Lifecycle [§28]:** acquisition, receipt, capitalisation, location, custodian, maintenance, transfer, verification, impairment or revaluation, and disposal.
- **Documents [§29]:** invoices, warranties, insurance, maintenance records, photos, disposal documents and valuation reports, all stored in DocuRepo.
- **Physical checks [§30]:** a unique ID and QR code for each asset, with location, department, custodian, physical verification and missing or damaged reports.
- **Two kinds of depreciation [§31]:** book depreciation follows your accounting policy, and tax depreciation follows income-tax blocks. They are never assumed to be equal.
- **Inputs [§32]:** cost, capitalisation and put-to-use dates, category, method, useful life, residual value, tax rates, additions, disposals and prior written-down values.
- **Schedules [§33]:** monthly and yearly book depreciation, accumulated depreciation, net book value, tax depreciation, tax written-down value, block schedules, additions and disposals, and a book-versus-tax reconciliation.
- **Posting [§34]:** depreciation is calculated automatically. Journals are posted to open periods only, under your approval rules, and closed periods are never changed.

## 11. Property Management, including ownership documents [§35–41]

- **Module [§35]:** Wealth → Property, linked to Assets and the ledger.
- **Setup [§36]:** Add Property → Upload Document. Accepted documents: sale deed, registration document, lease, property tax, loan, insurance, valuation report and utility bill.
- **Directory [§37]:** organised as Owner → Property → Building → Floor → Unit. Each property holds its details, legal ownership and share, location, purchase details, valuation, related assets, loans, insurance, tax records and documents.
- **Tenants [§38]:** read from the lease: tenant, unit, lease period, rent, escalation, deposit, due dates, notice period, payment terms and tax details. Nothing is retyped.
- **Rent matching [§39]:** bank receipts are matched to expected rent, recognising rent received, partial payments, arrears, advance rent, deposits and other receipts. A deposit is never counted as rent.
- **Operations [§40]:** leases, renewals, escalations, tenant ledger, collection, maintenance, utilities, expenses, vendors, insurance, property tax, improvements and occupancy.
- **Accounting [§41]:** each property links to income and expenditure, receivables, deposits, loans, assets, depreciation, GST and income tax. Its value is held in one place only.

## 12. Income tax and GST [§45–48]

- **Tax profiles [§45]:** one Tax & Audit Centre covers individuals, proprietorships, companies, LLPs, partnerships, trusts and other entities. Each has its own tax profile and filing obligations.
- **Income tax preparation [§46]:** uses financial statements, bank lines, salary documents, rent, investments, loans, depreciation, tax statements and earlier returns. Deductions and credits are never invented.
- **GST [§47]:** for each GSTIN, an invoice register, GSTR-1, GSTR-3B, GSTR-2B reconciliation, ITC review, payment matching, annual returns and filing evidence, following the filing scheme that actually applies.
- **Filing [§48]:** validated drafts and supporting reports only. Actual filing needs your explicit approval and an authorised method.

## 13. Regulatory intelligence [§49–51]

- **What is monitored [§49]:** a version-controlled set of rules, watching official sources for changes to income tax, GST, corporate reporting, depreciation, return formats, filing schemas, validation rules, due dates and property compliance.
- **Each change [§50]:** keeps its source, publication and effective dates, which entities and periods it affects, a comparison of old and new rules, tests, and an ambiguity flag. It becomes active only after your approval. Filed returns and closed years are never changed.
- **Forms [§51]:** drafts follow the official schema for each period, and old form versions are kept. A draft is never a filed return.

## 14. Always audit-ready [§52–54]

- **Checks [§52]:** run all the time for unreconciled entries, wrong classifications, missing invoices, duplicates, asset gaps, depreciation differences, rent gaps, tax and GST mismatches, cost-basis gaps, intercompany differences and missing documents.
- **Inbox [§53]:** everything goes to the existing Inbox, grouped by entity, account, year, issue, risk and evidence. There is no second queue.
- **Readiness dashboard [§54]:** in Tax & Audit, it shows reconciled accounts, open issues, missing evidence, closed periods, draft reports, pending tax work, unchecked balances and approvals needed. It counts only verified data.

## 15. Automation levels and missing information [§55–59]

- **Automatic [§55]:** sorting, reading, merchant and entity matching, linking, duplicate checks, draft reports, reminders, rule watching and previews.
- **Confirm first [§56]:** opening balances, capitalisation, reclassification, property and tenant links, depreciation posting, tax treatment, historical corrections and reimbursement settlements.
- **Explicit approval only [§57]:** closed-period changes, shared database changes, finalising statements, filing, certification and going live.
- **Upload first [§58]:** your usual action is to upload. You then see what was read, what was found, what is proposed, any conflicts and what needs approval.
- **Missing values [§59]:** the app searches records, then related documents, then saved rules, and checks whether the value can be worked out. Only then does it ask for the smallest missing piece, and you can correct it in place.

## 16. Build order, tests and evidence [§61–72]

- **Build order [§61–70]:** Phases run 1 audit → 2 documents → 3 entities and past years → 4 accounting automation (with Demat and v6.1 in this phase) → 5 assets and property → 6 depreciation → 7 tax, GST and rules → 8 continuous audit → 9 end-to-end checks → 10 your acceptance. Each phase is built in isolation and waits for your approval.
- **Tests [§71]:** all 22 tests become automated checks.
- **Reports [§72]:** every phase delivers its matching report from the list of 20, including screenshots for iPhone, iPad and desktop.
- **Final instructions:** nothing is invented, duplicated or silently reinterpreted. No closed periods or shared data are changed without approval, and nothing is filed or published without your go-ahead.

## Technical notes
- Navigation: AppShell becomes five places, and the existing routes become sections inside them, with beforeLoad redirects for old paths, reusing SectionTabs.
- Statement Desk gets a document-type classifier, plus a parser and matcher per type under statement-pipeline/. DocuRepo extends the existing documents table with record links, extracted-field rows (page, raw, normalised, confidence, status) and versions.
- New owner- and entity-scoped tables, added alongside existing ones:
  - entities and tax profiles
  - financial years and opening balances
  - demat accounts, holdings (unique per ISIN), lots and capital-gain lines
  - prices and valuation snapshots
  - assets and depreciation runs
  - properties, units, owners, tenants and leases
  - GST periods
  - rule versions with effective dates
- All writes go through atomic, repeat-safe database functions with undo. Rules are pure modules with tests.
