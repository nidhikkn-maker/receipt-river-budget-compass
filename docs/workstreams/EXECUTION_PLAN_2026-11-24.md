# THAPAL V4: execution plan to 24 Nov 2026 (coordinator, 10 Nov 2026)

Authority: GitLab Issue #1 and KK's deadline directive.
This plan does not authorise production deployment, hosted migration, protected merges or live-data access.
Priority order: financial correctness → security → reliable interactions → visual fidelity.

## 1. Where we start (measured, 10 Nov)

| Item | State |
|---|---|
| Integration head | `1f549b3`, local and not yet pushed. It contains P0-024/025/026, P9 (proposed), the in-app value dialogs and net-worth event checks. |
| Integration test runs | Runs 1 and 2: 2,906 / 2,906. Run 3: one CPU-starvation timeout (2.2 s alone, 31.5 s under load); it will be re-run when the machine is idle. Nothing is pushed until there are three clean runs. |
| Signature Flow branch | `69ab3e2` (B1d), local. Typecheck and build pass; full runs are pending. |
| Fidelity branch | `uix/fidelity`, in progress: Manrope plus the 61 visible deviations. |
| 111 screens | 0 independently verified. 96 partial, 8 implemented (unverified), 6 missing, 1 blocked. The register estimate is ≈ 2,984 h for UIX plus about 600 h for accounting and security release work. |
| Requirements | 1,536 in total; 35 complete with local evidence. |
| Release blockers | 8 open: RB-P1-01..07 and RB-DEC-C11. |
| GitLab CI | **Unverified.** The "success" pipelines (8–49 s) carry no visible jobs or reports and match Vercel's build timing. |
| Preview | `preview.thapal.app` serves `937cfaf` (last verified), Vercel sign-in required, sample data only. |

## 2. Feasibility (explicit flag)

**At current capacity the 24 Nov target for full, independently accepted V4 is not achievable.**
Current capacity is one 4-core container running three or four agents. Above that, test runs start timing out from CPU contention.

**Measured capacity:**
- About 8–10 screen-equivalents a day reach "implementation candidate".
- Verification is serial: three full runs take about 25–30 minutes per integration.
- At that rate, about 70–90 of the 111 screens would be implementation candidates by 20 Nov.
- Fewer would be independently verified.

**Gates outside engineering control:**

| Gate | Owner |
|---|---|
| Physical iPhone and iPad runs (RB-P1-05) | KK |
| Hosted database and auth verification (RB-P1-06) | Needs a test account and approval |
| Restored-database rehearsal (RB-P1-07) | Needs approval and an isolated copy |
| GitLab CI proven to run (runner / `.gitlab-ci.yml` recognition) | KK: check the Jobs tab, or a read-only token |
| External: K05 integrations hub (Account Aggregator partner), J11 official ITR/GST schemas, J12 Malaysia scope, final T artwork | Providers and KK |

**What would make implementation feasible:** 2–3 additional isolated build environments. Each would be a separate Claude cloud session with its own container, branch and worktree, pushing to GitLab, with integration and verification kept here. That removes the CPU contention and roughly doubles throughput. **This needs KK's approval** because it multiplies compute and token use.

Even then, 24 Nov acceptance depends on the gates above. The honest 24 Nov outcome is either an independently accepted release candidate, or a precise not-ready list. It will never be a false certification.

## 3. Tracks, with exclusive file ownership

| Track | Scope (screens) | Owns | Branch / worktree |
|---|---|---|---|
| **A — Accounting and security** | P0s; RB-P1-01..04 (passkey fresh auth, server-side export authorisation, session lock, assistant revocation); P0-015 disposal authorisation; legal-entity isolation; tests for the 14 P3 decisions; failure injection; feeds I05, J06, J13, K08, K09 | `.lovable/staged-sql/**`, posting, `store.tsx` save/delete paths, `statement-pipeline/**`, `*.server.ts` export, `fx.functions.ts` | `phase3/completion`, `/home/user/thapal-p3c` |
| **B — Signature Flow system and Home/Add** | Shell, tokens, Manrope, fidelity; A01–A06, B01–B08, E01–E05, K01, K07, K10, K11 | `styles.css`, `themes.ts`, `shell/**`, `smart-add/**`, `new.tsx`, `AppShell`, `ui/**` | `uix/signature-shell` (`thapal-uixb`), plus `uix/fidelity` (`thapal-uixf`) |
| **C — Money and Inbox** | C01–C12, D01–D10, E06–E11 | Routes and components for wealth/cards/transfers/accounts/inbox/review/expenses/drafts/rules (not Statement Desk internals) | `modules/connections`, `thapal-modc` |
| **E — Records, assets and property** | F01–F09, I01–I10 | vault/docrepo/entities/assets/property routes and components | new `modules/records` (needs capacity) |
| **F — Travel, investments and reports** | G01–G11, H01–H08, J01–J14, K02–K06, K09, K12 | trips/claims/investments/report-centre/tax/settings folds | new `modules/reports` (needs capacity) |
| **D — Integration and QA (coordinator)** | Daily merges; three full runs; whole-stack SQL; cross-module and failure-injection checks; preview gate; dashboard; registers | `docs/workstreams/**`, `docs/registers/**`, integration tests | `integration/phase2-3-p0`, `thapal-integration` |

**Shared-interface contracts:**
- Screens use the shell's PageHeader, SplitView, States kit, Sheet/ValueDialog and DateField.
- Money is shown only through the ledger readers (`ledgerView`, `accountBalance`, `position`, `computeNetWorth`).
- Destructive actions use archive or reversal through Track A functions only.
- No track edits another track's files. Requests go through Track D.

## 4. Dependency-aware schedule

**Critical path:**
1. Track A P0s and P9 verified.
2. Signature Flow shell with fidelity correction, approved by KK.
3. The shell merged into integration, which unblocks screen rollout on the integrated branch.
4. Screen tracks (C/E/F).
5. Device and accessibility acceptance.
6. Release rehearsal.

| Date | Target (verifiable) |
|---|---|
| **11 Nov** | Three clean integration runs; push the integration head. Failure-injection suite green. B1d verified (three runs) and pushed; preview gate re-run with the info panel. Fidelity correction candidate with measured before/after. |
| **12 Nov** | **Milestone: integration and critical fixes.** KK reviews the corrected iPhone/iPad/desktop previews. Remaining browser confirms (destructive, approvals, period closing) replaced. GitLab CI either proven to run or escalated with evidence. |
| **13 Nov** | On KK's visual approval, merge the Signature Flow shell into integration. Screen tracks start on it: C (Money), E (Records), F (Reports). About 10 screens a day across tracks. |
| **14 Nov** | **Milestone: accounting and security foundation.** RB-P1-02 server exports; RB-P1-01/03/04 local fixes with negative tests; P3 decision tests; whole-stack rollback and reconciliation evidence. |
| **15–17 Nov** | About 35 screens migrated with tests and 3-device captures. **17 Nov milestone: module connections**, with the seven cross-module journeys passing end to end on fixtures. |
| **18–20 Nov** | Remaining screens. **20 Nov milestone: all 111 implemented**, with zero omitted contracts. Blocked screens (K05, J11, J12) are explicitly marked with their external dependency. |
| **21–22 Nov** | **Device, accessibility and regression acceptance.** KK runs physical devices on preview.thapal.app; axe and keyboard checks; full regression. |
| **23 Nov** | **Financial, recovery and release verification.** Restored-database rehearsal (needs approval), backup/restore, reconciliation evidence, and security blockers resolved or explicitly blocked. |
| **24 Nov** | Release-candidate decision: an independently accepted release candidate, or a not-ready report with the exact remaining gates. |

## 5. Daily quotas and reporting

- **Screens:** at least 10 per day reach implementation candidate from 13 Nov, and the previous day's candidates are verified. A screen is verified only with a passing test, three-device captures and the register updated.
- **Daily dashboard** (`docs/workstreams/PROGRESS_DASHBOARD.md`) contains:
  - branch SHAs, with tests run by the coordinator vs reported by developers;
  - screen status changes by ID with evidence path;
  - P0/P1 remaining;
  - journey outcomes;
  - fidelity deviations remaining;
  - device proof;
  - blockers with owners;
  - the critical path, recomputed daily.

## 6. Decisions and resources needed from KK

1. **Approve 2–3 additional isolated cloud build sessions** (capacity). This is the single biggest lever on the date.
2. **GitLab CI.** Check pipeline #3048743755 → Jobs, or authorise a read-only, project-scoped API token through the secure credential form.
3. **Hosted verification test account** (RB-P1-06), and approval for the **restored-database rehearsal** (RB-P1-07).
4. **Physical-device sessions** on 21–22 Nov (RB-P1-05).
5. **External items:** Account Aggregator partner (K05), official ITR/GST schemas (J11), Malaysia scope (J12), final T artwork.
6. **Fidelity decisions** flagged in the deviation register (26 ambiguous rows, e.g. tabular vs proportional hero figures).
