# Finish v6.0 and v6.1 in one continuous run

## How this run works
- I'll work through every remaining item in one go. I won't stop to ask "Continue", and I'll only report back once the whole list is done or the only items left are blocked.
- First I'll build a requirement checklist from both documents (v6.0 §1–72, v6.1 §1–15). Each line in it gets a status (done / built now / blocked), the place in the app where it lives, and the test that proves it. The run is finished only when every line is either done or blocked on something only you can provide.
- The checklist is saved with the evidence pack in your Files, so you can read it against the documents line by line yourself.

## Work order (anything already built is reused, not rebuilt)
1. **Documents and Statement Desk:** every check step records a real result. Statement originals are kept in DocuRepo, with each imported line linked to its file and page. Schedules and returns keep their full version history. Incomplete asset and lease suggestions stay open for editing. Invoices become GST drafts. Receipts from Add Expense go through the same intake path.
2. **Companies and history:** a tax profile you confirm, with opening balances for each company. Per-company access and locked periods. Losses carried forward only with filed-return evidence. An approval log that can only be added to.
3. **Reconciliations and audit:** real figure-to-figure comparisons for loans, suppliers, customers, investments and between your companies. Each audit finding links to its document, page and entries. "Reconciled" appears only when coverage is complete.
4. **Assets and property:** confirmed owner, the asset's full life history, tax depreciation rates taken from approved rules, joint ownership, a tenant list, lease versions, and rent split from deposits.
5. **Tax, GST and rules:** old vs new regime with deductions, special-rate capital gains, surcharge and cess, rates for companies and firms, input tax credit only when GSTR-2B confirms it, quarterly (QRMP) and composition schemes, which ITR form applies, and pinned rule versions. Form 16 and 26AS/AIS figures are read into the tax working.
6. **Market prices and net worth (v6.1):** one holdings list matched by exchange and type, quantities marked verified or provisional, broker cash kept separate, bond/SGB/gold/foreign rules, and price, time, source and freshness for each holding. A price job with retry, ownership share, daily snapshots, performance that adjusts for money added, and alerts. All of this runs on closing or statement prices until you choose a licensed provider.
7. **Proof:** tests for each rule, browser checks at phone and iPad widths, updated evidence pack and checklist, and a fresh security review. Nothing goes live until you approve publishing.

## Blocked on you (left marked in the checklist, never guessed)
- Live NSE/BSE prices: needs you to choose a licensed provider.
- Official ITR JSON filing format: needs your accountant to agree the scope. Until then the app prepares working papers.
- Mercedes GLS original amount: needs the sanction letter.
- iPhone/iPad push, camera and Face ID checks: need your device.
- Publishing: needs your approval.

## Technical details
- Checklist file: `/mnt/documents/Ledgerline_v6_Requirements_Checklist.md`. Each row lists the section reference, the requirement text, its status, the route or module, and the test file.
- Schema changes are additive only, applied through migrations, owner-scoped with RLS. Existing financial records are never rewritten. Money movements reuse the existing atomic RPCs.
- The pure rules go in `src/lib/books/*` with tests next to them. The UI is added inside existing pages, with no new tabs.
- Full test suite and build run after each step. Playwright checks at 402px and 1024px.
