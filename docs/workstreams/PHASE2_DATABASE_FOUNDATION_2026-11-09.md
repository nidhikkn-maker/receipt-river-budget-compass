# Phase 2: Database foundation — progress report, stage 1 (isolated development only)

**Branch:** GitLab `krna-group/THAPAL-project`, branch `phase2/database-foundation`, created from the final Phase 1 commit `b08c3a0`.

**Scope (KK, 9 Nov 2026):** legal-entity separation, relational structures, permanent record IDs, account linkage, preservation of historical records. Backward compatible until migration is independently verified. No production data migration, deployment, production-branch merge or Lovable change.

**Nothing was applied to any hosted database.** All database changes are proposed SQL in `.lovable/staged-sql/proposed/`. `drizzle/migrations` (the applied history, 0000–0088) is unchanged.

**Phase 2 is not finished.** This report covers stage 1:
- the legal-entity foundation (P5);
- investment restore (P5b);
- backup and restore integrity.

The next stage is the normalised registers: assets, properties, trips, holdings, leases, receivables and journals (§7).

## 1. What was built

### 1.1 Legal entities and account linkage (proposed `P5_legal_entities_foundation.sql` + rollback)
| Object | What it does |
|---|---|
| `legal_entities` | One row per company, trust, HUF, LLP or organisation. `entity_key` is the app's existing JSON id, kept as a **permanent alias**, so P1 storage paths, P2 grants and P3 keep working. Each owner has exactly one personal entity, `personal:<owner>`. Entities are archived, never deleted. Rows carry identifiers, sha256 provenance and a readable ENT number. |
| `entity_relationships` | Shareholder, director, partner, trustee and similar links, recorded explicitly and never guessed from names |
| `account_entity_assignments` | Dated account-to-company links with no overlaps (trigger plus advisory lock). Moving an account **no longer re-attributes its earlier history**. |
| `legal_entity_id` on expenses, documents and opening_postings | Nullable and filled by a trigger. It never changes another value and never refuses a write that is valid today. Unresolved rows stay empty and are reported. |
| `register_records` + `record_ownerships` | One permanent uuid and one PRP/AST number per property or asset, shared by all its owners. Dated ownership shares per entity, with evidence. Confirmed shares are at most 100% on any date and cannot overlap. A share needs the co-owner's consent. |
| Readable numbers | Counters and a registry keyed by **company or personal scope, prefix and year** (KK decision DN-P2-IDS). Issued in the same transaction, never reused, never renumbered by restore or backfill. |
| Backfill | `preview_entity_backfill` returns proposed rows, exceptions and the source sha256. `commit_entity_backfill` needs a step-up, refuses assistants, refuses if the source changed, and is idempotent. `entity_backfill_report` compares counts, balances, orphans, unresolved rows and drift. Every run is kept in append-only `legacy_backfill_runs`. |

**What is never turned into a company (FND-02):**
- the Me, Family and Business labels;
- `Organisation:` tags;
- reimbursement profiles;
- trip organisation names.

Companies that were deleted or merged stay unresolved unless the owner confirms them. They then become archived "unknown legacy" entities.

### 1.2 Live defects found and fixed in P5 (they exist in production today)
1. **Applied 0058 `guard_closed_period`:** any company's closed month blocks **every** entry dated in it, personal entries included. After P5, a company's close blocks only that company's entries, whether linked by account or hand-picked. A close without a company still blocks everything, and nothing 0058 accepted is refused.
2. **Applied 0083 `guard_journals_rules`:** it reads `assets[].entityId`, but assets store `ownerEntityId` (`src/lib/assets.ts:18`). Company-specific closes therefore **never protected asset journals or events**. After P5 the guard uses the right field and checks the asset's company both before and after a move.

Both defects are reproduced on the applied schema and shown fixed in two places: the developer's tests and my independent test.

### 1.3 Investment restore (proposed `P5b_restore_investments.sql`)
- `restore_finance_backup` now writes `demat_accounts` and `security_holdings` inside the same single transaction.
- Existing rows are matched on their natural keys. They are kept unchanged, differences are reported, and the backup's id is remapped to the existing row.

### 1.4 Backup and restore integrity (app code; works with today's schema)
- **Cross-account restore remapping:** a single registry (`src/lib/backup-remap.ts`) remaps every JSON reference: 80 rules for settings and 21 for JSON columns. The previous code left **10 kinds of reference** pointing at the old account's ids.
- **Unmapped values** are kept byte-identical and listed in the restore report. Nothing is dropped.
- **Completeness test:** it uses the TypeScript checker to list every text field. A new id field cannot be forgotten.
- **Table inventory:** every applied table has an explicit backup decision (test-enforced). Demat accounts and holdings are now in the backup. Backups are written as format 3; v1 and v2 still restore.
- **Fixes:**
  - a restore could lose one of two copies of a depreciation posting;
  - an unreviewed change in the partial work could post a duplicate depreciation entry for the original owner;
  - depreciation ids could collide across owners after a cross-account restore;
  - opening-posting ids collided across owners.
  
  New ids are owner-unique, and **no stored id was changed**.

### 1.5 Recovery after the interrupted session
- Both developer runs stopped when the session was interrupted. KK chose to restart both.
- The new developers reviewed the saved partial work critically and fixed six defects in partial P5:
  1. the preview could not run;
  2. the close check could have been weaker than 0058 during dual-read;
  3. joint ownership had no anchor, so anyone could claim a share;
  4. re-commits wasted ENT numbers;
  5. accounts linked only in JSON could silently move their history;
  6. the journal guard checked only the asset's new company.

## 2. Test evidence (all local, isolated)
| Check | Result |
|---|---|
| `bun run typecheck` | Pass. No new suppressions. |
| `bun run build` | Pass |
| Full suite ×3 | **2,657 / 2,657 passed, 347 files, in each of three identical runs** |
| `phase2-entities-sql` (24) and `phase2-restore-investments-sql` (8), ×3 | 32/32 each run |
| Phase 1 security suites on top of P5 | 177/177: security-phase1-sql, -e2e, -independent, security-proposed-sql, security-proposed-restore-sql (includes the P4 rollback catalog-identity test) |
| Backup suites ×3 | 43/43 each run; backup + books + restore SQL: 617/617 |
| Independent tests (written by the reviewer, `phase2-independent.test.ts`) | Pass. **Closed periods:** the defect is reproduced at 0088+P1+P2+P4; after P5, personal entries are allowed and the company's own (hand-picked) entries are still refused. **Isolation:** a second owner can neither see nor write; even the owner cannot insert or hard-delete directly; commit needs a step-up; an assistant reads but cannot preview or commit. |
| Data preservation | Every pre-existing row is hashed before and after apply, preview, commit, re-commit and orphan commit: no value changed. Balances per entity, account, currency, month and type are identical to the app's own `effectiveEntity`. |
| Rollback | Restores the exact P1+P2+P4 catalog and data, archives the 10 P5 tables (nothing dropped), then P4, P2 and P1 roll back and the stack re-applies |

### 2.1 Full-suite runs
Three identical runs: 2,657/2,657, 347 files. The JSON report of run 3 is in `docs/registers/implementation/vitest-report.json`. Typecheck first failed on the reviewer's own new test file (a read-only list type); after the fix it is clean.

**Interpreting my independent test:** two of its early failures were caused by my own test seed, not by the SQL.
- The applied safeguard refuses direct closed-period writes: "Close or reopen on Audit so evidence is retained".
- An entry with a company but no `entity_source = 'manual'` is personal in the app (`src/lib/books/entity-accounts.ts:62-65`), and P5 agrees with that.

## 3. Status by category
**Completed and tested locally:**
- all P5 objects, rules, backfill and report;
- both closed-period fixes;
- RLS and assistant limits on the new tables;
- scope-local readable numbers;
- joint property with dated shares;
- P5, P5b and P4-refusal rollbacks;
- P5b atomic investment restore;
- the backup registry, remapping and inventory;
- the depreciation and opening-posting id fixes.

**Implemented but not fully verified:**
- true multi-connection concurrency of the overlap and 100% checks (PGlite has one connection);
- P3 re-applied on top of P5/P5b;
- the Assets and Opening Balances screens in a browser.

**Pending production-like verification:** each item needs KK's approval.
- restored-copy rehearsal: backfill for every owner, compare report at `match`, orphan and ambiguity counts;
- hosted pre-checks H-P5-1..8 (`docs/plans/PHASE2_MIGRATION_PLAN_2026-11-09.md` §10);
- performance on large owners;
- a full backup → restore rehearsal.

**Blocked on hosting:**
- applying P1, P2, P4, P5 or P5b (not authorised);
- `btree_gist` availability, if an exclusion constraint is preferred over the trigger.

## 4. Behaviour changes that need KK's attention
1. **Erasure with joint records:** with P5 applied, `delete_my_finance_data` is refused while another account holds shares in a record this owner administers. This is linked to the pending decision C13. Until C13 is decided, erasure is otherwise unchanged.
2. **Backup format 3:** older app versions refuse format 3 files with a clear error rather than silently dropping tables. Backups made by the current live app (v1/v2) still restore.
3. **Until P5b is applied:** investment tables restore in a separate step after the main transaction, so a restore is not fully all-or-nothing. P5b fixes this.

## 5. Remaining risks (full list: migration plan §11, R1–R11)
- **PGlite is not Supabase:** definer bypass, locks across connections and policy cost all need the hosted pre-checks.
- **Dual-read:** until the write switch, the app moves accounts in JSON while the database uses the dated table. The close check honours both, and the compare report shows any drift.
- **Rollback and numbers:** rollback archives the number counters. Re-applying without restoring them would reissue visible numbers. The exact restore step is documented.
- **Restoring into closed periods:** a same-account restore into periods the account has already closed is refused. This already happens on today's schema (0072/0083).
- **Storage copies:** repeated restores stage fresh file copies, leaving orphaned copies in storage. Records are not duplicated.
- **Meaning-based references:** the backup registry's type test catches only id-style field names. References identified by meaning (traveller, saved filters, lot source) came from manual review.

## 6. Release blockers
- All **seven Phase 1 blockers remain open**: `docs/registers/blockers/production_release_blockers.csv` (RB-P1-01..07).
- Phase 2 adds no separate blocker. Its hosted pre-checks and restored-copy rehearsal fall under RB-P1-06/07 and FND-05.

## 7. Next stage of Phase 2 (continues under KK's existing instructions)
- **Normalised registers** for assets, properties, trips, holdings, leases, receivables and journals:
  - built on the P5 framework, attached to `register_records`, `record_ownerships` and legal entities;
  - each with previewed backfill and a compare report;
  - dual-read first, with no write switch without approval.
- **Ledger linkage:** money totals become references to ledger rows; legacy totals are kept read-only for the compare.
- **Backup format 4** carrying the P5 tables; the move of `P5_BACKUP_DECISIONS` into `backup.ts` once P5 is applied.

## 8. Registers updated
- **Implementation register:** `recheck_phase2.tsv`, 14 requirements: REQ-LED-005, 037, 045, 046, 048; REQ-AST-044, 045, 047; REQ-SEC-040, 049, 056, 066, 068, 091. All are **Partial, tested locally**. None is complete, because the work is proposed only and production-like evidence is missing.
- **Architecture register:** `architecture_recheck_phases_1_2.tsv`.
  - ARC-01, 04, 05, 06 and 34 are updated.
  - ARC-14 (period close) and ARC-49 (backup/restore) are **downgraded from Implemented to Partial** because of the live defects found.
- **Decision register:** DN-P2-IDS (permanent IDs, final), DN-REPORT-UIX, DN-UIX-SF.

## 9. Screenshots and the Signature Flow comparison
- Phase 2 changed no screens apart from a helper call in Opening Balances, which is not visible.
- The Phase 1 security flows were captured at iPhone and iPad sizes (emulated in Chromium) and compared with the approved Signature Flow captures: `docs/evidence/screens/2026-11-09-phase1-security/README.md`.
- **Finding:** the current UI does not match Signature Flow in colours, the T logo, navigation, Home layout or typography. This is pre-existing and planned UIX work. It was not changed in Phase 2.
- **Next set:** desktop captures will be added, per Signature Flow §11.1.

## 10. Revised production-readiness scores (evidence-based)
| Area | After Phase 1 | Now | Reason |
|---|---|---|---|
| Entity/database implementation | 4.5 | **5.5** | Legal entities, dated account links, permanent numbers and joint ownership designed and tested, with a preserved-data proof. Not higher: proposed only; registers still JSON. |
| Historical financial verification | 4.0 | **4.5** | Backfill proven not to change any existing value; two live closed-period defects found and fixed in proposal. Baseline not run on production. |
| Disaster recovery | 4.0 | **4.5** | Backup covers every table by decision; cross-account restore has zero orphans; investments restore atomically (P5b). No production-like restore drill. |
| Automated testing | 8.0 | 8.0 | More database and restore tests, plus the independent test. Still no device, visual-regression or browser-in-CI tests. |
| Security implementation | 6.0 | 6.0 | Unchanged; all seven blockers open |
| Accounting implementation | 4.0 | 4.0 | Phase 3 |
| UIX implementation | 4.0 | 4.0 | Mismatch with Signature Flow confirmed by side-by-side capture |
| Production readiness | 3.0 | 3.0 | Nothing applied or deployed |
