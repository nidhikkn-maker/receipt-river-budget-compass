# Migration proposal for staged SQL (2026-11-09)

> **Nothing has been applied.** No database was touched: not Lovable Cloud, not Live, not any hosted draft. No existing migration was edited and nothing was committed or pushed. The only evidence comes from reading the repository, running the existing local PGlite tests, and running a scratch replay of `drizzle/migrations/0000–0088` in an in-memory PGlite database (method below). Every "Proposed migration" here is a proposal for KK to approve or reject.

Scope: the 14 files in `.lovable/staged-sql/` plus `scripts/accounting-foundation.sql`. Two more staged-only files turned up and are listed in the appendix, but they were not reviewed in depth: `.lovable/period-authority.sql` and `scripts/accounting-close-guard.sql`.

## Method and limits

1. **Object and body comparison.** A scratch script pulled every `CREATE [OR REPLACE] FUNCTION` out of each staged file and compared it with the *latest* definition of the same name across `drizzle/migrations` (in file order). Before comparing, it stripped comments and whitespace. Tables, policies, triggers and grants were compared by name and then by normalised statement text.
2. **Full-chain replay (scratch, not committed).** All 89 migrations (0000–0088) were applied in order to an in-memory PGlite database. Minimal Supabase stand-ins were used: `auth.users`, `auth.uid()`/`auth.jwt()`, `storage.objects` with `owner_id text`, `storage.foldername`, and the roles `anon`, `authenticated` and `service_role`. **All 89 applied without error.** Each staged file was then executed inside `BEGIN … ROLLBACK`. Runtime scenarios S1–S9 (cited below) then ran against that replayed schema. These stand-ins are not the real Supabase `auth`/`storage` schemas, so hosted behaviour (storage API, PostgREST overload resolution, grants that Supabase sets by default) is **not verified**.
3. **Existing tests.** 19 test files ran with `bunx vitest run …`: **122/122 passed** (counts per file below). Most of these tests run a staged file against a small hand-built fixture schema, not against the real migration chain.
4. **Not verified:** the actual state of the Live or Cloud database. "Applied" means "present in `drizzle/migrations` 0000–0088", per the task statement. Also not verified: how Lovable applies drizzle migrations, including whether a file runs as one transaction and whether `meta/_journal.json` and snapshots must be added by hand.

## Status at a glance

| # | Staged file | Status vs 0000–0088 | Executes cleanly today? | Recommendation |
|---|---|---|---|---|
| 1 | `entity-access.sql` | **Fully applied**: identical to 0075 | Yes, as a no-op re-run | Discard (superseded by 0075) |
| 2 | `entity-member-uploads.sql` | **Fully applied**: identical to 0078 | Yes, as a no-op (re-creates the 0078 policies) | Discard (superseded by 0078); the policy it creates is replaced by #9 |
| 3 | `intake-server-approval.sql` | **Fully applied**: function body identical to 0079 | Yes, as a no-op | Discard (superseded by 0079) |
| 4 | `closed_gst_amendments.sql` | **Fully applied**: body semantically identical to 0081 (formatting only) | **No**: `trigger "guard_closed_gst_amendments" … already exists` | Discard (superseded by 0081) |
| 5 | `v5.12-transfer-safeguards.sql` | **Fully applied**: both bodies and grants identical to 0049 | Yes, as a no-op | Discard (superseded by 0049) |
| 6 | `period-recovery-authority.sql` | **Fully applied, and partly outdated** (0072 + 0073; `change_accounting_period` later replaced by 0084) | **No**: `relation "imported_period_history" already exists` | **Discard**. Dangerous if run statement by statement (S1) |
| 7 | `typed-intake.sql` | **Applied, then outdated** (0074; then 0079 and 0085) | **No**: `function "validate_intake_records" already exists` | **Discard**. Dangerous if run statement by statement (removes the 0079 approval check) |
| 8 | `reviewed_preferences.sql` | **Partially applied**: table, `save_reviewed_preferences` and `sensitive_preference_sections` are in 0080 (the last one was updated by 0082). **Not applied:** the `guard_preference_approval` trigger and the DO-block rewrite of `restore_finance_backup` | **No**: `relation "preference_approvals" already exists` | **Rewrite** as a trigger-only migration, with a fix for restoring into an account that has no preferences row (S9) |
| 9 | `company-bound-uploads.sql` | **Not applied** | Yes (rolled back) | Propose (0089), merged with #10 |
| 10 | `document-storage-boundary.sql` | **Not applied** | **No** on its own: `function public.is_unlinked_company_file(text) does not exist` (needs #9 first) | Propose, merged into 0089 after #9 |
| 11 | `report-history-versions.sql` | **Not applied** | Yes | Propose (0090) |
| 12 | `statement-atomic-undo.sql` | **Not applied** | Yes | Propose (0091) |
| 13 | `budget-merchant-authority.sql` | **Not applied** | Yes | **Rewrite** before proposing: it breaks backup restore (S8) |
| 14 | `category-merge.sql` | **Not applied** | Yes | **Rewrite or defer**: takes a table-wide `LOCK TABLE` across all tenants; no app code calls it |
| 15 | `scripts/accounting-foundation.sql` | **Not applied** | Yes | **Rewrite or defer**: blocks confirmed data deletion (S4) and backup restore (S5) |

---

## Per-file analysis

### 1. `entity-access.sql`: company-level sharing (owner plus per-company grants)

1. **Status: fully applied.** After normalisation (comments stripped) the whole file is identical to `0075_entity_level_access.sql`. That covers the `documents.entity_id` column and index, the `entity_members` table, its policy, `can_access_entity`, `grant_entity_access`, `revoke_entity_access`, and the policies "Entity members read documents" and "Entity members read document files". Every statement uses `IF NOT EXISTS`, `OR REPLACE` or `DROP … IF EXISTS`, so a re-run is a no-op. No conflicts.
2. **What it does / callers.** Lets an owner grant a verified account read or edit access to one company (entity). Callers: `src/components/books/CompanyAccess.tsx` (via `grant_entity_access`). `my_shared_companies` (0077) and the policies in 0076 and 0078 build on it.
3. **Dependencies.** `auth.users`, `finance_preferences.data.entities`, `documents`, `storage.objects`. Required by #2, #9, #10 and #15.
4. **Security (already live).** All three functions are `SECURITY DEFINER` with `search_path=public`, check `auth.uid()`, have EXECUTE revoked from `public` and `anon`, and are granted to `authenticated`. `grant_entity_access` can be used to test whether an email belongs to a verified account. That is inherent in invite-by-email and is already live.
5. **Tests.** `src/lib/books/entity-access-sql.test.ts` (7/7 pass) runs 0075, not the staged file.
6. **Rollback.** Not applicable (nothing new). Rolling back 0075 itself would cascade to 0076–0078 and is not proposed.
7. **Recommendation: discard as superseded by 0075.**

### 2. `entity-member-uploads.sql`: company editors add documents and files

1. **Status: fully applied.** Identical to `0078_entity_member_uploads.sql`. It creates the policies "Entity editors add company documents" (INSERT on `documents`) and "Entity editors upload document files" (INSERT on `storage.objects`).
2. **Callers.** `CompanyAccess.tsx` → `uploadCompanyDocument` (`src/lib/books/company-upload.ts`).
3. **Dependencies.** #1 (0075).
4. **Security (live today).** The live 0078 storage INSERT policy is **broader than intended**. Any member with an active edit grant on *any* company of an owner may upload to *any path* under that owner's prefix. That includes `<owner>/docs/…` and personal receipt paths, because the storage row carries no company tag. It does not check `storage.objects.owner_id` either. #9 narrows this. **Re-running this staged file after #9 would quietly reinstate the broad policy.**
5. **Tests.** `src/lib/books/entity-upload-sql.test.ts` (6/6 pass, runs 0075 and 0078).
6. **Rollback.** Not applicable.
7. **Recommendation: discard as superseded by 0078.** Delete or archive it so nobody re-runs it after 0089.

### 3. `intake-server-approval.sql`: document intake must match an approved attempt

1. **Status: fully applied.** `commit_document_intake_reviewed` is identical to `0079_intake_server_approval.sql`, apart from comments.
2. **Callers.** `src/lib/store.tsx` (document intake), browser test `scripts/browser/test_document_intake_recovery.py`.
3. **Dependencies.** 0071 (`document_intake_commits`, revision trigger), 0074/0085 (`validate_intake_records`), 0059 (`document_runs`).
4. **Security (live).** `SECURITY DEFINER`, `search_path=public`, checks `auth.uid()`, revoked from `PUBLIC` and `anon`. Note that `document_runs` is directly writable by its owner (0059: `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`, policy "Owners manage their document runs"). The "approved attempt" check therefore guards owner integrity against a buggy or stale client. It is **not** a boundary against the owner's own token.
5. **Tests.** `intake-revision-sql.test.ts` (9/9), `typed-intake-sql.test.ts` (9/9).
6. **Rollback.** Not applicable.
7. **Recommendation: discard as superseded by 0079.**

### 4. `closed_gst_amendments.sql`: no open-dated replacement of a closed-period GST invoice

1. **Status: fully applied.** The function body matches `0081_closed_gst_amendment_guard.sql` apart from line breaks and one comment. Executing the file fails on `CREATE TRIGGER` because the trigger already exists. Because the file runs `CREATE OR REPLACE FUNCTION` first, a statement-by-statement run would rewrite an identical body (harmless).
2. **What it does / callers.** A BEFORE UPDATE trigger on `finance_preferences`. It refuses amendments (`amendsId`) that target an invoice dated in a closed period, and refuses removing or retargeting a replacement that affects a closed period. There is no RPC. The client reaches it through any write to preferences.
3. **Dependencies.** `books.closedPeriods` (0070/0072 authority).
4. **Security.** `SECURITY DEFINER`, honours `ledgerline.erasing`. No grants needed.
5. **Tests.** `src/lib/books/closed-gst-amendments-sql.test.ts` (5/5 pass). It runs the **staged** file, which is equivalent to 0081.
6. **Rollback.** Not applicable (0081 already live).
7. **Recommendation: discard as superseded by 0081.** Optionally point the test at 0081 so it covers the migration that is actually applied.

### 5. `v5.12-transfer-safeguards.sql`: owner-scoped transfer confirm and cancel

1. **Status: fully applied.** The `confirm_transfer` and `cancel_transfer` bodies, the REVOKEs and the GRANTs are identical to `0049_harden_transfer_approval_and_undo.sql`.
2. **Callers.** `src/lib/store.tsx`.
3. **Dependencies.** 0047 (`transfer_links`).
4. **Security (live).** `SECURITY DEFINER`, `search_path=public`, checks `auth.uid()`, uses an owner advisory lock, revoked from `PUBLIC` and `anon`.
5. **Tests.** `src/lib/transfer-rpc-sql.test.ts` (21/21 pass, runs 0047 and 0049).
6. **Rollback.** Not applicable.
7. **Recommendation: discard as superseded by 0049.**

### 6. `period-recovery-authority.sql`: backup restore keeps closures; only Audit closes or reopens

1. **Status: fully applied, and partly outdated.**
   - `imported_period_history` table and policy, `archive_backup_period_history`, `restore_finance_backup`, `period_operation_authority`: identical to **0072**.
   - `require_period_operation`: identical to the **0073** body (0073 replaced the 0072 body).
   - `change_accounting_period(uuid,text,text,date,date,text,jsonb)` (7 arguments): this is the **0072** version. **0084 dropped it** and created an 8-argument version with `_figures jsonb DEFAULT NULL`.
   - **Conflict, verified in S1:** if the file is executed statement by statement (non-atomically), the `CREATE TABLE`/`CREATE FUNCTION`/`CREATE TRIGGER` statements fail, but `CREATE OR REPLACE FUNCTION change_accounting_period(… 7 args)` succeeds. That leaves **two overloads**. A 7-argument call then fails with `function public.change_accounting_period(uuid, unknown, …, jsonb) is not unique`. `src/routes/_authenticated/audit.tsx` sends `_figures` only when figures exist, so period close or reopen calls without figures would break. It would also drop the 0084 figure snapshot from any close made through the old overload.
2. **Callers.** `audit.tsx` (`change_accounting_period`), `src/lib/backup.ts` and `PeriodEvidence.tsx` (`imported_period_history`), `scripts/browser/test_period_recovery.py`.
3. **Dependencies.** 0070 (`period_close_evidence`), 0069.
4. **Security (live).** `restore_finance_backup` is `SECURITY INVOKER` (RLS applies) and owner-forces every row. `archive_backup_period_history` and `change_accounting_period` are `SECURITY DEFINER` with `auth.uid()` checks, revoked from `PUBLIC` and `anon`. `period_operation_authority` has RLS on, no policies, and is granted only to `service_role`.
5. **Tests.** `period-recovery-sql.test.ts` (8/8), `period-figures-sql.test.ts` (4/4), `period-evidence-sql.test.ts` (7/7), `period-authority-sql.test.ts` (3/3; runs `.lovable/period-authority.sql`). All pass.
6. **Rollback.** Not applicable. If someone runs it by mistake: `DROP FUNCTION IF EXISTS public.change_accounting_period(uuid,text,text,date,date,text,jsonb);` (the 8-argument version from 0084 stays).
7. **Recommendation: discard as superseded by 0072, 0073 and 0084.** It should be removed from `staged-sql/` because it is a hazard.

### 7. `typed-intake.sql`: typed validation of document-intake records

1. **Status: applied, then outdated.** The original is 0074. `commit_document_intake_reviewed` was replaced by **0079**, which adds the approved-attempt check. `validate_intake_records` was replaced by **0085**, which adds nested `fyRecords` schedule, filed-return and version validation. The staged file lacks both. Executing it fails immediately (`CREATE FUNCTION` on an existing function).
   - **Conflict and hazard:** if run statement by statement, the `CREATE OR REPLACE FUNCTION commit_document_intake_reviewed` would **remove the 0079 server-approval check**. That is a security and integrity regression.
2. **Callers.** `store.tsx`. Tests: `register-workflow-persistence.test.tsx`, `asset-document-persistence.test.tsx`.
3. **Dependencies.** 0071, 0059.
4. **Security.** As for #3. `validate_intake_records` is `SECURITY INVOKER`, revoked from `PUBLIC`, `anon` and `authenticated`, and is only called inside the definer function.
5. **Tests.** `typed-intake-sql.test.ts` (9/9; runs 0071, 0074, 0079 and 0085, not the staged file).
6. **Rollback.** Not applicable.
7. **Recommendation: discard as superseded.** Remove it from `staged-sql/`.

### 8. `reviewed_preferences.sql`: financially sensitive preference sections need a reviewed approval

1. **Status: partially applied.**
   - Applied in **0080**: `preference_approvals` (identical table and policy) and `save_reviewed_preferences` (identical).
   - `sensitive_preference_sections`: the staged copy is the **0080** list. **0082 added `books.gstAdvances`**. The staged `CREATE FUNCTION` would fail, so it cannot regress the function, but the file is out of date.
   - **Not applied:** the `guard_preference_approval()` function and trigger (BEFORE INSERT OR UPDATE on `finance_preferences`), and the DO block. The DO block rewrites `restore_finance_backup` so that its UPDATE branch calls `save_reviewed_preferences(gen_random_uuid(), r->'data', <current revision>, true)`. It refuses to run if the 0072 statement text is not found.
   - Verified in S2: on the replayed chain, the trigger plus the DO block install cleanly, the rewrite finds the 0072 text, and `gstAdvances` is still sensitive (via 0082).
   - **Conflict, verified in S9:** the DO block rewrites only the *UPDATE* branch. When the owner has **no `finance_preferences` row**, `restore_finance_backup` takes the dynamic `INSERT … ON CONFLICT` branch. The guard then refuses any backup containing sensitive sections ("Financial registers and sensitive settings must be saved through a reviewed approval"). With an existing row, the restore succeeds. Not verified: whether the app always creates a preferences row before a restore.
   - `docs/OPEN_BLOCKERS.md` records the activation hold: "the current published client still writes preferences directly". Installing the trigger before publishing a compatible client would break saves for the published client.
2. **Callers.** `src/lib/store.tsx` `savePreferences` → `save_reviewed_preferences` (already live). The trigger itself has no caller; it enforces on every write. `src/lib/statement-pipeline/history-persistence.test.ts` and `market-workflow-persistence.test.tsx` exercise the RPC.
3. **Dependencies.** 0080, 0082, 0072 (`restore_finance_backup` text), 0059 (`document_runs` exemption). Every other BEFORE trigger on `finance_preferences` runs in alphabetical order (S3): `bump_preferences_revision`, `guard_books_freeze`, `guard_books_registers`, `guard_budget_merchant_authority` (if #13 is installed), `guard_closed_gst_amendments`, `guard_journals_rules`, `guard_preference_approval`, `require_period_operation`.
4. **Security.** This **tightens** writes: sensitive sections become writable only through an approval row in the same transaction, a matching document run, or erasure. `guard_preference_approval` is `SECURITY DEFINER` with `search_path=public`. Caveats:
   - The document-run exemption can be satisfied by the owner, because `document_runs` is owner-writable. This is an integrity control, not an access boundary.
   - The rewritten restore passes `_approved = true` automatically, so a confirmed restore counts as approval. That is consistent with the in-app typed confirmation, but it should be stated explicitly in the approval.
5. **Tests.** `src/lib/books/preference-approval-sql.test.ts` (8/8 pass). It runs the **whole staged file** on a fixture schema, so it covers neither the INSERT-branch restore nor the real chain. Still needed:
   - a test of a restore into an account with no preferences row;
   - a test on the full 0000–0088 chain;
   - a check of every SECURITY DEFINER writer of `finance_preferences` against the guard. From the migrations, these writers are 0015 claim/irregular confirmations, 0040, 0060 (`commit_document_intake`, EXECUTE revoked in 0071), 0070/0072/0084 period operations, 0071/0074/0079 intake, 0080. Of these, only 0015 and the period operations are covered by the test file's matrix.
6. **Rollback (trigger-only migration).**
   ```sql
   DROP TRIGGER IF EXISTS guard_preference_approval ON public.finance_preferences;
   DROP FUNCTION IF EXISTS public.guard_preference_approval();
   -- Restore restore_finance_backup: re-run the CREATE OR REPLACE FUNCTION public.restore_finance_backup(jsonb,text)
   -- block from drizzle/migrations/0072_period_recovery_authority.sql (lines 9–37, with REVOKE/GRANT lines 36–37).
   ```
   Data: rows in `preference_approvals` are audit records. Keep them.
7. **Recommendation: rewrite** as a new migration containing *only* the trigger, the guard function and the restore rewrite. Do not include the CREATE TABLE or function statements already in 0080 and 0082. Also fix the INSERT branch: route the no-row case through `save_reviewed_preferences` too, or make the guard accept a same-transaction approval with `expected_revision IS NULL`. Install only after a compatible client is published (OPEN_BLOCKERS). Proposed number **0094** (last, after #13).

### 9. `company-bound-uploads.sql`: company uploads bound to `owner/companies/<entity-hex>/<file>`

1. **Status: not applied.** None of `can_upload_company_file`, `is_unlinked_company_file`, `guard_company_document_path` or the two new storage policies exist in 0000–0088. It **replaces** the 0078 policy "Entity editors upload document files". It applies cleanly on the replayed chain.
2. **What it does.**
   - Member uploads must use exactly `<owner>/companies/<hex(entity_id)>/<safe-name>`, set `storage.objects.owner_id = auth.uid()`, and hold an active edit grant on a company that still exists.
   - Members may read and delete their own *unlinked* (not yet referenced) uploads, so a failed metadata save can clean up.
   - A `documents` trigger stops non-owners writing rows that point outside their company namespace, changing owner or company, or replacing `file_path`.
   - **Callers:** `src/lib/books/company-upload.ts` (`companyFilePrefix`, `uploadCompanyDocument`, which already builds the new path shape), used by `CompanyAccess.tsx`.
   - **Current client behaviour:** the upload succeeds today because the 0078 policy is broad. The cleanup `remove` after a failed save **fails** today, because members have no DELETE policy, so unreferenced uploads are retained ("…could not be removed. Ask the company owner…").
3. **Dependencies.** 0075 (`entity_members`, `can_access_entity`, `documents.entity_id`), 0078 (the policy it replaces), and a Supabase `storage.objects.owner_id` text column (present in current Supabase storage; not verified on the hosted project). **#10 depends on this file.**
4. **Security.**
   - **Tightens** member INSERT: it now requires an exact company namespace and an owner match.
   - **Adds** member SELECT and DELETE, limited to unlinked files in that member's grant namespace that they own.
   - `can_upload_company_file` and `is_unlinked_company_file` are `SECURITY DEFINER`, `search_path=public`, `auth.uid()`-based, revoked from `public` and `anon`, granted to `authenticated` (S7). Through `documents`, `is_unlinked_company_file` reveals whether a path is referenced, but only for paths the caller may upload to.
   - `guard_company_document_path` is `SECURITY INVOKER`. It is skipped when `auth.uid()` is NULL (service role) or when the caller is the owner.
5. **Tests.** `src/lib/books/company-upload-workflow.test.ts` (7/7 pass; runs 0075, 0078 and this file, plus the 0066 team policy and #10). Still needed: a hosted check of Supabase storage `upload`/`remove` (see OPEN_BLOCKERS: "Company-member grant/revoke on hosted storage still depends on staged company-bound-uploads.sql"), and a test on the full chain.
6. **Rollback.**
   ```sql
   DROP POLICY IF EXISTS "DocuRepo originals require current document access" ON storage.objects; -- if #10 installed
   DROP TRIGGER IF EXISTS guard_company_document_path ON public.documents;
   DROP FUNCTION IF EXISTS public.guard_company_document_path();
   DROP POLICY IF EXISTS "Entity editors read own pending uploads" ON storage.objects;
   DROP POLICY IF EXISTS "Entity editors clean unlinked company uploads" ON storage.objects;
   DROP POLICY IF EXISTS "Entity editors upload document files" ON storage.objects;
   -- Re-create the 0078 version (drizzle/migrations/0078_entity_member_uploads.sql, lines 4–7).
   DROP FUNCTION IF EXISTS public.is_unlinked_company_file(text);
   DROP FUNCTION IF EXISTS public.can_upload_company_file(text);
   ```
   Data: none changed. Files uploaded under the new namespace stay; owners keep access through their own-prefix policies.
7. **Recommendation: propose** as **0089**, combined with #10 in one file so the dependency cannot be applied out of order. Needs KK's access-change approval and a compatible deployment (OPEN_BLOCKERS 18:40).

### 10. `document-storage-boundary.sql`: restrictive read policy for DocuRepo originals

1. **Status: not applied.** It fails on its own (`is_unlinked_company_file` missing) and applies cleanly after #9.
2. **What it does.** Adds a **RESTRICTIVE** SELECT policy on `storage.objects` for bucket `receipts`. A read is allowed only in one of these cases:
   - the caller's own prefix;
   - another owner's path that is outside `docs/` and `companies/` and not referenced by any `documents` row (e.g. team receipts);
   - a path referenced by a `documents` row the caller may read via `can_access_entity`;
   - the caller's own unlinked company upload.

   **Closes a live exposure:** the 0066 policy "Read team receipts" lets a team user with `view_receipts` read *every* object under an employee's prefix, including private DocuRepo originals at `<uid>/docs/…` (the path used by `store.tsx:809`). This applies only when team roles are in use; how widely they are used in production was not verified.
3. **Dependencies.** #9 (`is_unlinked_company_file`), 0075, 0066.
4. **Security.** Tightens reads across all permissive receipt policies at once (restrictive policies AND with them). Possible side effects:
   - It also restricts anything else that reads another owner's `receipts` objects under `docs/` or `companies/` without a `documents` grant. Owner, service-role and own-prefix reads are unaffected.
   - Performance: the policy subqueries `documents` by `file_path`, and **there is no index on `documents.file_path`** (only `(owner_id, created_at)`, `(owner_id, entity_id)` and `replaces_id`). Proposed addition: `CREATE INDEX IF NOT EXISTS documents_file_path_idx ON public.documents(file_path);`
5. **Tests.** `company-upload-workflow.test.ts`, case "permissive team receipt access cannot unlock private or other-company DocuRepo originals" (pass). Still needed: a hosted signed-URL check and an EXPLAIN on a realistic `documents` volume.
6. **Rollback.** `DROP POLICY IF EXISTS "DocuRepo originals require current document access" ON storage.objects;` No data changes.
7. **Recommendation: propose**, merged into **0089** after #9, plus the `file_path` index.

### 11. `report-history-versions.sql`: server-assigned report versions

1. **Status: not applied.** `report_history.version` already exists (0028, `integer NOT NULL DEFAULT 1`). It applies cleanly.
2. **What it does.** A BEFORE INSERT trigger takes a per-(owner, kind, period) advisory lock and assigns `version = max(version)+1`. Clients today send `version: prior+1` or `count+1`, which gives duplicates or gaps after deletions or concurrent saves. If the same `id` is retried with identical evidence, the trigger keeps the old version and lets the primary key reject the duplicate. If the `id` is reused with *different* evidence, it raises an error. **Callers whose client-sent versions it overrides:**
   - `src/lib/report-jobs.server.ts:120` (`version: (prior.count ?? 0) + 1`);
   - `src/routes/_authenticated/report-centre.tsx:114` (`version: prior+1`);
   - other inserts in `ExpenditureReportBuilder.tsx`, `claim-preparations.ts` and `InboxWork.tsx` (not inspected line by line).
3. **Dependencies.** 0028. Independent of the other staged files.
4. **Security.** `SECURITY DEFINER`, `search_path=public`, revoked from `PUBLIC`, `anon` and `authenticated` (it is a trigger, so it cannot be called directly). It reads `report_history` by `id` across owners. A colliding UUID belonging to another owner would produce the message "already belongs to different evidence" (negligible leak). It does not change RLS.
5. **Tests.** `src/lib/books/report-history-versions.test.ts` (2/2 pass). Still needed: a concurrent-insert test (two sessions) and confirmation that the read-back logic in `report-jobs.server.ts` tolerates a version different from the one it sent.
6. **Rollback.** `DROP TRIGGER IF EXISTS assign_report_history_version ON public.report_history; DROP FUNCTION IF EXISTS public.assign_report_history_version();` Versions already assigned stay (cosmetic).
7. **Recommendation: propose** as **0090**. Low risk.

### 12. `statement-atomic-undo.sql`: atomic Undo of a statement import

1. **Status: not applied.** It applies cleanly.
2. **What it does.** `undo_statement_rows(_id, _items)` locks the owner's accounts and expenses. It checks every row against an owner-read full snapshot and its `statement_ref`, refuses linked transfers, then deletes or un-reconciles all rows in one transaction and writes an idempotency receipt (`statement_undo_receipts`). **Caller:** `src/lib/statement-pipeline/atomic-undo.functions.ts` (`undoStatement` server function), already integrated. **It currently fails closed:** reading the missing `statement_undo_receipts` table errors with "Safe Undo is awaiting database release approval…", so Statement Desk Undo is unavailable today (OPEN_BLOCKERS 18:40). `scripts/check-statement-concurrency.py` also references it.
3. **Dependencies.** `expenses` (`statement_ref`, `reconciled_at`, `transfer_counterpart_of`: 0042/0047), `accounts`. Existing expense triggers still fire inside it (`guard_closed_period` 0058, `a_lock_period_owner` 0070, audit triggers), so closed-period rows abort the whole Undo, which is the intended behaviour.
4. **Security.** `SECURITY DEFINER`, `search_path=public`, refuses a NULL `auth.uid()`, scopes every statement to `employee_id = uid`, revoked from `PUBLIC` and `anon`. The new table has RLS with an owner SELECT policy only; `service_role` has ALL. It locks *all* of the owner's account and expense rows (owner-scoped, but heavy for large ledgers).
5. **Tests.** `src/lib/statement-pipeline/atomic-undo-integration.test.ts` (4/4 pass: success, lost response, mid-delete failure, stale revision). OPEN_BLOCKERS mentions "six independent-session disposable PostgreSQL cases" (`scripts/check-statement-concurrency.py`, not run here; it needs a real Postgres). Still needed: a full-chain test with closed-period rows, and a cleanup of the receipt table in `delete_my_finance_data` (see "Cross-cutting").
6. **Rollback.** `DROP FUNCTION IF EXISTS public.undo_statement_rows(uuid,jsonb); DROP TABLE IF EXISTS public.statement_undo_receipts;` Data: Undos already performed are not reversed by the rollback. Receipts are the only record that they happened, so export them before dropping. The client returns to the fail-closed state.
7. **Recommendation: propose** as **0091**, after KK's release approval.

### 13. `budget-merchant-authority.sql`: complete-budget allocation and append-only merchant history

1. **Status: not applied.** It applies cleanly.
2. **What it does.** A BEFORE INSERT/UPDATE trigger on `finance_preferences` does two things:
   - **Trips:** for any changed trip that promises `completeBudgetDimensions`, each dimension's allocation must sum (FX-adjusted for currency) to `trip.budget`.
   - **Merchants:** `merchantAliases` may change only together with exactly one appended `merchantGroupingHistory` event. The event's before/after must match, and its `entryIds` and `entrySnapshot` must equal the server-computed set of affected owner expenses (via `merchant_group_key`, a SQL port of `src/lib/intelligence.ts:227`). Reversals must restore exactly and refuse when later edits depend on the change.

   **Callers (writing the shapes it checks):**
   - `src/routes/_authenticated/patterns.tsx:82` (merchant review);
   - `src/components/trip/TripBudget.tsx`, `src/lib/trip-budget.ts` and `src/lib/travel.ts` (complete dimensions);
   - all go through `store.savePreferences` → `save_reviewed_preferences`.

   Today these rules are client-side only.
3. **Dependencies.** None on other staged files. Interacts with #8 (both are triggers on `finance_preferences`) and with `restore_finance_backup`.
4. **Security.** Integrity hardening; no RLS change. The trigger function is `SECURITY DEFINER`, revoked from `PUBLIC`, `anon` and `authenticated`. `merchant_group_key` is `SECURITY INVOKER`, IMMUTABLE, and keeps default EXECUTE for `anon` (harmless: a pure function).
5. **Conflicts (verified in S8):** **backup restore breaks.** Restoring a backup whose preferences contain two or more merchant-history events into an account with different or empty history fails with "Merchant history is append-only; review one change at a time". A cross-account or fresh-account restore of any user who has used merchant grouping more than once would therefore fail. The same applies to restoring older history over newer. Also:
   - **Not verified:** exact parity between the SQL and JS key functions for non-ASCII merchant names (PostgreSQL `\m`/`\M` versus JS `\b`).
   - Editing a legacy alias without a history event (e.g. from the old published client) would be refused, so a compatible client must be published first.
6. **Tests.** `src/lib/books/budget-merchant-authority.test.ts` (8/8 pass; runs 0080 and this file on a fixture). OPEN_BLOCKERS: owner-accepted isolated testing complete, production activation pending. Still needed: a restore-compatibility test, a JS/SQL key parity property test, and a full-chain run.
7. **Rollback.** `DROP TRIGGER IF EXISTS guard_budget_merchant_authority ON public.finance_preferences; DROP FUNCTION IF EXISTS public.guard_budget_merchant_authority(); DROP FUNCTION IF EXISTS public.merchant_group_key(text,jsonb);` No data changes.
8. **Recommendation: rewrite, then propose** as **0093**. Give the restore path an explicit, transaction-local authority, for example a `ledgerline.restoring` setting written only by `restore_finance_backup`, following the existing `ledgerline.erasing` pattern. While that setting is on, accept a wholesale history replacement and still validate trip allocations.

### 14. `category-merge.sql`: reviewed atomic category merge with Undo

1. **Status: not applied.** It applies cleanly. **The only current caller is the test.** The app uses `move_expense_category` (0007, `store.tsx:520`), so this file's functions would be dead code until a UI is built.
2. **What it does.**
   - `preview_category_merge` returns the owner's full ledger, commitments, budgets and preferences.
   - `commit_category_merge` recomputes the preview under locks, requires an exact match, moves the category on expenses (including allocations), commitments, monthly budgets (summed), scoped budgets and trip budget lines, and records before and after snapshots.
   - `undo_category_merge` restores category metadata only if nothing changed since.
3. **Dependencies.** `expenses.allocations` (0015), `commitments`, `category_budgets`, `finance_preferences.revision` (0071). Interacts with #13 (trip lines rewritten) and with closed-period triggers. The test confirms a closed-period refusal rolls the whole merge back.
4. **Security and operational concerns.**
   - `commit_category_merge` and `undo_category_merge` run `LOCK TABLE public.expenses, public.commitments, public.category_budgets IN SHARE ROW EXCLUSIVE MODE` as `SECURITY DEFINER`. That is a **table-wide lock across all tenants**, held while the full-ledger preview JSON is rebuilt. Any `authenticated` caller, including anonymous demo guests (they hold the `authenticated` role, and `requireRealAccount` gates server functions only, not RPCs), can take it repeatedly, even with an invalid preview, because the lock comes before validation. **That is a denial-of-service vector.**
   - Owner scoping is otherwise correct: `auth.uid()` everywhere, revoked from `PUBLIC` and `anon`.
   - `category_merge_operations` stores full ledger snapshots with no FK and no cleanup in `delete_my_finance_data`.
5. **Tests.** `src/lib/books/category-merge-sql.test.ts` (8/8 pass, fixture schema). Still needed: a concurrency and lock-contention test, a demo-guest denial test, and a full-chain test.
6. **Rollback.** `DROP FUNCTION IF EXISTS public.undo_category_merge(uuid); DROP FUNCTION IF EXISTS public.commit_category_merge(uuid,jsonb); DROP FUNCTION IF EXISTS public.preview_category_merge(text,text); DROP TABLE IF EXISTS public.category_merge_operations;` Data: completed merges stay merged. Dropping the table discards the only before-snapshots, so export them first.
7. **Recommendation: rewrite or defer.**
   - Replace `LOCK TABLE` with the owner advisory lock used elsewhere (`pg_advisory_xact_lock(hashtextextended(uid::text,0))`) plus row locks, and detect new rows through owner revision counters.
   - Refuse anonymous (demo) JWTs.
   - Add cleanup on erasure.
   - Propose only together with a UI (no number assigned now).

### 15. `scripts/accounting-foundation.sql`: double-entry journals, accountant review grants

1. **Status: not applied.** No object exists in 0000–0088. It applies cleanly (S3/S7). The column and constraint references it relies on exist: `expenses.receipt_details` (0007), `adjustment_sign` (0010), `scope` (0002), `entity_id`/`entity_source` (0065), `documents.entity_id` (0075), `documents.evidence_locked`. PL/pgSQL bodies are only checked when they run.
2. **What it does.**
   - Tables `accounting_review_grants`, `accounting_journal_evidence` and `accounting_exception_reviews`.
   - `set_accounting_review_grant`: owner grants a verified accountant account access per company.
   - `post_accounting_journal`: balanced, source-linked journals with opening/accrual/prepayment/settlement/reversal rules. It writes canonical `adjustment` rows into `expenses` and locks source documents.
   - `review_accounting_exception`: owner or granted accountant notes.
   - Triggers `accounting_entry_immutable` (expenses) and `accounting_original_immutable` (documents).

   **Callers:** `src/lib/store.tsx` lines ~487–510 (`accountingAvailable`, `postAccounting`, `accountantData`, `setAccountantGrant`, `reviewAccounting`). **They fail closed today:** `accountingAvailable()` returns false on "does not exist/schema cache", and accountant data throws "Accountant access is on hold pending the approved accounting installation".
3. **Dependencies.** 0058, 0065, 0070/0072/0084 (closed periods with `entityId`), 0075. The related `scripts/accounting-close-guard.sql` (not reviewed) builds on it.
4. **Security.**
   - **New cross-account read path:** granted accountants can SELECT full journal JSON and reviews for granted companies.
   - `set_accounting_review_grant` accepts an email *or a user UUID* and reveals whether a verified account exists (same class as `grant_entity_access`).
   - All RPCs are `SECURITY DEFINER`, `search_path=public`, check `auth.uid()`, revoked from `PUBLIC` and `anon`.
   - Grants are written only through the RPC: table INSERT, UPDATE and DELETE are revoked after being granted.
   - The trigger functions keep default EXECUTE (harmless, trigger-only).
   - `ledgerline.accounting_request` is a transaction-local setting written by the definer function. PostgREST clients cannot call `set_config`.
5. **Conflicts (verified):**
   - **S4, confirmed data deletion breaks:** `delete_my_finance_data()` (0058) fails with "Posted accounting evidence is immutable…" for any owner with a posted journal. Neither guard honours `ledgerline.erasing`, and the documents guard would also block `DELETE FROM documents`. This contradicts the AGENTS.md data-deletion rule.
   - **S5, backup restore breaks:** `restore_finance_backup` fails with "Accounting evidence requires atomic journal posting" for any backup containing posted journal rows. ZIP backups include `expenses` but not `accounting_journal_evidence` (`src/lib/backup.ts` BACKUP_TABLES), so journals cannot round-trip.
   - `delete_my_finance_data` has no cleanup for the three new tables.
   - Performance: `guard_accounting_entry` runs an unindexed JSON lookup on `accounting_journal_evidence` for every UPDATE and DELETE on `expenses`.
6. **Tests.** `src/lib/books/accounting-authority.test.ts` (1/1) and `accounting-annual-acceptance.test.ts` (1/1) pass. Both are large single-scenario acceptance runs on a fixture schema. Still needed: erasure, restore (same-account and cross-account with ID remap), a full-chain run, guest denial, and revoked-accountant denial on the evidence tables (partly covered).
7. **Rollback.**
   ```sql
   DROP TRIGGER IF EXISTS accounting_original_immutable ON public.documents;
   DROP TRIGGER IF EXISTS accounting_entry_immutable ON public.expenses;
   DROP FUNCTION IF EXISTS public.review_accounting_exception(uuid,uuid,uuid,text,text);
   DROP FUNCTION IF EXISTS public.guard_accounting_original();
   DROP FUNCTION IF EXISTS public.guard_accounting_entry();
   DROP FUNCTION IF EXISTS public.post_accounting_journal(uuid,jsonb,bigint);
   DROP FUNCTION IF EXISTS public.set_accounting_review_grant(text,text,boolean);
   DROP TABLE IF EXISTS public.accounting_exception_reviews;
   DROP TABLE IF EXISTS public.accounting_journal_evidence;
   DROP TABLE IF EXISTS public.accounting_review_grants;
   ```
   Data: **posted journal `expenses` rows (txn_type `adjustment`, `receipt_details.accounting`) stay and keep moving account balances. Linked documents stay `evidence_locked = true`.** KK must decide whether those rows are reversed, kept, or exported before any rollback.
8. **Recommendation: rewrite or defer.**
   - Add `ledgerline.erasing` bypasses to both guards.
   - Add erasure cleanup of the three tables.
   - Define how backup and restore treat journal rows and evidence (include `accounting_journal_evidence` in backups, or exclude journal rows and re-post them).
   - Add an expression index for settlement lookups.
   - Refuse anonymous JWTs.
   - Then propose it with the close guard as a later migration (no number yet).

---

## Cross-cutting findings

- **Statement-by-statement hazard.** Files #4, #6, #7 and #8 fail on their first statement when run as a single transaction. If any tool executes them non-atomically, #6 creates an ambiguous `change_accounting_period` overload (S1) and #7 removes the 0079 approval check. Move these files out of `staged-sql/`.
- **Erasure coverage.** `delete_my_finance_data` was last redefined in 0058. It does not clear tables added later that have no FK cascade: `preference_approvals` (0080, already live), `entity_members` grants (0075, already live), `document_intake_commits` (0071; not checked further), and, from staged files, `statement_undo_receipts`, `category_merge_operations` and the accounting tables. `imported_period_history` and `period_close_evidence` cascade from `finance_preferences`. The live gaps should be confirmed and fixed in a separate migration.
- **Demo guests.** Every staged RPC is granted to `authenticated`, which includes anonymous demo sessions. Only #14 is a real concern (table-wide lock).
- **Drizzle bookkeeping.** New files 0089+ probably need `drizzle/migrations/meta/_journal.json` entries and snapshots in the existing pattern (89 entries today). How Lovable applies them was not verified.
- **Unrelated working-tree changes.** `src/lib/claim-pdf.ts`, `src/lib/expenditure-pdf.ts` and `src/lib/report-pdf.ts` were already modified in the working tree while this review ran. They were not touched here.

## Proposed ordered migration sequence (for approval only, nothing applied)

| Order | Proposed file | Source | Gate |
|---|---|---|---|
| 0089 | `0089_company_bound_document_storage.sql` | #9 + #10 + `documents(file_path)` index | KK access-change approval, compatible client deployed, hosted storage check |
| 0090 | `0090_server_report_history_versions.sql` | #11 | KK release approval |
| 0091 | `0091_atomic_statement_undo.sql` | #12 | KK release approval; enables the existing fail-closed Undo caller |
| 0092 | `0092_erasure_coverage.sql` (new, not staged) | cleanup for 0071/0075/0080 tables plus 0091 receipts in `delete_my_finance_data` | Needs writing and tests first |
| 0093 | `0093_budget_merchant_authority.sql` | #13, **rewritten** with a restore authority | Compatible client published; restore tests |
| 0094 | `0094_preference_approval_guard.sql` | #8 trigger and restore rewrite only, **with the INSERT-branch fix** | Compatible client published first (OPEN_BLOCKERS); KK approval |
| later | category merge | #14, **rewritten** without `LOCK TABLE` | Only with a UI |
| later | accounting foundation (+ close guard) | #15, **rewritten** for erasure, restore and indexes | KK access and deployment approval |
| — | discard | #1–#7 | Remove or archive from `staged-sql/` |

Ordering constraints:
- #10 must follow #9 (function dependency).
- 0093 and 0094 must both be in place before any restore-path change, and must be tested together, because both guard `finance_preferences` and both affect `restore_finance_backup`.
- 0094's DO block must run against the 0072 `restore_finance_backup` text. It aborts safely if that text has changed.
- The accounting foundation must follow 0092 so erasure coverage exists.

## Test evidence (run 2026-11-09, local, PGlite)

All passed: 122/122 across 19 files.

| Test file | Result | Loads |
|---|---|---|
| `src/lib/books/entity-access-sql.test.ts` | 7/7 | 0075 |
| `src/lib/books/entity-upload-sql.test.ts` | 6/6 | 0075, 0078 |
| `src/lib/books/entity-transactions-sql.test.ts` | 4/4 | 0075–0077 |
| `src/lib/books/intake-revision-sql.test.ts` | 9/9 | 0071, 0074, 0079 |
| `src/lib/books/typed-intake-sql.test.ts` | 9/9 | 0071, 0074, 0079, 0085 |
| `src/lib/books/closed-gst-amendments-sql.test.ts` | 5/5 | staged #4 |
| `src/lib/transfer-rpc-sql.test.ts` | 21/21 | 0047, 0049 |
| `src/lib/books/period-recovery-sql.test.ts` | 8/8 | 0069, 0070, 0072, 0073 |
| `src/lib/books/period-figures-sql.test.ts` | 4/4 | 0070, 0072, 0084 |
| `src/lib/books/period-evidence-sql.test.ts` | 7/7 | 0070 |
| `src/lib/books/period-authority-sql.test.ts` | 3/3 | 0070, `.lovable/period-authority.sql` |
| `src/lib/books/preference-approval-sql.test.ts` | 8/8 | staged #8 (whole file) |
| `src/lib/books/company-upload-workflow.test.ts` | 7/7 | 0075, 0078, 0066 excerpt, staged #9, #10 |
| `src/lib/books/report-history-versions.test.ts` | 2/2 | staged #11 |
| `src/lib/statement-pipeline/atomic-undo-integration.test.ts` | 4/4 | staged #12 |
| `src/lib/books/budget-merchant-authority.test.ts` | 8/8 | 0080, staged #13 |
| `src/lib/books/category-merge-sql.test.ts` | 8/8 | staged #14 |
| `src/lib/books/accounting-authority.test.ts` | 1/1 | `scripts/accounting-foundation.sql` (+0070/0072/0084) |
| `src/lib/books/accounting-annual-acceptance.test.ts` | 1/1 | same |

Scratch full-chain scenarios (in-memory PGlite, 0000–0088 replayed, every scenario rolled back; harness not committed):

| ID | Scenario | Result |
|---|---|---|
| S1 | #6's 7-argument `change_accounting_period` executed after 0084 | 2 overloads; 7-argument call → `… is not unique` |
| S2 | #8 trigger and DO block only | Installs; restore rewritten; `gstAdvances` still sensitive |
| S3 | #13, #11, #12, #14, #9, #10, #8 (trigger part), #15 cumulatively | Installs in one transaction |
| S4 | #15 + `delete_my_finance_data` with a journal row | **Fails**: "Posted accounting evidence is immutable…" |
| S5 | #15 + `restore_finance_backup` with a journal row | **Fails**: "Accounting evidence requires atomic journal posting" |
| S6 | #9 + #10 storage policies | Expected policy set incl. one RESTRICTIVE SELECT |
| S7 | Privileges of staged functions | No staged RPC executable by `anon`; trigger and pure functions keep default EXECUTE |
| S8 | #13 + restore of 2 merchant events into an empty account | **Fails**: "Merchant history is append-only…" |
| S9 | #8 guard + restore with `assets` | **Fails** with no preferences row; succeeds with an existing row |

Tests still needed before any activation:
1. A committed full-chain replay test, so staged SQL is exercised against the real schema rather than fixtures.
2. Restore tests for #8 and #13.
3. Erasure and restore tests for #15.
4. Concurrency tests for #11 and #14.
5. A JS/SQL `merchant_group_key` parity property test.
6. Hosted storage signing and revocation for #9 and #10, using isolated accounts only.

## Items requiring KK's approval

1. **0089 storage access change** (#9 + #10): narrows member uploads, adds member cleanup and read of their own pending uploads, and adds a RESTRICTIVE read policy that closes team-role access to DocuRepo originals. It needs a compatible client deployment and a hosted check with throwaway accounts.
2. **0090 report version trigger** (#11): changes the stored `version` values that clients send.
3. **0091 statement Undo RPC and receipts** (#12): turns on the already-integrated Statement Desk Undo, which deletes and un-reconciles ledger rows atomically.
4. **0092 erasure coverage**: new SQL, which must be written and reviewed before it is proposed.
5. **0093 budget/merchant authority** (#13): owner-accepted in isolation (OPEN_BLOCKERS 15:54), but the restore conflict (S8) must be fixed and a compatible client published first.
6. **0094 preference approval trigger** (#8): needs a compatible client published *first*, the INSERT-branch restore fix (S9), and explicit acceptance that a confirmed restore counts as approval.
7. **Category merge** (#14): whether to build it at all. If yes, approve the lock redesign.
8. **Accounting foundation** (#15): a new accountant read path across accounts, plus decisions on erasure, backup and restore treatment and on what happens to posted journal rows if it is ever rolled back.
9. **Removal or archiving of the superseded staged files** #1–#7 (and `.lovable/period-authority.sql`) so they cannot be re-run.
10. **Every production publish** stays a separate approval (OPEN_BLOCKERS).

## Appendix: other staged-only SQL found (not reviewed in depth)

- `.lovable/period-authority.sql`: an earlier `require_period_operation` function and trigger (21 lines). Superseded by 0072 and 0073 by name; bodies not compared. `period-authority-sql.test.ts` still loads it.
- `scripts/accounting-close-guard.sql`: `guard_corporate_close_acceptance` and trigger `corporate_close_acceptance`, marked "STAGED ONLY … disposable acceptance databases". Depends on #15.

**Restating: no SQL in this document has been applied to any database.**
