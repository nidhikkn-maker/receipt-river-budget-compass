# Security migration plan, 2026-11-09 (P1 containment + P2 V3.1 role model + P4 step-up and assistant limits)

> **Nothing has been applied.** No live, hosted or Lovable Cloud database was queried or changed. No file was added to `drizzle/migrations`, no existing migration or staged file was edited, and nothing was committed or pushed. Every result below comes from the isolated in-memory PGlite harness (`src/test/full-schema-pglite.ts`), which replays `drizzle/migrations/0000–0088` with Supabase-like stubs.

**Status labels.** *Specified* means written and reviewed against the 0088 schema. *Tested (isolated)* means proved by `src/lib/security-proposed-sql.test.ts` on the replayed schema. Both P1 and P2 are **Specified + Tested (isolated)**. Neither is **Applied**.

Inputs: `docs/SECURITY_REVIEW_2026-11-09.md` (H-1, H-2, H-3, M-1, M-2, M-4, Lows), `docs/MIGRATION_PROPOSAL_2026-11-09.md` (§9, §10, cross-cutting 0092 erasure), `docs/specs/THAPAL_V3_1_CONTRACT_2026-11-09.txt` §12, and KK's decisions:
- adopt V3.1 roles through a controlled migration;
- preserve the old team-expense feature and its history until replacements are verified (no deletion of `user_roles`, `role_permissions`, `role_permission_audit`, `department_budgets`, `profiles.department` or history rows);
- keep internal identifiers;
- no live query of role holders, so the fix must be safe **whoever** holds legacy roles. This neutralises H-2 without knowing who holds them.

## 1. Files

| File | Purpose |
|---|---|
| `.lovable/staged-sql/proposed/P1_security_containment.sql` | Containment of H-1, H-2, H-3, M-1, M-2, L-3 and L-4, plus erasure coverage. Changes no rows. |
| `.lovable/staged-sql/proposed/P1_security_containment.rollback.sql` | Restores the exact 0088 objects (bodies copied verbatim from 0000, 0058, 0066 and 0078). |
| `.lovable/staged-sql/proposed/P2_v31_role_model.sql` | Additive V3.1 grants, matrix, audit, `has_permission`, invite/accept/revoke, backfill and transition sync. |
| `.lovable/staged-sql/proposed/P2_v31_role_model.rollback.sql` | Drops the P2 functions and triggers. **Archives** (does not drop) the three P2 tables into `security_rollback_archive`. |
| `src/lib/security-proposed-sql.test.ts` | 80 isolated acceptance tests (§6). |
| `.lovable/staged-sql/proposed/P4_step_up_and_assistant_limits.sql` (+ `.rollback.sql`) | Phase 1 contract (`docs/plans/PHASE1_SECURITY_CONTRACT_2026-11-09.md`): database step-up, external-assistant limits and revocation, append-only audit history (§13). |
| `.lovable/staged-sql/proposed/P4b_api_pre_request.sql` (+ `.rollback.sql`) | Optional PostgREST pre-request hook. **Not** part of the automatic order; needs hosted verification (§13.6). |
| `src/lib/security-phase1-sql.test.ts` | 72 isolated acceptance tests for P1+P2+P4 (§13.8). |

Both SQL files run as one `BEGIN … COMMIT` and start with a preflight `DO` block that aborts on an unexpected schema.

## 2. P1: exact objects changed (before → after)

| # | Object | 0088 (before) | P1 (after) | Finding |
|---|---|---|---|---|
| 1 | `can_access_expense(uuid,text)` (definer) | true for **every** other user if the caller has `finance`; for `manager`, true if `profiles.department` matches (default `'Engineering'` = everyone) | Same signature. True only if the person granted the caller an active `entity_members` row (write grant for non-view actions) **and** the role switch allows it. `department` is no longer consulted. No row policy uses it any more; only `team_names()` does. | H-1, H-2 |
| 2 | `can_access_expense(uuid,text,text)` | did not exist | New row-level overload: caller ≠ owner, `entity_id` NOT NULL, role switch allows, **and** an active grant from that owner for **that** company (write grant for non-view actions) | H-1 |
| 3 | policy `expenses` "Expense linked records belong to owner" (RESTRICTIVE, USING) | `employee_id = uid OR can_access_expense(employee_id,'view_expenses')` | `… OR can_access_expense(employee_id,'view_expenses', entity_id)`; WITH CHECK unchanged | H-1 |
| 4 | policies `expenses` "Team expenses: read/edit/delete" | 2-arg call | 3-arg call with `entity_id` (same names and commands) | H-1 |
| 5 | `guard_team_expense_edit()` | category switch checked person-wide | Checked for `OLD.entity_id`; otherwise identical | H-1 |
| 6 | `can_read_team_receipt(text)` | did not exist | Definer helper: the path must be referenced in `receipts[].path` of a company expense that the caller may see under (2) | H-1 |
| 7 | storage policy "Read team receipts" | the employee's **whole** `receipts/` prefix (statements, vault, reports, drafts) | `bucket_id='receipts' AND can_read_team_receipt(name)` | H-1 |
| 8 | `team_company_tax()` | every non-demo owner's companies and **all** `entityTaxProfiles` (PAN) | Only owners who granted the caller; only granted companies and their profiles (order kept) | H-1 |
| 9 | `has_role(uuid,app_role)` | answered for any user id; executable by anon | Answers only when `_user_id = auth.uid()` | L-3 |
| 10 | `department_budgets` policies | read: own department OR `has_role(finance)`; write: `can_do('edit_budgets')` (any finance holder) | read: own department OR `is_admin()`; write: `is_admin() AND can_do('edit_budgets')` ("verified finance" = app admin who also holds finance). Rows untouched. | H-2, L-4 |
| 11 | `can_upload_company_file(text)`, `is_unlinked_company_file(text)` | did not exist (staged #9 only) | From staged #9, with `search_path = public, pg_temp` and a NULL guard | M-1, M-2 |
| 12 | `is_own_unlinked_company_upload(text)` | did not exist | New: the object exists, is still unreferenced, and `storage.objects.owner_id = auth.uid()` | M-1 |
| 13 | storage policy "Entity editors upload document files" | write **anywhere** under a sharing owner's prefix (0078) | Only `<owner>/companies/<hex(entity)>/<safe-name>` for an active write grant on an existing company, with `owner_id = uid` | M-2 |
| 14 | storage policies "Entity editors clean unlinked company uploads" (DELETE), "Entity editors read own pending uploads" (SELECT) | did not exist | From staged #9: editors may read and delete only their own unreferenced uploads | M-2 (restores cleanup) |
| 15 | storage policy "DocuRepo originals require current document access" (RESTRICTIVE SELECT) | did not exist (staged #10) | Another owner's `docs/` or `companies/` originals, or any path referenced by a document, are readable only through a document the caller may currently read | M-1, H-1 defence in depth |
| 16 | index `documents_file_path_idx` | none | `documents(file_path)`, used by (11), (12), (15) and the 0075 read policy | performance |
| 17 | trigger `zz_guard_shared_document_edit` + `guard_shared_document_edit()` (invoker) | none (staged #9 guard keyed on `NEW.owner_id`; review showed it does not stop H-3) | BEFORE INSERT OR UPDATE, keyed on **OLD**. Nobody may change `owner_id`. A non-owner may not change `entity_id`, `file_path`, `transaction_id`, `account_id`, `loan_id`, `replaces_id` or `evidence_locked`, and needs a current write grant on `OLD.entity_id`. A non-owner INSERT must use the exact company namespace, the caller's own unlinked upload, and no record links. | H-3, M-1 |
| 18 | trigger `zz_guard_shared_expense_edit` + `guard_shared_expense_edit()` (invoker) | only `guard_team_expense_edit` (employee_id) | BEFORE UPDATE, keyed on OLD. Nobody may change `employee_id`. A non-owner may not change `entity_id`, `receipts` or `member_id`. | H-3 pattern on expenses |
| 19 | `delete_my_finance_data()` | 0058 list (22 tables) | Same contract (no args, `void`, definer). Also clears `entity_members` (as owner **or** member), `preference_approvals`, accountant links, contacts, uploads and events, all `import_*` rows, `statement_checkpoints`, `transfer_links`, `opening_postings`, `period_operation_authority`, `document_runs`, `document_intake_commits`, `receipt_problem_reports`, `report_jobs`, `demat_accounts`, `security_holdings`, `financial_corrections`, `claim_preparations`, `reimbursement_config_audit`, `period_close_evidence` and `imported_period_history`. Also clears the P2 tables when they exist (dynamic SQL, so P2 never redefines this function). | proposed 0092 |
| 20 | EXECUTE grants | `has_role`, `my_department`, `is_admin`, `can_do`, `can_access_expense` and `guard_team_expense_edit` executable by PUBLIC and anon | Revoked from PUBLIC and anon; granted to `authenticated` (and `service_role` for the new helpers) | L-3 |

**Unchanged on purpose:**
- `user_roles`, `role_permissions`, `role_permission_audit`, `department_budgets` and `profiles`, and their rows.
- `admin_team`, `admin_set_member`, `admin_set_permission`, `my_team_role`, `can_do`, `is_admin`, `team_names` (its body is unchanged; its result narrows through (1)), `can_access_entity`, `grant_entity_access`, `revoke_entity_access` and `my_shared_companies`.
- `handle_new_user`: the `'Engineering'` default stays, because departments no longer grant reach.
- The 0075, 0076 and 0078 `documents` and `expenses` entity policies, which are now bounded by the triggers.

**Kept by erasure on purpose** (identity or access history, under KK's preserve decision):
- `profiles`, `user_roles`, `app_admins`, `role_permission_audit`;
- `expense_history` rows the caller wrote on other people's records;
- `demo_sessions` (the cron job removes these);
- `device_passkeys` and `passkey_challenges` (sign-in factors, not finance data);
- P2 audit rows where the caller was the actor in **another** owner's workspace.

`expense_history` for the caller's own expenses cascades.

## 3. P2: V3.1 role model (additive)

| Object | Description |
|---|---|
| `access_role_permissions(role, action, allowed)` | An 11 × 11 matrix of the roles `owner`, `adult_family_member`, `delegate`, `bookkeeper`, `accountant`, `auditor`, `company_secretary`, `authorised_reviewer`, `administrator` and the two legacy roles `legacy_company_editor` and `legacy_company_viewer` against the actions `view`, `upload`, `draft_edit`, `propose`, `post`, `approve`, `export`, `share`, `delete_unposted`, `manage_access` and `reopen`. Clients can read it; only migrations change it. |
| `access_grants` | Columns: `workspace_owner_id`, optional `entity_id` (NULL = whole workspace), `role` (never `owner`), `grantee_email`, `grantee_id`, `granted_by`, `created_at`, `expires_at`, `accepted_at`, `identity_check`, `revoked_at`, `revoked_by`, `source` (`invite`/`entity_members`) and `source_ref`. CHECKs: not self; accepted ⇔ grantee set; accepted ⇒ identity check recorded; expiry after creation. One active grant per person per scope. Clients get SELECT only (owner or grantee). |
| `access_grant_audit` | Append-only: UPDATE is always refused, and DELETE only during `delete_my_finance_data`. Events are `invited`, `accepted`, `revoked`, `backfilled` and `role_changed`. |
| `has_permission(_owner, _entity, _action)` | Definer. The owner has every action. A grantee needs an accepted, unrevoked, unexpired grant whose scope is the whole workspace or exactly `_entity`, plus a matrix allow. Anonymous sessions are refused. Checked on every call (no caching), so revocation and expiry take effect on the next statement. |
| `invite_access(_owner, _entity, _email, _role, _expires_at)` | The owner, or a `manage_access` holder (who may not create `administrator`). The company must exist, the email must be valid and not the owner's, and the expiry must be in the future. Refuses a duplicate active grant in the same scope. |
| `accept_access(_grant)` | **Identity requirement:** the caller must be non-anonymous with a **confirmed** email equal to the invite (case-insensitive and trimmed). The grant must be unrevoked and unexpired. Idempotent for the same person. Records `identity_check='confirmed_email_match'`. |
| `revoke_access(_grant)`, `my_access_invites()` | Revoke by the owner, a `manage_access` holder, or the grantee (leaving). The second function lists pending invites for the caller's confirmed email. |
| trigger `sync_entity_member_grant` on `entity_members` (AFTER INSERT/UPDATE) | During the transition, the current UI's `grant_entity_access` and `revoke_entity_access` are mirrored onto the backfilled grant (role change, immediate revoke). `entity_members` itself is never modified. |
| Backfill | Every `entity_members` row, active and revoked, becomes one grant with `source='entity_members'`, `source_ref = entity_members.id`, the same timestamps and the same revocation. It is idempotent and writes one `backfilled` audit row per grant. |

**Matrix (proposed, needs KK confirmation):**

| role | view | upload | draft_edit | propose | post | approve | export | share | delete_unposted | manage_access | reopen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| owner | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| adult_family_member | ✔ | ✔ | ✔ | ✔ | | | | | | | |
| delegate | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | | ✔ | | |
| bookkeeper | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | | ✔ | | |
| accountant | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | | |
| auditor | ✔ | | | | | | ✔ | | | | |
| company_secretary | ✔ | ✔ | ✔ | ✔ | | | ✔ | | | | |
| authorised_reviewer | ✔ | | | | | ✔ | ✔ | | | | |
| administrator | | | | | | | | | | ✔ | |
| legacy_company_editor | ✔ | ✔ | ✔ | | | | ✔ | | | | |
| legacy_company_viewer | ✔ | | | | | | ✔ | | | | |

Rationale:
- Only the owner may `share` externally or `reopen` closed periods, which matches "only the Audit operation can close or reopen periods".
- `administrator` manages access but never reads finances, the same separation P1 enforces for legacy admins.
- `auditor` is read-only (contract A03: "auditor read-only").
- Professional roles get no `share` or `reopen`.

**Backfill mapping and justification (revised for V4 FND-04 / decision V4-P2MAP; the earlier can_write → bookkeeper, read-only → auditor mapping escalated rights and was replaced):**
- **`can_write` → `legacy_company_editor`** = view, upload, draft_edit, export. **Read-only → `legacy_company_viewer`** = view, export. Both equal exactly what the grant allows at 0088+P1, derived from the applied policies:
  - *view*: 0075 "Entity members read documents" and "Entity members read document files". The 0076 company-transaction read/update policies are additionally gated by the 0066/P1 RESTRICTIVE expenses policy (`employee_id = auth.uid() OR can_access_expense(...)`, which needs a legacy finance/manager role), so a company grant alone never exposes ledger rows; that legacy-role reach is not part of the grant and is not mapped.
  - *export*: the only member export path is the SharedWithMe CSV/PDF/Excel download, built in the browser from the rows the member can read. No server export exists for members, so export == read ("no export beyond read").
  - *upload* (editors): 0078 "Entity editors add company documents" + P1 "Entity editors upload document files" (`<owner>/companies/<hex>/<file>` only). Cleaning the editor's **own unlinked** upload is part of uploading, not `delete_unposted`.
  - *draft_edit* (editors): 0076 "Entity editors update company documents" (title/notes/metadata; P1 forbids changing owner, company, file, links and evidence lock).
  - Never granted: `propose` (no proposal mechanism for members), `post` (no INSERT on the owner's ledger; every money RPC is owner-scoped by `auth.uid()`), `approve`, `share` and `manage_access` (grant/revoke are owner-only), `delete_unposted` (no member DELETE policy), `reopen` (period operations are owner-only).
- Legacy roles cannot be invited (`invite_access` refuses them) and a CHECK allows them only on rows with `source='entity_members'`. The transition sync maps can_write toggles and revocations onto them immediately.
- **Proof** (`src/lib/security-phase1-sql.test.ts` §B): for each of the 11 actions a probe runs the real database path (read, upload + link, metadata edit, owner draft, owner ledger insert, owner preference write, grant/invite, revoke, delete, period evidence/closed-period change) at 0088, P1, P1+P2 and P1+P2+P4. The effective set is identical in all four states and equals `has_permission` for the backfilled role; other companies and personal scope give nothing.
- **Legacy `user_roles` are not mapped** (H-2: holders and origin unknown). Mapping them needs an owner-confirmed list.

**Not done in P2 (a later, separately approved step):** no row or storage policy calls `has_permission` yet (a test asserts this). The live database reach after P2 is exactly P1's.

## 4. Order and dependencies

1. Preconditions: 0000–0088 applied; staged `company-bound-uploads.sql` and `document-storage-boundary.sql` **not** applied. The P1 preflight aborts if the staged trigger `guard_company_document_path` exists. Those two staged files are superseded by P1 and must never run after it, and `entity-member-uploads.sql` must never run either (it re-creates the broad 0078 upload policy: I-6).
2. **P1**, in file order: helpers (overload) → expense policies → team guard → team receipts → `team_company_tax` → `has_role` → budgets → company-file helpers (before the document guard that calls them) → storage policies → index → OLD-keyed guards → erasure → grants. Each step depends only on earlier ones. Nothing relies on alphabetical file order. The guard triggers are named `zz_*` on purpose: PostgreSQL fires same-timing triggers in name order, so the guards run last and see the final `NEW` row.
3. **P2**, which requires P1 (preflight check).
4. Rollback goes in reverse: P2 rollback, then P1 rollback. The P1 rollback refuses to run while P2 tables exist.
5. Drizzle bookkeeping: when approved, these would become `drizzle/migrations/0089_security_containment.sql` and `0090_v31_role_model.sql`, with `meta/_journal.json` entries in the existing pattern. That was not done here, as instructed.
6. Client compatibility: none of the changes need an app release. `CompanyAccess.tsx` already uploads to `companies/<hex>/`, and its cleanup `remove` now works. Two UI items need a later copy update: the `TeamAccess` copy ("Managers act on their own department; finance on everyone") and the Team-expenses subtitle.

## 5. Security effect per finding

| Finding | Effect after P1 (P2 adds nothing to live reach) | Test evidence |
|---|---|---|
| **H-1** team roles cross-tenant | A finance or manager role alone reaches **nothing** of another owner. With an owner's company grant, it reaches only that company's rows, the receipts those rows reference, and that company's tax profile. Personal (no-entity) rows, other companies, statements, vault files and reports are unreachable. | H-1a–f reproduce at 0088, blocked after P1 and P1+P2; "legacy finance with a c1 grant…" and "legacy finance/manager without a grant…" pass |
| **H-2** unknown or self-assigned roles | Neutralised without touching or querying `user_roles`. A role row is inert without an explicit owner grant. Shared department budgets can be changed only by app admins (service-role-created rows) who also hold finance. | H-2/L-4 probe |
| **H-3** editor takeover | `owner_id` and `employee_id` are immutable for signed-in callers. Non-owners cannot change company, file, links or the evidence lock. | H-3a, H-3b blocked; H-3c control stays blocked |
| **M-1** pointing at other files | Editors may reference only their own new unlinked upload in the exact company namespace. The restrictive read policy stops document-path tricks on `docs/` and `companies/`. | M-1a, M-1b; "c1 editor…" (foreign or existing file refused) |
| **M-2** write anywhere | Uploads only to `<owner>/companies/<hex>/<safe-name>`, never to `reports/`, another company, a subfolder or `..`. | M-2; editor flow negative cases |
| **M-4** MCP token can write | **Not changed by P1 or P2.** Closed by **P4** (§13): RESTRICTIVE write denial on every table and on files, writer RPCs refuse assistant sessions, revocation is immediate. | `security-phase1-sql.test.ts` M-4 probe, §D |
| **L-3** role oracle | `has_role` answers only for self, and anon and PUBLIC lose EXECUTE on the role helpers. | L-3 probe (stranger and anon) |
| **L-4** department budgets | Read only for the caller's own department, or by an admin. | H-2/L-4 probe; admin test |
| Erasure gap (0092) | Every owner-linked table is cleared except the documented kept list. Other owners' rows are unchanged. | erasure tests |
| L-1, L-2, L-5–L-8, M-3, I-* | Not in scope for this package (app-code or hosted changes); unchanged. | — |

## 6. Tests (actually run)

Command: `bunx vitest run src/lib/security-proposed-sql.test.ts`. **Result: 80/80 passed, about 32 s (run 3 times, all passed).**

Each database is a fresh PGlite with 0000–0088 replayed. Every probe runs inside `BEGIN … ROLLBACK`, so probes cannot affect each other.

**Baseline at 0088 (15 tests):** each of the following *reproduces*:
- H-1a manager reads unrelated personal expenses;
- H-1b finance reads statements, vault documents and receipts;
- H-1c finance reads every owner's PAN;
- H-1d a finance user with only a c1 grant reads personal and c2 rows;
- H-1e finance edits an unrelated owner's expense;
- H-1f manager reads unrelated receipts;
- H-2/L-4 legacy finance changes shared budgets;
- H-3a editor reassigns a document;
- H-3b editor moves an expense to another company or re-points its receipts;
- M-1a editor document pointing at a personal vault file, which the editor then reads;
- M-1b re-point to the c2 original;
- M-2 editor writes into `reports/`;
- L-3 `has_role` oracle (stranger and anon);
- ERASE: `preference_approvals` and `entity_members` survive erasure.

H-3c (an editor moves an expense to themself) is a control that 0088 already blocks, and it stays blocked.

**After P1, and after P1+P2 (30 tests):** every probe above is **blocked**.

**Legitimate flows after P1, and after P1+P2 (20 tests):**
- owner CRUD on expenses, documents and files (including changing their own document's company and file);
- c1 editor: reads c1 only, uploads into the namespace, links their own upload, renames, cleans an unlinked upload, cannot delete a linked one. Four bad paths and a foreign storage owner are refused, as is metadata pointing at an existing file;
- read-only member: reads, cannot write;
- legacy finance with a c1 grant: exactly the c1 expense, the referenced c1 receipt and the c1 PAN;
- legacy finance and manager without a grant: nothing of others, and their own data and role intact;
- finance c1 editor: may edit permitted fields, and the category switch is still enforced;
- admin: `admin_team`, `admin_set_member` and `admin_set_permission` work, history is readable and the role matrix keeps 24 rows; the admin sees 0 foreign expenses or files; an admin who also holds finance can edit budgets;
- revoked member: immediately loses rows, files, pending uploads, `my_shared_companies` and write access;
- family: invite, verified accept, request with evidence; the owner reads the evidence and decides; the member sees none of the owner's records;
- visitor demo: the guest seeds and sees only their own rows.

**Data preservation and rollback (2 tests):** described in §7.

**Erasure (3 tests):**
- The 0088 gap reproduces (`preference_approvals`, `entity_members`, `upload_links`, `opening_postings`, `report_jobs` and others survive).
- After P1 and after P1+P2, no owner-linked row is left outside the kept list, and the other owner's rows are unchanged.
- The contract is preserved (no args, `void`, definer, not executable by anon).

**Definer hygiene (1 test):** all 16 new or replaced definer functions set `search_path`, are not executable by PUBLIC or anon, and check `auth.uid()` or call a helper that does.

**P2 (9 tests):**
- the stored matrix equals the documented matrix (99 cells);
- `has_permission` follows the matrix for all 8 grantable roles; the owner has all actions; strangers, other workspaces and anon have none;
- entity scope never reaches another company or personal records;
- expiry and revocation take effect on the very next statement (including the grantee leaving), and the audit is append-only (UPDATE and DELETE refused);
- identity-matched acceptance: a different email, an unconfirmed account with the same address, and an anonymous session are all refused; a confirmed match is accepted and idempotent;
- invite authorization: a stranger cannot invite, and `owner`, a missing company and a past expiry are refused; an administrator can invite but not create an administrator, and has only `manage_access`; direct INSERT, UPDATE and DELETE on grants are refused;
- backfill: 5 `entity_members` rows (one revoked) became `legacy_company_editor` and `legacy_company_viewer` grants with revocation kept; legacy `user_roles` were not mapped and are untouched;
- transition sync: grant, role change and revoke are mirrored immediately;
- P2 switches no live policy (an accepted workspace accountant sees 0 rows or files, and no policy references `has_permission`).

**One real defect found and fixed during testing:** Supabase's default privileges (`GRANT ALL ON TABLES TO anon, authenticated`) made the new P2 tables client-writable at the privilege level, so a client UPDATE silently affected 0 rows instead of being refused. P2 now runs `REVOKE ALL … FROM PUBLIC, anon, authenticated` and grants SELECT only.

**Full suite (`bun run test`):** see §11.

## 7. Data-preservation evidence

The test "data preservation and exact rollback" works as follows:
1. Seed the realistic scenario: two owners, companies c1 and c2, nine storage objects, grants (one revoked), legacy roles, an app admin, budgets, `preference_approvals` and a demo guest.
2. Insert generic rows into **all 63 public tables** for two owners (FK and trigger enforcement off during seeding, CHECKs honoured). The test asserts that no table is empty.
3. Take a snapshot per table, plus `storage.objects` and `auth.users`: `count(*)` and `md5(string_agg(row::text ORDER BY row::text))`.

Assertions, each checked by the test:
- After P1, the snapshot is **identical** (P1 changes no rows).
- After P2, the snapshot of every pre-existing table is **identical**. Backfilled grants equal the `entity_members` count.
- After the P2 rollback and then the P1 rollback, the following are each **identical to the 0088 snapshot**: `pg_policies` (public and storage), `pg_get_functiondef` and ACL for every public function, every trigger definition, every index, the RLS flag of every table, and every table grant. All table data is identical too.
- The three P2 tables survive in `security_rollback_archive`.
- Re-applying P1 and P2 after a rollback works and still preserves the data.

Reference hashes for the hosted pre-check (PGlite formatting; the hosted output may differ by server version, so compare a hosted export rather than relying on these alone). These are `md5(pg_get_functiondef)` values at 0088:

| function | hash |
|---|---|
| `can_access_expense(uuid,text)` | `00bd96212884fc8d6a7b0d138c64eec9` |
| `guard_team_expense_edit()` | `e557d2ba7ab7f20a34dd4f29c0589fcc` |
| `team_company_tax()` | `d849ed62ccb4a0102c52ddbca4e44031` |
| `has_role(uuid,app_role)` | `8239cb57b97d7f87f98507c481c7d5c3` |
| `delete_my_finance_data()` | `50a74fa8f65b3b7651f71e9409e069e8` |
| `team_names()` | `619d75598331cf9260c30d55ff35692f` |

## 8. Rollback procedure (exact steps)

1. **Requires KK approval.** Export the P2 tables if P2 was applied: `COPY (SELECT * FROM public.access_grants) …`, and the same for `access_grant_audit`.
2. If P2 was applied, run `.lovable/staged-sql/proposed/P2_v31_role_model.rollback.sql` as one transaction. It:
   - drops the sync trigger and the six P2 functions;
   - moves `access_grant_audit`, `access_grants` and `access_role_permissions` to `security_rollback_archive.<name>_<UTC timestamp>`;
   - revokes all client privileges on them.

   `entity_members` is unaffected.
3. Run `.lovable/staged-sql/proposed/P1_security_containment.rollback.sql` as one transaction. It refuses to run while `public.access_grants` exists. It drops the two `zz_*` guards, the new storage policies and the index; re-creates the 0078 upload policy; restores the 0066 expense, receipt and budget policies; drops the overload and the helpers; restores `can_access_expense`, `guard_team_expense_edit`, `team_company_tax`, `has_role` and `delete_my_finance_data` verbatim; and re-grants EXECUTE to PUBLIC and anon as at 0088.
4. Verify with the read-only pre-check queries P-8 and P-9 below, comparing against the export taken before P1.
5. **Effect:** rollback **re-opens H-1, H-3, M-1, M-2 and L-3**. Files uploaded under `companies/<hex>/` stay, and owners keep access through their own-prefix policies. No table rows change in either rollback.

## 9. Production pre-checks (all read-only; each **requires KK approval** before running)

| ID | Purpose | Query |
|---|---|---|
| P-1 | Which migrations are live | `SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;` (or the Lovable or Supabase migration table) |
| P-2 | Staged #9/#10 not installed; P1/P2 not already present | `SELECT tgname FROM pg_trigger WHERE tgname IN ('guard_company_document_path','zz_guard_shared_document_edit');` `SELECT proname FROM pg_proc WHERE proname IN ('can_upload_company_file','is_unlinked_company_file','has_permission','can_read_team_receipt');` |
| P-3 | Legacy role holders, aggregate only (H-2; P1 does not depend on the answer) | `SELECT role, count(*) FROM public.user_roles GROUP BY 1;` `SELECT count(*) FROM public.app_admins;` `SELECT count(*) FROM public.role_permission_audit WHERE change='member';` |
| P-4 | Who will lose team visibility (UI impact) | `SELECT r.role, count(DISTINCT r.user_id) holders, count(DISTINCT m.owner_id) FILTER (WHERE m.revoked_at IS NULL) granting_owners FROM public.user_roles r LEFT JOIN public.entity_members m ON m.member_id=r.user_id GROUP BY 1;` |
| P-5 | Backfill conflicts (P2 unique active scope) | `SELECT owner_id, entity_id, lower(btrim(member_email)) e, count(*) FROM public.entity_members WHERE revoked_at IS NULL GROUP BY 1,2,3 HAVING count(*)>1;` and `SELECT count(*) FROM public.entity_members WHERE nullif(btrim(member_email),'') IS NULL;` |
| P-6 | Editor documents outside the company namespace (existing H-3/M-1 artefacts to review) | `SELECT count(*) FROM public.documents WHERE entity_id IS NOT NULL AND file_path NOT LIKE owner_id::text||'/companies/'||encode(convert_to(entity_id,'UTF8'),'hex')||'/%';` |
| P-7 | Storage owner column populated (needed by policies 12–15) | `SELECT count(*) FILTER (WHERE owner_id IS NULL) missing, count(*) FILTER (WHERE owner_id <> split_part(name,'/',1)) foreign_uploads FROM storage.objects WHERE bucket_id='receipts';` |
| P-8 | Object snapshot to diff against §2 and §7 | `SELECT schemaname, tablename, policyname, permissive, cmd, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;` |
| P-9 | Function bodies and grants for in-scope functions | `SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)), p.proacl FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('can_access_expense','guard_team_expense_edit','team_company_tax','has_role','delete_my_finance_data','team_names','can_do','is_admin','my_department');` |
| P-10 | Possible earlier exploitation (H-3): documents whose path prefix differs from a company document's original owner cannot be detected directly; review recent ownership changes | `SELECT owner_id, count(*) FROM public.documents WHERE entity_id IS NOT NULL GROUP BY 1;` cross-checked against `entity_members` member ids (an editor owning a document tagged with someone else's company id is suspicious) |
| P-11 | Performance (`documents_file_path_idx` and the restrictive policy) | `EXPLAIN SELECT 1 FROM storage.objects WHERE bucket_id='receipts' LIMIT 50;` run as a test user on a hosted **draft** only |

Do not run any `DELETE` or `UPDATE` against production for this package. All of the checks above are SELECT, EXPLAIN or catalog reads.

## 10. Residual risks

- **Signed URLs already issued** keep working until they expire: 60 s for vault files; 300 s for family evidence and 600 s for draft thumbnails (L-2). Data already loaded into a member's `SharedWithMe` React state, and files already downloaded, stay with that member.
- **M-4 (MCP OAuth token can write through PostgREST)** is addressed by P4 (§13), assuming hosted assistant tokens carry a `client_id` claim and first-party tokens do not (hosted pre-check H-P4-2).
- **Legacy role holders are unknown (H-2).** P1 makes their rows inert without an owner grant, but an owner who has *also* granted a legacy finance or manager user a company now exposes that company's rows and referenced receipts to them. That is the intended "explicit grant" path. The rows were never deleted (KK decision).
- **Existing artefacts:** documents already re-pointed or taken over under H-3 or M-1 before P1 stay as they are (P-6 and P-10 help find them). P1 does not move or delete them.
- **Same-company linking:** an editor can still link only their *own* new upload. The owner's unlinked files under `companies/<hex>/` stay private to the owner.
- **`storage.objects.owner_id`** must be set by the hosted Storage API (P-7). If it is not, editor uploads fail closed: they are refused, not opened.
- **Department budgets** become editable only by an app admin who also holds finance. If no such person exists, nobody can edit them until KK assigns one (rows unchanged).
- **P2 matrix is not enforced yet.** Until policies switch to `has_permission`, the matrix has no database effect. The transition sync mirrors only `entity_members` changes, not P2 invites, back to the old model.
- **PGlite is not Supabase.** The roles, auth, storage and default privileges are stand-ins. Hosted behaviour (Storage API, PostgREST overload resolution with the new 3-argument `can_access_expense`, and server-version differences in `pg_get_functiondef`) is **not verified**.
- **App copy:** `TeamAccess.tsx` still says "Managers act on their own department; finance on everyone". A later UI change is needed (src was not changed here).

## 11. Full-suite result

`bun run test` was run after adding the test file: **320 test files, 2312 tests, all passed** (318 s). The run includes the new 80 tests and any other untracked test files present in the working tree at the time.

## 12. Items requiring KK approval

1. Apply **P1** (as 0089) after the read-only pre-checks P-1–P-9. Team visibility for legacy finance and manager users drops to explicitly granted companies only; department budget editing needs app admin plus finance.
2. Confirm that the staged `company-bound-uploads.sql`, `document-storage-boundary.sql` and `entity-member-uploads.sql` are superseded and archived or removed so they can never run after P1.
3. Apply **P2** (as 0090): confirm the role matrix and the backfill mapping **can_write → legacy_company_editor** and **read-only → legacy_company_viewer** (exact current rights, §3).
4. Whether and how legacy `user_roles` should map to V3.1 grants (needs an owner-confirmed list; not automated).
5. The later step that switches row and storage policies to `has_permission`, and retires the legacy team-expense model once V3.1 replacements are verified.
6. Apply **P4** (as 0091) after the hosted pre-checks in §13.7; decide whether to activate P4b. The L-2 signed-URL windows and UI copy updates remain outside this SQL package.
7. Each rollback, and every production publish, is a separate approval.

## 13. P4: step-up and external-assistant limits (Phase 1 contract, database track)

**Status:** Specified + Tested (isolated). **Not applied.** Requires P1 and P2 (preflight); refuses to run twice.

### 13.1 Objects

| Object | Purpose |
|---|---|
| `step_up_grants(id, owner_id, method, scope, session_id, created_at, expires_at)` | Recent re-confirmations. `method` ∈ passkey/password/email_otp; `scope` ∈ all/credential (default all); CHECKs: expires within 5 minutes of creation, email_otp only with scope credential. Clients SELECT their own rows only; no client INSERT/UPDATE/DELETE privilege. |
| `record_step_up(_owner uuid, _method text, _seconds int DEFAULT 300, _session uuid DEFAULT NULL, _scope text DEFAULT NULL)` | SECURITY DEFINER; EXECUTE for `service_role` **only** (one function; 2–5 argument calls resolve to it). Validates account, method (passkey/password/email_otp; PIN refused, Decision 30), scope (NULL → passkey/password `all`, email_otp `credential`; email_otp + `all` refused) and 1–300 s. `_session` = the confirming token's `session_id`. Uses one `clock_timestamp()` for `created_at` and `expires_at` (fixes a latent defect in the earlier P4 draft: two calls differ by microseconds on a real server, so a 300-second grant broke the 5-minute CHECK). Writes `step_up_recorded`. |
| `jwt_session_id()` | The caller's `auth.jwt()->>'session_id'` as uuid (NULL if absent/malformed). No client EXECUTE. |
| `has_recent_step_up_for(_action)` | True when the caller (never an assistant) has an unexpired grant whose `session_id` is NULL or equals `jwt_session_id()`, with scope `all`, or scope `credential` and `_action = 'register_passkey'`. EXECUTE anon/authenticated/service_role (RLS policy helper). |
| `has_recent_step_up()` | `has_recent_step_up_for(NULL)`: scope `all` only. |
| `require_recent_step_up(_action)` | **VOLATILE.** Raises `STEP_UP_REQUIRED: <action>` (SQLSTATE 42501) without a session-matching scope-`all` grant, and always for assistant sessions; raises `Unknown sensitive action` (22023) for names that are not a registered step-up function, `remove_device_passkey` or `revoke_assistant_client`. On success writes `sensitive_action_authorised` (action, grant method, session); that row rolls back with the action if the action fails (documented, intended). Grants are reusable within their lifetime (≤ 5 minutes). |
| `step_up_attempts(id, owner_id, method, session_id, started_at, finished_at, outcome)` + `begin_step_up_attempt(_owner uuid, _method text, _session uuid DEFAULT NULL) RETURNS uuid` + `finish_step_up_attempt(_id uuid, _ok boolean)` | **Shared rate limit** (replaces the per-instance in-memory counter). RLS on, no table access for any client or service_role; functions `service_role` only. `begin` takes `pg_advisory_xact_lock(hashtextextended('public.step_up_attempts:'||owner,0))`, counts attempts of the owner (all methods) started in the last 15 minutes that failed **or are unfinished** (fail closed) and started after the owner's latest success; at ≥ 5 it writes `step_up_rate_limited` and **returns NULL** (not an exception, so the audit row survives; the server maps NULL to "Too many failed confirmations…"), otherwise inserts a pending attempt and returns its id. `finish` sets ok/fail once (a second finish raises); fail writes `step_up_failed`. Success keeps all rows as evidence. |
| `security_events(id, seq, owner_id, event, action, method, session_id, client_id, created_at, detail)` + `log_security_event(...)` | Append-only audit. Owner SELECTs own rows; no INSERT/UPDATE/DELETE for clients or service_role; RESTRICTIVE UPDATE/DELETE deny (section 9 list). Written only by SECURITY DEFINER functions through `log_security_event` (no client/service EXECUTE; `client_id` comes from the caller's claim, never a parameter) and the passkey trigger. Events: step_up_recorded, step_up_failed, step_up_rate_limited, sensitive_action_authorised, passkey_registered, passkey_removed, assistant_client_revoked. **Erasure:** kept by `delete_my_finance_data`, like `role_permission_audit`, `step_up_grants` and `step_up_attempts` (pending KK decision C13). |
| `is_assistant_session()` | `coalesce(auth.jwt()->>'client_id','') <> ''`. |
| `refuse_assistant_session(_action)` | Raises `ASSISTANT_READ_ONLY: <action>` (42501) for assistant sessions. |
| `revoked_assistant_clients(owner_id, client_id, revoked_at)` + `revoke_assistant_client(_client_id)` | Step-up guarded revocation (writes `assistant_client_revoked`, detail.revoked_client_id); clients SELECT own rows only and cannot un-revoke. |
| `assistant_client_revoked(_owner)`, `refuse_revoked_assistant(_action)` | Definer helper used by policies: the session's client was revoked by the caller or by the row's owner. |
| `remove_device_passkey(_credential_id text)` | Resolved against the applied schema (0008: `credential_id text PRIMARY KEY`, **no id column; P4 adds none**). SECURITY DEFINER, step-up guarded (refuses assistants), deletes only `credential_id = _credential_id AND owner_id = auth.uid()`, requires exactly one row, otherwise raises `Passkey not found` (P0002) and nothing changes. Writes `passkey_removed`. A RESTRICTIVE policy refuses direct client DELETE. App: calls with `_credential_id`; falls back to the owner-only direct delete (requiring exactly one deleted row) **only** when the function is missing (today's production schema); any other error is shown. |
| Passkey registration (KK decision) | RESTRICTIVE INSERT policy "P4 passkey registration needs a fresh step-up" (`has_recent_step_up_for('register_passkey')`, so assistants never). Table UPDATE revoked from PUBLIC/anon/authenticated and `UPDATE (counter)` granted to authenticated (saved original ACL in `security_p4.saved_acl` for the rollback): unlock/step-up counter updates keep working; `credential_id`, `public_key`, `owner_id` can't be replaced in place. BEFORE UPDATE trigger `p4_passkey_counter_monotonic` → `guard_device_passkey_update()` (every role, including service_role and the table owner) refuses `NEW.counter < OLD.counter` (`PASSKEY_COUNTER_REGRESSION`, 42501) and any change of `owner_id`/`credential_id`/`public_key` (`PASSKEY_IMMUTABLE`, 42501); equal or higher counters pass. AFTER INSERT trigger `p4_passkey_registered_audit` → `log_passkey_registered()` writes `passkey_registered` with the grant's method. Server "register" options/verify refuse with `STEP_UP_REQUIRED: register_passkey` unless the caller's `has_recent_step_up_for` is true (unchanged when the function is missing). Trusted methods: passkey, password, or emailed one-time code (`email_otp`, scope `credential`, authorises registration only) for accounts without a password. |
| Policies on **every** RLS table in public (73 after P4) and on `storage.objects` | RESTRICTIVE, `TO anon, authenticated`: "P4 assistants cannot insert/update/delete" (`NOT is_assistant_session()`), "P4 revoked assistants cannot read" (`NOT is_assistant_session() OR NOT assistant_client_revoked(<owner column>)`). Owner column, first match: owner_id, employee_id, user_id, workspace_owner_id. Tables without one (access_role_permissions, department_budgets, expense_history, job_state, market_quotes, profiles, regulatory_changes, regulatory_snapshots, role_permission_audit, role_permissions) get the write denial and caller-only read revocation. No table is skipped (every public table has RLS). Storage files use the path's first segment as owner. |
| Audit append-only | RESTRICTIVE UPDATE/DELETE `USING (false)` on transaction_audit, role_permission_audit, access_grant_audit, period_close_evidence, imported_period_history, preference_approvals, security_events. Definer writers, cascades and `delete_my_finance_data` are unaffected (verified). |
| `security_p4.guarded_functions` + `security_p4.guard()` + `security_p4.saved_acl` | Private registry (name, argument types, mode, technique, original ACL) and the original `device_passkeys` ACL, used by the rollback. |

### 13.2 Guarded functions (same names, signatures, return types, SECURITY mode and grants)

- **Step-up** (`require_recent_step_up`): `grant_entity_access`, `revoke_entity_access`, `admin_set_member`, `admin_set_permission`, `delete_my_finance_data`, `restore_finance_backup`, `change_accounting_period` (every overload; one exists), `invite_access`, `accept_access`, `revoke_access`, `save_reviewed_preferences` **only when `_approved` is not false** (otherwise assistant-refusal only), plus the new `remove_device_passkey` and `revoke_assistant_client`. The fail-closed catalog check also exempts `require_recent_step_up` (now VOLATILE; it writes the authorisation event).
- **Assistant refusal** (every client-callable VOLATILE non-trigger function of 0088+P1+P2 not already step-up guarded; the test re-derives this list from `pg_proc`): `accept_family_invite`, `apply_review_metadata`, `archive_backup_period_history`, `bulk_category_change`, `cancel_transfer`, `commit_document_intake_reviewed`, `confirm_transfer`, `correct_financial_entries`, `decide_family_request`, `finance_operation`, `finish_my_report_job`, `link_activity_expenses`, `manage_trip_expenses`, `move_expense_category`, `post_opening_balances`, `receive_claim_receipt`, `retry_my_report_job`, `review_statement_evidence`, `revise_import_rows`, `save_claim_preparation`, `save_import_balance_review`, `start_demo_workspace`, `undo_category_change`, `undo_financial_correction`, `undo_opening_balances`, `undo_review_metadata`.
- **Revoked-assistant refusal** for row-returning definer readers that bypass RLS: `admin_team`, `my_access_invites`, `my_family_invites`, `my_shared_companies`, `team_company_tax`, `team_names`.
- **Technique.** SECURITY DEFINER originals are renamed to `<name>__unguarded` (EXECUTE revoked from PUBLIC, anon, authenticated) and replaced by a definer wrapper that runs the check and delegates. **SECURITY INVOKER originals** (`restore_finance_backup`, `finance_operation`, `move_expense_category`, `receive_claim_receipt`, `save_import_balance_review`) cannot use a delegating wrapper: a definer wrapper would run the body as table owner and bypass RLS, and an invoker wrapper cannot call a copy clients may not execute. They are still renamed to `__unguarded` (clients lose EXECUTE; kept for rollback), and the public name is re-created from the original definition with the check inserted as the first body statement, keeping INVOKER and RLS. P4 refuses to wrap a function that a policy/trigger/view references by oid, and aborts if any unreviewed client-callable writer remains (fail closed on an unexpected hosted catalog).

### 13.3 Order

0000–0088 → P1 → P2 → **P4** → (optional, separate approval) P4b. Rollback: P4b rollback (after deactivating the hook) → **P4 rollback** → P2 rollback (refuses while P4 is installed) → P1 rollback.

### 13.4 Effects

- Normal signed-in users: no change except that the listed sensitive actions need a passkey/password re-confirmation at most 5 minutes old **from the same auth session** (the app retries once after `STEP_UP_REQUIRED`), adding a passkey needs a fresh passkey/password/emailed-code confirmation, and 5 failed confirmations in 15 minutes lock step-up for that account across all servers. PIN unlock never satisfies any of it.
- Assistant (OAuth `client_id`) sessions: read the user's own rows exactly as before; every table write, file write and wrapped RPC is refused; a revoked client loses reads on the next statement (also for another member's assistant using that client on the revoking owner's company rows).
- Data: no existing row value changes and no column is added to an existing table (count + md5 of every table identical, including `device_passkeys`).

### 13.5 Rollback steps

1. **KK approval.** Export `step_up_grants` and `revoked_assistant_clients` if needed.
2. Deactivate and roll back P4b if it was applied.
3. Run `P4_step_up_and_assistant_limits.rollback.sql` (one transaction): drops the P4 policies, drops each wrapper and renames `__unguarded` back (original oid and body), restores the saved EXECUTE grants, drops the passkey audit and counter triggers, restores `device_passkeys` table-level UPDATE from the saved ACL (and removes the column grant), drops the P4 functions and the `security_p4` schema, and **moves** the four P4 tables (`step_up_grants`, `revoked_assistant_clients`, `step_up_attempts`, `security_events`) to `security_rollback_archive.<name>_<UTC>` (no client or service_role access), so audit evidence is never silently dropped. Proven: the catalog (policies, function definitions and ACLs, triggers, indexes, columns, table and column grants, RLS flags) equals P1+P2 exactly, all data is unchanged and the archived security_events rows are intact.
4. Effect: step-up and assistant limits stop being enforced (M-4 re-opens).

### 13.6 P4b (optional PostgREST hook)

`public.api_pre_request()` raises for non-GET/HEAD/OPTIONS requests from assistant sessions and for revoked clients. Activation is a separate statement (`ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.api_pre_request'; NOTIFY pgrst, 'reload config';`), **not** run by the file. Unverified on hosted: whether Lovable Cloud allows the setting; PostgREST sends RPC as POST, so assistant read RPCs would need GET (check `src/lib/mcp/` first). P4 does not depend on it.

### 13.7 Hosted pre-checks (read-only; each **requires KK approval**)

| ID | Purpose | Query / action |
|---|---|---|
| H-P4-1 | P4 not present; function list matches §13.2 | `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('record_step_up','is_assistant_session') OR proname LIKE '%\_\_unguarded';` and `SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.provolatile='v' AND p.prorettype<>'trigger'::regtype AND has_function_privilege('authenticated',p.oid,'EXECUTE') ORDER BY 1;` |
| H-P4-2 | Assistant tokens carry `client_id`; first-party tokens do not | Decode one MCP access token and one app session token on a **draft** (no production data) |
| H-P4-3 | Definer owner bypasses RLS (wrappers, `remove_device_passkey`, erasure) | `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('postgres','supabase_admin');` |
| H-P4-4 | No other object depends on a guarded function by oid | `SELECT classid::regclass, objid FROM pg_depend WHERE refclassid='pg_proc'::regclass AND refobjid IN (SELECT oid FROM pg_proc WHERE proname IN (...§13.2...)) AND deptype='n';` |
| H-P4-5 | `regexp_instr` available (PostgreSQL ≥ 15) | `SHOW server_version;` |
| H-P4-6 | Policy cost on large tables | `EXPLAIN` a 1,000-row expenses read as a test user on a **draft** |
| H-P4-7 | First-party access tokens carry `session_id` (grant binding) and server functions see it in `context.claims` | Decode one app session token on a **draft**; note `session_id` and `amr` |
| H-P4-8 | Email one-time code for a Google-only account: `signInWithOtp({shouldCreateUser:false})` sends a **code** (email template contains `{{ .Token }}`), `verifyOtp({type:'email'})` returns the same user, local sign-out leaves the person's session intact | Draft project with a test Google-only account; no production data |
| H-P4-9 | `hashtextextended` and `pg_advisory_xact_lock` available to the definer; concurrent begins from two connections never exceed 5 | `SELECT hashtextextended('x',0);` and a two-connection script on a **draft** |

### 13.8 Tests (actually run)

`src/lib/security-phase1-sql.test.ts`, 72 tests: H-1a–f, H-2, H-3a/b, M-1a/b, M-2 and M-4 reproduce at 0088 and are blocked after P1+P2+P4 (26); legacy editor/viewer action matrix identical at 0088/P1/P1+P2/P1+P2+P4 and no escalation (4); each of the 13 guarded functions refuses without step-up, works after `record_step_up`, refuses after expiry and for an assistant session with a fresh grant, plus natural 1-second expiry, approval-only preference guard, service-role-only `record_step_up` (PIN and scope checks), and wrapper signature/grant identity with clients unable to execute `__unguarded` (17); assistant sessions read own rows, every table/file write and every wrapped RPC refused, catalog coverage of every table (including the new P4 tables), revocation immediate, P4b behaviour (7); audit tables append-only even under a hypothetical permissive policy, erasure still works (7); normal flows: own CRUD, finance_operation reimbursement with replay, bulk category change + undo, transfer confirm + cancel, company grant/revoke with step-up and editor upload, family flow, demo guest, passkeys (registration needs step-up, counter update without one, no in-place key replacement, direct delete refused, `remove_device_passkey(credential_id)` owner-only) (6); erasure (security_events/step_up_attempts kept) and same/cross-account restore via `prepareRestore` with step-up (3); data preservation and exact rollback P4 → P2 → P1 including column grants, four tables archived with their security_events rows, re-apply (1).

`src/lib/security-phase1-e2e.test.ts`, 20 tests, real `@simplewebauthn/server` verification with a node:crypto P-256 software authenticator registered through the app's own register path (stored key = base64 COSE, the app's encoding): registration refused without a grant (server and, independently, the database policy), with an expired grant, another session's or another user's grant and for assistants; allowed with password, emailed-code and passkey grants, each audited; an emailed-code grant never authorises erasure, sharing, passkey removal or assistant revocation; unlock counter updates without a grant; PIN refused everywhere; (i) passkey step-up → session-bound grant → `remove_device_passkey`, `revoke_assistant_client`, `delete_my_finance_data` succeed; (ii) grant expiry and expired (consumed) challenge refused; (iii) assertion replay, stale assertion after a new challenge, unlock challenge used for step-up, counter regression, other session/user/no-session grants refused; (iv) another user's credential refused (RLS and owner check), cannot remove another user's passkey, assistants refused at options/verify/password/RPC; (v) exact security_events sequence, rolled back on failure, owner-only visibility, no client/service writes; (vi) password path with the real limiter: 5 wrong across limiter instances → lock-out, window expiry, session-bound success; shared limiter: passkey and email failures share the count, 12 concurrent begins → exactly 5 attempts, unfinished attempts count, success re-opens with history kept, double finish refused, clients/anon/service_role cannot touch attempts or call the functions; fallback to the in-memory limiter and `recorded:false` on P1+P2 only (today's schema); 40 consecutive 300-second grants each last exactly 300 s; session binding and the `remove_device_passkey` matrix.

The e2e counter test also proves a client and the table owner cannot lower the counter or rewrite a stored key, while equal/higher values and normal unlock increments work.

Component tests: `src/components/StepUpHost.test.tsx` (7: emailed code only for `register_passkey`; password only for accounts with an email identity and passkey only when one exists, with guidance when neither applies; code send/verify through the server functions; wrong code/password shows an error and does not settle; Cancel resolves false without server calls; the PIN is never offered) and `src/components/AuthFaceIdOffer.test.tsx` (4: on /auth, accepting the offer opens the confirmation, registration starts only after the password grant; Cancel marks "later" and registers nothing; declining keeps today's behaviour; no dialog on the remembered-account screen).

Also `src/lib/security-phase1-independent.test.ts` (1), `src/lib/step-up-server.test.ts`, `src/lib/step-up.test.ts`, `src/lib/step-up-check.test.ts`, `src/components/DeviceSecurity.test.tsx`.

Command: `bunx vitest run src/lib/security-phase1-sql.test.ts src/lib/security-phase1-e2e.test.ts src/lib/security-phase1-independent.test.ts src/lib/security-proposed-sql.test.ts src/lib/security-proposed-restore-sql.test.ts src/components/DeviceSecurity.test.tsx src/lib/step-up-server.test.ts src/lib/step-up.test.ts` — results in the Phase 1 report (3 consecutive runs). PGlite runs one connection, so the concurrency test proves the counting rule under interleaved calls; true multi-connection behaviour relies on the advisory lock and is hosted pre-check H-P4-9.

### 13.9 Residual risks

- **Client-side exports** (CSV/PDF/Excel built in the browser from readable rows) cannot be step-up enforced by the database; only server actions can.
- **Passkey registration** now needs a fresh step-up in the database (closed). Remaining: an emailed code proves control of the mailbox, so someone holding a stolen session **and** the person's email can add a passkey (then use it for step-up); this is KK's chosen trusted method for password-less accounts.
- **Unbound grants:** a grant recorded without `_session` (older server code, or a token without `session_id`) authorises every session of the owner for its ≤ 5-minute life. Current server code always passes the claim when present (hosted check H-P4-7).
- **Rate-limit lock-out is per owner:** someone holding a session can lock the real person out of step-up for 15 minutes (fail closed by design). `step_up_attempts` and `security_events` are not pruned yet.
- **Audit meaning:** `sensitive_action_authorised` records that the check passed; a client holding a fresh grant can call `require_recent_step_up` directly for a registered action name, which writes that row without performing the action. The row never claims completion.
- **Signature counter:** closed: the counter can only stay equal or increase (trigger, every role). A stolen session can still raise it, which only makes the real authenticator's next assertion fail the regression check (denial, not bypass).
- **/auth Face ID offer:** closed: /auth mounts a `StepUpHost` only while the post-sign-in offer runs (after a server-validated `getUser`, never on the remembered-account screen), so accepting asks for confirmation and registers only after a grant; cancelling marks the offer "later" as before.
- **Definer readers** are refused only for *revoked* assistants; a non-revoked assistant can still call them (read-only).
- **P4b hook unverified on hosted**; without it, assistant RPC calls to non-wrapped STABLE readers are still allowed (they are read-only).
- **Revocation does not revoke the OAuth token** at the managed auth server; the database refuses it, and the token still expires normally.
- **New tables/functions added later** are not covered automatically; the P4 fail-closed check only runs when P4 is applied. Future migrations must add the four assistant policies and wrap new writers.
- `step_up_grants` rows are not pruned (small; a later housekeeping job may delete rows expired for > 30 days).
- PGlite is not Supabase (§10).
