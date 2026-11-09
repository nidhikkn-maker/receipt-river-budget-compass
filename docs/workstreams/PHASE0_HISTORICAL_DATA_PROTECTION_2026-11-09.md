# Phase 0: Historical data protection (V4 FND-05, FND-04 test hygiene, §8 test quality)

**Approved by KK:** 9 Nov 2026, isolated development only.
**Branch:** GitLab `phase0/historical-data-protection`, from `v4-development` (`c83bb39`).
**Code commit:** `659b207`.
**Status:** complete in isolated development. Nothing deployed, merged or run against production. Lovable and the live database are untouched.

## 1. Problems found and corrected

| # | Problem (before Phase 0) | Effect | Correction |
|---|---|---|---|
| P0-1 | **Every settings save wrote back the cleaned display copy.** `store.savePreferences` and `commitDocumentRecords` sent `normalizePreferences()` output as the stored data. | Records the app could not read were deleted on the next save of *any* setting. Lists over their caps lost their oldest records. Display-only tidying became permanent: clamped percentages, trimmed company text and defaults. | `preserveForSave()` (`src/lib/preserve-records.ts`): <br>• untouched sections and records are written back byte-for-byte as stored<br>• unreadable records are kept<br>• when the owner edits a record that had been tidied for display, the stored original is copied to `preservedRecords` |
| P0-2 | **Count caps on financial history** in `cleanBooks`: journals 5,000, asset events 3,000, property costs 3,000, leases 500, GST invoices 10,000, GST filings/advances 2,000, snapshots 1,500, holdings 500, document links 3,000, closed periods 200, period log 500, financial-year records 200, properties 200, findings 3,000 and others (28 lists). | Oldest records silently cut. | All count caps removed. Readability filters stay, for display only. |
| P0-3 | **Count caps elsewhere:** assets 200 and companies 50 (`cleanAssets`, `cleanEntities`), price overrides 2,000, statement batches 50×2,000, decisions 300, contract obligations 300, allocation plans 60. | Same, plus assets beyond 200 were never depreciated. | Caps removed. |
| P0-4 | **Statement upload evidence truncated:** posted/reconciled ids 3,000, undo rows 3,000, linked drafts 3,000, expected counts clamped to 3,000, references cut to 1,000 characters. Checkpoints re-cleaned *all* history. | Undo/recovery evidence for large uploads was lost; unreadable uploads were dropped by any checkpoint. | No caps or truncation. Checkpoints rewrite only the upload being saved; older and unreadable uploads are kept exactly. |
| P0-5 | **Monthly depreciation job** (service role, which bypasses the database approval guard) wrote `books.journals = cleaned view + new`. | Each monthly run could delete unreadable or over-cap journals. | `withPreparedJournals()` appends only new journals to the **stored** list. If the stored list cannot be read, it skips the write rather than replace it. |
| P0-6 | **Write-side caps:** net-worth snapshots 1,500 (`addSnapshot`), proposed document fields 300 (`unmappedFields`), milestone progress 120 (`recordProgress`). | Oldest history silently dropped on each write. | Caps removed. |
| P0-7 | **Demo cleanup deleted on lookup failure.** If the identity lookup failed, it deleted the owner's expenses, accounts and settings, even for a guest who had upgraded to a real account. | Possible deletion of a real account's data on a transient auth error. | `demoCleanupDecision()`: deletes only when the lookup confirms a still-anonymous guest; otherwise skips. |
| P0-8 | `@ts-nocheck` in the security SQL acceptance test (V4 FND-04 requires its removal). | 37 type errors hidden. | Removed. Errors fixed with runtime-checked `first()`, `email()` and `matrix()` helpers, so the tests are stricter, not weaker. |

**Where the old database guard did and did not protect.** Migration 0080's `save_reviewed_preferences` refuses unapproved changes to assets, entities, payment instruments, reimbursement profiles and 21 `books` sections. For those, the old behaviour usually produced a save *error* rather than silent loss, unless the owner approved a change in that section.
- **Not guarded**, so loss was silent on any save: company journals, closed periods, period log, document links, snapshots, quotes, findings, ITR hand-offs, statement upload history and batches, decisions, receivables and payees.
- **The depreciation job** bypassed the guard entirely.

**Owner review.** Unreadable records are listed by `unreadableRecords()` and shown as a notice on Inbox and in *Settings → Data*, with a JSON download. The notice changes nothing. It uses existing components only; no new design.

## 2. Files changed (code commit `659b207`)
- **New:**
  - `src/lib/preserve-records.ts`
  - `src/lib/demo-cleanup.ts`
  - `src/components/UnreadableRecordsNotice.tsx`
  - `scripts/integrity/historical-baseline.sql`
  - tests: `src/lib/preserve-records.test.ts`, `src/lib/preserve-records-sql.test.ts`, `src/lib/integrity-baseline-sql.test.ts`
- **Changed:**
  - `src/lib/store.tsx` (save paths, unreadable-record list)
  - `src/lib/preferences.ts`
  - `src/lib/books/types.ts`
  - `src/lib/assets.ts`
  - `src/lib/entities.ts`
  - `src/lib/books/price-overrides.ts`
  - `src/lib/statement-pipeline/history.ts`
  - `src/lib/books/assets-ledger.ts`
  - `src/lib/books/market.ts`
  - `src/lib/books/intake.ts`
  - `src/lib/intelligence.ts`
  - `src/routes/api/public/jobs/monthly-depreciation.ts`
  - `src/routes/api/public/jobs/cleanup-demos.ts`
  - `src/routes/_authenticated/inbox.tsx`
  - `src/routes/_authenticated/settings.tsx`
  - `src/lib/security-proposed-sql.test.ts`
- **Registers:**
  - `docs/registers/implementation/recheck_phase0.tsv`
  - `scripts/registers/merge_rechecks.py`
  - regenerated implementation register
- **Database objects:** none changed. No migration in this phase.

## 3. Tests executed and results
| Run | Commit | Result |
|---|---|---|
| Full suite, run 1 | `659b207` | **2,337 passed / 0 failed**, 324 files |
| Full suite, run 2 | `659b207` | 2,337 / 0, identical per-file results |
| Full suite, run 3 | `659b207` | 2,337 / 0, identical per-file results |
| `bun run typecheck` | `659b207` | clean; no `@ts-nocheck`/`@ts-ignore`/`@ts-expect-error` outside the generated `routeTree.gen.ts` |
| `bun run build` | `659b207` | pass |

Tests run in isolated PGlite 0.x with every applied migration (0000–0088) replayed (`src/test/full-schema-pglite.ts`). No test touches Cloud, GitHub or production. The JSON report is in `docs/registers/implementation/vitest-report.json`.

New tests (20). Deterministic datasets with no randomness, sized above every previous cap:
- **`preserve-records.test.ts` (14):**
  - Loading keeps 6,000 journals, 4,000 asset events, 600 leases, 12,000 invoices, 250 closed periods, 2,000 snapshots, 600 holdings, 3,500 document links, 260 assets, 70 companies, 350 decisions, 60×2,500 batch ids, and 3,500/3,200 upload ids with uncapped expected counts.
  - Display safety still holds.
  - An unchanged save writes every stored key byte-identical.
  - An unrelated setting change leaves every financial section identical.
  - Adding or deleting one journal changes only that journal and keeps the unreadable one.
  - Editing a clamped asset archives its stored original; untouched clamped assets keep their stored value.
  - A corrupt map entry and an unreadable gold rate survive.
  - Exactly 7 unreadable records are listed.
  - Upload checkpoints keep older and unreadable uploads.
  - Depreciation appends without replacing, and runs for asset #250.
  - Snapshot, milestone and proposed-field histories are uncapped.
  - The demo cleanup decision table.
- **`preserve-records-sql.test.ts` (2), against the real `save_reviewed_preferences`:**
  - The store's exact save pipeline saves an unrelated change with no approval prompt, and the database keeps 231 assets (including the unreadable one), 5,201 journals and 520 leases byte-identical.
  - The pre-Phase-0 payload changes financial sections and is refused without approval; stored data is unchanged.
- **`integrity-baseline-sql.test.ts` (4):**
  - The baseline has only `SELECT`/`WITH`.
  - It runs inside `BEGIN TRANSACTION READ ONLY` on the full schema.
  - It flags lists sitting exactly at a previous cap.
  - It hashes owner ids, gives identical output for identical data and different output after a change.
  - The read-only transaction refuses an update.

## 4. Evidence that historical data is preserved
- **Byte-identical round trip:** load → save of large stored data, including unreadable records, writes every stored key unchanged.
- **Through the real database function:** after an unrelated save, all financial sections are byte-identical in the database.
- **Owner edits are surgical:** only the edited or added or deleted record changes. Replaced originals that had been tidied for display are archived, never lost.
- **Scheduled job:** the stored journal list is a prefix of the result, and only new ids are appended.
- **Baseline tooling** (`scripts/integrity/historical-baseline.sql`) records per-owner fingerprints of the ledger, accounts, documents, stored files, audit tables, settings lists (with past-truncation flags) and upload evidence. Running it before and after any future migration proves no change. **It has not been run against production.**

## 5. Remaining risks
1. **Past losses in production are unknown.** Truncation or drops may already have happened before Phase 0. The baseline's `at_previous_cap` flags would reveal likely cases, but running it needs KK's approval for a read-only production check (APR-PROD-READONLY). Lost records cannot be recovered from the app; only from hosted backups, if any exist.
2. **Not yet live.** Phase 0 protects only once deployed. The published app still runs the old code; deployment is not authorised.
3. **Ledger rows (`expenses`) are still hard-deleted** when a user deletes an entry (`store.tsx:582`). That is a user action, not silent, but V4 requires reversal instead of deletion. This is planned for Phase 3, with the accounting engine.
4. **Settings JSON grows without caps.** It now keeps full history inside one row. The database limit is 20 MB per save (0080); a heavy company could approach it over years. Phase 2 moves registers into tables.
5. **Display limits kept by design** on UI-only lists: dismissed reminders, favourites, map positions, cooling-off, briefs, travel messages, autopilot actions and checked-audit marks. **KK to confirm** this classification.
6. **Unverified on hosted infrastructure:** this is evidence from isolated PGlite. Hosted Postgres behaviour of the same code and functions has not been run.
7. **Lint:** 31 `react-hooks/exhaustive-deps` and 2 `no-explicit-any` suppressions remain. These are lint, not type checking; none was added in this phase.

## 6. Requirement status after Phase 0 (implementation register, independent recheck)
| Requirement | Before | After | Note |
|---|---|---|---|
| REQ-SEC-040 (P0) no automation deletes financial data | Partial | **Partial**, stronger evidence | Silent deletion paths closed. Hard deletes, H-1/H-3 and process approvals remain open. |
| REQ-AUT-032 (P1) never silently rewrites history | Partial (mechanical) | **Partial**, rechecked | Display tidying no longer rewrites history. Versioned mappings not yet verified. |
| REQ-AST-032 (P2) depreciation runs | Partial (mechanical) | **Partial**, rechecked | All assets covered; journals still need approval to post. |
| REQ-LED-047 (P1) deleted record keeps id in archive | Partial (mechanical) | **Partial**, rechecked | Archive for replaced originals. Ledger hard delete remains. |
| V4 FND-04 "remove type-check suppression in critical SQL test" | Open | **Done (local)** | |
| V4 §8 deterministic repeated passes, commit recorded | Open | **Done (local)** | 3 identical runs at `659b207` |
| V4 FND-05 read-only baseline prepared | Open | **Prepared, not run** | Needs approval to run on production |

Totals in the register are unchanged (35 complete / 974 partial / 474 missing / 46 blocked / 7 unverified; P0 14/223/34/10/7). Phase 0 closes defects but completes no whole requirement, so no status was upgraded without evidence.

## 7. Revised production-readiness assessment (evidence at `659b207`)
| Area | Before Phase 0 | After | Reason |
|---|---|---|---|
| Historical financial verification | 3.0 | **4.0** | Silent loss paths closed and tested at scale; read-only baseline ready. Not 5+: production state is unknown and the fix is undeployed. |
| Entity/database implementation | 3.5 | **4.0** | The silent truncation found in the JSON registers is fixed. Entities are still not relational. |
| Automated testing | 7.0 | **7.5** | Suppression removed, deterministic triple run, large-dataset and real-database-function tests. Still no device, visual or browser-in-CI tests. |
| Security implementation | 5.0 | **5.0** | Demo-cleanup deletion risk closed; H-1/H-2/H-3 still open in the applied schema. |
| Accounting implementation | 4.0 | 4.0 | Unchanged (Phase 3). |
| UIX implementation | 4.0 | 4.0 | Unchanged. |
| Disaster recovery | 4.0 | 4.0 | Unchanged. |
| Production readiness | 3.0 | **3.0** | Nothing deployed; gates G1–G9 still open. |

## 8. Rollback
`git revert 659b207` on the Phase 0 branch restores the previous behaviour. No database objects or data were changed, so no data rollback is needed.

## 9. Items requiring KK's approval or confirmation
1. Confirm the UI-only list classification (risk 5).
2. Approve, separately, running `historical-baseline.sql` read-only on production to detect past truncation (exact SQL in the repository).
3. Approval to start Phase 1 (security).
