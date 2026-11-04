# Ledgerline v6 roadmap: one app combining v6.0 and v6.1

v6.0 and v6.1 build on the app you already have. They don't replace it. Everything comes in through **Statement Desk**, every original file is kept in **DocuRepo**, and each area reads from the same records. That way nothing is entered twice and nothing is counted twice.

```text
             Statement Desk  (the only upload place, for every module)
   Upload -> Identify -> Read -> Check -> Match -> Sort -> Confirm -> Save -> Undo
                                   |
                     DocuRepo  (one copy of each original, linked to many records)
                                   |
 Money | Investments | Assets | Property | Loans | Income tax | GST | Rules | Audit
                                   |
            Net worth and reports on Home and Wealth (live where a trusted source exists)
```

Each phase is a separate release. You approve each one before I build it, and it ships only after its checks pass.

## Every document in your list, and where it goes

| Document | Phase | Goes to |
|---|---|---|
| Bank statements | Exists, extended in 2 | Ledger, reconciliation |
| Credit card statements | Exists, extended in 2 | Ledger, card bills |
| Loan statements | Exists, extended in 2 | Loans, EMI matching |
| Receipts | Exists | Expenses |
| Invoices | 4 | Expenses and income, missing-invoice check |
| Utility bills | 4 | Expenses, linked to the property |
| Contracts | 4 | Obligations and payment terms |
| Insurance documents | 2 | Renewals, linked to an asset, property or vehicle |
| ICICI Direct statements | 3 | Investments |
| Demat holdings | 3 | Investments |
| Mutual fund statements | 3 | Investments (existing fund prices) |
| Company incorporation documents | 5 | Entity profile |
| PAN and GST registration | 5 | Entity profile, tax and GST settings |
| Audited financial statements | 5 | Opening balances, previous years |
| Trial balances | 5 | Opening balances, previous years |
| Asset purchase invoices | 6 | Asset register |
| Depreciation schedules | 6 | Book and tax depreciation |
| Maintenance documents | 6 and 7 | Asset or property history |
| Property deeds and ownership documents | 7 | Property directory and ownership share |
| Lease agreements | 7 | Tenants and rent |
| Tax returns | 8 | Income tax, previous-year figures |
| GST returns | 9 | GST reconciliation |
| Other financial and legal records | 2 | DocuRepo, linked by hand when the type isn't clear |

## Phase 1: Check what already exists (no changes)
- A written review of what the app already does against each v6.0 section, ending in a gap list. Later phases then reuse existing parts instead of rebuilding them.

## Phase 2: DocuRepo and Statement Desk for every document type
- Rename the Document Vault to **DocuRepo** (More → DocuRepo). Old links keep working.
- Statement Desk recognises the document type itself and asks only when it isn't sure.
- It also works out who and what the document belongs to: entity, person, organisation, financial year, period, account, asset, property, investment, loan, tax registration, and expiry or renewal date.
- One stored file can link to many records, with no duplicate copies.
- Each file gets an automatic name (Entity / Year / Type / ID) and searchable details. The original file and its name are kept untouched.
- Each value read from a document keeps its page, the value as printed, how sure the reading is, and whether you've checked it.
- Document lifecycle: version, replaced-by, expiry and renewal reminders, and retention.
- Search by type, entity, year, amount, linked record or text.
- An "Upload" button in every module opens Statement Desk set up for that module.

## Phase 3: Investments and the Demat completeness check
- An ICICI Direct demat statement opens a **Demat Statement Review** card. It shows: account identified, holdings read, valuation (needs price data), purchase history (complete or missing), capital gains (waiting to be checked), and the original stored in DocuRepo.
- If purchase history is missing, it offers **"Upload ICICI Direct Transaction Statement or Capital Gains Statement"**. That file goes through the same desk, attaches to existing holdings by ISIN, and never creates a second copy of a security.
- Quantity check: bought − sold must equal the holding. Capital gains are marked verified only when both documents agree.
- Mutual fund statements (CAS) link to the existing funds.
- **Live prices and net worth (v6.1):**
  - Share and ETF prices come from an approved provider. Each price shows its date and time and is labelled "delayed" unless it really is live.
  - Value = checked quantity × price. Broker cash is counted once.
  - A Net worth card on Home shows how up to date each part is, with dated snapshots for history.
  - Alerts cover missing or stale prices, quantity differences and corporate actions.
  - **Needs your decision:** which price provider to use, because some charge.

## Phase 4: Automated accounting
- One shared ledger for each entity, with bank, card, invoice, receipt, contract and utility bill lines recognised and matched.
- Internal transfers and card payments are never counted twice.
- A missing-invoice check flags business debits that have no invoice in DocuRepo.

## Phase 5: Company and past-year setup
- Create an entity profile from incorporation, PAN and GST registration documents: name, CIN, PAN, GSTIN, directors or partners, address and financial year. Uploading the same documents again creates no duplicates.
- New fields go onto existing ones where they match. A brand-new field needs your approval before it's added.
- Suggest opening balances from last year's audited statements or trial balance. Anything missing in the schedules is flagged and never made up. You approve the balances before they are used.

## Phase 6: Assets and depreciation
- An asset register built from purchase invoices, covering the asset's life, documents, insurance, maintenance and checks.
- Book depreciation (Companies Act) and tax depreciation (Income Tax blocks) are worked out separately and posted only after you confirm.
- Uploaded depreciation schedules are compared against the app's own calculation.

## Phase 7: Property ownership and rent
- Property records come from deeds and ownership documents: owner or owners and their shares, purchase date and cost, registration and survey details, encumbrances and the related loan.
- Ownership is used in net worth and in tax, so a jointly owned property counts only your share.
- Tenants come from lease agreements: rent, deposit, yearly increases, start and end dates.
- Rent received is matched from bank statements. Security deposits are kept apart from income.
- Property tax, maintenance and utility bills attach to each property, with property accounts and returns.

## Phase 8: Income tax
- A Tax & Audit Centre for each entity and each person.
- Draft income figures by head: salary, house property (using your ownership share), business, capital gains (from Phase 3) and other sources.
- Deductions, TDS and advance tax are shown against Form 26AS / AIS where you upload them.
- Past tax returns are read in for previous-year comparison.
- Drafts only; nothing is ever filed automatically.

## Phase 9: GST
- Output tax from sales invoices, input credit from purchase invoices, with a GSTR-1 / 3B draft summary.
- Uploaded GST returns are compared with the books, and GSTR-2B gaps are listed.
- Due-date reminders. Drafts only, never filed automatically.

## Phase 10: Regulatory intelligence
- A list of trusted official sources (for example the Income Tax, GST and MCA portals) checked for rule changes such as rates, limits and due dates.
- Each rule carries the date it applies from, so past years keep the rules they were worked out under.
- A new rule is shown to you for approval before it's used.
- Period-correct form drafts are generated from the approved rules.

## Phase 11: Continuous audit and automation levels
- An "audit-ready" dashboard. Every important figure can be traced back to its document, using the eight financial checks already in the app. Gaps go to the Inbox.
- Three automation levels:
  - **Automatic:** reading, matching and reminders.
  - **Confirm first:** postings, new records and opening balances.
  - **Never automatic:** filing, payments, trades, and deleting evidence.
- Missing information: the app searches records and documents first, then asks you only for the smallest missing piece.

## Rules kept in every phase
- Statement Desk is the only upload place. Nothing is invented. Anything unsure waits for you to confirm.
- Every save can be undone, and a failed step never leaves half-saved records.
- Your records belong only to you, with separate access for each entity.
- Existing records and the way shared data is stored are not changed without your approval.
- Nothing is published to the live site without your go-ahead.

## Technical notes
- Each phase adds pure rule modules under src/lib, plus tests from the v6.0 Part P list (items 1–22).
- Database changes are added alongside the existing tables, with owner and entity access rules and atomic, repeat-safe save functions.
- Phase 2 extends the existing documents table with document-to-record links and extracted-field rows.
- Phase 3 adds demat accounts, holdings (unique per ISIN), lots, capital-gain lines, a server-side cached price fetcher and valuation snapshots kept apart from the ledger.
- Phases 7–10 add properties and owners, leases, tax computations, GST periods and dated rule versions.

## Suggested order
2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11, one at a time.
