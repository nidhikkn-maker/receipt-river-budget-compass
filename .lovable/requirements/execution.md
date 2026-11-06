# Consolidated execution ledger

## Source of truth
- Original documents are preserved byte-for-byte in `.lovable/specifications/v6.0.md` and `v6.1.md`, with SHA-256 fingerprints in `register.json`.
- `register.json` accounts for every nonblank source clause (899, including contextual headings). These are **not** final unique functional requirement counts.
- Two independent original-document audits have returned; neither certifies an exhaustive atomic acceptance register. Their findings are retained in `audit-2026-11-06.md`. No implementation-only claim is counted as verified completion.
- Latest master instruction authorises ordinary implementation, not production deletion, filing, paid services or publication.

## Current implementation
- Return draft registry now appears in Tax Centre exports; removed unsupported claims of official GST format validation.
- Database register safeguard applied and confirmed present: leases, company tax-year profiles, asset financial facts, period definitions and historical logs. Physical checks remain editable. Ten isolated PostgreSQL tests pass; no production financial records changed.
- Close/reopen now writes owner-scoped database-generated evidence with SHA-256 ledger/register revisions, source documents, approval history and rule versions. Audit downloads and shows retained snapshots; seven disposable PostgreSQL tests and isolated close/download/reload/reopen browser checks pass. Legacy closures without evidence are explicitly labelled.
- Intake commits are owner-serialized, revision-checked and replay-protected with atomic evidence locking; seven disposable PostgreSQL tests pass. All preference updates advance the shared revision. The exact approved request/payload/revision now persists in the document run before committing; isolated Statement Desk lost-response/reload/retry check passed with one save. Typed server proposal validation remains partial.
- Portfolio signed flows now count contribution/redemption transfers across the portfolio boundary, exclude internal moves/counterparts, feed snapshots and movement alerts, and include Demat allocation. Actual stored price-fetch timestamps replace invented evening times. Eight flow/alert tests and a timestamp regression pass.
- Close-operation bypass hardening is applied: transaction-scoped private authority rows gate closing state; ordinary preference upserts retain current closure state. Backup restore preserves existing closures, archives imported closing snapshots separately as unverified and never manufactures authoritative evidence. Eight disposable PostgreSQL tests and controlled Audit history/download and Settings backup recovery checks pass; Cloud safeguard presence read back.
- Typed document intake validation is enforced in Cloud for changed entity/asset/property/lease/FY/GST/tax/holding/quote records, including document-type consistency, money types and ranges, real dates and basic shape. Eight disposable PostgreSQL tests pass; company descriptive fields remain optional. Full nested/provenance validation and server approvals are still open.
- Standalone loan net worth now uses dated owner-confirmed retained lender statement observations, never undated/original principal; missing/conflicting observations explicitly mark incomplete totals. Seven pure tests and controlled Wealth confirmation/save/reload/mobile checks pass. Printed outstanding, as-on date and page are now read from the statement and prefilled (never confirmed automatically; conflicting figures refused); three tests pass. Server-enforced source verification remains open.
- Next executable requirements: server approvals/full typed provenance, company document access, demat ownership and broker-cash reconciliation, closing blockers and remaining acceptance.

## External dependencies
- Licensed intraday feed choice and credentials (deferred by owner).
- Final official ITR schema adoption (deferred by owner).
- GLS sanction/disbursal evidence (not supplied).
- Physical iPhone/iPad and isolated hosted write acceptance (not available here).
- Consequential production publication requires explicit approval.

## Verification
- Full suite: 204 test files, 1,595 tests passed on 6 November 2026. Preview compilation log reports build OK. Master register updated with partial status and observed evidence; no blanket completion.
- Known unambiguous source-field corrections now refresh typed entity/asset/lease/GST proposals, persist in runs and retain printed originals. Ambiguous labels never silently change financial facts; five regressions pass. Full field/provenance coverage remains incomplete.
- The original GUC-based period authority prototype was superseded: Cloud refused setting its custom permission parameter. The applied implementation uses a private owner/transaction authority table, removed in the same close transaction; no permission marker leaks into later writes.
- Isolated signed-in browser check passed: company tax profile edited from 60% to 75% and survived reload; accountant ZIP downloaded with PDF and three CSVs using the edited assumptions. Screenshots inspected. Production writes were intercepted, so this does not certify Cloud persistence.
- Controlled browser evidence never certifies hosted saves or real-device behaviour.
## 6 Nov 2026 — Priority 1 continued (company access)
- Register relabelled: 890 unexamined clauses now NOT AUDITED (they never asserted missing code), 9 PARTIAL kept; status legend recorded in register.json.
- Member uploads (migration 0078): edit-grant members can add documents owned by the granting owner and tagged only to a company they can edit; files upload into the owner's private prefix only while an active edit grant exists. View-only members, other companies, untagged rows and strangers are refused; revocation closes both paths immediately. Six disposable PostgreSQL tests pass.
- Shared view: per-company search over entries and documents, PDF export (same company-only rows as CSV, access level and spending total printed), and an Add document control for edit members. Five new pure tests pass.
- Company-access suite: 23 tests pass (documents, files, transactions, uploads, CSV/PDF/search). Remaining Priority 1 gap: a two-real-account hosted check, which needs a second sign-in (external).

## 6 Nov 2026 — Document intake server approval (Priority: typed saves & centralized approvals)
- Migration 0079: commit_document_intake_reviewed now requires the exact approved attempt (id, document, payload, lock, revision) retained in the owner's durable document run before saving; unreviewed or altered payloads are refused. Committed retries still replay even after the run attempt is removed.
- Existing intake fixtures updated to seed approved runs; three new approval tests (no run, altered payload/lock, replay after run removal). All 310 books tests pass; typecheck clean.

## 6 Nov 2026 — Broker cash overlap check (audit item 6)
- recon.ts brokerCashOverlap(): flags a broker_cash holding and a cash-like account (savings/current/cash/wallet/investment/other_asset) whose names share a significant word (e.g. the broker's name) — the same money would otherwise be counted twice in net worth. Read-only; clears when records are fixed. Generic words (cash/balance/fund) never match on their own; liabilities and archived accounts are ignored.
- Surfaced in the continuous audit as a high-risk "Investment overlap" finding pointing to Wealth. Four new tests; full suite 1,629 passed.
- Item 7 (demat legal ownership) verified already complete: sharePct stored and validated 0–100, applied in valuation, editable and shown as "% yours" in the Market panel.
