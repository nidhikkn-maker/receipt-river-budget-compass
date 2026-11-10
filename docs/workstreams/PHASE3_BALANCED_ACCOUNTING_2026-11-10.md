# Phase 3: Balanced accounting — report (isolated development only)

**Approval:** KK, 10 Nov 2026, decision DN-P3-DEV (isolated development) and KK's six binding Phase 3 decisions of 10 Nov 2026.

**Branch:** `phase3/completion` (worktree `thapal-p3c`), from the integration commit `a8a84b3` (Phase 2 stage 1 + P5/P5b, P6 registers, P7, P0 fixes, P0-001 archive). Revision 1 of this report covered `phase3/balanced-accounting`.

**Nothing was applied to any hosted database:** no historical record was migrated, nothing was deployed, pushed, merged or committed. All database changes are proposed SQL tested in PGlite.

## 1. What changed in revision 2 (Phase 3 completion)

- **`P7_balanced_posting.sql` revised in place** (still the one authoritative posting layer): reversal entries, correction dates, prior-period adjustments, personal-only closes in both guards, reimbursement types, one permission check, Statement Desk Undo, card payments, linked-record states, approval queue. Rollback revised accordingly.
- **New `P8_asset_depreciation_posting.sql` + rollback** (needs P6 and P7): approved depreciation posts balanced in the asset's legal entity.
- **Rollback chain:** P8 → P7 → P6 → (P5b) → P5. P7, P6 and P5 rollbacks refuse while P8 is installed; P5 still refuses while P6 or P7 is installed. Tested: out-of-order refusals, exact catalog restore, reinstall.
- **Whole stack installs together** (P1, P2, P4, P5, P5b, P6, P7, P8): `phase3-depreciation-sql.test.ts` and `phase3-independent.test.ts` run on it.

Plan and full mapping: `docs/plans/PHASE3_ACCOUNTING_PLAN_2026-11-10.md` (§0 decisions, §2 the 14 P3 decisions, §12 client functions).

## 2. KK's decisions 1–6: implemented

| # | Decision | Result | Test evidence |
|---|---|---|---|
| 1 | Keep the original; record a separate linked balanced reversal | The original row stays byte-identical; a mirrored reversal row (`reverses_entry_id`) and mirrored reversal batches are added; both are immutable history; a reversed claimed expense takes its claim with it on the same correction date. Every ledger reader applies `ledger.ts ledgerView` (net zero, each on its own date) | `phase3-completion-sql` decision 1 (2 tests) + claim reversal; `phase3-readers` (13); independent test per month |
| 2 | Correction date in an open period; no automatic reopening; separate prior-period workflow | `reverse_ledger_entry(..., _on)` defaults to today and refuses closed dates. Prior-period adjustments: submit → step-up approval → posted after the closed period, tagged with it; `prior_period_adjustment_report()` shows as-closed figures (unchanged), adjustments and the restated view | completion decision 2 (2 tests); independent test (June 7,500 as closed; July 1,500; restated 9,000) |
| 3 | Personal-only closes enforced | `phase3_p7.closed()` and the legacy `p5_entry_closed` both honour `personal:<owner>` periods (rollback restores P5's body) | completion decision 3; posting test 6a (guards agree under 4 configurations) |
| 4 | Distinguish refund, employee reimbursement, advance, insurance recovery, inter-party settlement | Refund reduces the purchase; claims post receivable + separate recovery (gross expense preserved); money back settles the receivable; advances are a liability; unlinked money back is an exception; one receipt on two claims never settles twice | completion decision 4 (3 tests); posting test 4; independent test |
| 5 | Owner-only posting; architecture for authorised accountants; legacy roles never | `phase3_p7.may()` on every posting path; reserved delegation (no writer: default off) requiring a P2 grant with `post`/`approve`; legacy company roles excluded | completion decision 5 |
| 6 | LSE, HLD, RCV, PRJ prefixes approved | Already issued by P6 within the owning entity's scope; unchanged | `phase2-registers-sql` (passes) |

## 3. Remaining Phase 3 items: status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Statement Desk Undo by audited per-entry reversal | Completed and tested locally | `reverse_statement_upload`; completion item 1 (posted reversed with reason, unposted deleted, match cleared, replay, stale snapshot refused, evidence released) |
| 2 | Linked record states | Completed and tested locally | completion item 2 (transfer link `reversed`, receiving side cannot be revived, both sides net 0; fingerprint and draft kept; bulk-category history kept and undo blocked; P0-021) |
| 3 | Card payment duplicate (P0-005b) | Completed and tested locally | `card-payment.repro.test.tsx` (4: form, same id on retry, lost-response retry once, fallback once); completion item 3 (SQL: one entry, one posting) |
| 4 | Depreciation in balanced accounting | Completed and tested locally (P8) | `phase3-depreciation-sql` (7) |
| 5 | Approval logic (journal, reversal, conversion) | Database + client functions completed and tested locally; screens pending (next developer) | completion item 5 (2 tests) |
| 6 | 14 P3 decisions mapping | Completed | plan §2 |
| 7 | Personal and company period closing | Completed and tested locally | completion decision 3 + item 7 |
| 8 | Preserve records and evidence | Completed and tested locally | row hashes around every operation (plan §6) |
| 9 | Independent tests | Completed and tested locally | `phase3-independent` (9) |

## 4. KK's integrity goals, proven

| Goal | Proof |
|---|---|
| An expense is recognised correctly | Independent per-month model = journal; gross expenses kept for claims (`expense:Medical` 3,200 = 1,200 + 2,000) |
| Its payment is recorded once | Card payment retried with the same id → one entry, one posting; app balance and journal agree |
| A reimbursement does not duplicate or misclassify it | Money back settles `receivable:claim:*`, never an expense or income code; unlinked money back is an exception; a receipt listed on two claims settles none |
| A correction preserves its history | Original byte-identical, reversal row + batches added, audit row with reason, actor, correction date and link states; nothing deletable |
| Account balances remain accurate | Every account: journal = `ledger.ts` (ledgerView) = the database legacy reader, to the paisa |
| Every financial report reflects the same records | One reader rule (`ledgerView`) in the store, assistant facts, report jobs, push, statement checkpoint and MCP tools (inventory test fails on a new unlisted reader); P&L identity between the cash and accrual views tested |

## 5. Reconciliation results (independent test, full stack)

- Journal = independent TypeScript model per legal entity, **month** and code (corrections land in July, the originals stay in April/May/June).
- Every entity balances; inter-entity balances cancel.
- Every account (9): journal account line = `ledger.ts` balance over the stored rows = the SQL legacy reader.
- Reconciliation report: exactly the 3 seeded, explained differences (opening without evidence; unexplained adjustment + duplicate statement row; static personal opening). No new difference from reversals, claims, advances, card payments, depreciation or the prior-period adjustment.
- P&L: app cash spending = journal cost + outstanding claim receivables + advance-claim recoveries − non-cash journals (depreciation 2,000; accrual 1,500), exactly.

## 6. Test evidence

| Check | Result |
|---|---|
| `bun run typecheck` | Pass; no suppressions |
| `src/lib/phase3-*.test.ts` (7 files) + `card-payment.repro.test.tsx` | 8 files, 90/90 (86 + 4), in each of three identical runs |
| `phase2-*`, `security-phase1-*`, `security-proposed-*`, `src/lib/backup*`, `src/lib/statement-pipeline`, `src/components` | 74 files, 565/565 (once, final SQL) |
| Full suite (once, before the last one-line claim-date fix that the repeated runs cover) | 368 files, 2,801/2,801 |

## 7. Decisions still needed from KK

1. **Accrual claim recognition.** The journal recognises a claim's recovery when the claim is recorded (receivable); the app's cash view when money arrives. Confirm the journal treatment; screens will label both views.
2. **Restoring reversal pairs into active books** is refused (DN-P3-9 exception). Confirm, or approve a preview-gated restore re-sync.
3. **Posting delegation.** The reserved delegation path is off; a later release needs KK's approval to add the owner's grant workflow.
4. **Interim delete confirmation** for owners who have not activated (P0-005a R11): still pending.
5. **Hosted dry run** on a restored copy.

## 8. Residual risks

Plan §9: accrual vs cash P&L timing; claim recovery by primary category; reversal refused when the account moved entity; restore into active books; narrow readers trust `receipt_details.reversal` (database-enforced); depreciation duplicate tie-break; PGlite is not hosted Supabase (concurrency, PostgREST alias selects, performance).

## 9. Readiness (evidence-based)

| Area | Before | Now | Reason |
|---|---|---|---|
| Accounting implementation | 5.5 | **7.0** | KK decisions 1–6 implemented in the database; all 9 remaining items done at database + app-logic level; independent per-month reconciliation; approval screens and hosted dry run still pending |
| Historical financial verification | 5.0 | 5.5 | Preservation proven around every operation; still not run on real data |
| Automated testing | 8.0 | 8.5 | 45 new or rewritten Phase 3 tests and a reader-inventory guard |
| Production readiness | 3.0 | 3.0 | Nothing applied or deployed |

**Classification:** completed and tested locally (isolated PGlite + unit/UI tests); pending production-like verification on a restored copy; approval screens pending (next developer).
