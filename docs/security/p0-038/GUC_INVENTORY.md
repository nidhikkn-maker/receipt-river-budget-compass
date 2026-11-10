# P0-038 — session-setting (GUC) inventory

Track A, 10 Nov 2026. Scope: every `current_setting(` / `set_config(` / `SET [LOCAL]` in
`.lovable/staged-sql/proposed/*.sql` (proposed, never applied) and `drizzle/migrations/*.sql` (applied; not edited).

**Why this matters:** PostgreSQL lets any role set a custom setting (`SET x.y = ...` or `set_config('x.y', ...)`).
So when a guard skips its check because a setting holds a certain value, a signed-in client with plain SQL access can
switch that check off. This is the same threat model as P0-036.

**The fix pattern (same as P14 and P18):**
- The exemption is an **authority row**: transaction id plus caller, kept in a table that clients cannot read or write.
- Only the SECURITY DEFINER operation that owns the exemption writes the row, using `grant_authority`. Clients cannot
  execute `grant_authority`.
- The guard checks `transaction_id = txid_current() AND actor_id = auth.uid()`.
- The row is removed (`end_authority`) before the operation returns.

The helpers are generated identically per schema: `<schema>.authority`, `grant_authority`, `end_authority` and
`authorised(scope, item)`.

The attacks below are in `src/lib/p0-038-guc-authority-sql.test.ts`, which runs in isolated PGlite only. Each attack
sets the old setting as the signed-in caller, using both `set_config(..., true)` and `SET LOCAL`, and then tries the
guarded write. Before the fix, the P9, P10, P11, P13 (applying), P7 (reversal) and P3 (evidence) attacks **succeeded**.
This was checked by running the same test file against the unfixed proposed SQL.

Line numbers below refer to this commit.

## Proposed SQL — exploitable, fixed here

| # | file:line (guard) | setting | what it exempted | legitimate setter | client exploit | fix |
|---|---|---|---|---|---|---|
| 1 | P10_unposted_entry_withdrawal.sql:182 (`guard_withdrawal`) | `phase3_p10.writing` = entry id | Lets a write change `receipt_details.withdrawal` and lets a withdrawn entry's money, date and account columns change | P10 `change` (withdraw_entry / restore_entry), P13 `apply`, P16 `withdraw_upload_entry` | **Yes, reproduced.** The owner sets the setting to the entry id and then changes the amount of a withdrawn entry, or flips its state to "restored" with no reason or history. | `phase3_p10.authority` scope `writing`, item = entry id. Written by the three definer functions; P13 and P16 updated to call it. |
| 2 | P13_team_change_requests.sql:130 (`guard_team_financial_edit`) | `phase3_p13.applying` = entry id | Lets a team member make a consequential edit to another person's entry | P13 `apply` (decide_entry_change approval) | **Yes, reproduced.** A manager with `edit_expenses` sets the setting and changes the owner's amount directly, with no request or approval. | `phase3_p13.authority` scope `applying`. The actor is the approver. |
| 3 | P9_statement_import_idempotency_and_archive_guards.sql:124 (`guard_line_claims`) | `phase3_p9.claiming` = on | Lets a write set or change `statement_line_imports.entry_id` and `registered_at` | `claim_statement_lines`, `confirm_statement_lines` | **Yes, reproduced.** The owner forges or clears a line registration, which defeats re-import idempotency (P0-025). | `phase3_p9.authority` scope `claiming`. The guard is now SECURITY DEFINER because `phase3_p9` is closed to clients. |
| 4 | P11_backup_restore_receipts.sql:209 (check injected into `restore_finance_backup`) | `phase3_p11.checked` = on | Lets a caller run the direct restore without going through the repeat-restore check and receipt | `restore_finance_backup_checked` | **Yes, reproduced.** A direct restore with the setting skips repeat detection (P0-023), skips the receipt and skips `keep_withdrawals` (P0-033). | Ticket in `phase3_p11.restore_authority`: one row for the caller and transaction, holding the SHA-256 of the exact payload. See "How the P11 ticket works" below this table. |
| 5 | P14_asset_disposal_approval.sql:346 (`exempt()`) | `phase3_p11.checked` = on | Lets a write record asset disposal fields (`soldOn`, `saleValue`, `disposal`) and disposal entries without an approved request | P11 checked restore | **Yes.** Set the setting, then write `soldOn` directly. The test now gets `P14_DISPOSAL_APPROVAL_REQUIRED`. | `phase3_p14.p11_restoring()` → `phase3_p11.restoring()`, which is true only while a claimed ticket exists for this caller and transaction. It uses plpgsql, so P14 still installs without P11. |
| 6 | P7_balanced_posting.sql:1026 (`guard_reversal_rows`) | `phase3_p7.reversal_insert` = original id | Lets a client insert a reversal row while books are active | P7 `reverse_entry` (reverse_ledger_entry, approvals) | **Yes, reproduced.** The owner inserts a mirror reversal directly, with no step-up, no reason and no `posting_reversals` record. | `phase3_p7.authority` scope `reversal_insert`, item = original id. |
| 7 | P7_balanced_posting.sql:1061-1068 (`sync_trigger` context) | `phase3_p7.reason` / `.request` / `.meta` | Not a guard skip. These values became the posting batch audit meta (`reason`, `request`), and `meta` was merged last, so it could override `actor` and add `priorPeriod` | P7 `reverse_entry` | **Yes, audit forgery** (by code reading; the test shows the forged values are now ignored). On an ordinary save, the client could record another user as `actor`, record a false reversal reason, or tag postings into the prior-period adjustment report (`meta->'priorPeriod'`). | These values now travel in the `context` of the same authority row that `reverse_entry` writes, and `sync_trigger` reads them from that row. |
| 8 | P3_accounting_posting_layer.sql:508 (`guard_accounting_entry`) | `ledgerline.accounting_request` = request id | Lets a write insert expenses rows that carry `receipt_details.accounting` journal evidence | `post_accounting_journal` | **Yes, if P3 were installed** (reproduced on P1+P2+P3). A client forges accounting evidence entries, which then become immutable. | `accounting_private.authority` scope `accounting_request`, item = request id. |
| 9 | P3_accounting_posting_layer.sql:509 | `ledgerline.restoring` = on | Same as row 8, during a backup restore | P3 `restore_finance_backup` wrapper (SECURITY INVOKER) | **Yes, if installed** (reproduced). | `accounting_private.begin_restore()` / `end_restore()` (scope `restoring`). See the P3 residual below. |

**How the P11 ticket works (row 4):**
- `open_restore` is SECURITY DEFINER. It recomputes the fingerprint and the earlier receipts itself, then writes the
  ticket.
- The direct restore must claim the ticket (`claim_restore($1)`). A claim succeeds once only, and only for the same
  payload.
- `close_restore` writes the receipt and removes the ticket.
- A DEFERRABLE INITIALLY DEFERRED constraint trigger refuses COMMIT while any ticket is still open
  (`P11_RESTORE_UNRECORDED`). This means a restore can never commit without its receipt.

**Residual 1 — P11 steps can be called one by one.** `restore_finance_backup_checked` must stay SECURITY INVOKER,
because the restore is RLS-scoped. So `open_restore`, the direct restore and `close_restore` can each be called
directly, in order. Doing so is exactly the checked restore: the repeat check, `keep_withdrawals`, the step-up (P4) and
the receipt all still apply. There are two small differences:
- In that path the caller supplies the `counts` that are recorded.
- P14's restore exemption is open from the restore until `close_restore`. It grants nothing a crafted backup payload
  could not already carry.

**Residual 2 — P3 `begin_restore`.** The P3 wrapper is SECURITY INVOKER, so `begin_restore` must be callable by
`authenticated`. Calling it gives what restoring a crafted backup gives, and no more:
- It requires a signed-in caller.
- With P4 installed, it requires the same recent step-up.

P3 is superseded and its preflight refuses to install alongside P7.

## Proposed SQL — not client-exploitable (no write privilege), fixed anyway

| # | file:line | setting | what it exempted | legitimate setter | client exploit | fix |
|---|---|---|---|---|---|---|
| 10 | P13_team_change_requests.sql:106 (`guard_audit` on `entry_change_requests`) | `phase3_p13.deciding` = request id | Lets a write update a request row (the decision) | `decide_entry_change`, `cancel_entry_change` | **No.** `authenticated` has only SELECT on `entry_change_requests`, so the attack gets `permission denied` before and after the fix. `service_role` already passes as the operator path. | `phase3_p13.authority` scope `deciding` (defence in depth). |
| 11 | P7_balanced_posting.sql:436, 497 (`guard_writer` on 11 posting tables; `guard_immutable` release of `posting_event_sources`) | `phase3_p7.writer` = on | Lets a write insert posting rows and release a source binding | 12 P7 functions and P16's `reverse_statement_upload` copy | **No.** All 11 tables are REVOKE ALL from anon, authenticated and service_role, with SELECT only. The test confirms that setting the value and then inserting fails. | `phase3_p7.authority` scope `writer`. P16 and P16's rollback copy of the P7 body were updated in step, so P16's rollback still restores P7's body exactly. |
| 12 | P3_accounting_posting_layer.sql:210, 241 | `ledgerline.posting_writer` = on | Lets a write insert `accounting_postings` and `accounting_posting_lines` | `accounting_private.insert_posting` | **No.** These tables are SELECT-only for clients. | `accounting_private.authority` scope `posting_writer`. |

## Already fixed before this change (listed for completeness)

| setting | where | fixed by |
|---|---|---|
| `ledgerline.erasing` | Proposed P1 (writer, :300), P2, P3, P5, P6, P7, P8, P9, P10, P13, P14, P15. Applied 0058:13/:52, 0059:106, 0062:16, 0069:8, 0072:42, 0073:2, 0081:5, 0083:17. | P18 (P0-036): `phase3_p18.erasure_authority`. Every reader is rewritten at install, and the install fails closed if any read remains. |
| `phase3_p9.discarding` | P9 `guard_archive_delete` / `discard_used_pending_document` | P18 (P0-036): `phase3_p18.discard_authority` |
| `phase3_p14.writing` | P14 | P14 itself (P14-a): `phase3_p14.writing` row |

P18's post-install check (P18_erasure_authority.sql:203-208) now also refuses to install while any function still
reads one of the retired settings (rows 1-12 plus `phase3_p9.discarding` and `phase3_p14.writing`).

## Applied migrations (drizzle) — not edited

| # | file:line | setting | what it exempts | legitimate setter | client exploit | status |
|---|---|---|---|---|---|---|
| 13 | 0012_harden_finance_operation_validation.sql:16 (RESTRICTIVE INSERT policy on `finance_operations`). Setter injected by 0012:21 into `finance_operation`; read at 0015_atomic_claim_receipts_and_irregular_confirmation.sql:4 (`receive_claim_receipt`). | `app.finance_owner` = own uid | (a) Lets a client insert its own idempotency records into `finance_operations`. (b) Lets a client call `receive_claim_receipt` outside the money-movement workflow. | `finance_operation` (SECURITY INVOKER). Note that it never clears the setting, so the setting stays on for the rest of the transaction. | **Yes, self-scope only.** For (a): `SELECT set_config('app.finance_owner', auth.uid()::text, true); INSERT INTO finance_operations(owner_id, operation_key, result) VALUES (auth.uid(), 'card_payment:<id>', '{}')`. A later real operation with that key then returns the forged result as a replay and saves nothing; P7's `record_card_payment` reads the same table. For (b): a direct `receive_claim_receipt` call skips the idempotency key and the per-owner advisory lock. Both functions run under the caller's RLS, so no other owner's rows are reachable. | **Fixed by proposed P19** (P0-038 row 13, KK Option 1). `finance_operation` and `receive_claim_receipt` are now SECURITY DEFINER with explicit owner predicates. `phase3_p19.authority` replaces the setting. Client writes to `finance_operations` are closed, and each record is bound to the canonical request. See `P19_REVIEW.md`. |
| 14 | 0058_migration.sql:52 and the eight readers in the row above | `ledgerline.erasing` | erasure | `delete_my_finance_data` | yes | fixed by proposed P18 (P0-036) |

**How row 13 was closed (P19).**
- Both functions were SECURITY INVOKER, so a transaction-bound row could not tell the workflow from a client.
- KK chose Option 1. `.lovable/staged-sql/proposed/P19_finance_operation_authority.sql` (with its rollback) makes
  both functions SECURITY DEFINER with `search_path = public, pg_temp`.
- Every ownership predicate that RLS used to supply is re-implemented, and every written row is re-checked.
- `finance_operation` writes the authority row (txid plus caller) before its money branches and removes it before it
  returns. `receive_claim_receipt` requires that row and has no client EXECUTE.
- The 0012 policy is dropped. Clients lose INSERT, UPDATE and DELETE on `finance_operations`.
- A record with the same key and a different request is refused (`P19_IDEMPOTENCY_CONFLICT`).
- The install fails closed if any function or policy still reads `app.finance_owner`.
- Reproduction before P19 and refusal after it, both on the applied schema and on P1..P18:
  `src/lib/p19-finance-operation-authority-sql.test.ts`.

## Not an exemption

| file:line | setting | reason |
|---|---|---|
| P4b_api_pre_request.sql:31 | `request.method` | It is set by PostgREST for each request before the pre-request hook. It only **narrows**: assistant sessions are refused unless the method is GET, HEAD or OPTIONS. In plain SQL the hook does not run at all, and assistant writes are refused separately by P4's RESTRICTIVE policies. |
| `auth.uid()` / `auth.jwt()` (everywhere) | `request.jwt.claims` (in tests, `test.uid`) | This is the identity that PostgREST sets from the verified JWT. It is context, not an exemption. A client that could rewrite it would be impersonating another user, which no row guard can address; that is a platform boundary. The new authority checks also compare `actor_id` with `auth.uid()`. |
| P3.rollback:9, P7.rollback:35/38, P8.rollback:18, P9.rollback:19, P11.rollback:14, P13.rollback:15, P14.rollback:15, P15.rollback:12, P18.rollback:15 | `ledgerline.rollback_discard_postings`, `phase3_p7.rollback_keep_reversals`, `phase3_p7.rollback_archive_postings`, `phase3_p8.rollback_with_postings`, `phase3_p9.rollback_with_pending`, `phase3_p11.drop_receipts`, `phase3_p13.drop_requests`, `phase3_p14.drop_requests`, `phase3_p15.drop_audit`, `phase3_p18.drop_audit` | These are operator switches, read only by rollback `DO` blocks. Running a rollback needs DDL privileges, and no stored function reads these switches, so they grant a client nothing. |
| P1.rollback:108 | `ledgerline.erasing` (set) | Operator rollback restores the pre-P1 erasure body; nothing reads the setting once P18 is installed. |

Copies of applied migrations under `.lovable/staged-sql/*.sql` (outside `proposed/`) read `ledgerline.erasing` too.
Their live copies are the drizzle files, which P18 covers.

## Counts (final state, 10 Nov 2026)

There are 14 inventory rows, plus 4 "not an exemption" groups and 3 "already fixed before this change" items.

- **Exploitable by a client: 10 found; all 10 now fixed in proposed SQL.**
  - 9 in proposed SQL (rows 1-9), fixed in the files that own them.
  - 1 applied-only (row 13, `app.finance_owner`, self-scope), fixed by proposed P19.
- **Not client-exploitable, fixed anyway for defence in depth: 3** (rows 10-12).
- **Applied-only: 2.**
  - Row 13, `app.finance_owner`, is fixed by P19.
  - Row 14, `ledgerline.erasing`, is fixed by P18 (P0-036).
- **Not an exemption: 4 groups.**
  - `request.method`.
  - JWT identity context.
  - 10 rollback operator switches.
  - P1 rollback erasing.
- **Already fixed before this change: 3.** These are `ledgerline.erasing`, `phase3_p9.discarding` and
  `phase3_p14.writing`.
- **Status by row:**
  - Rows 1-12: fixed (proposed).
  - Row 13: fixed (proposed P19).
  - Row 14: fixed (proposed P18).
  - Open: 0.

All of these fixes are **proposed only**. The applied (hosted) database still runs 0012/0015 and the applied
`ledgerline.erasing` guards until KK approves P18 and P19 and they are installed (P19 last, after P18).

## Remaining exploitable paths

**Through a client-settable session setting: none**, once the proposed stack, including P18 and P19, is installed.
- Every installed function is checked at install time: P18 for the retired settings and `ledgerline.erasing`; P19
  for `app.finance_owner` in functions and policies.
- The whole-stack test confirms that no function reads any of them.

**Until P18 and P19 are applied to the hosted database, the applied schema remains exploitable** in two ways. Both are
self-scope only, and both need plain SQL as `authenticated` (PostgREST exposes no `set_config`):
- `ledgerline.erasing` (row 14): it bypasses the applied evidence and archive guards for the caller's own rows. It is
  closed by P18.
- `app.finance_owner` (row 13): it lets the caller forge their own idempotency records or call
  `receive_claim_receipt` outside the workflow. It is closed by P19.

**Related, not a session setting (recorded in `P19_REVIEW.md`):**
- **Claim JSON is still editable by row edit.** The owner, and company editors through 0075/P1, can still change
  `expenses.reimbursement` and `reimbursement_status` with an ordinary row edit. The app edits claim details this way
  by design. The audit trigger records every such edit. The money-back entry and the idempotent receipt still go only
  through the workflow.
- **P7 `record_card_payment` replay** is not yet bound to a request hash. Clients can no longer forge its record.
