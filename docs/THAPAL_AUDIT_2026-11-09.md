# Thapal (formerly Ledgerline): independent repository audit, 9 Nov 2026

**Scope:** GitHub repository `nidhikkn-maker/receipt-river-budget-compass` at commit `65b9a36` ("Completed Milestone 2 build"); `origin/main` is at the same commit.
**Method:** I ran the CI pipeline for real and read the code area by area. I did not take the requirements register (`.lovable/requirements/register.json`) at its word: I spot-checked its claims against the code.
**Read-only:** no code, register entries or generated docs were changed. The hosted Cloud project, the published site and physical devices were **not** accessed.

## 1. Scorecard

| Area | Result |
|---|---|
| Dependency install (`bun install --frozen-lockfile`) | PASS once `cdn.sheetjs.com` was allowed. `xlsx` is pinned to a CDN tarball, not npm, so any network that blocks that host fails the install. |
| Typecheck (`tsc --noEmit`) | PASS |
| Production build (`vite build`) | PASS |
| Test suite (`vitest run`) | **FAIL: 9 failed / 2,196 passed (2,205 tests; 3 of 316 files fail).** Failures repeat on every run; they are not flaky. |
| Thapal rebrand | **Not in the repo.** "Thapal" appears 0 times; "Ledgerline" appears in 156 files under `src/`, `public/` and `vite.config.ts`. |
| Register (self-reported) | 570 VERIFIED COMPLETE / 325 PARTIAL / 4 BLOCKED / 0 MISSING out of 899 clauses |
| Register (after this audit) | Of the 570 "verified", **169 are headings or non-functional lines**, so about 401 are real functional verifications. At least 1 is false and 3 are overstated (see §6). |

## 2. CI results in detail

The 9 failing tests are in three files. Each file's test predates a code change made on 7–8 Nov, so the suite is red on `main`. Earlier progress notes (e.g. "Full suite … 1,793 tests PASS") no longer hold.

| Failing file | Tests | Cause |
|---|---|---|
| `src/lib/report-centre-all.test.ts` | 5 (company P&L, balance sheet, cash flow, trial balance, audit schedules) | `buildReportDoc` (`src/lib/report-centre.ts:181`, changed 8 Nov) now refuses corporate reports with no company selected ("Choose a company with available book records"). The all-report-types test passes no `entityId` and no books. The code fails safe; the test is stale. |
| `src/lib/report-specialized-persistence.test.ts` | 1 | Same refusal, reached through the persistence path. |
| `src/components/expenditure-builder-workflow.test.tsx` | 3 | `ExpenditureReportBuilder.tsx` (changed 8 Nov) now converts images through `<canvas>`. The jsdom test environment has no canvas (`HTMLCanvasElement.prototype.getContext` not implemented), so the "Confirm documents & generate" dialog never appears. This needs a canvas mock, or a check that real browsers behave correctly. |

The test `accounting-annual-acceptance.test.ts` failed only while `xlsx` was missing; it passes once dependencies install.

## 3. What works

Each item below has code present and its tests passed in this run. Files are given as evidence.

**Core personal ledger**
- **Statement classification:** a debit is never assumed to be an expense; refunds, card payments, transfers and loan EMIs are told apart. Files: `src/lib/statement-auto.ts`, `src/lib/statement-pipeline/classify.ts`, `pipeline.test.ts`.
- **Bank and card reconciliation, running balances and cross-checks:** `statement-pipeline/match.ts`, `statement-crosscheck.ts`, `running-balance.ts`.
- **Bulk category change with undo:** `store.tsx` `bulkSetCategory`, migration `drizzle/migrations/0016_bulk_category_history_undo.sql`.
- **Corrections with undo:** `financial-corrections.ts`, migrations 0041 and 0045.
- **Backup and restore (ZIP):** `backup.ts`, using `restore_finance_backup` (migrations 0013, 0068, 0072).
- **Data deletion:** `delete-data.ts` and `delete_my_finance_data`.
- **Inbox and review centre:** `inbox.tsx`, `review-centre.ts`.
- **Reports, charts and budgets:** `reports.ts`, `budgets.tsx`, `forecast.tsx`. Personal reports pass; the corporate exception is in §2.
- **Offline entries and sync:** `offline.ts` (AES-GCM, non-extractable per-owner keys, owner-bound authenticated data), `/sync-queue`, `store.tsx` retry.
- **Atomic money movements:** `finance_operation` (migration 0011), called from `store.tsx`.

**Accounting, company and investments**
- **Reconciliations** for loans, suppliers, customers, investments and intercompany balances: `books/recon.ts`.
- **Property and leases:** rent and deposit allocation and tenant ledger (`books/property.ts`); lease and property proposals (`books/intake.ts`).
- **Depreciation**, book vs tax: `books/depreciation.ts`.
- **GST:** GSTR-1/3B drafts and JSON in `books/gst.ts`. These are working papers, not filings.
- **Compliance obligations and ARN evidence:** `books/compliance.ts`.
- **Continuous audit:** `books/audit.ts`, `/audit`.
- **Market data:** end-of-day NSE/BSE closing prices (`api/public/jobs/closing-prices.ts`) and mutual fund NAVs (`mutual-funds.functions.ts`, mfapi), with staleness marking in `books/market.ts`.
- **Demat and fund holdings without duplicates:** `investments/demat.ts`, `books/fund-statement.ts`.
- **Loan and card EMI recognition:** `emi-match.ts`, `position.ts` `isCardEmi`.
- **Claims, bookings and travel, report jobs and recovery, assistant context:** all have library modules with passing tests.

**Platform and security**
- **Row-level security:** all 63 tables created in `drizzle/migrations` (89 files, 0000–0088) have RLS enabled. Migrations live in `drizzle/migrations`; there is no `supabase/migrations` folder.
- **Guest demo:** `start_demo_workspace` (security definer, not callable by anon); cron cleanup in `api/public/jobs/cleanup-demos.ts`.
- **Cron jobs:** all 7 under `api/public/jobs/` require `authenticateCronRequest`.
- **Passkeys (SimpleWebAuthn):** `passkeys.functions.ts`, with user verification required and stored challenges; used by `DeviceLock.tsx`.
- **PWA:** `vite.config.ts`, `public/sw-extras.js`. **Web push:** `push-crypto.server.ts`, `push-dispatch.server.ts`, five `push-*.test.ts` files.
- **MCP server:** `src/lib/mcp/`, 4 read-only tools with OAuth.
- **Accountant upload links:** `upload-link.ts` and `api/public/upload/$token.ts`. **Family and roles:** `family-*`, `team-access.ts`, `role-access.test.ts`.
- **AI privacy:** checked on the server in `assistant.functions.ts` and the extraction functions.
- **Themes and navigation:** `themes.ts`, `NavProgress.tsx`.
- No TODO, FIXME or stub markers in non-test `src`.

## 4. What is partial

Code exists but has gaps. Representative register IDs are given in brackets.

| Theme | Gap |
|---|---|
| Statement upload undo | `atomic-undo.functions.ts` calls `undo_statement_rows` and `statement_undo_receipts`, which exist only in `.lovable/staged-sql/statement-atomic-undo.sql`. The UI correctly refuses and shows "awaiting database release approval". [V60-0066 BLOCKED, V60-0068, V60-0732] |
| Accounting journal posting | `store.tsx` calls `post_accounting_journal`, `review_accounting_exception` and `set_accounting_review_grant`. These are defined only in `scripts/accounting-foundation.sql` ("STAGED ONLY … Do not install on production"); they are in no migration and not in the generated types. The call is behind `accountingAvailable()`, and no UI calls `postAccounting`. |
| Staged SQL never applied | Not in `drizzle/migrations`: `budget-merchant-authority`, `category-merge`, `company-bound-uploads`, `document-storage-boundary`, `report-history-versions` and `statement-atomic-undo`, plus the trigger in `reviewed_preferences`. The features they gate: budget allocation completeness, immutable merchant history, category merge with undo, company-specific uploads and DocuRepo access [V60-0082 BLOCKED], server-side report versioning, and preference approval. |
| Statement Desk as the only intake | Market and property panels open Smart Add, which embeds the Statement Desk page, rather than linking to `/statements`. There are no rendered navigation tests. [V60-0035–0037, 0070–0076] |
| Document extraction fixtures | No representative extraction tests for bank, card, trial balance, GST return, contract, insurance, utility or prior-year audited statements. [V60-0039–0063, 0206, 0230–0270, 0489, 0499] |
| Shared ledger and end-to-end flows | No integration tests for tax, asset, property and investment flows into one ledger, nor domain-level workflow acceptance. [V60-0013–0031, 0273–0274, 0652–0765] |
| Differences sent to the Inbox | Supplier and non-GST cases are done; lender, holdings and intercompany are not. Inbox items are flattened, not grouped by entity, account, year or risk. [V60-0016, 0312, 0597–0605] |
| Tax and Audit Centre | Company, trust (ITR-7) and LLP variants are incomplete. Official schemas are not pinned. GST composition and state due dates are missing. Rates are not effective-dated. [V60-0518, 0522, 0547, 0382] |
| Valuation and net worth | Price fetch → save → net-worth recalculation is not tested together; brokerage cash is not in the formulas. [V61-0004, 0027, 0051] |
| Access-control proof | RLS is proven on local PGlite only; search and all storage/RPC/role cases are not covered. [V60-0162, 0730] |
| Passkeys | No unit test for `passkeys.functions.ts`. The relying-party ID comes from the request's Origin header, with no allowlist. |
| Department limits | Only an "Edit department budgets" permission (`team-access.ts`) and report logic exist; no dedicated limit-enforcement check was found. |
| Reimbursement recognition | Reimbursement is an entry type, but the bank-statement classifier never proposes it. Credits are only refund, card payment, income or transfer (`statement-auto.ts:154-161`), and unknown credits are flagged for confirmation. [V60-0287, see §6] |
| Test suite | 9 stale or failing tests (see §2). |

## 5. What is missing

Each was searched for and not found.

| Item | Search evidence |
|---|---|
| **Thapal rebrand** | `grep -ri thapal` across the repo gives 0 hits. "Ledgerline" is still in the PWA manifest `name`/`short_name` (`vite.config.ts`); the page title, Apple web-app title and loading label (`src/routes/__root.tsx:88-89,170`); `LedgerlineLogo.tsx`; `public/brand/ledgerline-*.svg` (7 files); `public/splash/*.png` (11, content not inspected); push notification text (`public/push-events.js:7-8`); all 4 email templates; the passkey relying-party name (`passkeys.functions.ts:11`); about 60 route and component files; and `ledgerline:smart-add` event names. The MCP server title is a third name, "Receipt River Budget Compass". The live domain is `ledgerline.biz`. The repo shows no sign the rename synced from Lovable. |
| Category merge UI | No `categoryMerge`, `mergeCategor` or `commit_category_merge` in `src`; the SQL is staged only. |
| Licensed live intraday prices | Only end-of-day exchange closes (bhavcopy) and mfapi NAVs exist. [V61-0044 BLOCKED; provider choice deferred by owner] |
| Bank feeds / Account Aggregator, Siri, widgets, share sheet | `HANDOVER.md`: not built; needs a partner or licence, or a native wrapper. |
| Register coverage of personal-finance and platform features | The 899 clauses come only from the v6.0 and v6.1 specs (accounting and market data). Backup, budgets, bulk undo, offline, deletion, sign-in, demo, passkeys, PWA, push, MCP and themes have no register entries, so the register cannot show their verification status. |

## 6. Register discrepancies

1. **V60-0287 "Reimbursements" is marked VERIFIED COMPLETE. That is false for bank statements:** no classifier path produces a reimbursement. It should be PARTIAL.
2. **V60-0072/0073** say `MarketPanel.tsx` and `PropertyPanel.tsx` "link to /statements". They actually call `openSmartAdd(...)`, which embeds `StatementDeskPage` in an overlay. The outcome is similar, but the evidence text is wrong.
3. **V60-0597–0605** say `audit.ts` `groupBy` drives Inbox grouping. It is used only on `/audit`; the Inbox list is flat (`components/books/useAudit.ts` `auditInboxItems`).
4. **V60-0752** (security and permissions report, VERIFIED) rests on documents and PGlite tests, while its sibling entries V60-0162 and V60-0730 say cross-entity proof is incomplete.
5. **169 VERIFIED entries are headings or non-functional lines.** Counting them as "complete" inflates the headline figure.
6. Stale counts, e.g. "intake-fixtures.test.ts (21 tests)" now has 24. Not false, but out of date.
7. The progress notes' claim that the full suite passes is no longer true at `65b9a36`.

## 7. Cannot be verified from this repository

| Item | What it needs |
|---|---|
| Which migrations and staged SQL are applied on hosted Lovable Cloud; whether hosted RLS matches the migrations | Cloud database access |
| The published site (`ledgerline.biz`) matching this commit, and whether the brand there already says Thapal | Access to the published site; owner publish history |
| Hosted private-file download, signed URL expiry, company-member grant and revoke | Hosted isolated acceptance environment |
| Hosted multi-device import recovery; hosted report-job restart | Hosted environment, multiple browsers |
| AI extraction accuracy (receipts, documents, statements, bookings); the assistant | AI gateway and real documents |
| Face ID / platform passkeys, iOS splash and standalone mode, camera, push delivery, offline install, iPhone/iPad layout [V61-0120 BLOCKED] | Physical devices and the VAPID seed |
| Live NSE/BSE/mfapi fetches and cron schedules (no `cron.schedule` in migrations) | Hosted scheduler and network |
| Upload-link and accountant email delivery | Email provider |
| Official ITR/GST filing formats; Mercedes GLS loan facts | Owner decision; sanction letter (`docs/OPEN_BLOCKERS.md`) |

## 8. Recommended next steps (in priority order)

1. **Make CI green.**
   - Give the corporate report types an entity and books fixture in `report-centre-all.test.ts` and `report-specialized-persistence.test.ts`.
   - Add a canvas mock (or `canvas` dev dependency) for `expenditure-builder-workflow.test.tsx`, then check image conversion in a real browser.
2. **Finish the Thapal rebrand in the repo.** Update:
   - the manifest, `<title>` and Apple title, and loading label;
   - the logo component and `public/brand` SVGs, then regenerate the icons and splash screens (`scripts/brand/build_icons.py`);
   - the email templates, push text, passkey relying-party name and MCP title, and `docs/brand-usage.md`.

   **Keep** the IndexedDB name `ledgerline-offline` (renaming it would orphan entries queued offline on devices) and existing event and storage keys, unless they are migrated. Decide separately whether the domain changes.
3. **Decide on the staged SQL with the owner.** Either approve and move each staged file into a numbered drizzle migration (statement undo, category merge, budget/merchant authority, company uploads, DocuRepo boundary, report versions, preference trigger, accounting foundation), or remove the dead client paths.
4. **Correct the register:** V60-0287 to PARTIAL, fix the evidence for V60-0072/0073 and 0597–0605, and report functional clauses separately from headings. Add register coverage for the personal-finance and platform features.
5. **Pin `xlsx` to a source CI can always reach**, or document that `cdn.sheetjs.com` must be allowed.
6. Continue the PARTIAL themes in §4, starting with extraction fixtures and end-to-end shared-ledger acceptance.
