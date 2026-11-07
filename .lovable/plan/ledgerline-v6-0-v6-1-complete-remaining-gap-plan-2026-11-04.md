# Ledgerline v6.0 + v6.1 — complete remaining-gap plan

Two fresh, independent line-by-line audits were run this round (v6.0 §1–72, v6.1 §1–15), each instructed to re-read the document several times, and checked against the current app. Every gap they returned is listed below, together with your two new requests. Work runs top to bottom; each batch ends with tests and a phone-width check. Nothing is published without your approval.

## Batch A — your two new requests (first)

### A1. Opening-balance workflow (v6.0 §19)
- New "Opening balances" step for each company/person and financial year: it shows audited closing figures next to your records on the opening date (bank, cash, investments, receivables, loans, payables, fixed assets, accumulated depreciation, capital and reserves, tax balances, other balances).
- You link each line to one or more of your accounts. The app shows the difference for each account.
- "Post opening entries" creates one dated entry per account (1 April of the new year) for exactly the difference. These are labelled "Opening balance FY …", never count as income or spending, and are skipped if the account already agrees.
- Posting is blocked when the figures don't balance, a schedule is missing or a line is unlinked, unless you record a written reason for that line (kept as an exception).
- Each posting is saved once only (re-pressing does nothing), recorded with who/when/source document, can be undone as a whole, and respects locked periods.
- The comparison stays visible after posting, showing "agrees" or the remaining difference.

### A2. Accountant-ready income tax handoff (v6.0 §46)
- A "Prepare handoff for accountant" button on each tax working. It produces one ZIP containing:
  - Computation sheet (PDF + spreadsheet): every income head, set-offs, carry-forwards, credits (TDS/TCS/advance/self-assessment), estimated payable/refund, regime and form suggested.
  - Schedules: salary, house property, business (receipts, expenses, depreciation), capital gains lot by lot with holding period, other sources, losses brought/carried forward, tax credits with matching 26AS/AIS line.
  - Source list: each figure links to its entries and documents; original documents included.
  - Assumptions and unresolved items (unapproved rules, unconfirmed profile, estimates).
  - "Still needed from you" checklist, each with why it's needed: e.g. missing Form 16, 26AS/AIS, home-loan interest certificate, capital-gains statement, deduction proofs (80C/80D etc. when old regime), advance-tax challans, prior-year return for carried-forward losses, rent receipts, property tax receipts.
- The same checklist shows on screen with "I've added it" links that open Statement Desk.
- Handoff status: Prepared → Sent → Questions → Filed (with acknowledgement number). Each version is a frozen snapshot and later edits don't change it.

## Batch B — single intake and DocuRepo (v6.0 §2, §3, §5–8, §10, §11, §15, §58–59)
- Statement Desk re-routes any upload identified as a bank/card statement to the statement pipeline, whatever page it came from.
- Validate / match / reconcile / audit steps record real results. A failure stops completion, and a run that saved records but couldn't close is recovered on next open.
- Bank and card statement originals are stored in DocuRepo with their own identity, and each imported line links back to its file and page (beyond the 10-item upload history).
- Classification also proposes reporting period, related asset, property, investment and tax registration, creating all relevant links in the central link list (purchase payment, supplier, insurance, depreciation, property).
- One editable extracted-value model: correcting a field updates the proposal, the matching and the checks. Typed values (entity, asset, lease, tax, audited lines) keep page, confidence and verification like other fields.
- Long documents are read in chunks with a "possibly incomplete" flag instead of stopping at 20/40 lines.
- Detailed schedules, qualifications and returns keep full version history instead of being replaced.
- Search also matches linked property, asset, account and transaction names, with linked-record filters in the UI.
- New-field approval runs a real compatibility test (sample documents re-read with the new field) and stores the result.
- Incomplete asset/lease proposals stay editable instead of disappearing. Unknown entity kind, asset kind and in-use date stay "unknown" until confirmed. Proper calendar, life, residual and identifier validation.
- Asset documents are read for put-to-use date, method, useful life, residual and opening tax WDV, so they don't have to be typed.

## Batch C — entities, history, permissions (v6.0 §5, §10, §14, §16, §20, §45, §56–57)
- Per-entity access: you can give a family member/accountant access to selected companies only. Search, export and reports respect it (database-enforced).
- Structured registrations (PAN, GSTIN, CIN, TAN, others) with verified status. Authorised persons with role, scope, validity and evidence. Entity matching uses only verified identifiers and stops on conflicts.
- A personal tax profile must be confirmed (no silent new-regime default).
- Losses carried forward require filed-return evidence and stay separate per person/entity.
- Approvals recorded with actor and time in an append-only log for tax treatment, historical corrections, ownership/tenant links and asset lifecycle. Locked periods apply per entity.

## Batch D — reconciliations and audit (v6.0 §21, §23–24, §52–54)
- One authoritative tax and GST working per entity; the older unscoped estimates on the tax page are removed or reconciled to it.
- Supplier matching also requires entity, account, currency, direction and invoice-level allocation.
- New customer reconciliation (invoices vs receipts) feeding the Inbox.
- Intercompany compares both sides' receivable/payable balances. Investment reconciliation includes opening holdings and corporate actions, and flags incomplete history.
- Audit findings link the exact document, page and entries. More substantive classification, depreciation-vs-ledger and tax mismatch checks. Intercompany uses entity-account mapping.
- "Reconciled account" requires full statement-period coverage and an agreed closing balance.

## Batch E — assets, depreciation, property (v6.0 §27–41)
- Assets need a confirmed owner (or stay "owner unresolved"), and every creation path applies the capitalisation policy.
- Acquisition, impairment, revaluation, disposal and owner/inter-entity transfers produce approved, balanced entries reconciled to the payment.
- Depreciation: tax rates and blocks as effective-dated approved rules, one block result used everywhere (tax working, comparison), entity-separated blocks, background monthly preparation with full catch-up. Posting is a balanced depreciation-expense / accumulated-depreciation entry so profit reports include it.
- Asset lifecycle shows openable evidence with roles (photo, disposal, valuation report).
- Property becomes its own page (inside the existing "More", no new bottom tab), with joint ownership shares, legal/acquisition details and survey and other identifiers kept as fields. Supporting documents enrich an existing property instead of creating a new one.
- Tenant master (ID, contact, address, PAN/GST, TDS treatment). Lease renewals versioned. Maintenance/vendor workflow. Improvements can be capitalised.
- Saved rent allocations with advance and deposit balances. Deposits move to a deposit liability by approved correction. Accrued rent, receivables, property GST and income-tax treatment linked.

## Batch F — tax, GST, rules (v6.0 §46–51)
- Complete tax working: old/new regime with deductions, special-rate capital gains, surcharge/cess, non-individual rates by chosen section, full loss set-off and carry-forward schedule, entity investment gains, and reconciliation of credits to 26AS/AIS.
- GST: ITC gated by uploaded GSTR-2B. Quarterly (QRMP) and composition (CMP-08/GSTR-4) workings by scheme. Fuller GSTR-9 tables.
- Rules: store the official notification/schema copy, regression tests per rule, pinned rule versions on filed/closed years (changes need explicit historical-correction approval).
- Official forms: store the official ITR and GST JSON schemas per period, validate generated drafts against them and keep the results. Eligibility for ITR-1 to ITR-7. Where a full ITR schema can't be filled from your records, the accountant handoff (A2) lists exactly which schedules remain.

## Batch G — market prices and net worth (v6.1 §1–15)
- One canonical holding per security and account: manual entries link to Demat/investment accounts instead of duplicating them. Per-account position checks.
- Capture exchange, symbol and instrument type. Quotes match the holding's exchange and type, with no blanket NSE preference.
- Holding quantities are marked verified or provisional; unresolved mismatches are shown as provisional.
- Broker cash kept separate from securities, so an account total never double-counts holdings. Bond/SGB rules (face value, accrued interest), and foreign-currency holdings converted on the server.
- Every holding (manual and Demat) shows exchange, trading status, last price, real price time (or "date only"), provider, last successful refresh and a stale badge. A missing price is shown as "no price", never ₹0.
- Price job: per-exchange completeness, failure reporting and retry. Per-holding failure marks stale but keeps the last good value. Screen refreshes on open/focus. Automatic NAV refresh after publication, covering all funds.
- Gold: choose valuation method; purity limited to 24k or below and positive weight.
- Ownership share applied to Demat, accounts, property valuations and loans. Bank figures marked verified only when reconciled.
- Home, Wealth and Financial Position use one net-worth calculation, with a real "as of" time and a freshness line for each part (bank, investments, property valuation date, loan verification date).
- Automatic daily valuation snapshot, complete allocation, flow-adjusted performance across all investments.
- Alerts: corporate actions, Demat missing prices/stale NAVs, statement vs trade-history quantity, consistent ownership basis, configurable unusual-value threshold, change vs current valuation.
- Source-permission record for exchange files and the NAV source. Provider labels shown accurately.

## Batch H — proof and acceptance (v6.0 §60, §69–72; v6.1 §14–15)
- iPad landscape list-and-detail layouts for Tax, Property, Assets. Phone layout for the opening-balance table.
- Isolated end-to-end runs with real sample documents through upload → read → approve → ledger → report, including interrupted uploads, retries, cross-entity access, source-to-report traceability, and the eight financial-integrity checks.
- Evidence dossier in Files: each report named in §72 (system audit, intake, DocuRepo, extraction accuracy, entity/FY/opening balance, asset/depreciation/property/rental/Demat, regulatory, tax/GST, continuous audit, integrity, security and permissions, screenshots, exception register, deployment readiness) plus the v6.1 market approval pack.
- Fresh security review. Production publishing only after your explicit approval.

## Needs you (cannot be finished without)
- **Live intraday NSE/BSE prices and trading status:** need a licensed provider you choose. End-of-day prices continue meanwhile.
- **Permission terms for exchange files and the NAV source:** need confirming for your intended use.
- **Mercedes GLS original amount/start date:** need the sanction letter.
- **iPhone/iPad checks** of push, camera and layouts: need your devices.
- **Accountant review** of tax rules, and **approval to publish**.

## Technical details
- Opening entries reuse the existing `adjustment` type with `adjustmentSign`, tagged with the FY and head, and deterministic ids (entity+FY+account) for idempotency. Posted in one owner-checked atomic database function with an audit row, undone through the existing corrections/undo pattern. Account opening balances stay unchanged.
- Handoff ZIP built in the browser (fflate, jsPDF with the existing Tamil-safe text helpers) from `taxComputation` extended to return per-figure source ids. Snapshots stored like Reports Centre history (report_history + owner receipts prefix). The missing-items list comes from a pure tested `handoffGaps()` rule.
- New tables (entity access grants, approval log, opening postings, handoff snapshots, official schemas) get owner RLS, grants and PGlite regression tests. Entity access is checked by a security-definer helper.
- Background depreciation, NAV refresh and daily snapshots run as managed scheduled routes with cron authentication.
- Price matching changes live in `market.ts`/`bhavcopy.ts`. One `canonicalNetWorth()` replaces the separate `position.ts` path.
