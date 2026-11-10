# P19 — definer-safety review of the finance workflow

Track A, 10 Nov 2026. Owner decision KK: Option 1 (GUC_INVENTORY.md row 13).

- **Files:** `.lovable/staged-sql/proposed/P19_finance_operation_authority.sql` and `.rollback.sql`.
- **Status:** proposed only. Nothing is applied to Lovable Cloud, Live or any hosted database.
- **Tests:** `src/lib/p19-finance-operation-authority-sql.test.ts`, run in isolated PGlite only.

## What changed

| object | before (0011 / 0012 / 0015, P4 when installed) | after P19 |
|---|---|---|
| `public.finance_operation(text, jsonb)` | SECURITY INVOKER, `search_path = public`. It set `app.finance_owner` and never cleared it. EXECUTE: authenticated, service_role. | SECURITY DEFINER, `search_path = public, pg_temp`. It writes a `phase3_p19.authority` row (txid, auth.uid()) and removes it before it returns. Requests are strictly idempotent. EXECUTE: **authenticated only**. |
| `public.receive_claim_receipt(uuid, numeric, date, uuid, text)` | SECURITY INVOKER. It ran if `current_setting('app.finance_owner') = uid`. EXECUTE: authenticated, service_role. | SECURITY DEFINER, pinned search_path. It runs only while `phase3_p19.authorised('finance_operation')` is true. EXECUTE: **none** (only finance_operation calls it, as the owner). |
| P4 `__unguarded` copies of both | Original bodies, which read `app.finance_owner`. EXECUTE: service_role. | Same new bodies without the assistant check, as before. EXECUTE: **none**. |
| `public.finance_operations` | Client INSERT was allowed when `app.finance_owner = uid`. Clients could also UPDATE and DELETE their own rows (policy "Own finance operations" FOR ALL plus the default table grants). | Clients lose INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. anon loses everything. Three RESTRICTIVE `false` policies are added for INSERT, UPDATE and DELETE. A new column `request_sha256` holds the canonical-request hash. The owner can still SELECT their own rows. |
| `app.finance_owner` | Read by one policy and one function, and set by finance_operation. | Read or set by nothing. The install fails closed if any function or policy still mentions it. |

## Definer-safety checklist

| check | result | evidence |
|---|---|---|
| search_path pinned | `public, pg_temp` on all four workflow functions and every `phase3_p19` helper. pg_catalog is searched first, implicitly. pg_temp is never searched for functions, and comes last for relations. | Post-install check plus test "definer safety". |
| Schema-qualified references | Every table is `public.*` or `phase3_p19.*`. Every row variable uses `public.<table>%ROWTYPE`. | The test scans the bodies for an unqualified `FROM`, `JOIN`, `INTO` or `UPDATE` target and finds none. |
| No dynamic SQL with user input | The workflow bodies contain no `EXECUTE`, `format(`, `set_config` or `current_setting`; the test asserts this. The install-time `DO` blocks use `EXECUTE format(... %I ..., %L)` only with constant function names and the constant body text. | Test "definer safety". |
| Minimal EXECUTE | finance_operation: authenticated only. The only caller is `src/lib/store.tsx` `supabase.rpc("finance_operation")` with the user's session; no `supabaseAdmin` caller exists in `src/**`. receive_claim_receipt and the `__unguarded` copies: owner only. `phase3_p19.*`: no client or service role, and no USAGE on the schema. | Post-install check plus test. |
| No role escalation | No `SET ROLE`, no GRANT and no `security_definer` helper is reachable from client input. The functions never set or trust a session setting. Identity is `auth.uid()` only. | Code review. |
| Cross-owner and cross-entity writes refused | See predicates P1–P7, R1–R7, B1, C1–C4, L1–L5, E1–E3, N1 and I1 in the SQL header. Every written row is re-checked after the write (`check_entry`, `check_loan`, `check_commitment`). | Tests "receipt claiming", "other money movements" and mutations M2a–M2d. |
| Authority bound to its transaction | Primary key (transaction_id, scope). The check is `transaction_id = txid_current() AND actor_id = auth.uid()`. The row is removed before the function returns, and an error rolls it back. A client that catches the error with a SAVEPOINT gets no authority, and a later direct call in the same transaction is refused. | Test "(d)". |
| Triggers keep working | Triggers still fire inside the definer. Those that exempt a privileged `current_user` do so only when `auth.uid() IS NULL` (P9 :215/:354, P10 :212, P13 :105, P14 :347, P15 :73), so they never exempt this workflow, because auth.uid() is set. Invoker triggers that read tables (`validate_finance_links`, `validate_category_allocations`, P13 `guard_team_financial_edit`, P1 `guard_shared_expense_edit`) filter by `NEW.employee_id` or `auth.uid()` explicitly, so they give the same answers when RLS is not in force. | Code review; compatibility runs below. |
| P4 assistant refusal kept | When P4 is installed (detected from P4's inline line in the current body), `phase3_p19.refuse_assistant` calls `public.refuse_assistant_session(<fn>)` first, as P4's inline guard did. P4's RESTRICTIVE assistant table policies do not apply inside a definer, so this check replaces them. | Test (stack): `ASSISTANT_READ_ONLY: finance_operation`. |
| Unreviewed bodies refused | The install requires that each replaced function's `md5(prosrc)` is one of the four reviewed bodies: applied 0015 finance_operation and receive_claim_receipt, and P4's inline versions. | Test "refuses to install over an unreviewed function body". |

## Line-by-line review of the original bodies

These are the effective bodies after 0011, the 0012 `replace()` edits and the 0015 branch splice. The P19 predicate
IDs refer to the header of the SQL file.

- **Start (all operations).**
  - Originally: `uid := auth.uid()` and refuse if NULL; take the advisory lock on `hashtextextended(uid)`; set
    `app.finance_owner`; the date is not in the future; derive the key; require an `operationId` (0012); read
    `finance_operations WHERE owner_id = uid` and replay if found.
  - P19 keeps all of these except `set_config`. It adds:
    - the canonical-request hash and the conflict check;
    - refusal of a payload that is not a JSON object (otherwise the key would be NULL anyway);
    - `grant_authority` after the replay check, so a replay writes nothing.
- **claim_receipt.** Delegates to receive_claim_receipt, as before.
- **receive_claim_receipt.**
  - Originally:
    - the setting check;
    - `SELECT ... WHERE id = expense_id AND employee_id = uid FOR UPDATE`;
    - the pending, stage, amount and date checks;
    - an account check (`owner_id = uid`, not archived, cash or bank kind);
    - INSERT of the reimbursement entry (member_id copied from the claim);
    - UPDATE of the claim's JSON, appending the receipt;
    - UPDATE `WHERE id = e.id`, where RLS limited the row to the owner.
  - P19:
    - The setting check becomes the authority check (R1).
    - The SELECT is unchanged (R2).
    - It adds `can_access_entity(e.employee_id, e.entity_id, true)` (R3).
    - The amount, date and account checks are unchanged (R4–R6).
    - The INSERT and the UPDATE are re-checked with `check_entry`. This brings back "Own expenses: add", which covered
      member_id, and the RESTRICTIVE link checks.
    - The UPDATE is now also limited to `employee_id = uid` (R7).
- **reimbursement (0015).**
  - The loop over `employee_id = uid ... ORDER BY id FOR UPDATE` is unchanged, and each claim goes through
    receive_claim_receipt.
  - The unused `GET DIAGNOSTICS row_count` was dropped.
  - The "Claim not found" count check is kept (B1).
- **confirm_irregular (0015).**
  - The commitment INSERT for uid is re-checked with `check_commitment`.
  - The `finance_preferences` upsert keys on `owner_id = uid`, and the conflict UPDATE is limited to
    `owner_id = uid` (I1).
- **commitment (0011, plus the 0012 account check).**
  - The SELECT (`owner_id = uid FOR UPDATE`), the status and due checks, the amount check and the payment-account
    check are unchanged (C1–C3).
  - The entry INSERT is re-checked with `check_entry`.
  - The schedule UPDATE is limited to `owner_id = uid` and re-checked with `check_commitment` (C4). It raises if the
    schedule changed in between.
- **loan_payment (0011, plus the 0012 predicates).**
  - The SELECT is unchanged (`owner_id = uid FOR UPDATE`, L1), and so is the 0012 `account_id IS NULL` refusal.
  - For a card EMI, the loan account was protected only by the loans RESTRICTIVE policy. It now needs an explicit
    `accounts.owner_id = uid` (L2).
  - The outstanding read is unchanged: liability account of uid and entries of uid (0012, L3).
  - The paying-account check is unchanged (L4).
  - Both entry INSERTs are re-checked with `check_entry`.
  - The loan UPDATE is limited to `owner_id = uid` and re-checked with `check_loan` (L5).
- **convert_emi (0011).**
  - The purchase SELECT and the card check are unchanged (E1).
  - The "already on EMI" check now covers all owners, not just the RLS-visible ones, so it is stricter (E2).
  - `statement_day` is read only from that account of uid (E3).
  - The loan INSERT is re-checked with `check_loan`, and the fee entry with `check_entry`.
- **create_loan (0011).** The account INSERT for uid is checked to have `owner_id = uid`. The loan INSERT is
  re-checked with `check_loan` (N1).
- **End.**
  - Originally: INSERT the `finance_operations` record and return.
  - P19 also stores `request_sha256` and calls `end_authority` before returning.

Operation-level permission:
- 0011, 0012, 0015 and every later applied or proposed migration let only the record owner run these operations.
  Every read in the original body is filtered to `= uid`. Team, entity-member (0075 / P1 / P2) and Finance-role
  policies only ever grant rows where `employee_id <> auth.uid()`, so the invoker body never used them.
- No Finance-role requirement exists for reimbursements, so none is added. P19 keeps the operations owner-only.
- An entity member with write access is refused (test "cross-entity").

## Behaviour changes for the app

- **Same key, different request:** returns `P19_IDEMPOTENCY_CONFLICT` with SQLSTATE 22023. It used to replay the
  first result silently.
  - `store.tsx` builds every payload deterministically from its arguments (for example, the reimbursement
    `operationId` is the sorted ids), so ordinary retries are identical requests and still replay.
  - A UI retry with changed values under the same key now fails visibly instead of silently doing nothing.
- **receive_claim_receipt:** no longer callable by any client. `src/**` never calls it.
- **`finance_operations` rows:** no longer writable or deletable by clients, and anon can no longer read them. The app
  never writes them, and backups exclude the table (`backup.ts`).
- **service_role:** loses EXECUTE on finance_operation. No server code calls it, and it would refuse anyway
  ("Sign in to continue").

## Residual notes (not exploitable through a session setting)

1. **P7 `record_card_payment`** is already SECURITY DEFINER and writes the same table.
   - Its replay does not compare the request. It checks only an existing entry's fields.
   - Clients can no longer forge its record. Binding its request to a hash is a P7 change and is left for review.
2. **Claim JSON on `expenses.reimbursement` / `reimbursement_status`** is still client-writable as an ordinary row
   edit:
   - by the owner, through "Own expenses: edit";
   - by company editors, through 0075 "Entity editors update company transactions" and P1 team edit.
   - This is by design: `store.tsx` edits claim details this way.
   - These edits are recorded by the definer audit trigger (`transaction_audit`, append-only under P4).
   - The money-back entry and the idempotent receipt append go only through the workflow.
   - Making the receipts list workflow-only would need its own decision, because it changes the claim editor.
3. **Default table grants.** Supabase grants ALL on public tables to anon and authenticated by default, which
   includes TRIGGER. P19 revokes TRIGGER on `finance_operations`. The same default applies to every other table and
   is a platform-wide item, not part of this finding.
4. **Not verified against a hosted database.** As for P18: PostgREST does not expose `set_config`, so the original
   bypass needs plain SQL as authenticated. The PGlite reproduction uses exactly that.

## Test evidence (isolated PGlite)

- `p19-finance-operation-authority-sql.test.ts`: **18 tests**, all passing. That is 8 per schema (applied, and
  P1..P18), plus 2 whole-stack tests.
  - **Before P19:** a forged record replays and saves nothing; a direct receive_claim_receipt works outside the
    workflow.
  - **After P19:** the same attacks are refused (permission denied, or "Use the payment workflow" even for a caller
    holding EXECUTE).
  - **Idempotency (a)–(e):** (a) replay, including reordered JSON keys; (b) conflict on 4 changed fields and on
    another action's key; (c) the lock is held until commit, a back-to-back and same-transaction duplicate is a
    replay, the primary-key barrier holds, and a lost race rolls back with its effect; (d) mid-way failure, a
    SAVEPOINT catch and the post-success authority check; (e) forged INSERT, UPDATE and DELETE are refused.
  - **Receipts:** partial receipts, over-claim, double claim, cross-owner (both directions), foreign and archived
    accounts, future date, cross-entity member, outside-workflow call, audit rows and lock presence.
  - **Other operations:** commitment, create_loan, loan_payment, convert_emi (and conflict), confirm_irregular, and
    the P4 assistant refusal.
  - **Definer safety:** checked as in the checklist above.
  - **Rollback:**
    - The rollback restores the exact catalog, and the setting is trusted again, which shows it was the fix.
    - Reinstall works.
    - P1..P18 → P19 installs in order, and P19, then P18..P8, each roll back to the exact previous catalog.
    - P7..P1 roll back without error but not to the exact catalog. That happens equally without P19 (pre-existing,
      by those files' design).
  - **Unreviewed body:** the install is refused.
- **Compatibility:** the existing money-operation suites were re-run with P19 appended to every database they build
  (`TEST_APPEND_SQL=...P19...`):
  - Suites: `phase3-posting-sql`, `phase3-completion-sql`, `phase3-independent`, `security-phase1-sql` and
    `books/preference-approval-sql`.
  - Result: 133 of 136 pass. The 3 that differ are P4 catalog expectations about these two functions:
    - receive_claim_receipt is no longer client-callable, so it drops out of P4's client-callable writer set.
    - The assistant probe now gets "permission denied" instead of `ASSISTANT_READ_ONLY`, which is still a refusal.
    - Appending P19 before P4 in that suite's own `[P1, P2]` base makes P4 choose its delegate technique.
  - Every finance_operation, reimbursement, claim-receipt and irregular-bill test passes.
- **Mutations:** every mutation was run against the same test file, and the file was restored afterwards.

  | mutation | result |
  |---|---|
  | M1a: receive_claim_receipt trusts `app.finance_owner` instead of the authority row | 13 tests fail, including "even a caller holding EXECUTE is refused" |
  | M1b: client INSERT re-allowed under the 0012 setting policy | 4 tests fail, including (e) forged INSERT (expected permission denied, got success) |
  | M2a: claim SELECT without `employee_id = uid` | 2 tests fail: the company member's cross-entity claim reaches the account check |
  | M2b: commitment SELECT without `owner_id = uid` | 0 tests fail: the second layer (UPDATE limited to the owner) still refuses another person's schedule |
  | M2c: M2b plus the UPDATE predicate | 2 tests fail: `check_commitment` refuses with P19_NOT_OWNER instead of the expected refusal |
  | M2d: all three claim ownership layers removed (SELECT, `can_access_entity`, `check_entry`'s entity clause) | 2 tests fail |
