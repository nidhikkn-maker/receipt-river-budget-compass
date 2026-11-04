# Ledgerline v6 roadmap: one app combining v6.0 and v6.1

v6.0 and v6.1 build on the app you already have. They don't replace it. Everything comes in through **Statement Desk**, every original file is kept in **DocuRepo**, and each area reads from the same records. That way nothing is entered twice and nothing is counted twice.

```text
             Statement Desk  (the only upload place, for every module)
   Upload -> Identify -> Read -> Check -> Match -> Sort -> Confirm -> Save -> Undo
                                   |
                     DocuRepo  (one copy of each original, linked to many records)
                                   |
  Money & ledger | Investments | Assets | Property | Loans | Tax & GST | Audit
                                   |
            Net worth and reports on Home and Wealth (live where a trusted source exists)
```

Each phase is a separate release. You approve each one before I build it, and it ships only after its checks pass.

## Phase 1: Check what already exists (no changes)
- A written review of what the app already does against each v6.0 section: bank, card, loan and receipt reading, Inbox, the vault, Wealth and mutual fund prices.
- The result is a gap list, so later phases reuse what exists and don't rebuild it.

## Phase 2: DocuRepo and Statement Desk for every kind of document
- Rename the Document Vault to **DocuRepo** (More → DocuRepo). Old links keep working.
- Statement Desk recognises the document type itself (bank, card, loan, demat, invoice, deed, lease, tax return, and so on) and asks only when it isn't sure.
- One stored file can link to many records, such as an asset, a loan and a payment. Each file gets an automatic name and searchable details, and the original file is kept untouched.
- Each value read from a document keeps its page, the value as printed, how sure the reading is, and whether you've checked it.
- An "Upload" button in any module opens Statement Desk set up for that module.

## Phase 3: Investments and the Demat completeness check
- An ICICI Direct demat statement on Statement Desk opens a **Demat Statement Review** card. It shows: account identified, holdings read, valuation (needs price data), purchase history (complete or missing), capital gains (waiting to be checked), and the original stored in DocuRepo.
- If purchase history is missing, it offers **"Upload ICICI Direct Transaction Statement or Capital Gains Statement"**. That file goes through the same desk, attaches to existing holdings by ISIN, and never creates a second copy of a security.
- Quantity check: bought − sold must equal the holding. Capital gains are marked verified only when both documents agree.

## Phase 4: Live prices and net worth (v6.1)
- Share and ETF prices from an approved provider, plus the existing mutual fund prices. Each price shows its date and time and is labelled "delayed" unless it really is live.
- Holding value = checked quantity × price. Cash held by the broker is counted once.
- A Net worth card on Home shows assets, investments, cash and liabilities, how up to date each part is, and dated snapshots for history. Price updates never change purchase costs or ledger entries.
- Alerts for missing or stale prices, quantity differences and corporate actions, each of which you can switch on or off.
- **Needs your decision:** which price provider to use. Some charge a fee and have their own rules for use.

## Phase 5: Company and past-year setup
- Create a company profile from incorporation, PAN and GST documents. Uploading the same documents again creates no duplicates.
- Suggest opening balances from last year's audited statements. Anything missing in the schedules is flagged and never made up. You approve the balances before they are used.

## Phase 6: Assets and depreciation
- An asset register built from purchase invoices, with each asset's life, documents and checks.
- Book depreciation and tax depreciation are worked out separately as schedules. They are posted only after you confirm.

## Phase 7: Property and rent
- Property and tenant records from deeds and leases: rent, deposit and yearly increases.
- Rent received is matched from bank statements. Security deposits are kept apart from rental income.

## Phase 8: Tax, GST and rule updates
- A Tax & Audit Centre for each entity, with draft returns and GST summaries prepared from records. Nothing is ever filed automatically.
- Rule changes carry the date they apply from, so past years keep the rules they were worked out under.

## Phase 9: Continuous audit
- An "audit-ready" dashboard. Every important figure can be traced back to the document it came from, using the eight financial checks already in the app.
- Gaps show up in the Inbox, such as a bank debit with no invoice.

## Rules kept in every phase
- Statement Desk is the only upload place. Nothing is invented. Anything unsure waits for you to confirm.
- Every save can be undone, and a failed step never leaves half-saved records.
- Your records belong only to you. Existing records and the way shared data is stored are not changed without your approval.
- Nothing is published to the live site without your go-ahead.

## Technical notes
- Each phase adds pure rule modules under src/lib, plus tests based on the v6.0 Part P list.
- Database changes are added alongside the existing tables, with owner-only access and atomic, repeat-safe save functions.
- Phase 2 extends the existing documents table into a document-to-record link table, rather than creating a new file store.
- Phase 3 adds demat accounts, holdings (unique per ISIN per account), purchase lots and capital-gain lines.
- Phase 4 adds a server-side price fetcher with caching, and valuation snapshots kept apart from the ledger.

## Suggested order
Phases 2 → 3 → 4 first, because together they deliver what you asked for. Phases 5–9 follow in that order, one at a time.
