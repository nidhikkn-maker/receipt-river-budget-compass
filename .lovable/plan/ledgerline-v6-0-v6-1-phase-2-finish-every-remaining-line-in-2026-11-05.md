# Ledgerline v6.0 + v6.1 — Phase 2: finish every remaining line in one run

## How this run works
- One continuous run through every open line of both documents. No "Continue" prompts in between. I stop only when every buildable line is done and tested, or a step truly needs something from you.
- I start by updating the requirement checklist (Files: Ledgerline_v6_Requirements_Checklist.md) line by line. Each line is marked done, built now, or blocked, with where it is in the app and which test proves it.
- Existing features are reused, not rebuilt. No new tabs: everything goes into the current pages (Statement Desk, DocuRepo, Companies, Assets, Tax, Audit, Wealth, Home).

## Work order
1. **Documents and Statement Desk (v6.0 §1–20)**
   - Saving a document is all-or-nothing: the original, its details and its entries go in together or nothing is saved.
   - Every figure keeps the page and quote it came from. A figure without a page can't be confirmed.
   - Invoices create GST drafts. Loan and account documents link to the right account or loan.
   - Add Expense receipts go through the same check steps as Statement Desk.
   - Every check step stores its real result. Runs that stopped partway pick up where they left off.
   - Full version history for schedules and returns.
2. **Companies, years and permissions (§21–30)**
   - Separate access for each company. The database enforces it.
   - Confirmed tax profile for each company. Opening balances per company.
   - Approvals are checked on the server and kept in a log that can only be added to.
   - Losses carried forward need the filed return as proof.
3. **Reconciliations and audit (§31–42)**
   - Real figure-by-figure comparisons for loans, suppliers, customers, investments and between your own companies.
   - "Reconciled" only shows when every line is covered.
   - Each audit finding links to its document, page and entries. Closed years keep a frozen evidence pack.
4. **Assets and property (§43–52)**
   - Asset life events (bought, put to use, sold, written off) post balanced non-cash entries.
   - Depreciation rates come from approved rules. Joint ownership, tenant list, lease versions, and deposits held as a liability.
5. **Tax, GST and rules (§53–64)**
   - Form 16, 26AS/AIS and salary documents are read in. ITC is allowed only when it appears in GSTR-2B. QRMP and composition schemes.
   - Picks the right ITR form (ITR-1 to ITR-7). Each draft is tied to the rule version it used.
   - Official return files in the right layout, with the remaining fields flagged for your accountant.
6. **Market and net worth (v6.1 §1–15)**
   - One shared list of holdings. Prices are matched by exchange and security type. Verified and provisional quantities are kept apart, and broker cash is shown separately.
   - Bonds, SGBs, gold and foreign holdings are valued by their own rules.
   - Each holding shows its price, time, source and whether the price is out of date. Failed price fetches are retried and recorded.
   - Ownership share is applied. Daily snapshots, performance that ignores money you added, alerts, and one net-worth figure with its as-of time.
   - Bonus, split and dividend events update holdings.
7. **Proof (§65–72, v6.1 acceptance)**
   - Full test pack using isolated data. iPad landscape and phone layout checks. Screenshots.
   - Evidence pack v2 in Files and a fresh security review.

## Still blocked on you (marked in the checklist, not guessed)
- Live NSE/BSE prices: which licensed price provider to use.
- Final ITR filing format: confirm with your accountant.
- Mercedes GLS sanction letter.
- iPhone/iPad device testing.
- Approval to publish.

## Technical notes
- All schema changes are additive, scoped to the owner and protected by row-level security. Money writes use the existing atomic database functions.
- Business rules stay as pure functions in src/lib/books/* with tests. Database rules are tested with PGlite.
- roadmap.md and src/lib/AGENTS.md are updated as each part lands. The full test suite and type check run before reporting.
