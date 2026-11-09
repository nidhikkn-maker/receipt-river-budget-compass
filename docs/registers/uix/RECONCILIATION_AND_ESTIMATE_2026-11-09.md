# Signature Flow UIX master ↔ 111-screen register: reconciliation and refined estimate (9 Nov 2026)

**Sources:**
- the standalone **Thapal V4 Standalone Complete UIX Signature Flow** document, converted unchanged into `docs/specs/THAPAL_SIGNATURE_FLOW_UIX_MASTER_2026-11-09.md` (docx sha256 `84fedcc8…4b36`);
- its ten approved captures in `docs/evidence/signature-flow-reference/`;
- the recalculated register `docs/registers/uix/screen_audit_2026-11-09.tsv`.

The approved Signature Flow design is retained **without modification**.

## 1. Reconciliation
| Check | Result |
|---|---|
| Screen IDs in the master's §6 (A01–K12) vs the register | **111 of 111 match**, with no extras and none missing |
| Canonical top routes (§5.2): `/home`, `/money`, `/tasks`, `/records`, `/reports`, `/calendar`, `/notifications`, `/add`, `/search`, `/settings` | **3 of 10 exist** (`/reports`, `/search`, `/settings`). The other seven are needed as shell routes; today's URLs (`/dashboard`, `/wealth`, `/inbox`, `/vault`, `/plan` …) must keep working through redirects (AGENTS.md). |
| Primary navigation (§5.1/§17): Home, Money, To-do, Records, Reports; iPhone bottom bar Home, Money, central Add, To-do, Records | Not present. Today: Today / Spaces / Review / More (phone) and a 10-item rail. Part of the shell work. |
| Workspace switcher (§5.1): Personal, Family, Company, Trust, organisations; individual company, group or consolidated | Not present. Home-only scope chip, hidden on phones. Real entity boundaries need P5 (proposed). |
| iPad split view with list/detail persistence (§17) | Not present (code-only check). Part of the shell's list/detail template. |
| §16 additional V4 areas (16) placed inside parent screens | See §2. **None needs a new top-level route.** Four need child pages that the register must track: Payroll import, Insurance policy detail, Notices and appeals, Construction/CWIP. They are added below as **tracked child items**, not new screen IDs. |
| Signature Flow §11.1/§18 reporting rules | Adopted: before/after iPhone, iPad and desktop captures, side by side with approved captures; "proposed" labels for screens without a capture; separate implemented, tested, device-tested, compliance-reviewed and production-approved states |

## 2. §16 additional V4 areas → parent screens
The "Code today" column counts files from a keyword search, so it is indicative only.

| V4 area | Parent screen(s) | Code today | Register action |
|---|---|---|---|
| Company secretary and governance | F06/F07 entity; J10 compliance | Minimal (3 files) | Child page of F07, tracked |
| Trusts and 80G | F06 trust; J05 tax | Minimal (3) | Within F06/J05 |
| Sales invoices and payables | C04/C09; J03 | Partial (5) | Within C09/J03 |
| **Payroll import** | F07 company; C09 payables | Minimal (4) | **Tracked child item F07-c1** |
| **Insurance** | F01 Records → Policies; B03 Calendar | Minimal (4) | **Tracked child item F01-c1** |
| Forex and LRS | C02 currencies; J05 tax | None found | Within C02/J05 |
| Estate readiness | F01 Records → Personal | Not verified (the search term is ambiguous) | Within F01 |
| **Construction and projects** | F08 Projects | None (no CWIP) | **Tracked child item F08-c1** (depends on the projects register, Phase 2) |
| Email intake | E01 Add → Integrations; K05 | None | Within K05 (blocked: hosted inbound email) |
| **Notices and appeals** | D01 To-do; F01 Compliance | Partial (15 files mention notices) | **Tracked child item D01-c1** |
| AIS/Form 26AS | J05 personal tax | Partial (26) | Within J05 |
| Ask Thapal | B02 Search / K11 Help | Partial (assistant exists) | Within B02/K11 |
| Monthly Money Letter | B01 Home; J01; B05 | Partial (brief exists) | Within B01/B05 |
| Automation quality | K06; D01 | None | Within K06 |
| Money Map | C01 Money | Partial (/connections) | Within C01 |
| Completion and Health Centre | D01; K01; J01 | Partial (/records-check) | Within D01/K01 |

## 3. Refined estimate
**Basis:**
- **Per-screen hours:** from the register (Appendix A). Shared shell and design-system work is excluded per screen and counted once.
- **Shared-pattern savings:** counted where a screen's missing work is a pattern the shell will provide once.

| Item | Hours | Basis |
|---|---|---|
| Design system and shell, built once: tokens, typography, T mark slot (artwork pending), navigation (rail, bottom bar, central Add), 7 shell routes with redirects, list/detail and split-view template, modal/sheet, states kit (loading/empty/error/offline/unauthorized/stale/unsaved), breadcrumbs and Back, workspace switcher, search palette | **240** | Master §19.3 order; built and approved once |
| Screen-specific work, sum of per-screen estimates | 2,552 | Appendix A |
| Less: shared-pattern savings | **−228** | Estimated from each screen's gap text. **States:** 12 screens × 3 h. **Back/breadcrumb/deep link:** 30 × 2 h. **Source viewer:** 9 × 4 h. **Filters/chips:** 25 × 1.5 h. **List/detail:** 7 × 4 h. **Export preview:** 10 × 3 h. |
| **Net screen work** | **2,324** | |
| Cross-module journey tests: the 7 journeys in KK's brief plus master §15 | 180 | Seeded end-to-end with evidence |
| Server-side export service (RB-P1-02) | 80 | Security track |
| Rendered and side-by-side captures, accessibility checks for every screen | 160 | Three device sizes |
| **Total UIX track** | **≈ 2,984** (previously ≈ 3,200) | |

**Implementation vs testing split:** this assumes about 30% of per-screen hours are tests, an assumption to be refined per slice.

| Part | Hours |
|---|---|
| **Implementation** | ≈ 240 shell + 1,627 screens + 80 exports = **≈ 1,947** |
| **Testing and verification** | ≈ 697 screen tests + 180 journeys + 160 captures = **≈ 1,037** |

**Not included:**
- database, accounting and security track work: Phase 2 registers (in progress), Phase 3 posting (awaiting approval), P2/P5 application;
- physical iPhone/iPad testing;
- KK's visual approvals;
- production-like rehearsal.

## 4. Priorities
| Priority | Screens | Hours | Rule |
|---|---|---|---|
| **P0** | 16 | 324 | Screens with a P0 integrity defect: I01, I02, I05, D03, D08, D09, H01, J01, E08, C01, C04, J02–J04, J08, K09 |
| **P1** | 15 | 398 | The 8 Missing screens, plus the screens with an approved capture: B01, C01, D03, F01, G02, J01, E01–E03, E05 (some are already P0) |
| **P2** | 80 | 1,830 | All other partial screens |

## 5. Dependency-based sequencing
These groupings come from keyword matching on the register's dependency text, so they are **indicative**. Each slice re-checks them.

| Wave | Content | Gate |
|---|---|---|
| 0 | P0 integrity fixes: P0-001 (in progress), P0-002..004 (in progress on `p0/financial-integrity`) | None |
| 1 | **Design system and shell, proposed**, with real iPhone, iPad and desktop captures | **KK visual approval** before extension |
| 2 | **35 screens with no external dependency, ≈ 716 h**, in master order: Home/Search/Calendar/To-do → Money → Smart Add → Records → Reports → Settings. The screens: A01, A06, B01–B06, B08, C02–C05, C11, E02–E04, E06, E07, F04, F09, G06, G10, H06, I09, J01, J05, J07, J09, K06–K08, K10–K12. | Shell approved |
| 3 | Screens depending on P5/P2/staged SQL (≈ 28 screens, ≈ 642 h; plus 5 depending on the server export service, ≈ 106 h). Built against the proposed interfaces behind capability checks that fail closed, as Phase 1 did. | Interfaces delivered by the database/security tracks; production application needs separate approval |
| 4 | Screens depending on the Phase 2 registers (F08, G, H, I) | `phase2/registers` delivered |
| 5 | Screens depending on Phase 3 posting (≈ 34 screens) | Phase 3 approval and delivery |
| — | External: K05, J11, email intake, licensed prices | KK / providers |

## Appendix A: per-screen hours, status, priority and dependencies
| Screen | Name | Status | Priority | Hours | Dependencies |
|---|---|---|---|---|---|
| A01 | Welcome and Sign in | Partial | P2 | 14 | None (after shell) |
| A02 | Workspace setup | Partial | P2 | 28 | P5, StagedSQL |
| A03 | Invite and access | Partial | P2 | 40 | P2, StagedSQL |
| A04 | Setup progress | Partial | P2 | 24 | P5 |
| A05 | Opening balances | Partial | P2 | 20 | Phase3, StagedSQL |
| A06 | Welcome tour | Partial | P2 | 10 | None (after shell) |
| B01 | Home | Partial | P1 | 32 | None (after shell) |
| B02 | Global search | Partial | P2 | 24 | None (after shell) |
| B03 | Calendar month and agenda | Partial | P2 | 32 | None (after shell) |
| B04 | Calendar item | Missing | P1 | 20 | None (after shell) |
| B05 | Notifications center | Missing | P1 | 36 | None (after shell) |
| B06 | Notification preferences | Partial | P2 | 16 | None (after shell) |
| B07 | Workspace selector | Partial | P2 | 28 | P5, StagedSQL |
| B08 | Global command/help | Partial | P2 | 24 | None (after shell) |
| C01 | Money overview | Partial | P0 | 24 | P5 |
| C02 | Bank account index | Partial | P2 | 14 | None (after shell) |
| C03 | Bank account detail | Missing | P1 | 32 | None (after shell) |
| C04 | Credit card index | Partial | P0 | 12 | None (after shell) |
| C05 | Card detail | Partial | P2 | 16 | None (after shell) |
| C06 | Transaction detail | Partial | P2 | 28 | Phase3 |
| C07 | Transfer and card payment review | Partial | P2 | 16 | Phase3 |
| C08 | Loans and EMIs | Partial | P2 | 20 | Phase3 |
| C09 | Cash and wallet accounts | Partial | P2 | 12 | Phase3 |
| C10 | Net worth | Partial | P2 | 20 | P5 |
| C11 | Recurring payment manager | Partial | P2 | 14 | None (after shell) |
| C12 | Account settings | Partial | P2 | 20 | P2, P5 |
| D01 | Financial Inbox overview | Partial | P2 | 24 | P2, P5, StagedSQL |
| D02 | Smart Review | Partial | P2 | 20 | P2 |
| D03 | Statement Desk intake | Partial | P0 | 28 | Phase3, StagedSQL |
| D04 | Statement comparison | Partial | P2 | 32 | Phase3 |
| D05 | Match suggestions | Partial | P2 | 24 | Phase3 |
| D06 | Account reconciliation | Partial | P2 | 20 | Phase3 |
| D07 | Transfers and Card Payments queue | Partial | P2 | 16 | StagedSQL |
| D08 | Review history | Partial | P0 | 14 | P2 |
| D09 | Background job progress | Partial | P0 | 24 | StagedSQL |
| D10 | Exception resolution | Partial | P2 | 32 | P2, P5 |
| E01 | Universal Expense entry | Partial | P1 | 24 | External |
| E02 | Smart Add source selection | Partial | P1 | 12 | None (after shell) |
| E03 | Intelligent Canvas extraction | Partial | P1 | 32 | None (after shell) |
| E04 | Canvas exception/duplicate review | Partial | P2 | 24 | None (after shell) |
| E05 | Canvas confirmation | Partial | P1 | 16 | Phase3, StagedSQL |
| E06 | Draft and processing history | Partial | P2 | 20 | None (after shell) |
| E07 | Expense list | Partial | P2 | 14 | None (after shell) |
| E08 | Expense detail | Partial | P0 | 24 | Phase3, StagedSQL |
| E09 | Income/receipt detail | Partial | P2 | 24 | Phase3 |
| E10 | Merchant/category rules | Partial | P2 | 16 | StagedSQL |
| E11 | Splits and multi-currency | Partial | P2 | 14 | External |
| F01 | DocuRepo index | Partial | P1 | 16 | P2, StagedSQL |
| F02 | Document viewer | Partial | P2 | 32 | StagedSQL |
| F03 | Document relationship view | Partial | P2 | 28 | Phase3 |
| F04 | Document requests | Partial | P2 | 28 | None (after shell) |
| F05 | Documents lifecycle | Partial | P2 | 20 | P2, StagedSQL |
| F06 | Company/entity index | Partial | P2 | 28 | P5, StagedSQL |
| F07 | Company profile | Partial | P2 | 32 | P2, P5, StagedSQL |
| F08 | Projects/activities | Missing | P1 | 60 | Phase3 |
| F09 | Contact/merchant directory | Partial | P2 | 24 | None (after shell) |
| G01 | Travel Manager index | Partial | P2 | 14 | Phase3, P5, Registers |
| G02 | Trip overview | Partial | P1 | 18 | Phase3, P5 |
| G03 | Itinerary | Partial | P2 | 14 | Phase3, P5 |
| G04 | Trip budget | Partial | P2 | 14 | P5 |
| G05 | Trip expenses | Partial | P2 | 14 | Phase3, P5 |
| G06 | Travel receipts | Partial | P2 | 20 | None (after shell) |
| G07 | Reimbursement claim | Partial | P2 | 26 | Phase3, P2 |
| G08 | Approval and payment | Blocked | P2 | 40 | Phase3, P2, StagedSQL |
| G09 | Refund and trip closing | Partial | P2 | 20 | Phase3 |
| G10 | Trip report and evidence | Partial | P2 | 22 | None (after shell) |
| G11 | Trip collaborator settings | Missing | P1 | 32 | P2, P5, Registers |
| H01 | Portfolio overview | Partial | P0 | 20 | P5 |
| H02 | Import statements | Partial | P2 | 30 | Phase3 |
| H03 | Holding detail | Partial | P2 | 24 | Phase3 |
| H04 | Valuation history | Partial | P2 | 14 | External |
| H05 | Capital gains and corporate actions | Partial | P2 | 36 | Phase3 |
| H06 | Manual market-rate fallback | Partial | P2 | 6 | None (after shell) |
| H07 | Net worth reconciliation | Partial | P2 | 24 | Phase3, P5 |
| H08 | Portfolio reports | Partial | P2 | 22 | Phase3 |
| I01 | Asset register | Partial | P0 | 16 | Phase3, P5, Registers |
| I02 | Asset detail | Partial | P0 | 18 | P5 |
| I03 | Asset import review | Partial | P2 | 30 | Registers |
| I04 | Depreciation working | Partial | P2 | 20 | Phase3, P2, P5 |
| I05 | Asset disposal/transfer | Partial | P0 | 14 | Phase3, P5 |
| I06 | Property index | Partial | P2 | 12 | P5 |
| I07 | Property detail | Partial | P2 | 20 | Phase3 |
| I08 | Property cash flow | Partial | P2 | 18 | Phase3 |
| I09 | Property calendar | Missing | P1 | 16 | None (after shell) |
| I10 | Asset/property relationship | Partial | P2 | 16 | P5, Registers |
| J01 | Report studio | Partial | P0 | 24 | None (after shell) |
| J02 | Report preview | Partial | P0 | 16 | ServerExport |
| J03 | Export dialog | Partial | P0 | 28 | ServerExport |
| J04 | Export jobs and history | Partial | P0 | 20 | ServerExport |
| J05 | Personal reports | Partial | P2 | 14 | None (after shell) |
| J06 | Business books | Blocked | P2 | 40 | Phase3, ServerExport |
| J07 | Account reports | Partial | P2 | 12 | None (after shell) |
| J08 | Expenses/projects/travel reports | Partial | P0 | 10 | ServerExport |
| J09 | Assets/property/investments reports | Partial | P2 | 32 | None (after shell) |
| J10 | Tax working center | Partial | P2 | 28 | Phase3 |
| J11 | India-specific reporting templates | Blocked | P2 | 60 | External |
| J12 | Malaysia/multi-jurisdiction scope | Missing | P1 | 40 | P5 |
| J13 | Period close and audit readiness | Partial | P2 | 32 | Phase3, P2 |
| J14 | Regulatory monitor | Partial | P2 | 16 | P2 |
| K01 | Settings home | Partial | P2 | 12 | P2 |
| K02 | Accounts and payment methods | Partial | P2 | 16 | External |
| K03 | Organization and ownership | Partial | P2 | 24 | P5 |
| K04 | Roles and accountant grants | Partial | P2 | 28 | P2 |
| K05 | Integrations | Blocked | P2 | 60 | External |
| K06 | Import and automation rules | Partial | P2 | 16 | None (after shell) |
| K07 | Accessibility and language | Partial | P2 | 24 | None (after shell) |
| K08 | Security | Partial | P2 | 28 | None (after shell) |
| K09 | Data and recovery | Partial | P0 | 32 | ServerExport |
| K10 | Release/version information | Missing | P1 | 12 | None (after shell) |
| K11 | Support/help | Partial | P2 | 20 | None (after shell) |
| K12 | Privacy and consent | Partial | P2 | 20 | None (after shell) |