# Accounting-integrity migration plan (P3 posting layer), 2026-11-09

**Status: proposed only.** Nothing has been applied to Lovable Cloud or any hosted database. No file was added to `drizzle/migrations`. All evidence below comes from isolated in-memory PGlite (PostgreSQL 18.6 build) with every applied migration 0000–0088 replayed by `src/test/full-schema-pglite.ts`.

| Deliverable | Path |
|---|---|
| Migration (proposed) | `.lovable/staged-sql/proposed/P3_accounting_posting_layer.sql` |
| Rollback | `.lovable/staged-sql/proposed/P3_accounting_posting_layer.rollback.sql` |
| Acceptance tests | `src/lib/accounting-posting-proposed-sql.test.ts` (11 tests) |
| Owner decision | DN-04 option **A**: extend the existing engine; no second ledger |

---

## 1. Design: how P3 extends the ledger instead of duplicating it

### 1.1 What exists today (0088)
- **Ledger.** `public.expenses` is the only record of economic events. Rows are single-sided, with `txn_type`. Transfers, card payments, loan repayments and investments link two owned accounts (`account_id`, `to_account_id`). Balances are always derived (`ledger.ts accountBalance`).
- **Money movements.** `finance_operation` (0011) writes entries atomically under the owner advisory lock. A unique `(owner_id, operation_key)` in `finance_operations` makes retries safe.
- **Locks.** `guard_closed_period` (0058) and `lock_period_owner` (0070) freeze entries in closed periods. Periods change only through `change_accounting_period` (0070/0072/0084), protected by `require_period_operation`. Journals and rules are frozen by `ll_closed_on` and `guard_journals_rules` (0083).
- **Corrections.** Financial corrections are revision-checked RPCs (0041/0045).
- **Company double entry.** This is computed in TypeScript only, by `books/corporate-statements.ts` using `accounting-journal.ts` and `accounting-post.ts`. The staged `scripts/accounting-foundation.sql` adds journal tables and RPCs, but it was never applied.

### 1.2 What P3 adds
P3 adds one posting layer. It is keyed to existing identities, and each **posting** is one balanced document:

| Posting kind | Economic event key | Idempotency key (unique per owner) |
|---|---|---|
| `entry` | existing `expenses.id` × legal entity × version | `entry:<entryId>:<entity>:v<n>` |
| `entry_reversal` | the superseded entry posting | `reverse:<postingId>` (and at most one reversal per posting, by unique index) |
| `journal` | manual company journal (`journal.id`, `request_id`) | `journal:<requestId>` |

- **Lines** (`accounting_posting_lines`) carry entity, currency, code, role, debit, credit, account and entry, plus the original currency and amount.
- **Money movements from `finance_operation`** are posted through the entries they create. The operation key keeps the movement once; the entry id keeps the posting once.
- **`expenses` is never rewritten.** Postings point at it, and its rows and columns stay unchanged (proven in §5).

### 1.3 Why the accounting-foundation journals fold into P3
The foundation stored journals in `accounting_journal_evidence` as a parallel JSON store, with no line table, no DB-level balance and no index. P3 stores each journal as a `journal` posting with real lines:
- The **same validation body** is kept: openings, accruals, prepayments, recurring recognition, settlements, invoices and exact reversals.
- **Linked money legs** still write canonical `adjustment` anchor entries, so `accountBalance` and `corporate-statements.ts` work unchanged. Derivation skips anchor entries, so the event posts **once**.
- **`accounting_journal_evidence` is now a `security_invoker` view** over journal postings, with the exact columns `store.tsx` reads. The three RPC names and signatures are kept.

### 1.4 Mapping from entries to posting lines
The SQL derivation is `accounting_private.derive_entry`, run for each company whose accounts the entry touches or which owns the entry. It uses the same rules as `corporate-statements.ts`:

| Entry | Lines (per company) |
|---|---|
| Any type, on company accounts | `account:<id>` leg = canonical `accountBalance` delta (liabilities credit-normal) |
| expense / income / refund (owner company) | category legs from `allocations`, using `categoryParts`. The last part takes the rounding remainder (same `proportionMoney` half-up rounding). Refund = expense credit. |
| Company expense paid from a non-company account (manual) | `due:to:<payer>` liability (money in: `due:from:` asset) |
| card_payment / transfer / investment inside one company | two account legs only: **no expense, no income** |
| loan_repayment inside one company | bank credit, loan principal debit, `expense:loan-interest` (`repaymentParts`) |
| move across a company boundary | `due:from/to:<external account>`, never profit |
| adjustment with a posted depreciation journal | `expense:depreciation` |
| reimbursement, advance, unexplained adjustment, invalid allocation, manual movement without a company account | **exception, not a posting.** The TypeScript projection books these as `unclassified`. V3.1 §5 forbids fabricated postings (DN-P3-2). |
| `transfer_counterpart_of` rows, journal anchors, personal-only entries | nothing |
| `accounts.opening_balance` | exception: needs an opening journal (DN-P3-3) |

---

## 2. Exact SQL objects

### 2.1 Schema
- `accounting_private`: helpers. Not exposed by PostgREST, with no PUBLIC rights.

### 2.2 Tables
All five tables are RLS-enabled. API roles get SELECT only; default privileges are revoked.
- `accounting_postings`
  - Foreign keys: `owner_id → finance_preferences ON DELETE CASCADE`; `reverses_id → accounting_postings`.
  - Kind CHECKs.
  - Unique: `accounting_postings_idempotency (owner_id, idempotency_key)`, `…_journal_uq`, `…_request_uq`, `…_one_reversal (reverses_id)`, `…_entry_version`.
  - Indexes: `…_owner_entry`, `…_owner_entity_date`, `…_settlement` (fixes the foundation's unindexed settlement lookup), GIN `…_documents`.
- `accounting_posting_lines`
  - Amounts are `numeric` (no silent rounding). `signed_amount` is a generated column (`debit − credit`).
  - `accounting_lines_one_side`: debit ≥ 0, credit ≥ 0, exactly one side positive.
  - `accounting_lines_exact`: two decimals, below 1e13, which also rejects NaN and Infinity.
  - `role` allows only asset, liability, equity, income or expense. `currency` must match `^[A-Z]{3}$`.
  - Indexes: posting; owner+entity+code; account.
- `accounting_backfill_runs`: run id, fingerprint, result, `undone_at`. It drives activation.
- `accounting_review_grants`: foundation shape, plus a cascade foreign key.
- `accounting_exception_reviews`: foundation shape, plus `posting_id` (FK cascade).
- View `accounting_journal_evidence`: `security_invoker`, SELECT only.

### 2.3 Read policies
- Read access goes through `accounting_private.can_read(owner, entity)`. It allows the owner, an active company member (0075 `can_access_entity`, the same rule as company transactions) or an active owner-granted accountant.
- There are no write policies.

### 2.4 Guards (triggers)
- `a_guard_posting_insert`
  - Only the writer functions may insert (`ledgerline.posting_writer`); this applies to service_role too.
  - The company must exist.
  - Closed periods are refused via 0083 `ll_closed_on`.
  - Cross-owner entry, entry_ids and document references are refused.
  - A reversal must have the same owner and entity, must not be a reversal itself, and must not be dated before the original.
- `a_guard_line_insert`: line owner = posting owner; the account and entry must be the owner's.
- `b_posting_immutable` / `b_line_immutable`: UPDATE and DELETE are refused. The only exception is DELETE during `ledgerline.erasing` for the caller's own rows.
- `c_*_no_truncate`: TRUNCATE is refused.
- `z_posting_balanced` / `z_lines_balanced`: `DEFERRABLE INITIALLY DEFERRED` constraint triggers, which run `check_posting` at commit:
  - at least 2 lines;
  - Σdebit = Σcredit for the posting;
  - Σdebit = Σcredit for each (entity, currency);
  - a reversal exactly mirrors its original;
  - at most one active posting per (entry, company).
- On `expenses`:
  - `accounting_entry_immutable` (BEFORE): forged anchors are refused; anchor amounts are immutable (reconciliation metadata may change); a financial edit or delete of a settlement source is refused. It honours `ledgerline.erasing` and `ledgerline.restoring`.
  - `accounting_entry_sync` (AFTER): once the owner has an active committed run, writes reversal + replacement.
- On `documents`: `accounting_original_immutable` keeps journal originals. It uses the GIN index and honours erasure.

### 2.5 Functions
- `public.post_accounting_journal(uuid, jsonb, bigint)`: the foundation rules, writing one posting. Fixes applied:
  - The foundation's document check used an unqualified `id` that resolved to `d.id`, so any owner document passed. P3 qualifies it, and the test proves another owner's original is refused.
  - Identity lookups are scoped per owner.
  - Amounts must be numbers.
- `public.review_accounting_exception(uuid, uuid, uuid, text, text)` and `public.set_accounting_review_grant(text, text, boolean)`: same signatures as the foundation. Anonymous demo sessions are refused for grants.
- `public.accounting_backfill(_mode 'preview'|'commit', _run uuid, _expected text)` and `public.accounting_backfill_undo(_run uuid, _reason text)`: see §7.
- `public.restore_finance_backup(jsonb, text)`: a wrapper that sets `ledgerline.restoring`. It calls the **unchanged 0072 function**, moved to `accounting_private.restore_finance_backup_0072` with its ACL intact. It then calls `rebuild_restored_journals`, which recreates journal postings from restored anchors or lists exceptions.
- `delete_my_finance_data` (0058, or P1's version) is **not modified**. P3 tables cascade from `finance_preferences`, and every P3 guard honours `ledgerline.erasing`. This fixes foundation defect S4.

---

## 3. Order and dependencies
1. **Prerequisites.** P3 needs 0072 (restore), 0075 (`can_access_entity`) and 0083 (`ll_closed_on`). A guard DO block aborts if they are missing, or if any foundation/P3 object already exists.
2. **Position.** P3 goes after the security proposals P1 and P2 (`.lovable/staged-sql/proposed/`, written in parallel; not edited here) and after the migration-proposal sequence 0089–0094. The final number is assigned at approval.
3. **Combined check.** The test `P3 ordering with the parallel security proposals` installs P1 → P2 → P3 and passes:
   - P1's redefined `delete_my_finance_data` still erases postings;
   - revoked company members lose posting access immediately.
4. **Restore wrapper rule.** Any later migration that runs `CREATE OR REPLACE public.restore_finance_backup` replaces the P3 wrapper. The failure is closed (restored journal anchors are refused), but the migration must re-wrap.
5. **Foundation scripts.** `scripts/accounting-foundation.sql` must **never** be installed together with P3. `scripts/accounting-close-guard.sql` must be re-reviewed against P3 before any use.
6. **Deployment coupling.** Installing P3 makes `accountingAvailable()` in `store.tsx` return true. The journal-posting and accountant-review UI paths, which fail closed today, then go live. Install it only together with KK's access approval and the release decision (Gate 9).
7. **Drizzle.** The migration needs Drizzle `meta/_journal.json` and snapshot entries, following the existing pattern.

---

## 4. Tests and actual results
Command: `bunx vitest run src/lib/accounting-posting-proposed-sql.test.ts`. Result: **11/11 passed** (about 33 s).

| # | Test | Covers |
|---|---|---|
| 1 | Backfill preview equals the TypeScript `corporateStatements` derivation | Parity on `corporateFixture` plus 9 extra branches (refund, 3-way split rounding, manual company expense, cross-company transfer, depreciation, reimbursement exception, legacy repayment, personal-only, USD bill). Compares lines (entity/entry/date/code/role/debit/credit), trial balance per company and code, exception set (= TS unclassified groups and manual-movement issues), opening exceptions, and INR amounts with the original currency retained. |
| 2 | Commit posts the reviewed preview exactly once | Stale fingerprint refused; posted lines = preview; card payment = asset credit + liability debit (no expense); card purchase is the only expense; transfers and investments have no income or expense; cross-company transfer = due from/to; loan: only interest is an expense; replay returns `replayed`; second run posts 0; duplicate idempotency key refused (`accounting_postings_idempotency`); second active posting for the same event refused. |
| 3 | Database refuses bad postings | Unbalanced, per-entity and per-currency unbalanced, single-line, negative, two-sided and 3-decimal lines; direct insert without the writer path (superuser); UPDATE/DELETE/TRUNCATE of posted rows; non-mirror reversal; double reversal; owner write attempts and inserts through the view (permission denied). |
| 4 | store.tsx RPC shapes | `postAccountingWithRecovery` with the `store.tsx` read/post shapes; named-argument RPCs; replay; changed payload refused; unbalanced journal refused; anchor immutable (reconciliation allowed); forged anchor refused; exact reversal referencing the original; double reversal refused. Accountant: anonymous and unverified refused; `accountantData` selects; review write, replay and read-back fields; revoke leaves 0 rows and "not authorised". |
| 5 | Partial settlement | 1200 accrued − 500 paid leaves 700 due; the same bank payment cannot settle twice; mismatched snapshot refused; settlement over the balance refused; settled source financially immutable, metadata editable. |
| 6 | Closed periods | Journal and reversal inside a closed May are refused; a direct writer insert is refused; the correcting reversal and replacement dated June are accepted; reopening via `change_accounting_period` allows May posting. Final trial balance: rent 2200 / payable −2200. |
| 7 | Activation and undo | After commit, an entry amount edit gives v1 (unchanged) + reversal + v2. A delete gives a reversal. The preview then has 0 proposals, and active balances equal the preview trial balance. Undo needs a reason, reverses every active entry posting and deactivates (later edits post nothing); a replayed undo is idempotent. Backfill skips closed-period entries and lists them. |
| 8 | RLS | Another owner reads 0 rows from all six relations and cannot insert; their own preview shows only their company; cannot borrow the owner's document or account; cannot review. A company member sees only company A lines; after `revoke_entity_access`, 0 rows immediately. |
| 9 | Erasure and restore | Same-account restore over live postings succeeds with counts unchanged and 0 drift. `delete_my_finance_data` removes all five owner accounting tables and keeps the other owner's postings. Restore after erasure rebuilds 2 journal postings (original before its reversal). Entry postings need a new reviewed backfill. |
| 10 | Ordering | P1 → P2 → P3 install; member revoke; erasure. |
| 11 | Data preservation and rollback | See §5. |

**Full suite** (`bun run test`, run after the P3 tests were added): 321 files, **2313 tests: 2312 passed, 1 failed**.
- The failure is `src/lib/security-proposed-sql.test.ts`, the parallel P1/P2 work: `access_grant_audit` is left after erasure. It is not part of this deliverable.
- The final re-run is reported in the hand-off.

`tsc --noEmit` shows no errors in the new test file.

---

## 5. Data-preservation evidence (test 11)
- **Before P3.** Seeded at 0088: two owners, 16 owner entries + 1 other, 6 accounts, documents and preferences. The test records row count and an md5 of all rows for **every public base table** (more than 50 tables; `accounting_*` excluded), plus a catalog fingerprint: functions (source md5, ACL, security, config), triggers, policies, relations with ACLs, columns and schemas.
- **After installing P3.** Table snapshot identical.
- **After rollback.** Table snapshot identical, and the **catalog equals the 0088 catalog exactly**. That includes `restore_finance_backup` being the same function with the same source and ACL; an early run caught a lost `service_role` grant, which was then fixed.
- **Second cycle.** Install, then commit backfill runs for both owners: owner tables are still identical, because backfill writes only P3 tables. Rollback without the discard flag is refused ("Postings exist"). With `SET LOCAL ledgerline.rollback_discard_postings='on'` it succeeds; tables and catalog are identical to 0088, and the restored 0072 restore runs.

## 6. Rollback steps
1. Export `accounting_postings`, `accounting_posting_lines`, `accounting_backfill_runs`, `accounting_review_grants` and `accounting_exception_reviews`, and get KK's approval.
2. In one transaction, run `SET LOCAL ledgerline.rollback_discard_postings = 'on';` and then `P3_accounting_posting_layer.rollback.sql`. The script:
   1. drops the 3 triggers;
   2. drops the wrapper;
   3. moves the 0072 restore back and renames it;
   4. drops the 5 public RPCs and the view;
   5. drops `accounting_private` and the 5 tables.
3. **Data caveat.** Journal anchor entries already written to `expenses` stay and keep moving balances. Linked documents stay `evidence_locked`. KK decides whether to keep or reverse them, the same caveat as for the foundation.

## 7. Production backfill procedure (each step needs KK's approval)
1. **Pre-checks.** P3 is approved and installed, and the compatible client is deployed. Choose the owners. Back up first (ZIP plus a database snapshot).
2. **Preview.** As the owner (authenticated, real account), call `accounting_backfill('preview')`. It is read-only and returns:
   - proposals (post/replace/reverse, with lines);
   - exceptions (unclassified, manual-without-account, closed period, openings);
   - per-company totals and trial balance;
   - a `fingerprint`.
   Compare its trial balance with the Reports Centre company trial balance; differences should be only the listed exceptions.
3. **Owner review.** KK, and an accountant if engaged, review the exceptions and the parity. Openings need opening journals (DN-P3-3). Closed periods stay excluded unless DN-P3-4 is decided.
4. **Commit.** Call `accounting_backfill('commit', <new run uuid>, <fingerprint>)`. It is refused if the ledger changed since the preview, and a repeated call replays.
   - From then on, that owner's entry edits post reversal + replacement.
   - Re-run preview and commit to resync after account, company-mapping or preferences changes (DN-P3-12).
5. **Verify.** Preview again: 0 proposals. Active balances equal the TypeScript trial balance.
6. **Undo, if needed.** `accounting_backfill_undo(run, reason)` reverses all active entry postings, keeps history and deactivates. Only the latest run can be undone. Closed-period postings cannot be undone until the period is reopened.

Do not run any step on live data without explicit approval. Nothing here runs automatically.

---

## 8. Gate 2 checklist against V3.1 §5 invariants

| §5 invariant | Status | Evidence |
|---|---|---|
| Signed exact-decimal amounts | Specified + Tested (isolated) | `accounting_lines_one_side`, `accounting_lines_exact`, generated `signed_amount`; test 3 |
| Debits = credits per posting, legal entity and currency | Specified + Tested (isolated) | deferred `check_posting`; test 3 |
| Unique idempotency key per economic event | Specified + Tested (isolated) | `accounting_postings_idempotency`, journal/request unique; tests 2 and 4 |
| No invoice reused as full settlement for two duplicate debits | Specified; settlement part Tested (isolated) | "Bank transaction already settled" and over-balance refusal (test 5). The invoice-id uniqueness rule is kept from the foundation and is not re-tested on the full schema. |
| Partial receipts leave the balance due | Tested (isolated) | test 5 (700 due) |
| Card settlement does not create an expense | Tested (isolated) | tests 1 and 2 |
| Inter-account transfer does not create income | Tested (isolated) | tests 1 and 2 |
| Same economic event once despite multiple sources | Specified + Tested (isolated) at posting level | one active posting per (entry, company); anchors skipped. Statement-level dedup stays with the existing fingerprints (not changed). |
| Reconciled amounts agree with statement balances | Not in P3 scope | existing Statement Desk / balance checks |
| Posted entries cannot be silently edited | Tested (isolated) for postings and anchors; entries only after activation | test 7; pre-activation behaviour is DN-P3-1 |
| Locked-period changes need authorised correcting entries | Tested (isolated) | test 6 |
| Cross-workspace references cannot bypass RLS | Tested (isolated) | tests 3, 8, 10 |

**Gate 2 overall:** specified, and passing in isolation. Not yet accepted: this needs hosted-equivalent PostgreSQL, concurrency and performance evidence, and KK's decisions below.

---

## 9. Residual risks
- **Two implementations of the derivation.** The rules exist in TypeScript and in SQL. Parity is proven on one rich fixture, not on all real ledgers. A preview-vs-Reports comparison per owner is part of the procedure. Any later change to `corporate-statements.ts` must update `derive_entry` and the parity test together.
- **Edge cases.**
  - `ownerOf` order: an account listed under two companies resolves by JS insertion order in TypeScript, but by key order in SQL. The app prevents this.
  - Rounding at exact half-cent boundaries uses half-away-from-zero on both sides.
- **Drift.** After activation, only entry changes re-sync automatically. Account kind or name changes, company remaps and depreciation-journal status changes need a new preview/commit.
- **Not yet verified for production.**
  - PGlite is not hosted Supabase. `security_invoker` views need PostgreSQL 15 or later; confirm the hosted version.
  - Concurrency: the advisory lock and preferences row lock follow existing patterns but are not load-tested.
  - The per-row AFTER trigger costs one indexed lookup per entry write for non-activated owners.
- **Restore wrapper.** A later redefinition of `restore_finance_backup` replaces the wrapper (fail-closed). Cross-account restores cannot rebuild journals, because `backup.ts` does not remap `receipt_details.accounting`; they become listed exceptions (DN-P3-9).
- **Period-close evidence.** `change_accounting_period` snapshots entries but not postings. Postings in a closed period are immutable anyway, but the evidence should include them in a follow-up.
- **Access widening.** Company members and granted accountants can read the posting lines of granted companies. Lines carry account ids of other companies in `due:` codes. This needs KK's access approval.

## 10. Decision Needed (V3.1 versus existing behaviour; nothing chosen silently)

| ID | Conflict | Options | Proposed default in P3 |
|---|---|---|---|
| DN-P3-1 | V3.1: posted entries not silently editable. Today: entries are freely editable through corrections. | (a) After activation, edits auto-post reversal + replacement. (b) Block financial edits of posted entries. (c) Keep postings only for journals. | (a), active only after a committed backfill |
| DN-P3-2 | TypeScript books unknown counterparts as balanced `unclassified` lines; V3.1 requires exceptions, not fabricated postings. | (a) Exception only. (b) Post to a suspense account. | (a); the TypeScript reports are unchanged |
| DN-P3-3 | `accounts.opening_balance` has no dated capital mapping. | (a) Require opening journals. (b) Post to opening equity. | (a) |
| DN-P3-4 | Backfill into already closed periods. | (a) Skip and list. (b) Reopen and re-close on Audit. (c) A special audited backfill authority. | (a) |
| DN-P3-5 | Personal (non-company) entries get no postings. | (a) Companies only. (b) A pseudo-entity `personal` using the same rules. | (a) |
| DN-P3-6 | TypeScript `CorporateLine.currency` shows the original currency while amounts are INR. | (a) Lines in INR plus `original_currency`. (b) Multi-currency lines. | (a) |
| DN-P3-7 | Read access to postings for company members (0075) and accountants. | (a) As proposed. (b) Owner and accountant only. | (a), needs access approval |
| DN-P3-8 | Expense period guard ignores `entityId`; posting guard (0083 `ll_closed_on`) respects it. | (a) Keep both. (b) Align the expense guard. | (a); note the difference |
| DN-P3-9 | Cross-account restore of journals (`receipt_details.accounting` not remapped). | (a) Exceptions (current). (b) App change to remap and re-post. | (a) until an app change is approved |
| DN-P3-10 | Backfill undo: reversal history or physical deletion. | (a) Reversals. (b) Delete. | (a), immutability |
| DN-P3-11 | Foundation refused any update of a settlement source; P3 allows reconciliation metadata only. | (a) Allow metadata. (b) Refuse all. | (a) |
| DN-P3-12 | Resync after non-entry changes. | (a) Manual preview/commit. (b) Triggers on accounts and preferences. | (a) |
| DN-P3-13 | Period evidence should include postings. | Follow-up migration redefining `change_accounting_period`. | not in P3 |
| DN-P3-14 | Demo guests (anonymous) may post journals; foundation recommended refusing. | (a) Refuse grants and backfill only. (b) Also refuse journals. | (a) |
