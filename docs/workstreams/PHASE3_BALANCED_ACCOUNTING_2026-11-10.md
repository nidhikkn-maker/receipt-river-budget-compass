# Phase 3: Balanced accounting — report (isolated development only)

**Approval:** KK, 10 Nov 2026, decision DN-P3-DEV, for isolated development only.

**Branch:** GitLab `phase3/balanced-accounting`, created from the verified Phase 2 stage 1 commit `a8a6a50`.

**Nothing was applied to any hosted database:** no historical record was migrated, nothing was deployed, and nothing was merged into `main`. All database changes are proposed SQL.

## 1. What was built
- **Inventory:** `docs/plans/PHASE3_POSTING_INVENTORY_2026-11-10.md` lists 25 app write paths and every database writer to `expenses`, with file:line (V4 FND-01).
- **Proposed SQL:** `.lovable/staged-sql/proposed/P7_balanced_posting.sql` + rollback. **P7 is now the authoritative posting proposal.**
  - The earlier `P3_accounting_posting_layer.sql` is marked SUPERSEDED and kept for history. Each refuses to install while the other is present.
  - The P5 rollback refuses to run while P7 is installed.
- **Tables:**
  - `posting_events`: one row per economic event; its unique key is the idempotency identity.
  - `posting_event_sources`: the evidence of each event; each source can be bound to only one active event.
  - `posting_batches`: one legal entity each; source currency, amount, rate, FX date and source; reversal link.
  - `posting_lines`: exact 2-decimal debit/credit lines with an explicit currency.
  - `posting_reversals`: the audit record, including the archived entry and its links.
  - `posting_backfill_runs`: append-only conversion history.
- **One posting function:** every batch is written by `phase3_p7.write_batch`. Every existing write path reaches it through one trigger on `expenses` (and one on `opening_postings`), so no write path has its own posting code.
- **Database rules:**
  - A commit-time check rejects any batch whose debits and credits differ in any currency, or that has fewer than two lines.
  - A reversal must mirror its original exactly.
  - No role can update, delete or truncate posted rows, including the superuser and service role; only confirmed account erasure can.
  - A posted entry cannot be deleted (`P7_POSTED_ENTRY`), and another user can never delete an active owner's entry (`P7_TEAM_DELETE`, closes P0-022).
  - Guests and assistant sessions are refused.
- **Entry points:**
  - Read-only: `posting_status`, `preview_posting_backfill`, `posting_reconciliation_report`.
  - Need step-up: `commit_posting_backfill`, `undo_posting_backfill`, `reverse_ledger_entry`, `reverse_journal_batch`.
  - Refuses assistants: `post_journal_batch`.
- **App:**
  - `src/lib/posting.ts`.
  - Reversal replaces deletion for posted entries (`store.tsx` `remove`, `ExpenseDialog`, `DuplicateCompare`). Owners who have not activated the posting layer keep today's behaviour.
  - Statement Desk review gate: `review-gate.ts`, `apply.ts`, `statements.tsx`.
  - Server-side enforcement in `fx.functions.ts`.
- **Historical records:** a previewed, owner-confirmed, idempotent backfill (`preview_posting_backfill` → `commit_posting_backfill` with the exact preview fingerprint) and `posting_reconciliation_report`. **Nothing converts automatically.**

## 2. KK's requirements
| # | Requirement | Evidence (tests in `src/lib/phase3-*.test.ts`) |
|---|---|---|
| 1 | One controlled posting architecture | Every path reaches `write_batch`: opening balances, category moves, `finance_operation`, direct saves |
| 2 | Database-enforced balanced entries | Refused: unbalanced, single-line, 3-decimal, negative, two-sided and NaN lines. Mixed currencies balance per currency. A 33.33/33.33/33.34 split posts exactly. |
| 3 | Separate company and personal scopes | Batches belong to one P5 legal entity; personal books are the owner's personal entity; cross-tenant writes are refused |
| 4 | Immutable postings, audited reversals | No role can update or delete posted lines (developer tests and the coordinator's independent test). Reversal needs step-up and a reason, logs a security event and replays safely. |
| 5 | No silent conversion | An md5 of every pre-existing row and table, and the catalog, is unchanged across install, preview, commit and rollback. Backfill only on the owner's confirmed preview. |
| 6 | Opening balances and closed periods | Openings post only with a source document. Closed periods are skipped and listed. Reversal in a closed period is refused until reopened. Entity-aware checks match the existing guard. |
| 7 | Duplicate-posting prevention | Upload retries post once; duplicate statement, card or receipt rows are refused; a linked transfer counterpart posts once; a reimbursement retry gives one entry; a double commit replays |
| 8 | Multi-currency traceability | USD and EUR source amount, rate, date and source are kept on the batch; lines are INR and balance per currency |
| 9 | P0-005a integrated | Posted entries are never hard-deleted. The team delete policy no longer reaches active owners. Receipts are kept on reversal. The full row and its links are archived. Reversing one side of a linked transfer is refused until it is unlinked (P0-020). Undo of a posted opening is refused; reverse it instead. |
| 10 | Independent reconciliation and regression | `phase3-independent.test.ts`: 3 entities × INR/USD/EUR; the posted trial balance equals an independent TypeScript double-entry model **and** the app's own `ledger.ts` balances, to the paisa. Each entity balances, and inter-entity balances cancel. The coordinator's separate test `phase3-coordinator-independent.test.ts` re-checks balance per batch and currency, immutability for every role, no hard delete, and owner-only reads. |
| C11 | Review before posting | Every suggested Statement Desk row needs its own tick. "Apply everything" and "Accept all" are removed; only approved rows are saved. The approval stamp is enforced in `applyUpload`, in the server save and in the database (`C11_REVIEW_REQUIRED`). The thresholds are coded but pre-approve nothing in this release. |

**The 14 approved P3 decisions:** mapped one by one in `docs/plans/PHASE3_ACCOUNTING_PLAN_2026-11-10.md` §2.

## 3. Accounting-integrity results (isolated)
- **Test ledger:** 25 entries across 3 legal entities and 3 currencies; 20 post. The other 5 are listed exceptions, never invented balancing lines.
- **Trial balance:** equal to the independent model and to the app's balances, to the paisa.
- **Per-entity balance:** every entity balances, and inter-entity balances cancel exactly.
- **Reconciliation report:** exactly 3 differences, each explained by its entries, and nothing auto-fixed:
  - an opening balance without evidence;
  - an unexplained adjustment plus a duplicate statement row;
  - a static personal opening balance.

## 4. Test evidence
| Check | Result |
|---|---|
| `bun run typecheck` | Pass; no new suppressions |
| `bun run build` | Pass |
| **Full suite ×3** | **2,703 / 2,703 passed, 351 files, in each of three identical runs** |
| Phase 3 tests ×3 (developer) | 45/45 each run: `phase3-posting-sql` 30, `phase3-independent` 6, `phase3-c11` 9 |
| Required regressions (developer) | 210/210: phase2-entities-sql, phase2-independent, phase2-restore-investments-sql, security-phase1-sql, -e2e, security-proposed-sql, -restore-sql |
| Related suites (developer) | 52 files, 290/290: old P3 test, statement pipeline, backup restore, `src/components` |
| Coordinator's independent test | `phase3-coordinator-independent.test.ts`. **Balance:** every batch balances per currency, computed outside the SQL, with exact paise. **Immutability:** the superuser cannot update or delete posted lines. **No hard delete:** the owner cannot delete a posted entry. **Owner-only reads:** other owners and strangers read none of the journal. |

## 5. Decisions needed from KK
These are implemented locally as stated; nothing is applied anywhere.
1. **Reversal takes the entry out of the working ledger.** The row moves to an audit archive (full content and links), and a mirror posting is booked. Reason: many server-side readers (reports, assistant, MCP tools) read the ledger table directly and would otherwise keep counting it. Confirm this as the reading of DN-P3-10.
2. **Reversal date.** A reversal takes the original's date, and a closed original must be reopened first. The alternative, booking the correction in the current open period, would make old period reports disagree with the journal.
3. **Personal-only closes.** A closed period limited to the personal books (rather than all books or one company) is ignored by both the existing and the new checks, so the two always agree. This means a personal-only close does not yet lock personal entries. Supporting it needs both checks changed together.
4. **Reimbursements** reduce the original expense category and are never income.
5. **Journal posting is owner-only for now.** Authorised accountants (DN-P3-7 B) can read but not post.

## 6. What remains (Phase 3 follow-ups)
1. **Statement Desk Undo** must be rewritten as per-row reversal; after activation it fails closed. The staged statement-undo SQL hard-deletes and must be revised against DN-P3-10.
2. **Linked records on reversal:** statement import fingerprints, drafts, transfer links and claim receipts are archived but not yet updated.
3. **P0-005b card payment:** a card-payment action in the single posting path is still needed. Retries via `window.prompt` still double-post.
4. **Journal and accountant screens:** map them to `post_journal_batch` and `reverse_journal_batch`; still fail-closed.
5. **Owner screens** for preview, commit and the reconciliation report; today they are database-only.
6. **Interim delete confirmation** for owners who have not activated (P0-005a R11): pending KK.
7. **Hosted dry run** on a restored copy: needs KK approval.
8. **Depreciation journals** from the asset register are not yet posted.

## 7. Residual risks
- **Derivation rules** are proven on the seeded data set only, so comparing the preview with the Reports Centre is a mandatory stage before any commit.
- **Account moves:** when an account moves to another entity (P5), entries it does not touch are re-posted only through preview and commit.
- **Restores** for active owners post immediately as new events.
- **Raw API inserts** that omit the C11 stamp look like manual entries.
- **PGlite is not hosted Supabase:** concurrency, performance and the Postgres version are unverified. Hosted pre-checks are in plan §8.
- **Branch divergence:** this branch, `p0/financial-integrity` and `uix/screen-verification` all change `store.tsx` and `ExpenseDialog.tsx`, so combining them needs careful merging and re-verification. That is not done yet.

## 8. Screenshots
`docs/evidence/screens/2026-11-10-phase3/`: iPhone 15, iPad Pro 11 and desktop, Chromium emulation with fixture data.
- **Before:** the Statement Desk plan with "Apply everything (2 to save)" and "Accept all 3 asking items"; entry detail with Delete.
- **After:** "Suggested · approve each row"; "Save 1 approved row" ("Each automatically classified row needs your own tick; nothing is saved without it"); entry detail with "Reverse entry"; the reason dialog.
- **After, posting not installed:** Delete unchanged (today's production behaviour).

## 9. Readiness scores (evidence-based)
| Area | Before Phase 3 | Now | Reason |
|---|---|---|---|
| Accounting implementation | 4.0 | **5.5** | One database-enforced balanced posting layer, immutability, reversals, idempotency, entity scopes, FX traceability, C11 review gate, independent reconciliation to the paisa. Not higher: proposed only; follow-ups remain (Undo rewrite, linked-record updates, card payment, journal/accountant screens, owner backfill screens); no hosted dry run. |
| Historical financial verification | 4.5 | **5.0** | Previewed, fingerprinted backfill with an exact reconciliation report and preserved history. Not run on any real data. |
| Security implementation | 6.0 | 6.0 | P0-022 team-delete bypass closed in proposal; release blockers still open |
| Automated testing | 8.0 | 8.0 | More database and reconciliation tests; still no device or browser-in-CI tests |
| Production readiness | 3.0 | **3.0** | Nothing applied or deployed |

**Phase 3 stops here and waits for KK's approval before the next phase.**
