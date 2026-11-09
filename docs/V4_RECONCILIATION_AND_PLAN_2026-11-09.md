# Thapal V4: reconciliation against the code, gap analysis and phased plan

**Date:** 9 Nov 2026 · **Evidence commit:** `722b245` (code) on branch `claude/git-up-thapal-audit-bbjy2k`
**Authority:** Thapal V4 Production Readiness Master (`docs/specs/THAPAL_V4_MASTER_2026-11-09.md`), which contains the full V3 master, the V3.1 contract and the V4 recovery contract.
**Status:** analysis only. No implementation phase has started; awaiting KK's approval. Nothing touched production; nothing merged or published.

## 0. The three records (kept separate, all regenerable)

| Record | Answers | Files | Regenerate |
|---|---|---|---|
| **Master specification** | What Thapal must do | `docs/registers/master/`: `requirements.csv` (1,536 REQ), `architecture.csv` (68 ARC), `acceptance_tests.csv` (159 = 149 V3 + case 150 + 9 V3.1 journeys), `v3_decisions.csv` (50), `p3_decisions.csv` (14); screens in `docs/registers/screen_coverage.csv` (111) | `scripts/registers/import_v4_master.py` |
| **Implementation register** | What has actually been built and tested | `docs/registers/implementation/`: `requirements_status.csv`, `summary.json`, `manual_recheck.csv`, `architecture_recheck.tsv`, `vitest-report.json` | `scripts/registers/build_implementation_register.py` |
| **Decision register** | What KK approved, rejected or deferred | `docs/registers/decisions/decision_register.csv` (89 entries) | `scripts/registers/build_decision_register.py` |

**How each requirement's status was established:**
1. **Mechanical (all 1,536 rows).** Every claimed code file, test and database object was checked against the repository at `722b245`.
   - Claimed code files: 100% resolve.
   - Claimed tests: all exist, and all pass in the full run (2,317 / 2,317 tests, 321 files; per-file JSON report stored).
   - Database objects: each classified as applied migration, proposed-only, staged-only, or app-level JSON.
2. **Independent recheck (all 288 P0 rows and all 68 ARC rows).** Reviewers read the actual code for each requirement and treated V4's "known limits" as hypotheses to test. Their verdict replaces the mechanical one.
3. **Non-P0 rows (1,248) are mechanical only.** "Complete" there means *claimed evidence exists and passes and V4 lists no remaining limit*. Each phase rechecks its own rows before claiming them.

The vocabulary follows the honesty rule:

| Completion | Meaning |
|---|---|
| Complete (local evidence) | Every clause built, with a passing test |
| Partial | Some clauses built |
| Missing | Nothing meaningful built |
| Blocked | Needs an external approval, provider, device or artwork |
| Unverified | Code may satisfy it, but the required evidence (device, hosted, real documents) can't be produced locally |

States run Not started → Coded → Tested (local) → Deployed → Production-verified. **No row is Deployed or Production-verified.**

## 1. Requirement-by-requirement status (summary; row level in `requirements_status.csv`)

| Scope | Complete (local) | Partial | Missing | Blocked | Unverified | Total |
|---|---|---|---|---|---|---|
| **All 1,536** | 35 | 974 | 474 | 46 | 7 | 1,536 |
| **P0 (288, independently rechecked)** | 14 | 223 | 34 | 10 | 7 | 288 |

V4's baseline for comparison was 42 implemented, 185 partly tested, 786 in development, 485 not started and 38 blocked. The recheck rarely raised a row and often lowered one. Of the 21 architecture features V4 called Implemented, 11 are now lower.

| Area | Total | C | P | M | B | U |
|---|---|---|---|---|---|---|
| DEV building rules and gates | 121 | 5 | 78 | 24 | 10 | 4 |
| UIX Signature Flow and actions | 98 | 0 | 66 | 26 | 4 | 2 |
| SEC security, privacy, recovery | 95 | 5 | 63 | 19 | 8 | 0 |
| ADD intake and upload requests | 93 | 2 | 61 | 20 | 9 | 1 |
| EXP expenses and statement | 83 | 1 | 67 | 15 | 0 | 0 |
| AST assets and depreciation | 75 | 2 | 54 | 19 | 0 | 0 |
| TRV travel | 73 | 1 | 47 | 25 | 0 | 0 |
| RPT reports, Ask, Health Centre | 65 | 5 | 44 | 16 | 0 | 0 |
| TAX income tax and compliance | 61 | 3 | 35 | 22 | 1 | 0 |
| AUT automation and reading quality | 52 | 0 | 21 | 28 | 3 | 0 |
| LED one ledger, posting, IDs | 52 | 0 | 46 | 6 | 0 | 0 |
| CAL calendar | 48 | 1 | 26 | 21 | 0 | 0 |
| LNG plain language | 45 | 0 | 29 | 15 | 1 | 0 |
| BNK money and banking | 39 | 4 | 26 | 9 | 0 | 0 |
| NTF notifications | 35 | 0 | 15 | 18 | 2 | 0 |
| BIZ business and close | 34 | 3 | 21 | 10 | 0 | 0 |
| PRP property | 33 | 0 | 21 | 12 | 0 | 0 |
| ROL roles | 31 | 0 | 24 | 7 | 0 | 0 |
| WLT wealth, insurance, forex | 30 | 0 | 17 | 13 | 0 | 0 |
| RUL rules watch | 28 | 0 | 13 | 12 | 3 | 0 |
| GOV company secretary | 28 | 0 | 3 | 25 | 0 | 0 |
| INV investments in the books | 27 | 0 | 25 | 2 | 0 | 0 |
| TDO To-do | 26 | 1 | 21 | 4 | 0 | 0 |
| INT integrations | 26 | 0 | 12 | 11 | 3 | 0 |
| PRJ projects | 25 | 0 | 2 | 23 | 0 | 0 |
| PRD product shape | 24 | 0 | 21 | 3 | 0 | 0 |
| MAP Money Map | 23 | 0 | 1 | 22 | 0 | 0 |
| GRP group and workspaces | 23 | 1 | 17 | 5 | 0 | 0 |
| CLM reimbursements | 20 | 0 | 17 | 3 | 0 | 0 |
| TRS trusts and 80G | 18 | 0 | 1 | 17 | 0 | 0 |
| LON loans | 16 | 0 | 12 | 4 | 0 | 0 |
| BUD budgets and goals | 15 | 0 | 15 | 0 | 0 | 0 |
| VOC voice | 15 | 1 | 10 | 4 | 0 | 0 |
| FEA added features | 15 | 0 | 8 | 6 | 1 | 0 |
| FAM family umbrella | 14 | 0 | 8 | 6 | 0 | 0 |
| BKS accounting pipeline | 12 | 0 | 12 | 0 | 0 | 0 |
| GST | 12 | 0 | 10 | 1 | 1 | 0 |
| DOC documents vault | 6 | 0 | 5 | 1 | 0 | 0 |

**P0 complete (14):** ADD-013, TDO-005, BNK-009/010/011/014, SEC-019/020/021/024/073, DEV-053/054/056.

**P0 missing (34):**
- PRD-001 (four places)
- LNG-005/006/007/010
- ADD-082/088/089/090
- TDO-008
- SEC-004/012/013/014/016/025/026/045/086
- UIX-025/027/095
- DEV-002/014/017/023/024/030/040/046/048/052/057/096

Screens (V3.1 §8, rechecked 9 Nov): 8 Implemented, 96 Partial, 6 Missing, 1 Blocked, all functional only. **No screen is visually verified**, because no Signature Flow captures or device screenshots exist in the repository.

## 2. Architecture and database gap analysis (V4 FND-01 … FND-06)

Architecture recheck (68 ARC): 10 Implemented, 43 Partial, 14 Missing, 1 Blocked.

**FND-01 Balanced double-entry accounting: not met in applied code.**
- **Many write paths:** at least five write ledger rows (direct inserts/updates in `store.tsx`, the money-movement function `finance_operation`, Statement Desk apply, document intake commit, backup restore), plus RPCs for bulk category, corrections and transfers.
- **Single-sided entries:** each entry has a transaction type. Company double entry is derived in TypeScript (`corporate-statements.ts`). Nothing in the database checks that debits equal credits.
- **Journals in JSON:** company journals live inside the owner-preferences JSON (`books.journals`), not in a table.
- **Hard deletes:** expense delete is a physical `DELETE` (`store.tsx:582`), not a reversal.
- **Proposed fix:** the P3 posting layer, tested in isolation only.

**FND-02 Legal entity separation: not met.**
- Legal entities are JSON objects in `finance_preferences.data.entities`, and `expenses.entity_id` / `documents.entity_id` are free text with no foreign key.
- Account-to-entity mapping is also JSON (`books.entityAccounts`). There is no personal legal-entity record.
- The Me / Family / Business labels (`homeScope`) are UI scopes, not ownership.
- Payer, beneficiary and custodian are not modelled separately from the owner.

**FND-03 Database relationships: not met.**
- **63 tables but only 35 foreign keys.** Registers held only in JSON include entities, assets, trips, receivables, properties, leases, property costs, asset events, journals, holdings, quotes, snapshots, GST invoices and filings, financial-year records, tax profiles and rules.
- **Critical — silent data loss:** `cleanBooks` / `normalisePreferences` (`src/lib/books/types.ts:200`, `src/lib/preferences.ts:204`) **drop invalid records and keep only the newest N.** The limits include journals 5,000, asset events 3,000, leases 500, holdings 500, properties 200, GST invoices 10,000 and closed periods 200. The monthly depreciation job writes the capped result back. This is silent deletion of financial history, which V4 forbids.
- **No permanent IDs:** readable IDs (TRP-, AST-, PRP-, CLM-, EXP-) are not implemented; prefixes appear only as display references in statements and claims. Statement upload history is capped at 10.

**FND-04 Access control and privacy: not met in the applied schema.**
- **Open findings:** H-1 (team roles reach every account), H-2 (legacy self-assigned roles), H-3 (company-editor ownership takeover), M-1/M-2 (company uploads) and M-4 (assistant tokens can write).
- **Proposed fixes:** P1 and P2, tested in isolation (80 + 4 tests).
- **Not built:**
  - idle lock (today: 60 seconds after the app is hidden)
  - step-up before approvals and exports, so a PIN-unlocked session can approve and export
  - session/device list and remote sign-out
  - passkey removal
  - recovery codes
- **Done in code, not deployed:** the passkey origin allowlist.
- **Must fix:** the type-check suppression in `security-proposed-sql.test.ts` (V4 requires removal), and the Team Access wording.

**FND-05 Historical financial integrity: not met.**
- No frozen baseline of row counts, balances, document hashes or report snapshots exists.
- `delete_my_finance_data` erases `transaction_audit`, and that table has no actor, source or approval columns.
- The sanitizer truncation above.
- No production-like restore has been run.
- What exists: closed-period freeze triggers, correction revisions, period evidence and owner backup/restore.

**FND-06 Full UIX: not met.**
- Navigation is still 8 destinations plus Spaces (no Home/Money/To-do/Records places), and the plain-language renames are not applied.
- The Signature Flow palette, Manrope and the Option 02 mark are not implemented.
- 6 screens are missing; holdings, assets and properties have no detail pages; there are no device or visual tests.

## 3. Conflicts (each needs your ruling or confirms a change; none resolved silently)

| # | V4 says | Current state | Proposed resolution |
|---|---|---|---|
| C1 | No existing can-edit grant gains Bookkeeper or Company Secretary powers (FND-04, §12) | Proposed P2 backfill maps write → bookkeeper | Revise P2: map to a preserved "legacy company editor" grant with exactly today's rights; no automatic V3.1 role |
| C2 | DN-P3-5 B: include personal accounting in the same journal, as its own scope | P3 posts companies only | Revise P3: personal scope keyed to the owner's personal legal entity (no fictitious company) |
| C3 | DN-P3-7 B: owner and explicitly authorised accountants only | P3 lets company members read postings | Revise P3 read policy |
| C4 | DN-P3-8 B: the legacy period check must be company-aware | Entry freeze ignores entity | Add an entity-aware legacy check to P3 (migration plus tests) |
| C5 | DN-P3-13: authoritative close blocked until posting completeness is integrated into close/reopen evidence | Period close evidence excludes postings | Make it a release blocker; include a follow-up migration in the P3 plan |
| C6 | DN-P3-14 B: demo guests cannot grant, convert or post | P3 allows guest journals | Revise P3 and add direct-API bypass tests |
| C7 | DN-P3-6: functional-currency lines keep amount, currency, rate, date/source, settlement and FX differences | P3 keeps INR plus original currency only | Extend P3 columns (rate date/source, FX difference postings) |
| C8 | No silent deletion; historical integrity | Preference sanitizer truncates and drops records | Fix first (Phase 0): fail closed, never drop; migrate registers out of JSON in Phase 2 |
| C9 | Decision 30: the PIN can't authorise approvals, exports, access changes or filings | No step-up exists | Phase 1 |
| C10 | Decision 27: 5 / 15 idle minutes and always before approvals | 60 s after hidden, opt-in | Phase 1 |
| C11 | Decision 4: nothing posts without confirmation until accuracy is proven | Statement Desk saves the batch after one "Apply everything" tap | Keep, as it is user-confirmed. **KK to confirm** that one batch confirmation satisfies Decision 4 until graduated autopilot is earned |
| C12 | "Delete is reversal; posted entries immutable" (UIX action menus, FND-01) | Hard `DELETE` of expenses and drafts | Phase 3: deletes of posted entries become reversals; unposted drafts may be deleted with audit |
| C13 | Audit history must survive (FND-05) versus DPDP erasure (SEC) | Erasure deletes `transaction_audit` | **KK decision:** what audit must be retained after user erasure (legal retention), and in what minimal form |
| C14 | Decision 50: build and preview on thapal.in; keep ledgerline.biz | Passkey relying-party allowlist and email sender use ledgerline.biz only | Add thapal.in when that environment exists; passkeys registered on ledgerline.biz will not work on thapal.in (re-registration plan) |
| C15 | Permanent ID format (Decision 38) | UUIDs only | Phase 2: additive readable IDs beside UUIDs, never reused |
| C16 | Signature Flow design (Concept 06, deep green, Manrope) | Navy/gold V4.3 theme system with 7 styles | Phase 7, only after captures are supplied; keep other themes only if KK wants them |

## 4. Completed work that must be preserved (do not rebuild)
- **Statement Desk intake engine:** fingerprints, balance proof, resume/recovery, upload snapshots and interruption handling.
- **Money movements:** all-or-nothing `finance_operation` with idempotency.
- **Correction history:** corrections with revisions and undo, bulk category change and undo, closed-period freeze triggers, period-close evidence (0070) and the restore safeguards.
- **Owner data:** owner-scoped row-level security on all 63 tables, owner ZIP backup and cross-account restore with remapping, encrypted offline store, and device recovery copies.
- **Company and family access:** company grants (`entity_members`) and the family invite/request flows.
- **Accountant and claims:** accountant upload links (signed, slot claims), and claims, trips and expenditure-statement PDFs with byte-verified history.
- **Market data and reports:** end-of-day market data and NAVs with staleness; Report Centre and background report jobs.
- **Rules and tax:** rules register and rule watch; GST/TDS drafts labelled as working papers; tax workpaper and ITR handoff.
- **Rebrand:** Thapal display text, with internal ids pinned by `brand-compat.test.ts`.
- **Passkey origin allowlist** (code).
- **Isolated database harness:** `src/test/full-schema-pglite.ts`.
- **Proposed packages:** P1 / P2 / P3 with rollbacks and 95 isolated tests, which will be revised per §3, not discarded.
- **Gate 1 and V4 registers and their scripts.**
- **Old team-expense records and history** (Decision DN-09).

## 5. Phased development plan (each phase: isolated branch, small commits, tests after every stage)

Every phase ends with a written batch report covering:
- REQ / ARC / screen IDs
- files and database objects changed
- tests passed and failed (with commit hash and database version)
- negative cases
- financial parity
- security evidence
- screenshots (where UI is involved)
- open decisions
- rollback
- updated scores

Production actions stay separately gated (§7).

**Phase 0: evidence hygiene and stop silent data loss** (no schema change)
- **Work:**
  - Remove `@ts-nocheck` from the SQL acceptance test.
  - Make the database test suites deterministic: sequential mode, with repeat runs recorded.
  - Record commit, PGlite/Postgres version and fixtures in every report.
  - Change the preference sanitizers so they **never drop or truncate** financial records. Unknown or invalid records are preserved and flagged, and over-limit is an error the UI reports.
  - Write the read-only baseline-snapshot script: counts, balances by entity/account/currency/period, document hashes, report snapshots. **It runs against production only with approval.**
- **Acceptance:**
  - typecheck clean, with no suppressions
  - three consecutive identical full runs
  - new tests prove that 6,000 journals and 4,000 asset events round-trip unchanged
  - an invalid record is retained and flagged
  - the baseline script runs on the isolated harness and a seeded copy
- **Verification:** `bun run test` ×3, a sanitizer property test, and a diff of the baseline output before and after a round trip.

**Phase 1: security** (Gate A / G2; FND-04)
- **Work:**
  - Revise P2 (C1).
  - Keep P1 and re-review it.
  - Restrict assistant (MCP) tokens: revocation list, read-only token scope, and a refusal at the database for write-capable assistant sessions where possible.
  - Idle lock of 5 / 15 minutes; step-up (Face ID / passkey / password) before approvals, exports, access changes and filings; the PIN can never satisfy step-up.
  - Correct the Team Access wording.
  - Session/device list with remote sign-out, and passkey removal.
- **Acceptance:** each of the following is rejected in tests:
  - privilege escalation
  - cross-account restore
  - stale session
  - revoked invitation
  - export leakage
  - a PIN-only approval
  - a revoked assistant token

  Also: legacy team-expense rights preserved, H-1/H-2/H-3/M-1/M-2/M-4 closed in the isolated full schema, data identical across apply and rollback.
- **Verification:** the PGlite full-schema suite, unit tests for the session/step-up policy, browser tests on desktop, and a **real-device check (needs devices)**.

**Phase 2: legal entities and relationships** (Gate C; FND-02/03)
- **Work:**
  - Additive tables: `legal_entities` (individual/personal, company, trust, HUF, LLP, organisation), entity relationships, and foreign keys on accounts, entries and documents.
  - Normalised registers: assets, properties, leases, trips, holdings, receivables and journals.
  - Readable permanent IDs alongside the UUIDs.
  - Staged migration: additive schema → dual read → previewed backfill from JSON (legacy IDs and provenance kept) → compare → gated read switch → write switch. **No guessing of the owner of legacy personal records.**
- **Acceptance:**
  - zero orphan rows
  - exact source counts and hashes before and after backfill
  - unchanged balances
  - negative cross-tenant tests for read, write, import, export and attachment URLs
  - company books reconcile independently
  - rollback restores the previous state
- **Verification:** isolated harness plus a seeded realistic dataset, and a parity report comparing JSON with the tables.

**Phase 3: one balanced accounting engine** (Gate B / G3; FND-01)
- **Work:**
  - Revise P3 for all 14 approved decisions (C2–C7), on top of the Phase 2 entity tables.
  - Route every ledger write path through one posting service.
  - Deletes of posted entries become reversals.
  - Move journals out of JSON.
  - Make the close/reopen evidence include postings (C5).
- **Acceptance:**
  - an unbalanced entry is rejected at the database
  - idempotent replay of uploads, retries and multi-document matches
  - card payment settles the liability only; reimbursements are not duplicated
  - loans split principal, interest and charges
  - period lock and reversal
  - general ledger, subledger and reports agree
  - TypeScript and SQL rule parity
  - guests can't post, including through direct API calls
- **Verification:** database invariant tests, a property-based random-posting test, and parity fixtures.

**Phase 4: historical integrity** (Gate D; FND-05)
- **Work:**
  - A previewed historical conversion from April 2026 on **a production-like restored copy (requires KK approval to obtain)**.
  - Variance bridge; unmatched items become exceptions, never fabricated postings.
- **Acceptance:** every historical discrepancy documented, an exact opening-to-closing bridge, zero unauthorised changes, and an independently checked restore.
- **Verification:** before/after report by entity, period and currency.

**Phase 5: first complete bank-month journey** (G4; V4 §6, 10 steps)
- **Acceptance:** all 10 steps pass on an independently authored statement, with GL, trial balance, P&L, balance sheet, cash flow, bank reconciliation and detailed expense report in PDF, XLSX and CSV, all with identical totals.
- **Verification:** an automated end-to-end test plus a manual walkthrough with screenshots.

**Phase 6: modules connected to entities and the ledger** (G5)
- **Scope:** travel, expenses, claims, assets, property, investments, loans, tax, calendar, notifications and reports.
- **Acceptance:** the 9 V3.1 journeys and the mapped V3 acceptance cases pass.

**Phase 7: all 111 screens and Signature Flow** (G6)
- **Needs:** captures and the final logo.
- **Work:** navigation to Home/Money/To-do/Records, the plain-language renames, and the missing and detail pages.
- **Acceptance:** 111/111 rows complete with evidence, plus real-device comparisons and accessibility checks.

**Phase 8: integrations and AI** (G7)
- **Needs:** approved golden documents.
- **Acceptance:** provider feasibility evidence, per-field accuracy with confidence intervals, and fail-closed behaviour.

**Phase 9: operations and release** (G8–G9)
- **Work:** recovery drill with measured RPO/RTO, performance at p50/p95, threat review, and the release package.
- **Requires:** explicit KK approval for each production action.

## 6. Dependencies and risks
- **Dependencies:**
  - Phase 3 depends on Phase 2's entity tables (personal scope C2 needs a legal-entity record).
  - Phase 4 depends on a production-like copy (approval) and the PostgreSQL version (P3 needs 15+, unverified).
  - Phase 7 depends on Signature Flow captures and the Option 02 SVG.
  - Phase 8 depends on golden documents and provider approvals.
- **Risks:**
  - PGlite is not hosted Supabase, so concurrency, storage and versions must be proven on the restored copy.
  - JSON-to-table migration on live data is the highest-risk step, so it uses dual-read and a gated switch.
  - Posting rules exist in both TypeScript and SQL during the transition (parity tests mandatory).
  - Lovable syncs this branch, so every commit must keep the app working.
  - GitHub push access is intermittently refused (403); work can be committed locally but not pushed until access is restored.

## 7. Decisions and approvals requested from KK
1. **Approve Phase 0**, which starts now on approval (no schema change, no production access).
2. Confirm the C1 approach (preserved "legacy company editor" grant) and C2 (personal legal entity as the personal accounting scope).
3. C11: does one user-confirmed "Apply everything" satisfy Decision 4 until autopilot is earned?
4. C13: which audit records must be retained after a user erases their data, and for how long?
5. C14: when will a thapal.in preview environment exist? Passkey re-registration will be needed at domain switch.
6. **Pending approvals:**
   - live role query, and each read-only production check (exact SQL will be submitted)
   - a production-like restored copy for Phases 1–4 verification
   - golden documents
   - Signature Flow captures and the Option 02 SVG

## 8. Current evidence-based scores (V4 §2 categories; recomputed only from evidence at `722b245`)
| Area | V4 baseline | Evidence-based now | Why |
|---|---|---|---|
| Functional specification | 9.8 | 9.8 | Full V4 crosswalk now exists (1,536 / 68 / 111 / 159 / 50 / 14); non-P0 rows still mechanical only |
| Accounting-policy decisions | 10.0 | 10.0 | All 14 recorded; P3 needs revision to match (C2–C7) |
| Security implementation | 5.0 | 5.0 | H-1/H-2/H-3 open in applied schema; fixes isolated only |
| Accounting implementation | 4.0 | 4.0 | No database-balanced journal applied; multiple write paths; hard deletes |
| Entity/database implementation | 4.0 | 3.5 | Silent truncation found in the JSON registers; entities not relational |
| Historical financial verification | 3.0 | 3.0 | No baseline or production-like restore |
| UIX implementation | 4.0 | 4.0 | 8/111 functionally implemented; 0 visually verified |
| Automated testing | 7.0 | 7.0 | 2,317 passing locally; no device, visual, browser-in-CI or property tests; one suppression |
| Disaster recovery | 4.0 | 4.0 | Owner backup/restore only; no drill |
| Production readiness | 3.0 | 3.0 | Gates G1–G9 open |

None of these may move to 9.9–10 without the evidence V4 §7 specifies.
