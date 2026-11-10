# Phase 3: Balanced Accounting plan (P7 r2 + P8), 2026-11-10

**Status.** Proposed and isolated. Nothing has been applied to Lovable Cloud or any hosted database, nothing is committed, and no files under `drizzle/migrations` were touched. All evidence comes from in-memory PGlite, which replays 0000–0088 and then the proposed stack P1, P2, P4, P5, (P5b), (P6), P7 and (P8).

**Revision 2 (Phase 3 completion, worktree `phase3/completion` from integration commit `a8a84b3`).** KK's six binding decisions of 10 Nov 2026 changed what revision 1 built. They are implemented by **revising `P7_balanced_posting.sql` in place** (it is not applied anywhere, and one authoritative posting layer is clearer than a patch layer), plus **one new file, `P8_asset_depreciation_posting.sql`**, for the only part that needs the P6 registers.

**Authority.** `.lovable/staged-sql/proposed/P7_balanced_posting.sql` (revision 2) is the authoritative posting-layer proposal. It **supersedes** `P3_accounting_posting_layer.sql` and `docs/plans/ACCOUNTING_MIGRATION_PLAN_2026-11-09.md`, which are kept for history. Each file's preflight refuses to install when the other is present.

| Deliverable | Path |
|---|---|
| Inventory | `docs/plans/PHASE3_POSTING_INVENTORY_2026-11-10.md` (reader inventory for decision 1 in §3) |
| Posting layer, revised | `.lovable/staged-sql/proposed/P7_balanced_posting.sql`, `P7_balanced_posting.rollback.sql` |
| Depreciation posting (new) | `.lovable/staged-sql/proposed/P8_asset_depreciation_posting.sql`, `P8_asset_depreciation_posting.rollback.sql` |
| Rollback chain guards | `P5_legal_entities_foundation.rollback.sql` and `P6_registers.rollback.sql` refuse while P8 is installed; P7 rollback refuses while P8 is installed; P5 rollback refuses while P6 or P7 is installed (unchanged) |
| Client API for the screens | `src/lib/posting.ts` (§12) |
| Reader rule (decision 1) | `src/lib/ledger.ts` `ledgerView`, `txnFromRow`, `reversalOfRow`, `LEDGER_COLUMNS` |
| App wiring | `src/lib/store.tsx` (`remove`, `payCard`, ledger view on load), `src/components/ExpenseDialog.tsx`, `src/components/WealthPanels.tsx` (card payment form), `src/routes/_authenticated/statements.tsx` + `src/lib/statement-pipeline/atomic-undo*.ts` (Undo), `src/lib/reimbursements.ts` (claim kinds), server/MCP readers |
| Tests | `src/lib/phase3-completion-sql.test.ts` (17), `phase3-depreciation-sql.test.ts` (7), `phase3-readers.test.ts` (13), `phase3-independent.test.ts` (9, rewritten), `phase3-posting-sql.test.ts` (30, updated), `phase3-c11.test.ts` (9), `phase3-coordinator-independent.test.ts` (1), `src/components/card-payment.repro.test.tsx` (4, now the P0-005b regression) |

## 0. KK's decisions of 10 Nov 2026 (binding) and how revision 2 implements them

| # | Decision | Implementation | Evidence |
|---|---|---|---|
| 1 | Reversals keep the original in the journal and the working ledger; a separate balanced reversing entry is recorded and linked; history kept | `expenses.reverses_entry_id` (new nullable column, one reversal per original) + an immutable copy `receipt_details.reversal`. `phase3_p7.reverse_entry` inserts a mirrored reversal row through the one posting path; the trigger posts mirrored `reversal` batches dated on the reversal row's date. The original row is byte-identical afterwards; both rows are refused for edit (`P7_REVERSED_ENTRY`, `P7_REVERSAL_HISTORY`) and delete. `posting_reversals` keeps the full original row, reason, actor, session, correction date and link states. **Readers**: every reader counts original + reversal (net zero, each on its own date) through `ledger.ts ledgerView` (§3 of the inventory); the SQL reader `legacy_movements` counts reversal rows negatively | completion test "decision 1" (byte-identical original, month-by-month journal, replay, refusals); `phase3-readers.test.ts`; independent test (per month) |
| 2 | Corrections on the authorised correction date in an OPEN period; no automatic reopening; a separate controlled prior-period workflow | `reverse_ledger_entry(_request, _entry, _reason, _on date DEFAULT today)`: refused before the entry date, in the future, or inside a closed period (`P7_CLOSED_PERIOD … submit a prior-period adjustment`). Closed periods are never reopened. **Prior-period adjustment**: `submit_posting_request(kind 'prior_period_adjustment', {periodId, entityId, lines…} or {periodId, entryId})` → `decide_posting_request('approve')` with step-up; the target must exist and be CLOSED for the entity; the batch (`kind 'prior_period'`, or a reversal for the entry variant) is posted on the correction date after the period and tagged `meta.priorPeriod`. **Reporting**: `prior_period_adjustment_report()` shows per closed period and entity the figures **as closed** (unchanged; hash compared with the close evidence), the adjustments that relate to it and the restated view, side by side. Edits (DN-P3-1 reverse-and-replace) of an entry in an open period keep the superseded version's date so period reports match | completion tests "decision 2" (closed April untouched, reversal in July; PPA pending → step-up → posted 31 Jul; June as closed unchanged, restated shown); independent test (June 7,500 as closed + July 1,500, restated 9,000) |
| 3 | Same database-enforced protections for personal scopes | A period with `entityId = 'personal:<owner>'` (the personal legal entity's key) is enforced by **both** guards: `phase3_p7.closed()` (posting guard) and `public.p5_entry_closed` (legacy entry guard, replaced in P7 with one added branch; the P7 rollback restores the P5 body exactly). An entry touches the personal books when its paying or receiving account is personal, or it has no account and no hand-picked company | completion test "decision 3" (personal entries, a cashless entry and a company→personal withdrawal refused; Alpha-only entry allowed; personal journal refused, company journal allowed); posting test 6a (both guards agree entry by entity under 4 configurations incl. personal-only) |
| 4 | Distinguish merchant refunds, employee reimbursements, advances, insurance recoveries and inter-party settlements; preserve gross expenses; no duplicate recognition | See §1.1. Refund = the only money back that reduces the purchase. Claims (`reimbursement.kind` employer / insurance / party / legacy unset) post their own **claim event** (`claim:<expense>`): Dr `receivable:claim:<expense>` / Cr `recovery:<kind>:<category>`; money back (linked through the claim's `receipts[].txnId`) settles the receivable. Advances: Dr account / Cr `advance:received`; return reverses it; a claim of kind `advance` settles against the advance. Unlinked money back = exception `reimbursement_unlinked`; one receipt on two claims = `reimbursement_ambiguous` (never two settlements). A reversed money-back entry moves from the claim's `receipts` to `reversedReceipts` (with its reversal reference) so the claim is outstanding again | completion tests "decision 4" (3); posting test 4 (insurance claim retry); independent test |
| 5 | Owner-only posting for now; architecture for authorised accountants/bookkeepers; never expand legacy permissions | `phase3_p7.may(owner, entity, action)` + `require_may` is called by every posting, reversal, journal, backfill and approval path. Today: owner only (guests and assistant sessions never). The reserved delegation branch needs an owner-created `posting_delegations` row (no writer exists: default off) AND an accepted P2 grant whose matrix allows `post`/`approve`; `legacy_company_editor/viewer` never qualify | completion test "decision 5" (owner yes; accountant grant alone no; with a simulated delegation the accountant yes for C1 only, the legacy editor still no) |
| 6 | Readable ID prefixes LSE, HLD, RCV, PRJ approved | Already issued by P6 (`assign_readable_id`) in the owning legal entity's scope, never regenerated; nothing in Phase 3 changes them | `phase2-registers-sql.test.ts` (passes on this branch) |

## 1. Objects (P7 r2)

**Schema.** `phase3_p7` is private: no client usage and no EXECUTE rights.

**Column added to an existing table.** `public.expenses.reverses_entry_id uuid REFERENCES expenses(id)`, `CHECK (≠ id)`, unique partial index (one reversal per original). Nullable; NULL on every pre-existing row (tested). Rollback drops it when no reversal row exists; otherwise it refuses unless `phase3_p7.rollback_keep_reversals = 'on'` (dropping the link would make each reversal row count as a new entry).

**Tables.** All RLS-enabled, SELECT-only for API roles, P4 RESTRICTIVE assistant policies and P7 no-update/no-delete policies, writer-only insert, immutable (update/delete/truncate refused for every role; only confirmed erasure deletes).
- r1: `posting_events` (event keys `ledger_entry:`, `journal:` and now `claim:`), `posting_event_sources`, `posting_batches` (kinds `entry`, `opening`, `journal`, `reversal`, **`prior_period`**), `posting_lines`, `posting_reversals` (+ `reversal_entry_id`, `correction_date`; target + `prior_period`), `posting_backfill_runs`.
- r2 new: `posting_link_states` (states of linked records, item 2), `posting_requests` + `posting_request_decisions` (approval queue, item 5), `statement_upload_reversals` (Undo receipts, item 1), `posting_delegations` (reserved, decision 5).

**Invariants (r1, kept).** Writer-only insert; deferred balance check per batch and currency (= per legal entity and currency); ≥ 2 lines; exact paise; reversal mirrors its original exactly and only once; one active batch per event and entity; entity-aware closed periods; guests and assistants cannot post. **r2 changes:** a reversal is dated on or after its original (the correction date); the closed-period check covers personal-only periods.

**Hooks on existing tables.**
- `expenses`: `p7_guard_posted_delete` (posted deletes refused; reversed originals and reversal rows are history for every owner), **`zz_p7_guard_reversals`** (reversal rows only through the function for active books, exact mirror, immutable; reversed originals keep their financial content; the receiving side of a reversed transfer cannot be unlinked; `receipt_details.reversal` exists exactly on reversal rows), `zz_p7_sync_postings` (also re-syncs a claim's money-back entries when its receipts change).
- `expenses` trigger `clear_empty_category_history` (0016) **disabled** (P0-021; rollback re-enables).
- `opening_postings`: `zz_p7_sync_opening`. `period_close_evidence`: `p7_period_evidence`.
- Replaced function: `public.p5_entry_closed` (decision 3; restored by the rollback).

### 1.1 Derivation rules (`phase3_p7.derive_entry`, `derive_claim`)

Functional currency INR; source currency, amount, rate, FX date and source on the batch.

| Entry | Lines |
|---|---|
| expense / income | Account leg in the account's entity; category legs from the exact allocations in the effective entity; `due:` lines across entities, never profit |
| **refund (merchant refund)** | Dr account / Cr `expense:<category>`: the only money back that reduces the purchase |
| **expense with a tracked claim** (claim event `claim:<expense>`) | Dr `receivable:claim:<expense>` / Cr `recovery:<kind>:<category>` for the reimbursable part (rejected or written-off: only what was received). kind = employer / insurance / party / claim (unset, legacy). Dated on the expense date if open, else on the correction date. The gross expense batch is never touched |
| **expense with an advance claim** | Dr `advance:received` / Cr `recovery:advance:<category>` |
| **reimbursement (money back) linked to its claim** | Dr account / Cr `receivable:claim:<claim>` (+ `due:` lines across entities). Never income, never an expense code |
| **advance / advance_settlement** | Dr account / Cr `advance:received` (liability) and its exact reverse |
| transfer / card_payment / investment / loan_repayment | Cr source, Dr destination; loan interest per `repaymentParts`; `due:` lines across entities |
| adjustment of a source-backed opening | `opening` batch: account vs `equity:opening:<fy>` |
| adjustment classified by the hook | P8: approved book depreciation (§11). P7 alone classifies none |
| **reversal row** | Posted as the mirrored reversal of the original's active batches on the reversal row's date |
| exception, not posted (DN-P3-2) | unclassified adjustment, opening without evidence, no owned account, missing destination, inexact amount, invalid allocation, unresolved entity, duplicate evidence, C11 review required, **reimbursement_unlinked, reimbursement_ambiguous, advance_claim_receipt, unknown_recovery_kind**; P8: depreciation_not_approved, duplicate_depreciation, depreciation_amount_mismatch, depreciation_date_mismatch, depreciation_account_mismatch, asset_entity_mismatch, asset_missing, asset_disposal_workflow |
| skipped | statement counterparts (their evidence binds to the debit's event) |

### 1.2 Entry points

| Function | Guard | Purpose |
|---|---|---|
| `posting_status()` | — | capability probe (`version 'P7.2'`, `features[]`) |
| `preview_posting_backfill()`, `posting_reconciliation_report()`, `prior_period_adjustment_report()`, `posting_requests_overview(limit)` | read-only | previews and reports |
| `commit_posting_backfill(run, fingerprint)` | step-up | historical conversion (direct) |
| `undo_posting_backfill(run, reason)` | step-up | deactivate; reversals on the correction date |
| `reverse_ledger_entry(request, entry, reason, on)` | step-up | decision 1/2 reversal (direct) |
| `post_journal_batch(request, entity, date, lines, memo, sources)` | assistant refusal | manual journal (direct) |
| `reverse_journal_batch(request, batch, reason, on)` | step-up | journal reversal on the correction date |
| **`reverse_statement_upload(request, upload, items, reason)`** | step-up | item 1 |
| **`record_card_payment(request, from, card, amount, on, note)`** | assistant refusal | item 3 (P0-005b) |
| **`submit_posting_request(request, kind, payload, reason)`** | assistant refusal | item 5: prepare (journal, journal_reversal, reversal, backfill, prior_period_adjustment) |
| **`decide_posting_request(request, decision, note)`** | step-up | item 5: approve (executes) / reject / cancel |

All refuse guests. The fail-closed check (no unguarded client-callable volatile function) still passes.

## 2. The 14 approved P3 decisions: mapping and verification (item 6)

| Decision | Implementation (r2) | Evidence |
|---|---|---|
| DN-P3-1 A: reverse and replace posted edits | Edits after activation keep v1 and add an in-period reversal + v2 (meta reason/actor). Removal of a posted entry = linked reversal row (decision 1); originals immutable | posting test 2c; completion "decision 1" |
| DN-P3-2 A: exception only for unknown counterpart | No suspense lines; unlinked money back is `reimbursement_unlinked`, not a guessed expense reduction; asset entity mismatch is an exception, never an inter-entity guess | independent test (no suspense; 3 explained differences); completion "decision 4"; depreciation test |
| DN-P3-3 A: dated source-backed opening | Unchanged: openings post only with `source_doc_id` | posting tests 6c, 9 |
| DN-P3-4 A: skip closed periods | Backfill skips and lists closed-period work; corrections never post inside a closed period; claims recognised after close post on the correction date; prior-period treatment is the separate approved workflow (decision 2) | posting test 3b; completion "decision 2" |
| DN-P3-5 B: personal accounting included | Personal entity in the same journal; personal-only closes enforced (decision 3) | posting 5a; completion "decision 3" |
| DN-P3-6 A: functional currency + original | Reversal rows copy amount, original amount, currency, rate and FX date (mirror check); batches keep source facts | independent test (FX); completion "decision 1" (mirror refusal) |
| DN-P3-7 B: owner + explicitly authorised accountants | Reads unchanged (accountant grant per entity). Posting owner-only behind `may()`; delegation reserved and off; legacy roles never | posting 5b; completion "decision 5" |
| DN-P3-8 B: company-aware legacy period checks | Both guards entity-aware incl. personal; agree entry by entity | posting 6a; completion "decision 3" |
| DN-P3-9 A: cross-account restore exceptions | Journals never in backups; reversal rows restore only into books that are not active (mirror validated); backup remaps `reverses_entry_id`, `receipt_details.reversal.of`, `reimbursement.reversedReceipts[]` | backup tests (43/43) |
| DN-P3-10 A: undo by reversal | No physical delete of posted entries anywhere: entry removal, duplicate removal, Statement Desk Undo, backfill undo, journal reversal; evidence and receipts kept | completion items 1–2; posting 3a, 8a |
| DN-P3-11 A: reconciliation metadata only | Unmatching (Undo) and tags/title on reversed originals are metadata; financial edits of reversed history refused | posting 2c; completion "decision 1", item 1 |
| DN-P3-12 A: preview and confirm re-sync | Backfill (direct or through the approval queue) needs the exact preview fingerprint | posting 4e; completion item 5 (backfill approval) |
| DN-P3-13: mandatory close follow-up | Close refused while entries are unposted/exceptions; close and reopen evidence carries the posting snapshot; the PPA report compares the closed hash | posting 6d; completion "item 7"; PPA report `unchangedSinceClose` |
| DN-P3-14 B: guests cannot post | Every r2 entry point refuses guests (`P7_GUEST`); `may()` false for guests | posting 5e; completion (guest submit, guest reversal) |

## 3. The 10 requirements and C11

Unchanged from revision 1 (all done; evidence in the tests above). Requirement 9 (P0-005a) is now complete for posted entries: see §5. Requirement 10 is extended (§6 and item 9).

**C11** unchanged: every suggested Statement Desk row needs its own tick; server and database refuse an unreviewed automatic classification (`C11_REVIEW_REQUIRED`).

## 4. Stages (each needs KK approval before any hosted action)

1. Install P7 r2 after P1, P2, P4, P5 (and P6, P5b where used), then P8 after P6 and P7, on a production-like restored copy; record the catalog fingerprint. Nothing changes for any owner until they activate (except: P0-021 history is kept for everyone, and personal-only closes are honoured).
2. Deploy the compatible app (capability-checked: missing functions or column = today's behaviour; readers accept the reversal link from the column or its `receipt_details` copy).
3. Preview owner by owner; compare with the Reports Centre; review exceptions (now including unlinked reimbursements and unapproved depreciation).
4. Commit (direct with step-up, or submit + approve through the queue). Check `posting_reconciliation_report()`.
5. Close periods only once the report is clean (DN-P3-13); prior-period corrections through the PPA workflow.

## 5. P0-005a integration

| P0-005a requirement | r2 |
|---|---|
| R1 no physical delete of posted entries | Refused (`P7_POSTED_ENTRY`); removal = linked reversal row; reversed history never deletable |
| R2 never erase evidence | Original row kept unchanged; receipts stay on it; full row + links in `posting_reversals` |
| R3 closed periods | Correction date in an open period; prior-period workflow; entity-aware incl. personal |
| R4 linked records | `posting_link_states`: import fingerprint, draft, counterpart, document, loan, statement upload, category batch kept as history; transfer link → `reversed` (and its receiving side cannot be unlinked); claim receipt → moved to `reversedReceipts`, claim outstanding again |
| R5 metadata only | DN-P3-11 as above |
| R6 atomic and idempotent | One transaction per reversal / Undo / approval; request-id replay |
| R7 actor-attributed audit | `posting_reversals` actor, session, reason, correction date, snapshot; step-up `security_events` |
| R8 undo flows use reversal | Statement Desk Undo (`reverse_statement_upload`), duplicate removal, backfill undo, journal reversal; opening undo of a posted opening refused |
| R9 team and guest limits | `P7_TEAM_DELETE`; guests refused; posting owner-only (decision 5) |
| R10 no invented lines for past deletes | Unchanged |
| R11 interim UI | Where posting is active: in-app reason + correction date dialog; reversed history read-only in the detail view |

## 6. Preservation evidence (item 8)

- Install / backfill / rollback: count + md5 of every row of every public table (pre-existing columns; the new column asserted NULL) and the full catalog, before and after (posting test "historical preservation"); the P8 rollback restores the exact P6 + P7 catalog (depreciation test).
- Every r2 operation: `rowState` (md5 of every expenses row + accounts, documents, opening postings, legal entities, import posts, drafts, category batches, loans) before and after; only the listed rows change (reversal: none, only one new row; money-back reversal: only the claim row's `reimbursement`/status; transfer reversal: none; Statement Desk Undo: posted rows byte-identical, unposted row removed by today's rule).

## 7. Rollback (order P8 → P7 → P6 → (P5b) → P5)

1. `P8_asset_depreciation_posting.rollback.sql`: restores the P7 hook body; refuses while depreciation postings exist unless `phase3_p8.rollback_with_postings = 'on'`.
2. `P7_balanced_posting.rollback.sql`: refuses while P8 is installed; while postings exist unless `phase3_p7.rollback_archive_postings = 'on'`; while reversal rows exist unless `phase3_p7.rollback_keep_reversals = 'on'`. Unguards 9 entry points, drops the hooks, re-enables the 0016 trigger, restores `p5_entry_closed`, archives the 11 tables to `security_rollback_archive`, drops the functions, schema and (when no reversal row exists) the column.
3. P6 and P5 rollbacks refuse while P8 is installed (and P5 while P6/P7 are).

## 8. Hosted pre-checks needing KK approval

As in revision 1, plus: count reimbursement entries without a claim link (they become `reimbursement_unlinked` exceptions); count JSON depreciation journals marked posted with a `transactionId`; search `closedPeriods` for `personal:` entity ids (now enforced); confirm no hosted function writes `expenses.receipt_details.reversal`.

## 9. Residual risks

- **Accrual vs cash P&L.** The journal recognises a claim's recovery when the claim is recorded; the app's cash view (`cashflow`) reduces spending when money arrives. Balances agree exactly; P&L differs by outstanding claim receivables, advance-claim recoveries and non-cash journals (depreciation, accruals). The identity is tested; screens must label which view they show.
- **Claim category.** A claim's recovery uses the expense's primary category, not its split lines.
- **Reversal and account moves.** A reversal row takes the legal entity of its own date; if the account moved entity in between, the reversal is refused (mirror check) and the prior-period / journal route must be used.
- **Restore into active books.** Reversal rows are created only by the function for active owners, so restoring a backup containing a reversal pair into active books is refused for those rows (DN-P3-9 exception).
- **Narrow readers.** The store's first paint and the MCP tools read the link from `receipt_details.reversal` (the database keeps it exactly on reversal rows); the column is authoritative wherever present.
- **Depreciation duplicates.** When two approved journals name different entries for one asset-month, the already-posted one (else the lower entry id) keeps it; the other is an exception the owner resolves.
- **PGlite is not hosted Supabase:** concurrency, performance and PostgREST alias selects (`reversal:receipt_details->reversal`) need the restored copy.

## 10. Remaining Phase 3 items: status

| # | Item | Status |
|---|---|---|
| 1 | Statement Desk Undo by audited per-entry reversal | **Done (database + app)**: `reverse_statement_upload`; server fn uses it when installed (falls back to the staged probe otherwise); client wraps it in step-up and reports exactly what was reversed, removed and unmatched |
| 2 | Linked record states after reversals | **Done**: `posting_link_states`, transfer link `reversed`, claim receipts moved to `reversedReceipts`, P0-021 trigger disabled |
| 3 | Card-payment duplicate (P0-005b) | **Done**: in-app form; `record_card_payment` with the request id as entry id and operation key; fallback `save()` with `createId`; lost-response retry posts once (SQL + UI tests) |
| 4 | Depreciation in balanced accounting | **Done (P8)**: approved depreciation posts in the asset's entity; prepared (monthly job) never posts; archived assets depreciate; disposal stays separate |
| 5 | Approval logic for journal, reversal and historical conversion | **Done (database + client functions)**; screens next (§12) |
| 6 | Verify against the 14 decisions | **Done**: §2 |
| 7 | Personal and company period closing | **Done**: both guards, both scopes, tested |
| 8 | Preserve records and evidence | **Done**: §6 |
| 9 | Independent tests | **Done**: `phase3-independent.test.ts` (per entity, month and code; ledger.ts; SQL legacy reader; P&L identity) |

## 11. P8: asset depreciation posting

Approved book depreciation (the app's Assets → "Approve & add": the non-cash adjustment entry, then `books.journals[]` marked `posted` with the entry id; or a P6 `depreciation_journals` row `posted` with `entry_id`) is classified by the P7 hook `phase3_p7.classify_adjustment` and posts **Dr `expense:Depreciation` / Cr `account:<asset ledger account>`** in the asset's legal entity (P6 register scope, else the JSON company, else personal; the asset account must be in that entity). Triggers on `finance_preferences` (journal approval) and `depreciation_journals` (register backfill) re-sync the entries. The monthly job only prepares journals: nothing posts. Archived assets still depreciate (P0-001). Impairment and disposal stay a separate authorised workflow (`asset_disposal_workflow` exception). One depreciation per asset-month; amount, month-end date, sign and account must equal the journal.

## 12. Client functions for the screens developer (`src/lib/posting.ts`)

All are capability-checked through `readPostingStatus()/usePostingStatus()` (`installed`, `active`, `canPost`, `version`, `features`). Step-up prompts are handled inside (`withStepUp`); pass a custom `prompt` in tests.

| Function | Screen | Notes |
|---|---|---|
| `reverseLedgerEntry({ entryId, reason, requestId, correctionDate? })` → `{ entryId, reversalEntryId, correctionDate, replayed }` | entry detail "Reverse entry" (exists) | reason ≥ 5 chars; `P7_CLOSED_PERIOD` → offer a prior-period adjustment; `isNotPostedError` → delete instead (store does this) |
| `submitPostingRequest({ requestId, reason, kind, payload })` | journal, reversal, conversion and prior-period request forms | kinds `journal`, `journal_reversal`, `reversal`, `backfill`, `prior_period_adjustment`; `validateJournalLines` checks balance per currency client-side |
| `decidePostingRequest({ requestId, decision: 'approve' | 'reject' | 'cancel', note? })` | approval inbox | approve executes atomically (step-up) |
| `postingRequestsOverview(limit?)` → `RequestOverview[]` | approval inbox / history | status pending/approved/rejected/cancelled with result |
| `priorPeriodAdjustmentReport()` → `PriorPeriodRow[]` | period report | `asClosed`, `adjustments`, `restated`, `unchangedSinceClose` |
| `postingReconciliationReport()`, `previewPostingBackfill()` | activation / reconciliation screens | read-only |
| `undoPostingBackfill({ runId, reason })` | activation screen | step-up |
| `postJournalBatch({...})`, `reverseJournalBatch({ requestId, batchId, reason, correctionDate? })` | journal screen (direct owner path) | the approval queue is preferred |
| `recordCardPayment(input, rpc?, fallback?)` / `store.payCard(input)` | card payment form (built) | create `requestId` once per form; reuse on retry |
| `ledger.ts`: `ledgerView`, `isReversalHistory`, `txnFromRow`, `LEDGER_COLUMNS` | every list or total | reversal rows are negative and `reversesEntryId` is set; originals have `reversedBy`; both read-only |
| `reimbursements.ts`: `RECOVERY_KINDS`, `RECOVERY_LABEL`, `ReimbursementInfo.kind`, `reversedReceipts` | claim editor | set `kind` on a claim; a merchant refund is a `refund` entry, not a claim |
| `statement-pipeline/atomic-undo.ts`: `StatementUndoReport`, `undoSummary` | Statement Desk Undo (wired) | exact counts of reversed / removed / unmatched |
