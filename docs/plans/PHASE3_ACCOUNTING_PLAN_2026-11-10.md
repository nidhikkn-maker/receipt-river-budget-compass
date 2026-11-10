# Phase 3: Balanced Accounting plan (P7), 2026-11-10

**Status.** Proposed and isolated. Nothing has been applied to Lovable Cloud or any hosted database, nothing is committed, and no files under `drizzle/migrations` were touched. All evidence comes from in-memory PGlite, which replays 0000–0088 and then P1, P2, P4, P5 and P7.

**Authority.** `.lovable/staged-sql/proposed/P7_balanced_posting.sql` is the authoritative posting-layer proposal. It **supersedes** `P3_accounting_posting_layer.sql` and `docs/plans/ACCOUNTING_MIGRATION_PLAN_2026-11-09.md`, which are kept for history. P3 now carries a SUPERSEDED header. Each file's preflight refuses to install when the other is present.

| Deliverable | Path |
|---|---|
| Inventory (slice A) | `docs/plans/PHASE3_POSTING_INVENTORY_2026-11-10.md` |
| Proposed SQL and rollback (B, E) | `.lovable/staged-sql/proposed/P7_balanced_posting.sql`, `P7_balanced_posting.rollback.sql` |
| P5 rollback guard | `P5_legal_entities_foundation.rollback.sql` now refuses while P7 is installed |
| App wiring (C) | `src/lib/posting.ts`, `src/lib/store.tsx` (`remove`), `src/components/ExpenseDialog.tsx`, `src/components/DuplicateCompare.tsx` |
| C11 (D) | `src/lib/statement-pipeline/review-gate.ts`, `apply.ts`, `src/routes/_authenticated/statements.tsx`, `src/lib/receipt-reading.ts` (schema), `src/lib/fx.functions.ts` (server check) |
| Tests | `src/lib/phase3-posting-sql.test.ts` (30), `src/lib/phase3-independent.test.ts` (6), `src/lib/phase3-c11.test.ts` (9); fixture in `src/test/phase3-fixture.ts` |
| Screens | `docs/evidence/screens/2026-11-10-phase3/` (README inside) |

## 1. Objects (P7)

**Schema.** `phase3_p7` is private: no client usage and no EXECUTE rights.

**Tables.** All six are RLS-enabled. API roles get SELECT only. Each table has the P4 RESTRICTIVE assistant policies and the P7 RESTRICTIVE no-update/no-delete policies.
- `posting_events`: source event identity, unique on `(owner_id, event_key)`; the key is `ledger_entry:<id>` or `journal:<request>`.
- `posting_event_sources`: evidence aliases (`ledger_entry`, `statement_row`, `receipt`, `counterpart_entry`, `document`, `journal_request`). A partial unique index allows only **one active binding per piece of evidence**.
- `posting_batches`: one legal entity per batch, as a composite foreign key to P5 `legal_entities` (including the personal entity). Each batch has a kind (`entry`, `opening`, `journal` or `reversal`), a version, the posting date and `reverses_id`, which is unique so a batch can be reversed only once. It also stores the source currency, amount, rate, FX date and FX source, and the actor.
- `posting_lines`: exact debit and credit (2 dp, one side positive, below 1e13), explicit currency, role, owned account, counterpart entity.
- `posting_reversals`: the audit record. It holds the reason, actor, session, the full archived source row, and the P0-005a linked records (`_linked`).
- `posting_backfill_runs`: append-only commit and undo history. The latest row decides whether an owner is active.

**Invariants.**
- Only the writer may insert, through the session flag `phase3_p7.writer` set by the one posting function `phase3_p7.write_batch`.
- Assistant and guest sessions are refused at insert.
- UPDATE, DELETE and TRUNCATE are refused for every role. The only exception is owner erasure.
- A deferred constraint trigger checks each batch at commit:
  - it has at least 2 lines;
  - debits equal credits for each currency, and since a batch has one entity this means for each legal entity and currency;
  - a reversal exactly mirrors its original;
  - there is at most one active batch per event and entity.
- The closed-period check is entity-aware.
- A reversal must have the same owner, entity, event and date as its original.

**Hooks on existing tables. These add behaviour only for owners who have activated.**
- On `expenses`:
  - `p7_guard_posted_delete` (BEFORE DELETE): refuses deleting a posted entry (`P7_POSTED_ENTRY`) and refuses any delete by another user (`P7_TEAM_DELETE`).
  - `zz_p7_sync_postings` (AFTER): derives the entry and posts it, or posts a reversal plus a replacement, through `write_batch`.
- On `opening_postings`: `zz_p7_sync_opening`.
- On `period_close_evidence`: `p7_period_evidence` (C5 / DN-P3-13).

**Entry points.**

| Function | Guard |
|---|---|
| `posting_status()` (STABLE) | Capability probe |
| `preview_posting_backfill()` (STABLE) | — |
| `posting_reconciliation_report()` (STABLE) | — |
| `commit_posting_backfill(run, fingerprint)` | P4 step-up |
| `undo_posting_backfill(run, reason)` | P4 step-up |
| `reverse_ledger_entry(request, entry, reason)` | P4 step-up |
| `reverse_journal_batch(request, batch, reason)` | P4 step-up |
| `post_journal_batch(request, entity, date, lines, memo, sources)` | P4 assistant refusal |

All of them refuse guests (anonymous JWTs, anonymous `auth.users` rows or `demo_sessions`). The P5-style fail-closed check confirms that no client-callable volatile function is left unguarded.

**Read access (DN-P3-7 B).**
- The owner reads everything.
- An **accepted, unexpired, unrevoked P2 `accountant` grant** reads that entity's batches and lines. A workspace-wide grant covers companies; personal books need an explicit `personal:<owner>` grant.
- Company members, legacy company grants, bookkeepers, viewers, other owners, strangers and anonymous sessions read nothing.
- Assistants can read unless they have been revoked.

### Derivation rules (`phase3_p7.derive_entry`)

The currency is functional INR. The source currency is kept on the batch.

| Entry | Lines |
|---|---|
| expense / income / refund | The account leg (money out = credit, money in = debit) goes in the account's entity. Category legs come from the exact allocations and go in the effective entity. If the effective entity differs from the account's entity: `due:<entity>` in both books, never profit |
| reimbursement | Debit the account, credit `expense:<category>` (a contra-expense; **never income**) |
| transfer / card_payment / investment | Credit the source account, debit the destination account. No income or expense. Crossing entities creates `due:` lines |
| loan_repayment | Credit the source; debit the loan for the principal; debit `expense:Loan interest` (the ledger.ts `repaymentParts` rule) |
| adjustment that belongs to an active `opening_postings` row **with a source document** | `opening` batch: account against `equity:opening:<fy>` |
| exception, not posted (DN-P3-2) | Unclassified adjustment, opening without evidence, no owned account, advances, missing destination, inexact amount, invalid allocation, unresolved entity, duplicate evidence, C11 review required |
| skipped | Statement counterparts (`transfer_counterpart_of`); their evidence binds to the debit's event |

## 2. Decision mapping (`docs/registers/master/p3_decisions.csv`)

| Decision | Implementation | Evidence |
|---|---|---|
| DN-P3-1 A: reverse and replace posted edits | An edit after activation leaves version 1 unchanged and adds a reversal and version 2, with reason and actor in `meta`. Activation only follows a reviewed conversion | Test 2c |
| DN-P3-2 A: exception only | No suspense or `unclassified` lines. Exceptions are listed in the preview and the report | Independent test: no suspense lines, 5 listed exceptions |
| DN-P3-3 A: source-backed opening | Openings post only with `opening_postings.source_doc_id`. A static `accounts.opening_balance` and an opening without a document are exceptions. There is never a default opening equity | Tests 6c, 9 |
| DN-P3-4 A: skip closed periods | The preview and commit skip closed-period work and list it under `skippedClosed`. Reversal inside a closed period is refused (reopen on Audit first) | Tests 3b, 6b |
| **DN-P3-5 B: personal accounting included** | The same journal is used, scoped to P5's `individual_personal` legal entity. No fictitious company is created | Test 5a; independent trial balance has a personal book |
| DN-P3-6 A: functional currency plus original | The batch records the source currency, amount, rate, FX date and FX source (`functional_currency` or `server_fx_rate`). Lines carry an explicit currency and balance per currency, so the schema extends to true multi-currency | Independent test (USD/EUR); test 1b (each currency balances) |
| **DN-P3-7 B: owner and authorised accountants** | `p7_can_read`; member, viewer and stranger negatives; revocation takes effect on the next statement | Test 5b |
| **DN-P3-8 B: entity-aware legacy checks** | `phase3_p7.closed` uses P5 `ll_closed_on` with the same scope semantics as the P5 `guard_closed_period` | Test 6a: legacy and posting guards agree entry by entity under 4 period configurations |
| DN-P3-9 A: cross-account restore exceptions | Journals are never in backups. Restored rows post as new events keyed by entry id. No journal owner is ever remapped | Inventory A20; P7 tables are not in `BACKUP_TABLES` |
| DN-P3-10 A: undo by reversal | `reverse_ledger_entry` and `undo_posting_backfill` post reversals. The original batch, the archived row, the receipts and the linked records are kept | Tests 3a, 8a |
| DN-P3-11 A: reconciliation metadata only | Changes to tags, title, scope or statement match post nothing. Financial changes post a reversal plus a replacement | Test 2c |
| DN-P3-12 A: preview and confirm re-sync | Commit requires the exact preview fingerprint; a stale preview is refused. Re-commit while active re-syncs | Test 4e |
| **DN-P3-13: mandatory close follow-up** | For active owners, a close is refused while entries are unposted, exceptions or awaiting review. Close and reopen evidence includes a posting snapshot (batch ids, debit and credit, sha256) | Test 6d |
| **DN-P3-14 B: guests cannot post** | Preview, commit, journal and reversal are refused for anonymous and demo sessions. Direct inserts are refused (permission denied). `posting_status.canPost` is false | Test 5e |

## 3. The 10 requirements and C11

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | One posting architecture, extending the engine | Done | Every batch goes through `write_batch`. `expenses` remains the only ledger. All app paths reach it through the trigger (inventory; test 9 covers `post_opening_balances`, `move_expense_category`, `finance_operation` and direct saves) |
| 2 | Balanced at the database | Done | Tests 1a–1c: unbalanced, single-line, 3 dp, negative, two-sided, NaN and wrong role are refused; each currency balances separately; 33.33/33.33/33.34 posts exactly |
| 3 | Company and personal scopes | Done | Tests 5a–5c, plus the independent trial balance across 3 entities |
| 4 | Immutable postings, audited reversals | Done | Tests 2a, 2b, 3a–3c: superuser and service role are refused; step-up, reason, `security_events`, replay |
| 5 | No silent conversion | Done | Preview, then step-up commit with the fingerprint. Before and after hashes of every pre-existing row are identical across install, backfill and rollback |
| 6 | Opening balances and closed periods | Done | Tests 6a–6d, 9 |
| 7 | Duplicate-posting prevention | Done | Test 4: upload retries; statement, card and receipt evidence; transfer counterpart; reimbursement retry; commit replay |
| 8 | Multi-currency traceability | Done | Independent test 4. Conversion stays server-side; the stored INR is never recomputed |
| 9 | P0-005a integrated | Done for the posting layer | Section 5 |
| 10 | Independent reconciliation | Done | `phase3-independent.test.ts`: a TypeScript double-entry model and ledger.ts both equal the journal to the paisa; the report lists exactly the 3 explained differences |
| C11 | Explicit row review; no unchecked batch | Done (UI, server, database) | `phase3-c11.test.ts`, test 7, screenshots |

**C11 design.**
- **Statement Desk.**
  - Every suggested row now has its own "Approve" tick: auto rows and ask rows alike.
  - "Apply everything" is gone, and so is "Accept all N asking items".
  - The save button saves exactly the approved rows in one batch ("Save N approved rows").
- **applyUpload.**
  - It stamps each row with `receiptDetails.classification = {source: statement, automatic: true}` and `review = {approvedAt, method: row, key}`.
  - It refuses to start when a decision has no approval.
- **Server.** `saveExpense` refuses an automatic classification that has no review (`c11ReviewError`).
- **Database.** The P7 posting path raises `C11_REVIEW_REQUIRED` for such a row.
- **Graduated thresholds.** These stay at 99.5% for amounts and dates, 97% for categories, and at least 200 verified rows per issuer (`automationEarned`). In this release they **never pre-approve a row** (`rowApprovalRequired` is always true). Autopilot needs a separate KK decision.

## 4. Stages (each needs KK approval before any hosted action)

1. **Install.** Install P7 after P1, P2, P4 and P5 on a production-like restored copy, and record the catalog fingerprint. Nothing changes for any owner until they activate.
2. **Deploy the app.** Deploy the compatible app. The capability check keeps today's behaviour while `posting_status()` is missing or the owner is inactive.
3. **Preview, owner by owner.** Call `preview_posting_backfill()`. Compare it with the Reports Centre and review the exceptions.
4. **Commit.** Call `commit_posting_backfill(run, fingerprint)` with step-up. Then check `posting_reconciliation_report()`: every difference must be explained.
5. **Close follow-up.** Close periods only once the report is clean (DN-P3-13).
6. **Undo, if needed.** Call `undo_posting_backfill(run, reason)` with step-up.

## 5. P0-005a integration (`/home/user/thapal-p0/docs/registers/implementation/P0-005a_TRANSACTION_DELETION_INVESTIGATION.md`)

| P0-005a requirement | P7 |
|---|---|
| R1: no physical delete of posted entries | `p7_guard_posted_delete`; reversal only |
| R2: never erase evidence | Receipts are kept: the reversal path never calls storage remove. The full row and `expense_history` are archived in `posting_reversals.entry_snapshot._linked` |
| R3: closed periods | Reversal in a closed entity period is refused (reopen first). The guard is entity-aware |
| R4: linked records | Linked transfers are refused until unlinked (P0-020). Links are archived: documents, loans, `import_posts`, drafts, and the bulk-category history when this is the last entry (P0-021). **Re-pointing them is not done** (see Remaining) |
| R5: metadata only | DN-P3-11, as in section 2 |
| R6: atomic and idempotent | One transaction; request-id replay |
| R7: actor-attributed audit | `posting_reversals.actor_id` and `session_id`, reason, full before-image, and the step-up `security_events` row |
| R8: undo flows use reversal | Opening undo of a posted entry is refused (reverse instead). Duplicate removal reverses with a reason. The staged `statement-atomic-undo.sql` hard-deletes, so for active owners its deletes are refused by the guard (fails closed); it must be rewritten to call `reverse_ledger_entry` before approval |
| R9: team and guest limits | `P7_TEAM_DELETE` stops the 0066 team `delete_expenses` policy from reaching active owners' entries (P0-022). Guests cannot activate |
| R10: no invented lines for past deletes | Conversion starts from the current state; there are no balancing lines |
| R11: interim UI | Done where posting is active: an in-app dialog with consequences and a reason. Today's `window.confirm` delete remains for inactive owners, pending KK |

P0-005b (a card payment through `window.prompt` outside `finance_operation` double-posts on retry) is **not fixed**. A card-payment action in `finance_operation` is listed in Remaining. Once that exists, P7 posts it as a `card_payment` through the trigger. Until then, retries with fresh ids are separate events; only the statement-row evidence deduplicates them.

## 6. Preservation evidence

The test "installing P7, previewing, committing the backfill and rolling back never changes a pre-existing row" covers:
- the count and md5 of every row of every `public` table, except the step-up logs `step_up_grants` and `security_events`, which the confirmations write by design;
- the per-row md5 of every `expenses` row;
- the full catalog: functions (md5 of source, ACL, security definer, config), triggers, policies, relations and ACLs, columns, schemas, and the P4 guard registry.

All are compared before installation and after install, after preview and commit, and after rollback. They match. The catalog after rollback equals the pre-P7 catalog. Reinstall and a second rollback also work, and the P5 rollback then succeeds.

## 7. Rollback

1. Export the six P7 tables and get KK's approval.
2. In one transaction, `SET LOCAL phase3_p7.rollback_archive_postings = 'on'`, then run `P7_balanced_posting.rollback.sql`. It:
   - unguards the 5 entry points;
   - drops the 4 hooks;
   - moves the 6 tables, with their rows, to `security_rollback_archive.p7_*_<UTC microseconds>`, after removing policies, triggers and foreign keys to live tables;
   - drops the functions and the schema.
3. After that, the P5 rollback is allowed.
4. **Data caveat.** Entries removed with `reverse_ledger_entry` are not put back into `expenses`. Their full rows stay in the archived `posting_reversals` for a separately approved repair.

## 8. Hosted pre-checks needing KK approval

- **PostgreSQL version and extension.** Check the hosted version and confirm `hashtextextended`.
- **Catalog pins.** Confirm 0088 + P1 + P2 + P4 + P5 are installed with exactly the pinned sources.
- **Legacy data.**
  - Counts of opening balances (`accounts.opening_balance <> 0`).
  - Counts of adjustment, advance and accountless entries; each is an expected exception.
  - Duplicate `statement_ref` values across entries.
- **Personal-only periods.** Search `closedPeriods` for any `entityId` beginning `personal:`.
- **Hard-deleting functions.** Check the hosted `restore_finance_backup`, `undo_statement_rows` and any hot-fixed function for hard deletes.
- **Performance.**
  - The AFTER trigger cost on bulk updates (`bulk_category_change`, P5 entity backfill).
  - Preview time for the largest owner.
- **Concurrency.** Advisory lock per owner, under parallel edits.
- **Restored copy.** A production-like restored copy (Phase 4) for the dry-run preview and commit.

## 9. Residual risks

- **Derivation parity.** The SQL rules and the TypeScript reports overlap. Parity is proven on the seeded data set, not on real ledgers. The preview-versus-Reports comparison is a mandatory step.
- **C11 identity.** C11 relies on the client stamping statement rows; the server and database enforce the stamp. A raw API insert without the stamp looks like a manual entry. The database cannot tell who classified a row.
- **Personal-only periods.** A personal-only closed period is ignored by both the legacy guard and P7, consistently. Supporting one needs both changed together.
- **Account re-assignment.** P5 `reassign_account_entity` relinks entries without immediately re-posting the ones it does not touch. Resync goes through preview and commit (DN-P3-12).
- **Restores.** For active owners, restored rows post immediately as new events. A preview-gated restore re-sync is not implemented.
- **Asset journals.** Asset depreciation journals in JSON (`books.journals`) are not posted. Asset postings belong to Phase 6.
- **Foundation UI.** The foundation journal and accountant UI (`post_accounting_journal`) is not mapped to `post_journal_batch` and remains fail-closed.
- **Hosted fidelity.** PGlite is not hosted Supabase. RLS, `security_invoker` behaviour, concurrency and timing all need the restored copy.

## 10. Remaining

1. **Statement Desk Undo.** Rewrite it to use per-row `reverse_ledger_entry` (the staged SQL hard-deletes). Until then, Undo after activation fails closed.
2. **Linked records after reversal.** Re-point or close them: mark `import_posts` and drafts as reversed, cancel `transfer_links`, keep claim receipts consistent. Today they are archived but left as they were.
3. **Card payments.** Add a card-payment `finance_operation` action (P0-005b).
4. **Journal UI.** Map the foundation journal and accountant UI to `post_journal_batch` and `reverse_journal_batch`, with UI for accountant grants.
5. **Owner-facing screens.** Preview, commit and report screens for activation. Today these are database-only.
6. **Interim UI for inactive owners.** An in-app delete confirmation (P0-005a R11), pending KK.
7. **Hosted dry run.** On a restored copy, with KK approval.
