# 111-screen classification, recalculated from current code (9 Nov 2026)

**Authority:** THAPAL V4 Final 1 and the Signature Flow UIX Master (`docs/specs/THAPAL_SIGNATURE_FLOW_UIX_MASTER_2026-11-09.md`, §6 screen contracts).

**Code inspected:** branch `phase2/database-foundation`. This includes all Phase 0, Phase 1 and Phase 2 work. The uncommitted Phase 2 files were present in the tree and were read.

**Full register:** `docs/registers/uix/screen_audit_2026-11-09.tsv`. One row per screen with:
- route, files, before and after status;
- capabilities present, missing functionality, missing navigation and connections;
- database tables, services and APIs;
- integrity and security dependencies;
- device notes, tests present and missing, estimated hours;
- file:line evidence.

**Source audits:** `audit_A-C.tsv`, `audit_D-F.tsv`, `audit_G-I.tsv`, `audit_J-K.tsv`.

## How it was done, and its limits
- **Method:** four independent auditors read the code screen by screen against the §6 contract and the V4 requirements. The coordinator merged the results and spot-checked the most consequential claims (three are listed below).
- **The historical register (`docs/registers/screen_coverage.csv`, 8/96/6/1) was not treated as proof.** Every status was recalculated.
- **Code reading only.** Device and layout findings come from the code. Rendered evidence at iPhone, iPad and desktop sizes is the next step (§6). **No screen is independently verified yet.**
- **Strict rule:** a screen is Complete only if every contract element is present, connected to authoritative data, has its states handled, and is tested. Rendering, or passing unit tests, is not enough.

## Totals
| | Count |
|---|---|
| **Verified complete** | **0** |
| Partially complete | **99** |
| Missing | **8** |
| Externally blocked | **4** |
| Not yet independently verified | **111** |
| Visually aligned with Signature Flow | **0** (105 not aligned; 6 have no approved capture) |

### By area
| Area | Partial | Missing | Blocked | Screen-specific hours |
|---|---|---|---|---|
| A Onboarding and access | 6 | 0 | 0 | 136 |
| B Home and universal | 6 | 2 | 0 | 212 |
| C Money and accounts | 11 | 1 | 0 | 228 |
| D Inbox and Statement Desk | 10 | 0 | 0 | 234 |
| E Expenses and Smart Add | 11 | 0 | 0 | 220 |
| F DocuRepo and organisations | 8 | 1 | 0 | 268 |
| G Travel and reimbursements | 9 | 1 | 1 | 234 |
| H Investments | 8 | 0 | 0 | 176 |
| I Assets and property | 9 | 1 | 0 | 180 |
| J Reports and statutory | 11 | 1 | 2 | 372 |
| K Settings and trust | 10 | 1 | 1 | 292 |
| **Total** | **99** | **8** | **4** | **2,552** |

### Missing (8)
- B04 Calendar item
- B05 Notification centre (**was Partial**: the bell only links to the review queue)
- C03 Bank account detail
- F08 Projects/activities
- G11 Trip collaborator settings
- I09 Property calendar (**was Partial**: the calendar has no lease or property data)
- J12 Multi-jurisdiction scope
- K10 Release/version information

### Blocked (4)
| Screen | Blocked by |
|---|---|
| G08 Claim approval and payment | P2 roles and P3 posting, not approved |
| J06 Business books | P3 posting, not approved; the app already says "Posting is on hold" |
| J11 India reporting templates | Official ITR/GST/MCA schemas and reviewer confirmation |
| K05 Integrations | Regulated Account Aggregator partner and provider credentials |

### Statuses that changed (the old register was wrong)
- **Implemented → Partial (8):** D02 Smart Review, D03 Statement Desk intake, D09 Background jobs, H06 Manual market rates, I02 Asset detail, J08 Expense/project/travel reports, J14 Regulatory monitor, K01 Settings home.
- **Partial → Missing (2):** B05, I09.
- **Partial → Blocked (3):** G08, J06, J11.
- **Partial → Partial (91):** the evidence is refreshed. Several old claims were wrong in both directions; the details are in the evidence column.

## Highest-priority gaps (P0 = integrity or safety; P1 = missing core screens and connections)
**P0 (financial integrity or user safety visible in the UI; most can be fixed without database changes):**
1. **Assets can be deleted in one tap** with no confirmation, reason or record (`src/routes/_authenticated/assets.tsx:49,110`). Coordinator-verified. Fix: confirmation, and archive instead of delete.
2. **Statement Desk Undo cannot work today.** It calls `undo_statement_rows`, which exists only in unapplied staged SQL (`src/lib/statement-pipeline/atomic-undo.functions.ts:46`; the function is absent from `types.ts`). Coordinator-verified. Fix: say plainly that Undo is unavailable until the approved database change, instead of offering a button that fails.
3. **Review History offers Undo on batches already restored** (`ReviewHistory.tsx:16-17` hard-codes `undone:false`).
4. **Load errors shown as empty data:** "No holdings yet" on failure (`DematHoldings.tsx:10-11`); report history shows the empty message on error (`report-centre.tsx:72-75`). A person could believe their records are gone.
5. **Transaction delete is a hard delete** behind a browser `confirm` (`ExpenseDialog.tsx:54`). **Card payment is entered by `window.prompt`** and saved outside the finance-operation transaction (`WealthPanels.tsx:41`). Proper reversal waits on Phase 3. Interim fix: in-app confirmation with clear consequences, with the money movement routed through the existing `finance_operation` where it already exists.
6. **Exports are built in the browser** with no server authorisation, step-up or audit (release blocker RB-P1-02).

**P1 (missing core screens and connections):**
- The eight Missing screens, with their dependencies:
  - K10, B05 and B04 can start now.
  - C03 can start read-only now; its company links need P5.
  - G11 needs P2.
  - F08 needs the Phase 2 projects register.
  - I09 needs leases in the calendar.
  - J12 needs a jurisdiction model and legal profiles.
- **Primary routes from the approved navigation don't exist:** `/home`, `/money`, `/records`, `/todo` (To-do), `/calendar`, `/notifications`, and detail routes for accounts, assets, properties and holdings. Existing URLs must keep working through redirects (AGENTS.md).
- **No source document beside parsed data** (Statement Desk, DocuRepo viewer): the core evidence requirement.
- **Deep links:** account filters, report scope and search results go to list pages, not to the record.
- **Trip status:** the itinerary and finance status are combined, so "closed" overrides open refunds and claims (`travel.ts:27-33`).

## Dependencies (resolve before implementing)
| Dependency | Screens affected | Owner track | State |
|---|---|---|---|
| Signature Flow design system and shell (tokens, T logo, Home/Money/To-do/Records + Add navigation, list/detail template, workspace switcher, search palette, states) | All 111 | UIX | **Not started.** The Signature Flow master §19.3 requires freezing it before rolling out pages. Final T artwork is pending (APR-LOGO). |
| P2 roles/permissions (proposed) | A03, G08, G11, K04, K06 | Security | Not applied |
| P5 legal entities and account links (proposed) | A02, C01–C04, F05–F07 | Database (Phase 2) | Stage 1 done, not applied |
| Phase 2 registers stage (assets, properties, trips, holdings, projects) | F08, G01–G11, H01–H08, I01–I10 | Database (Phase 2) | Next stage |
| Phase 3 balanced posting (not approved) | A05, E08, G08, J06, J10, J13, reversals | Accounting | Awaits KK approval |
| Server-side export service (RB-P1-02) | J01–J04, J08, K09 | Security/UIX | Not started |
| Staged statement Undo and category merge SQL | D03, D08, D09 | Database | Staged, not applied |
| External: AA partner, providers, official schemas, licensed prices, hosted email codes | K05, J11, H04, A01 | KK / hosting | Outside engineering |

## Realistic effort estimate
| Work | Hours |
|---|---|
| Screen-specific work for all 111 screens (functional Complete + Signature Flow aligned + tests) | 2,552 |
| Global design system and shell (tokens, typography, logo integration, navigation, primary routes and redirects, list/detail and modal templates, states, workspace switcher, universal search palette) | ~240 |
| Cross-module journey test harness and the 7+ journeys in your brief (seeded data, end-to-end, with evidence) | ~180 |
| Server-side export service (RB-P1-02) | ~80 |
| Rendered verification at iPhone, iPad (incl. Split View) and desktop for every screen, side-by-side captures, accessibility checks | ~160 |
| **Engineering total (UIX track)** | **≈ 3,200 hours** |

**What this does not include:**
- **Database, accounting and security work** (the Phase 2 registers stage and Phase 3 posting) that many screens depend on. It is estimated separately in those tracks.
- **Physical iPhone/iPad testing and KK's visual approvals.** These are release gates that need people and devices, not engineering hours.

**What the total means:** at about 35 productive hours per engineer-week, this is roughly **90 engineer-weeks**. The critical path is:
1. the design system and shell, awaiting KK's approval of the proposed shell;
2. the vertical slices in the Signature Flow order: Home/Search/Calendar/To-do → Money/Statement Desk → Smart Add → Records/DocuRepo → Travel/Claims → Investments → Assets/Property → Reports → Settings.

Slices that depend on P2, P5, the registers or Phase 3 cannot finish before those tracks deliver.

## Proposed order of work (subject to KK's direction)
1. **P0 safety fixes** (§P0 items 1–5). These are small, need no database change, and stay within existing components and the approved look.
2. **Missing screens with no dependency:** K10, B05, B04 (calendar item), C03 (read-only).
3. **Signature Flow design system and shell** on an isolated branch, shown to KK as **proposed** before mass rollout (master §18–§19).
4. **Vertical slices**, each with iPhone, iPad and desktop before/after captures side by side with the approved capture, plus journey tests.
