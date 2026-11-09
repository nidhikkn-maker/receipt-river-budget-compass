# Thapal V4: consolidated progress report (9 Nov 2026)

**Repository:** GitLab `krna-group/THAPAL-project`.

**Branches:** `phase1/security` → `phase2/database-foundation` → `uix/screen-verification`. Each branch is built on the previous one.

**What has not happened:** no merge into `main`, no deployment, no production database change and no Lovable change. All database changes are **proposed SQL** in `.lovable/staged-sql/proposed/`. The hosted project was touched once, by a read-only call to its public auth-settings endpoint (approved, decision 3).

## 1. Status by phase and track
| Track | Status | Latest commit |
|---|---|---|
| Phase 0: historical data protection | Completed and tested locally (accepted by KK) | `e46ed30` (phase0 branch) |
| Phase 1: security | Completed and tested locally; **7 production blockers open** | `b08c3a0` (`phase1/security`) |
| Phase 2: database foundation, stage 1 | Completed and tested locally; registers stage next | `a8a6a50` (`phase2/database-foundation`) |
| UIX: 111-screen verification, Stage 1 audit | Completed; implementation not started apart from P0-001 (in progress) | `96a5265` (`uix/screen-verification`) |
| Phase 3: balanced accounting | Not started (awaits KK approval) | — |

## 2. Commits pushed in this cycle
**`phase2/database-foundation`:**

| Commit | Content |
|---|---|
| `e1b9917` | Decision register: permanent-ID rule (DN-P2-IDS), screenshot reporting requirement |
| `76c7046` | Emulated iPhone/iPad captures of Phase 1 flows; approved Signature Flow reference captures; comparison |
| `9ec8fb8` | Signature Flow UIX master stored as reference (DN-UIX-SF) |
| `964a0a8` | P5 legal entities, dated account links, scope-local permanent numbers, joint ownership; P5b atomic investment restore (proposed SQL) |
| `9b82372` | Backup/restore integrity: complete remap registry, every table classified, investments backed up, owner-unique posting ids |
| `a8a6a50` | Phase 2 stage 1 report, implementation and architecture register rechecks, test evidence |

**`uix/screen-verification`:**

| Commit | Content |
|---|---|
| `ac52663` | 111-screen classification recalculated from current code |
| `be0292a` | P0 defect register: P0-001 (KK-confirmed) and P0-002..006 identified |
| `96a5265` | Rendered sweep: 51 routes × iPhone/iPad/desktop |

## 3. Verification evidence
**Phase 2 stage 1:**
- `bun run typecheck`: clean. The reviewer's own new test file failed typecheck once (a read-only list type) and was fixed.
- No new suppressions.
- `bun run build`: pass.
- **Full suite: 2,657 of 2,657 tests passed in 347 files, in each of three identical runs.**
- **Phase 2 database tests:** 32 per run in each of three runs. The Phase 1 security suites on top of P5 pass at 177/177.
- **Backup tests:** 43 per run in each of three runs; backup + books + restore together: 617/617.
- **Independent checks:** `src/lib/phase2-independent.test.ts`, written separately from the developers' tests.
  - The closed-period defect is reproduced on the applied schema and fixed by P5.
  - Tenant isolation holds.
  - Direct client writes and hard deletes are refused.
  - The backfill commit needs a step-up.
  - Assistants can read but not commit.
- **Data preservation:** every pre-existing row is hashed before and after; no value changed. Balances are identical to the app's own calculation.

**UIX audit:**
- Four independent code audits against the Signature Flow §6 contracts.
- The coordinator spot-checked the asset-delete, Statement Undo and notification-bell findings; all three were confirmed.
- **Rendered sweep:** 153 captures; 0 page errors; 0 horizontal overflow; one intended redirect (`/transaction-review` → `/inbox`).
- **Limits:** Chromium emulation with fixture data only. This is not a functional or real-device verification.

## 4. UIX: what works, what is partial, what is missing, what is blocked
**Totals (111 screens):**
- **Verified complete:** 0
- **Partial:** 99
- **Missing:** 8
- **Blocked:** 4
- **Not independently verified:** 111
- **Visually aligned with Signature Flow:** 0 (105 not aligned; 6 have no approved capture)

**Already working underneath:** the functionality is substantial and is to be **reused, not rebuilt**.
- **Sign-in:** Google, email and passkey, with MPIN and recovery.
- **Home:** grounded next actions, net worth with as-of dates and quality notes, safe-to-spend.
- **Search:** natural-language queries.
- **Statement Desk:** on-device reading, duplicate fingerprints, balance checks with page quotes.
- **Smart Add:** confidence per field and source text.
- **DocuRepo:** search, filters, ZIP export with a manifest.
- **Companies:** PAN/GSTIN/CIN validation, people and shareholding.
- **Trips:** status filters and bulk expense actions.
- **Investments and assets:** dated mutual-fund history; demat holdings; an asset register with depreciation.
- **Reports:** 36 report types.
- **Security settings:** from Phase 1.

**Partial (99):** the per-screen gaps are in `docs/registers/uix/screen_audit_2026-11-09.tsv`. Common themes:
- the approved navigation and primary routes don't exist;
- no source document beside parsed data;
- weak deep links;
- load errors shown as empty data;
- combined itinerary and finance trip status;
- no professional sign-off records.

**Missing (8):**
- B04 Calendar item
- B05 Notification centre
- C03 Bank account detail
- F08 Projects/activities
- G11 Trip collaborator settings
- I09 Property calendar
- J12 Multi-jurisdiction scope
- K10 Release/version information

**Blocked (4):**
- G08 Claim approval: needs P2 and P3.
- J06 Business books: needs P3.
- J11 India templates: needs official schemas.
- K05 Integrations: needs an AA partner and providers.

**Effort:**
- **Total:** about **3,200 engineering hours**, roughly 90 engineer-weeks.
- **Breakdown:** 2,552 screen-specific; about 240 for the design system and shell; about 180 for journey tests; about 80 for server exports; about 160 for rendered and device checks.
- **Excluded:** the database/accounting dependencies, and physical-device and visual-approval gates.

**Dependencies:**
- the Signature Flow shell (all screens);
- P2 roles: A03, G08, G11, K04;
- P5 entities: C01–C04, F05–F07;
- the Phase 2 registers stage: F08, G, H, I;
- Phase 3 posting: J06, E08, G08 and reversals;
- the server export service, RB-P1-02 (J01–J04, J08, K09);
- staged Undo SQL (D03, D08, D09).

## 5. P0 defects (`docs/registers/implementation/p0_defects.tsv`)
| ID | Defect | Status |
|---|---|---|
| **P0-001** | **Assets can be permanently deleted in one tap** | **Confirmed P0 by KK. Fix in progress** on `uix/screen-verification`: archive workflow with reason, who/when/why, an Archived Assets view, restore, no change to valuation or net worth, the same principles for properties and holdings, regression tests, before/after iPhone and iPad captures. |
| P0-002 | Statement Desk Undo offered but cannot work (unapplied SQL) | Awaiting KK confirmation |
| P0-003 | Undo offered on batches already restored | Awaiting KK confirmation |
| P0-004 | Load errors shown as "no records" | Awaiting KK confirmation |
| P0-005 | Transaction hard delete; card payment by prompt outside the finance transaction | Awaiting KK confirmation; full fix is Phase 3 |
| P0-006 | Exports without server authorisation | Already release blocker RB-P1-02 |

## 6. Release blockers (all open)
- **RB-P1-01:** fresh authentication before passkey registration.
- **RB-P1-02:** server-side export authorisation.
- **RB-P1-03:** session locking for guests, Google-only accounts and restarts.
- **RB-P1-04:** effective assistant-token revocation.
- **RB-P1-05:** real iPhone/iPad testing.
- **RB-P1-06:** hosted database and auth verification.
- **RB-P1-07:** production-like migration evidence.

Several are implemented and tested locally. All stay open until the hosted, device or production-like evidence exists, as KK instructed.

## 7. Scores (evidence-based)
| Area | Now |
|---|---|
| Security implementation | 6.0 |
| Entity/database implementation | 5.5 |
| Historical financial verification | 4.5 |
| Disaster recovery | 4.5 |
| Automated testing | 8.0 |
| Accounting implementation | 4.0 |
| UIX implementation | 4.0 (0 of 111 screens functionally complete and aligned; confirmed by audit and side-by-side capture) |
| Production readiness | 3.0 |

## 8. Recommended next priorities
1. **Finish P0-001** and verify it independently: tests, full suite ×3, before/after captures.
2. **Confirm P0-002..005** so they can be fixed in the same safe, small way. P0-002 to P0-004 need no database change.
3. **Signature Flow design system and shell,** built on its own branch and shown to KK as **proposed**: tokens, the T mark (pending final artwork), Home/Money/To-do/Records + Add navigation, list/detail templates, states, the workspace switcher and the search palette. Every screen depends on it, so it is the critical path.
4. **Missing screens with no dependency:** K10, B05, B04, and C03 read-only.
5. **Phase 2 registers stage** (database track): assets, properties, trips, holdings, projects and journals as tables, built on P5. This unblocks F08, G, H and I.
6. **Decisions needed from KK:**
   - Phase 3 approval (unblocks J06, G08 and reversals);
   - C11, C13 and C14;
   - a test account for the hosted token check;
   - approval of a production-like restored copy for rehearsing the P1/P2/P4/P5 migrations.
