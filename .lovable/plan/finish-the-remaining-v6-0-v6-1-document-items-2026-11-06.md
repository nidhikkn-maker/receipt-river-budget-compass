# Finish the remaining v6.0 / v6.1 document items

Already done and not rebuilt: customer/supplier matching, rent vs deposit, corporate actions in holding checks, opening-balance posting, full tax calculation, frozen years, NSE/BSE closing prices, monthly depreciation, role access.

Still waiting on you (not in this plan): licensed live-price provider, final ITR filing format, GLS sanction letter, real iPhone/iPad checks.

All items below are built in one run, in this order, without stopping to ask "continue".

## 1. Fixing details read from a document (rank 11)
- One editable set of details per uploaded document. Every correction immediately refreshes the suggested company, asset, lease or year card, even if no card was suggested before.
- Each corrected value remembers it was changed by you and what it was before.

## 2. Every figure points back to its source (rank 2)
- Figures taken from documents (company, asset, lease, year, tax) keep the document, page/section and original printed value.
- Tax workpaper, depreciation and audit screens show "Source: document, page" next to each figure; figures without a source are labelled "estimate".

## 3. Approvals checked on the server (rank 3)
- Capitalising an asset, historical corrections, reopening a closed period, activating a new tax rule and finalising a return go through one server approval step that checks your Settings approval rules, the record's current version, and saves a before/after record.
- The screens keep showing who must approve; the server refuses anything that skipped it.

## 4. Safer document saves (rank 4)
- Saving from a document sends only the specific change (e.g. "add this asset"), not your whole settings copy. Two uploads saved at the same time can no longer overwrite each other; retrying a save never duplicates.

## 5. Company-level document access (rank 1)
- Documents, downloads, search and exports respect company access: a team member only sees documents for companies they're allowed on. You (owner/admin) see everything. Admin chooses company access per person in Settings → Team access, with Edit/Remove.

## 6. Closing a period saves proof (rank 12)
- Closing a month or year stores a snapshot: ledger version, reconciliation results, source documents, approvals and tax rule versions used.
- Asset, lease and tax-profile changes dated in a closed period are blocked on the server too. Reopening creates a new recorded version instead of overwriting.

## 7. Fuller GST drafts (rank 7) and tax-form registry (rank 6)
- GSTR-1/3B drafts include invoice lines, place of supply, credit/debit notes, exports, exempt/nil, reverse charge and ITC reversals; every total ties back to invoice IDs.
- Each return form has a registered version, period and company type. Drafts are labelled "working draft — not validated" unless a matching official format is registered (final format still waiting on you).

## 8. Complete opening trial balance and asset postings (ranks 8, 13)
- Opening entries now include fixed assets, accumulated depreciation, capital and reserves in balanced groups, with undo.
- Asset events (capitalise, impairment, revaluation, sale) prepare balanced journal entries for approval.

## 9. v6.1 leftovers
- Broker cash kept separate from shares in net worth; ownership share on demat holdings; net worth uses loan outstanding, not original amount; signed money in/out in snapshots.

## 10. Acceptance check pack (rank 15)
- Isolated document → ledger → report checks covering the §71 cases (duplicate renamed file, failed save, other-company denial, closed period).
- A generated report listing each requirement with pass/fail and evidence, saved to Files. Mock checks are labelled as such.

## Technical details
- New migrations: entity_members + can_access_entity(); approve_books_operation(action, expected_revision, before, after); books_ops RPC for typed intake operations with idempotency keys and row lock; period_close_evidence table and freeze trigger for register inputs in preferences.
- Code: DocumentIntake single typed state; EvidenceRef/DerivedFigure in books/types.ts propagated through intake.ts, taxcomp, tax-workpaper; regulatory.ts artifact registry + validateReturnDraft(); gst.ts extended; fy.ts balanced opening groups; assets-ledger applyEvent postings; net-worth fixes.
- Tests: PGlite tests for each migration (denial cases), unit tests per rule, Playwright acceptance script plus scripts/v6-acceptance-report generator. Full suite must pass before finishing.
