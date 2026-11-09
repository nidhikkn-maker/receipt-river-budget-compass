# Thapal security review — 2026-11-09

Branch `claude/git-up-thapal-audit-bbjy2k`. This review is read-only. No code, database, migration or staged SQL was changed. Nothing was committed or pushed.

## Method and evidence labels

- **Verified (PGlite)**: a throwaway harness in the session scratchpad (not in the repo) applied all 89 files `drizzle/migrations/0000…0088` in order to an in-memory PGlite. It used Supabase-like stubs: the roles `anon`, `authenticated` and `service_role`; `auth.users`, `auth.uid()` and `auth.jwt()`; `storage.objects` and `storage.foldername()`; and Supabase's default `ALTER DEFAULT PRIVILEGES … TO anon, authenticated, service_role`. All 89 files applied without error. The harness then read `pg_class.relrowsecurity`, `pg_policies` and `pg_proc` (SECURITY DEFINER, proconfig, EXECUTE privilege), and ran attack probes as `SET ROLE authenticated` with a chosen `auth.uid()`. The probes inserted rows directly into `storage.objects`, which is how the Storage API enforces RLS. Because the result is the cumulative final state, later `ALTER POLICY`, `DROP POLICY` and `CREATE OR REPLACE` statements are already applied.
- **Verified (code)**: read directly in source at the cited `file:line`.
- **Inferred**: depends on hosted behaviour or data this review cannot see.
- **Existing tests run** (`bunx vitest run …`): 18 files, **161/161 passed**. The files were family-access, family-requests, internal-reference-rls, upload-link, expense-review-security, private-files-download, role-access, search, backup, documents-linked-search, push-dispatch, books/entity-access-sql, books/entity-transactions-sql, books/entity-upload-sql, books/company-upload-workflow, transfer-rpc-sql, financial-corrections-sql and review-metadata-sql.
  Several SQL tests build reduced stub schemas instead of the full migration chain, so a passing test does not always prove the live policy set (see I-1).

---

## 1. Row-level security (final schema)

**What exists (verified, PGlite).** There are 63 `public` tables, and **every one has RLS enabled**. All 106 public and storage policies target only `{authenticated}`: none target `anon` or `public`. No policy uses `USING (true)` or `WITH CHECK (true)`; the former `role_permissions USING (true)` was replaced in `0086_role_permission_scope.sql:9-12`. Every `UPDATE` or `ALL` policy has a `WITH CHECK`. Three tables have RLS on with no policy, so clients are denied all access to them: `period_operation_authority`, `push_reminder_log` and `regulatory_snapshots`. Restrictive policies exist on `expenses`, `commitments` and `loans` (linked-record ownership) and on `finance_operations` (INSERT only through the workflow).

| table | RLS | policies (command, R = restrictive) |
|---|---|---|
| accountant_contacts | on | ALL |
| accountant_uploads | on | DELETE UPDATE SELECT |
| accounts | on | ALL |
| app_admins | on | SELECT |
| asset_valuations | on | ALL |
| category_batches | on | SELECT |
| category_budgets | on | ALL |
| claim_preparations | on | DELETE SELECT |
| commitments | on | ALL(R) ALL |
| demat_accounts | on | ALL |
| demo_sessions | on | SELECT |
| department_budgets | on | SELECT INSERT UPDATE |
| device_passkeys | on | ALL |
| document_intake_commits | on | SELECT |
| document_runs | on | ALL |
| documents | on | INSERT UPDATE SELECT ALL |
| entity_members | on | SELECT |
| expense_drafts | on | INSERT DELETE SELECT UPDATE |
| expense_history | on | SELECT |
| expenses | on | UPDATE SELECT ALL(R) INSERT DELETE |
| family_invites | on | ALL |
| family_members | on | ALL |
| family_requests | on | INSERT SELECT |
| finance_operations | on | INSERT(R) ALL |
| finance_preferences | on | ALL |
| financial_corrections | on | SELECT |
| goals | on | ALL |
| import_ai_state | on | SELECT |
| import_audit | on | INSERT SELECT |
| import_batches | on | ALL |
| import_pdf_pages | on | SELECT |
| import_posts | on | SELECT |
| import_rows | on | ALL |
| import_rules | on | ALL |
| imported_period_history | on | SELECT |
| job_state | on | SELECT |
| loans | on | ALL(R) ALL |
| market_quotes | on | SELECT |
| monthly_reviews | on | INSERT DELETE SELECT UPDATE |
| opening_postings | on | SELECT |
| passkey_challenges | on | ALL |
| period_close_evidence | on | SELECT |
| period_operation_authority | on | none (deny all) |
| preference_approvals | on | SELECT |
| profiles | on | SELECT UPDATE |
| push_reminder_log | on | none (deny all) |
| push_subscriptions | on | ALL |
| receipt_problem_reports | on | INSERT DELETE UPDATE SELECT |
| regulatory_changes | on | SELECT |
| regulatory_snapshots | on | none (deny all) |
| reimbursement_config_audit | on | SELECT |
| report_history | on | INSERT DELETE SELECT |
| report_jobs | on | INSERT SELECT |
| role_permission_audit | on | SELECT |
| role_permissions | on | SELECT |
| security_holdings | on | ALL |
| statement_checkpoints | on | SELECT |
| statement_line_imports | on | ALL |
| transaction_audit | on | SELECT |
| transfer_links | on | SELECT |
| upload_link_events | on | INSERT SELECT |
| upload_links | on | SELECT UPDATE |
| user_roles | on | SELECT |

Most policies are plain owner checks (`owner_id = auth.uid()` or `employee_id = auth.uid()`). The exceptions that matter are the team-role policies (`can_access_expense`, `can_do`, `my_department`) and the company-sharing policies (`can_access_entity`). Those exceptions are where the findings below sit.

### Findings

**H-1 (High, verified PGlite): team roles apply across the whole app, not per tenant.**
- `can_access_expense` (`0066_role_access.sql:56-63`) gives the `finance` role every other user's expenses. It gives `manager` every user whose `profiles.department` matches the manager's own.
- Every new signup gets `department = 'Engineering'` (`0003_profile_trigger_anonymous.sql:5`). Users cannot change it (`0009…:175-176` grants UPDATE on `full_name` only). In practice, then, a manager matches almost every account.
- The storage policy "Read team receipts" (`0066:93-96`) extends the same reach to **the user's entire `receipts/` prefix**, not just receipts. That prefix also holds bank statements, vault documents, report PDFs, family-request evidence and drafts.
- `team_company_tax()` (`0066:128-140`) returns every non-demo owner's entities and `books.entityTaxProfiles` (for example PAN) to any `finance` user.
- PGlite probe: a `manager` with no other relationship read unrelated users' expenses and every object in storage. A `finance` user read all expenses, all objects and other owners' PAN through `team_company_tax()`.
- Exposure depends on who holds `user_roles` rows. Roles can be granted only by `admin_set_member`, which requires `app_admins`, plus the legacy rows in H-2.
- **Fix:** scope roles to an explicit organisation. Add an `org_id` to `user_roles` and to profiles or memberships, and require `same_org(_employee)` in `can_access_expense`, the receipts policy and `team_company_tax`. Until then, restrict "Read team receipts" to paths that a team-visible `expenses.receipts[].path` actually references, rather than the whole prefix. Stop defaulting new users to `'Engineering'` (use NULL).

**H-2 (High, inferred: needs a hosted query): legacy self-assigned roles may still be active.** The first signup trigger took `role` from user-controlled `raw_user_meta_data` (`0000_expenses_core.sql:38-46`), so a user could sign up as `finance`. `0002` only *commented* `user_roles` as deprecated (`0002…:37`) and deleted no rows. `0066` then made `user_roles` authoritative again. Any account created while `0000`'s trigger was live may still hold a `finance` or `manager` row, which gives it the reach in H-1.
- **Fix (needs KK's approval):** run `SELECT role, count(*) FROM user_roles GROUP BY 1`, cross-checked against `app_admins` and `role_permission_audit`. Delete every role that no audited `admin_set_member` call granted.

**H-3 (High, verified PGlite): a company editor can take over the owner's company documents.**
- The editor UPDATE policy on `documents` (`0076_entity_scoped_transactions.sql:8-11`) checks `can_access_entity(owner_id, …, true)` against the *new* row.
- `can_access_entity` returns true whenever `_owner = auth.uid()` (`0075_entity_level_access.sql:23`). The owner's own "Own documents" WITH CHECK (`0009…:84`) also accepts any row the editor owns.
- So an editor can run `UPDATE documents SET owner_id = <self>, file_path = '<self>/…'` on any document of the shared company. The owner loses the record, and the `BEFORE DELETE` evidence guard (`0059…:111`) is bypassed.
- Probe: the owner's original document disappeared from the owner's view.
- The staged `.lovable/staged-sql/company-bound-uploads.sql:39` does **not** stop this, because its guard runs only when `NEW.owner_id <> auth.uid()`. Verified by applying the staged file.
- For comparison, expenses are protected by `guard_team_expense_edit` (`0066:81-91`, keyed on `OLD.employee_id`). An editor's attempt to move an expense to themselves returned 0 rows.
- **Fix:** add a BEFORE UPDATE trigger on `documents` keyed on `OLD`:
  `IF auth.uid() IS NOT NULL AND OLD.owner_id <> auth.uid() AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NEW.file_path IS DISTINCT FROM OLD.file_path) THEN RAISE …`.
  Alternatively, change line 39 of the staged guard to test `COALESCE(OLD.owner_id, NEW.owner_id) <> auth.uid()`.

**M-1 (Medium, verified PGlite): a company editor can expose the owner's other files by pointing document rows at them.**
- The editor INSERT policy (`0078_entity_member_uploads.sql:1-3`) and the editor UPDATE policy (`0076:8-11`) do not limit `file_path`.
- The CHECK `documents_path_owner` (`0009…:78`) only forces the path to start with the owner's prefix.
- The read policy "Entity members read document files" (`0075:59-62`) trusts `documents.file_path`.
- A `can_write` editor of company `c1` therefore pointed a `c1` document at the owner's `c2` file and at a personal receipt, and could then list and sign both.
- This needs the target path. Most paths contain `crypto.randomUUID()`, which limits the practical risk.
- Staged `company-bound-uploads.sql` plus `document-storage-boundary.sql` block it in PGlite. **Neither is live.**
- **Fix:** apply both staged files in that explicit order, together with the H-3 trigger fix.

**I-1 (Info, verified PGlite): shared-company transactions are invisible to members.** The restrictive "Expense linked records belong to owner" policy (`0066:65-66`) requires `employee_id = auth.uid() OR can_access_expense(...)`, so the entity SELECT and UPDATE policies on `expenses` never take effect. A member's `SharedWithMe` query (`src/components/books/CompanyAccess.tsx:77`) returns nothing. The test `books/entity-transactions-sql.test.ts:23` stubs only a single owner policy, so it passes without the restrictive policy. The current state is safe by accident. If someone relaxes the restrictive policy to "fix" visibility, make sure the `employee_id` guard (the `guard_team_expense_edit` pattern) is kept.

**L-1 (Low, verified PGlite): owners can edit link columns directly.** `upload_links` grants UPDATE on all columns to the owner (`0052_accountant_upload_links.sql:25,29`). An owner can un-revoke a link, extend `expires_at` or raise `max_files` directly, bypassing the 30-day / 50-file rules. This affects only the owner's own link. `accountant_uploads` (`0052:43-47`) also allows owner updates of `file_path`, but its consumer downloads with the user's own token (`AccountantInbox.tsx:21`), so RLS still applies. **Fix:** `REVOKE UPDATE … ; GRANT UPDATE (revoked_at)` and `GRANT UPDATE (consumed_at)`.

**I-2 (Info): idempotency rows are editable.** `finance_operations` ("Own finance operations", ALL) lets owners UPDATE or DELETE their own idempotency rows. Only the owner's own retry safety is affected.

## 2. Storage buckets and `storage.objects`

**What exists.** Final storage policies (verified PGlite):

| bucket | operation | rule |
|---|---|---|
| `receipts` | INSERT | first folder = uid (`0000:147`) |
| `receipts` | INSERT | entity editors write anywhere under a sharing owner's prefix (`0078:4-8`) |
| `receipts` | SELECT | own prefix (`0002:58`) |
| `receipts` | SELECT | team prefix (`0066:93-96`, see H-1) |
| `receipts` | SELECT | documents with an entity grant (`0075:59-62`) |
| `receipts` | SELECT | owner reads family-request evidence (`0022:93`) |
| `receipts` | DELETE | own prefix (`0002:60`) |
| `receipts` | UPDATE | no policy, so no overwrite or upsert |
| `statement-uploads` | SELECT, DELETE | own prefix only (`0052:60-63`); writes happen only through the service-role upload route |

Signed URLs:
- The store's `signedUrl` (`src/lib/store.tsx:875-885`) re-checks visibility before signing (own prefix, or a currently visible `documents` row) and signs for `PRIVATE_URL_SECONDS = 60` (`src/lib/private-files.ts:2`, path traversal refused at `:5`).
- `downloadFile` then fetches the bytes and checks size and checksum (`private-files.ts:24-33`).
- Other signing sites use longer windows: family evidence 300 s (`src/lib/family-requests.ts:86`), draft thumbnails 600 s (`src/lib/drafts.ts:77`), and import and balance views 60 s.

**Findings**
- **M-2 (Medium, verified PGlite): editors can write anywhere in the owner's prefix.** The editor upload policy (`0078:4-8`) lets a `can_write` member write any path under the owner's prefix: not limited to one company, and not under `docs/`. The probe planted `<owner>/reports/<uuid>.pdf`. `completeReportJob` adopts an "orphan" PDF already at that path as the report (`src/lib/report-jobs.server.ts:89-92`), so a member who knows a job id could substitute the report evidence. Staged `company-bound-uploads.sql:27-29` fixes this.
  Note that `entity-member-uploads.sql` sorts alphabetically after it and re-creates the old policy. With the staged folder applied alphabetically, the probe still succeeded. **Staged files must be applied in an explicit order.**
- **L-2 (Low, verified code): longer signed-URL windows.** The family-evidence (300 s) and draft (600 s) windows are longer than the 60 s that `src/lib/AGENTS.md` documents. **Fix:** use `PRIVATE_URL_SECONDS`.
- **I-3 (Info, inferred): bucket settings cannot be checked.** Bucket definitions (public flag, size limits, allowed MIME types) are not in the migrations, so this review cannot confirm that `receipts` and `statement-uploads` are private.

## 3. RPC and SECURITY DEFINER functions

**What exists (verified PGlite):**
- **Every one of the 70 SECURITY DEFINER functions in `public` sets `search_path=public`.**
- Every mutating RPC checks `auth.uid()` and limits work to the owner, or to `is_admin()` for the admin functions.
- The service-only functions have EXECUTE revoked from `public`, `anon` and `authenticated`: `claim_upload_slot`, `claim_job`, `claim_report_jobs`, `claim_import_batches`, `claim_import_ai`, `expired_demo_owners`, `post_import_rows_secure`, `record_statement_checkpoint`, `reconcile_expense` and `review_expense`.
- `start_demo_workspace` refuses non-anonymous callers and validates and rate-limits its label (`0051…:7-15`).
- `grant_entity_access` requires the company to exist in the caller's preferences and a verified target email (`0075:30-45`). `accept_family_invite` requires a verified matching email (`0022:62-72`).

**Findings**
- **L-3 (Low, verified PGlite): role oracle.** `has_role(_user_id uuid, _role)` (`0000:22-25`) is never revoked, so under Supabase's default grants both `anon` and `authenticated` can execute it. Any caller can ask whether **any** user id holds `finance`; the probe returned true for another user, including from a guest JWT. `can_do`, `is_admin`, `my_department` and `can_access_expense` are also executable by `anon`, but they only answer for `auth.uid()`, which is null for anon. **Fix:** `REVOKE EXECUTE … FROM public, anon` on all of these, and restrict `has_role` to `_user_id = auth.uid()`.
- **I-4 (Info): search_path hardening.** `search_path=public` still searches `pg_temp` first for relation names. Clients cannot create temporary tables through PostgREST, so this is defence in depth only. Prefer `SET search_path = ''` with qualified names, or `public, pg_temp`. The invoker trigger `bump_preferences_revision` has no search_path.

## 4. Search

**What exists (verified code).** `src/lib/search.ts:1-4` is a pure function over the store's in-memory records. `src/routes/_authenticated/search.tsx:40` reads `useStore()`. The store loads with explicit owner filters: `documents.eq("owner_id", userId)` and `expenses.eq("employee_id", userId)` (`src/lib/store.tsx:244,250`). Search makes no server call and uses no service role. The shared-company search (`CompanyAccess.tsx:108-111`) filters rows already returned under RLS. Tests `search.test.ts` and `documents-linked-search.test.ts` pass.
**Findings:** none.

## 5. Exports (CSV, PDF, ZIP backups, department exports, reports)

**What exists.**
- Reports are built in the browser from data the user can already see (`src/lib/AGENTS.md`).
- Background report jobs use the service role but filter every read by `job.owner_id` (`src/lib/report-jobs.server.ts:15-23`) and write only to `<owner>/reports/<id>.pdf` (`:63`).
- Backups filter by owner column (`src/lib/backup.ts:6-7`, `backup.test.ts`). Restore goes through the invoker function `restore_finance_backup` under RLS.
- Shared-company CSV, PDF and Excel exports are built from RLS-returned rows (`CompanyAccess.tsx:117-126`).
- Department budgets are limited by `department = my_department() OR has_role(finance)` (`0017…:1`).

**Findings**
- **L-4 (Low, inferred):** because of the default department in H-1, every user sees the "Engineering" department budgets.
- **I-5 (Info):** `report_jobs.filters.snapshot` is rendered verbatim (`report-jobs.server.ts:95-97`). A user can produce a PDF with arbitrary contents in their own history. This affects only the user's own records, but don't treat background PDFs as independent evidence.

## 6. Accountant access (upload links)

**What exists (verified code):**
- The token is `linkId.HMAC-SHA256` (`src/lib/upload-link.ts:60-76`, constant-time compare at `:72-75`).
- The link is looked up on every request, and its state (revoked, expired, full) is derived on each call (`src/routes/api/public/upload/$token.ts:7-14,39,50`).
- An atomic slot claim checks `revoked_at IS NULL AND expires_at > now() AND file_count < max_files` (`0052:51-58`; service role only).
- The stored path is `<owner>/accountant/<link>/<uuid>-<sanitised name>` (`$token.ts:54,59`).
- Files enter the ledger only through Statement Desk. The owner-side functions use `requireRealAccount` and are owner-scoped (`src/lib/accountant.functions.ts`).
- Note: no `accounting_review_grants` table exists in the migrations. Accountant "review" access to companies is the `entity_members` grant (sections 1 and 7).
- `upload-link.test.ts` passes.

**Findings**
- **L-5 (Low, verified code): HMAC key reuse.** The HMAC key is derived from `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/upload-link.server.ts:3-9`). Rotating the service key silently invalidates every link, and the key's exposure is tied to a much more powerful secret. **Fix:** use a dedicated `UPLOAD_LINK_SECRET`, with a previous secret accepted during rotation. Rotation invalidates existing links, so it needs KK's approval.
- **L-6 (Low, inferred about Storage behaviour): client-chosen content type.** The uploaded object's `contentType` comes from the client (`file.type`, `$token.ts:60`), while the allowlist checks only the extension (`upload-link.ts:6`). A link holder can store `x.pdf` as `text/html`. A signed URL opened in a browser would then render HTML on the storage origin, not the app origin. **Fix:** derive the MIME type from the allowlisted extension on the server.
- **L-7 (Low): request size.** `request.formData()` buffers the whole body before the 20 MB check (`$token.ts:51-56`). Check `content-length` first.
- **Info:** a link is a bearer credential for 30 days: anyone holding it can upload up to 50 files and see the owner's first name. A failed storage upload consumes a slot and does not refund it.

## 7. Family privacy

**What exists (verified code and tests):**
- A family member sees only their own requests while the invite is accepted and not revoked (`family_invite_owner`, `0023:1-6`; read policy `0039:1`).
- Inserts require a pending status and the requester's own `requests/` evidence path (`0039:2`).
- Decisions are owner-only, and withdrawal is requester-only while the invite is active (`0039:3-14`).
- `my_family_invites` reveals only the member's name and the inviter's email, and hides revoked invites (`0048:1-13`).
- A member gets no read path to the owner's ledger, documents or storage: no policy references `family_invites.accepted_by` outside `family_requests`.
- `family-access.test.ts`, which runs the real `family-access-sql.ts`, passes, including the revoked-requester and unrelated-user cases.

**Findings:** none. Two Info notes: after a revoke, the owner keeps read access to the member's evidence files (`0022:93`), and those evidence URLs last 300 s (L-2).

## 8. Immediate permission revocation

| grant | database reads and writes after revoke | remaining bearer window |
|---|---|---|
| Company (`revoke_entity_access`) | Immediate: `can_access_entity` checks `revoked_at IS NULL` on every query (verified PGlite: 0 objects visible after revoke) | Signed URLs already issued (60 s); data already loaded into `SharedWithMe` React state until reload; files and CSV/PDF/Excel already downloaded; documents the editor took over under H-3 stay with the editor |
| Family invite (`revoked = true`) | Immediate through `family_invite_owner` (verified by test) | none for the member; the owner's evidence URLs last 300 s |
| Accountant link (`revoked_at`) | Immediate: checked on GET, on POST and inside `claim_upload_slot` | none, apart from files already uploaded |
| Team role (`admin_set_member`) | Immediate: roles are read from tables, not JWT claims | signed URLs already issued; the team member's own downloads |
| Sign-out or session revoke | `requireSupabaseAuth` uses `auth.getClaims(token)` (`src/integrations/supabase/auth-middleware.ts:94`); with asymmetric JWT keys this is a local signature check (inferred), so an access token keeps working until `exp` (Supabase default 1 h) | up to the JWT lifetime |
| MCP OAuth token | Inferred: tokens are normal `authenticated` access JWTs; revoking consent stops refresh, not the current access token | access token until `exp` (see M-4) |
| Offline snapshot | Holds the owner's own data only (`offline.ts:14-15`, AES-GCM with a non-exportable device key); it never holds shared-company data | not applicable for grants |

## 9. Passkey relying-party origin

**What exists (verified code).** `src/lib/passkeys.functions.ts`:
- Line 6 takes `Origin` from the request header. It requires HTTPS unless the hostname is `localhost`.
- Line 11 uses `rpID: origin.hostname` for both options and assertion.
- Line 12 stores the challenge with that origin. Line 17 requires the same origin at verification.
- Lines 20 and 27 call `verifyRegistrationResponse` and `verifyAuthenticationResponse` with `expectedOrigin: origin.origin, expectedRPID: origin.hostname`.

User verification is required, and challenges are single-use (deleted on read) and expire after 5 minutes.

**Assessment.** A browser cannot forge `Origin`, so a phishing page cannot get assertions accepted for the real host. A non-browser client can send any `Origin`, though, including `http://localhost`. The server's expected origin and RP ID are then whatever that caller claims. The binding proves only that client data and authenticator data agree with each other, not that they came from Thapal's origin.
- Every call already requires a valid bearer token (`requireSupabaseAuth`), and a successful unlock mints no token. So the attacker gains nothing beyond the token they already hold.
- The outcome is still that passkeys registered for *any* hostname are accepted as the device-lock factor. The owner can also write `device_passkeys` and `passkey_challenges` directly (ALL policies), which bypasses verification for their own account.
- **M-3 (Medium, verified code; impact limited by design).**

**Fix:** use an environment-configured allowlist, and keep the challenge bound to the origin.

```ts
// src/lib/passkey-origin.ts — pure, unit-testable
export interface RelyingParty { origin: string; rpID: string }
const DEFAULT_ORIGINS = ["https://ledgerline.biz", "https://www.ledgerline.biz"];

/** PASSKEY_ALLOWED_ORIGINS: comma-separated exact origins (scheme://host[:port]).
 *  PASSKEY_RP_ID: optional registrable domain for production origins (e.g. "ledgerline.biz").
 *  Preview hosts must be listed exactly (e.g. https://id-preview--<project>.lovable.app);
 *  never allow "*.lovable.app" — other Lovable customers' apps live there. */
export function relyingPartyFor(originHeader: string | null, env: Record<string, string | undefined>): RelyingParty {
  if (!originHeader) throw new Error("Open this app in your browser to use Face ID");
  let url: URL;
  try { url = new URL(originHeader); } catch { throw new Error("Passkeys are not available on this address"); }
  if (url.origin !== originHeader) throw new Error("Passkeys are not available on this address");
  const allowed = (env["PASSKEY_ALLOWED_ORIGINS"] ?? DEFAULT_ORIGINS.join(","))
    .split(",").map((s) => s.trim()).filter(Boolean);
  const devLocal = env["NODE_ENV"] !== "production" && url.protocol === "http:" && url.hostname === "localhost";
  if (!devLocal && (url.protocol !== "https:" || !allowed.includes(url.origin)))
    throw new Error("Passkeys are not available on this address");
  const rp = env["PASSKEY_RP_ID"];
  const rpID = rp && (url.hostname === rp || url.hostname.endsWith(`.${rp}`)) ? rp : url.hostname;
  return { origin: url.origin, rpID };
}
```

In `passkeys.functions.ts`:
- Replace `originFromRequest()` with `relyingPartyFor(getRequest().headers.get("origin"), process.env)`.
- Use `rp.rpID` in `generate*Options`.
- Store `rp.origin` on the challenge.
- At verification, recompute `rp`, require `challenge.origin === rp.origin`, and pass `expectedOrigin: rp.origin, expectedRPID: rp.rpID`.

Add the unit tests below. Separately, consider moving `device_passkeys` writes and counter updates behind a server-only path: `REVOKE INSERT, UPDATE ON device_passkeys FROM authenticated`, and write through the service role after verification.

| case | expected |
|---|---|
| `https://ledgerline.biz` | accepted |
| `https://evil.example` | rejected |
| `http://localhost` with `NODE_ENV=production` | rejected |
| `https://ledgerline.biz/path` | rejected |
| exact preview host from env | accepted |
| other `*.lovable.app` host | rejected |

## 10. Service-role key and public API routes

**Service-role use (verified code; grep for `SUPABASE_SERVICE_ROLE` and `supabaseAdmin`).** The admin client is created only in `src/integrations/supabase/client.server.ts:32-69`, with a lazy import inside handlers. Callers:

| caller | how it is scoped |
|---|---|
| `statement-checkpoint.functions.ts:75-76` | owner from the verified context |
| `historical-import.functions.ts:15-17,25-26,63-64` | ownership checked first with the user's client; `processImport` filters by owner (`import-jobs.server.ts:24…`) |
| `booking-extract.functions.ts:61-62` | the caller's own `import_ai_state` |
| `accountant.server.ts` | link creation for `context.userId` |
| `upload/$token.ts` | public; HMAC-gated |
| `upload-link.server.ts:4` | HMAC key (L-5) |
| cron job routes | see below |

No service-role code was found in client-bundled files. `import_batches.file_path` is pinned to `<uid>/%` by its policy's WITH CHECK, so the admin download in `processImport` stays inside the owner's prefix (inferred: assumes Storage treats keys literally).

**Public routes.**
- The seven routes `src/routes/api/public/jobs/*.ts` all call `authenticateCronRequest` first (`src/integrations/supabase/cron-auth.ts:2-35`). It checks a Bearer token against SHA-256 digests with `timingSafeEqual`, supports a previous secret, and fails closed when the secret is unset. Verified for each file.
- `api/public/upload/$token.ts` is HMAC-gated (section 6).
- `/share-target` stores nothing (`src/routes/share-target.ts:8-9`).
- `/lovable/email/transactional/preview` is gated by `LOVABLE_API_KEY` but compares with `!==` (`preview.ts:24`). The file is auto-generated. **L-8 (Low).**
- Every `createServerFn` has `requireSupabaseAuth` or `requireRealAccount` middleware (verified by grep across `src/lib/**/*.functions.ts`).
- Push endpoints are re-validated at send time, and redirects are refused (`push-crypto.server.ts:17-19`). Rows inserted straight into `push_subscriptions` therefore cannot redirect the dispatcher.

## 11. MCP server

**What exists (verified code):**
- `src/lib/mcp/index.ts:15` accepts Supabase OAuth issuer tokens with `acceptedAudiences: "authenticated"` and `requireOAuthClientClaim: true`.
- Tools create a client per call with the caller's bearer token and the publishable key (`src/lib/mcp/supabase.ts:42-49`), so RLS applies. They also filter explicitly by `employee_id = ctx.getUserId()` (`tools/list-transactions.ts:24`, `spending-summary.ts:19`, `list-accounts.ts:16`), so team-visible rows are excluded.
- All four tools are read-only queries.
- `src/routes/mcp.ts:18-19` and `src/routes/[.well-known]/oauth-protected-resource.ts:20-22` trust `X-Forwarded-Host` and `-Proto`. This is safe only if the Lovable proxies overwrite those headers, which the file comment states and this review cannot verify.

**Findings**
- **M-4 (Medium, inferred): the MCP token is a full user token.** "Read-only" is a property of the tools, not of the token. An OAuth access token issued to an external assistant is an `authenticated` JWT for the user, so if the assistant or its logs leak it, it can write any owner table through PostgREST until it expires. **Fix:** add restrictive policies such as `AS RESTRICTIVE FOR INSERT, UPDATE, DELETE … USING/WITH CHECK ((auth.jwt() ->> 'client_id') IS NULL)` on owner tables, or the equivalent claim check in the definer RPCs. Keep access-token lifetimes short, and document consent revocation.
- **Info:** guest (anonymous) sessions are not explicitly refused by the MCP auth configuration. `requireOAuthClientClaim` and the consent flow apply, so this is inferred to be low risk.

---

## Findings by severity

| ID | Severity | Status | Location | Summary |
|---|---|---|---|---|
| H-1 | High | Verified (PGlite) | `0066_role_access.sql:56-63,93-96,128-140`; `0003_profile_trigger_anonymous.sql:5` | `finance` and `manager` roles reach every account's expenses, the whole private `receipts` prefix and PAN data; every user defaults to the "Engineering" department |
| H-2 | High | Inferred (needs a hosted query) | `0000_expenses_core.sql:38-46`; `0002…:37` | Roles self-assigned at signup through user metadata were never deleted, and became active again in 0066 |
| H-3 | High | Verified (PGlite), staged fix insufficient | `0076_entity_scoped_transactions.sql:8-11`; `0075:23`; staged `company-bound-uploads.sql:39` | A company editor can reassign the owner's company documents to themselves |
| M-1 | Medium | Verified (PGlite), fixed only in staged SQL | `0075:59-62`; `0076:8-11`; `0078:1-3` | A company editor can point document rows at the owner's other or personal files (needs the path) |
| M-2 | Medium | Verified (PGlite), fixed only in staged SQL | `0078_entity_member_uploads.sql:4-8`; `report-jobs.server.ts:89-92` | A company editor can write anywhere in the owner's prefix, including report paths |
| M-3 | Medium | Verified (code) | `src/lib/passkeys.functions.ts:6,11,20,27` | Passkey RP ID and origin come from a client-controlled header |
| M-4 | Medium | Inferred | `src/lib/mcp/index.ts:15`; `supabase.ts:42-49` | MCP OAuth tokens can write through PostgREST |
| L-1 | Low | Verified (PGlite) | `0052:25,29,43-47` | Owners can edit link expiry, file limit and revocation directly |
| L-2 | Low | Verified (code) | `family-requests.ts:86`; `drafts.ts:77` | 300 s and 600 s signed URLs, against the documented 60 s |
| L-3 | Low | Verified (PGlite) | `0000:22-25` | `has_role` is an anon-callable role oracle for any user |
| L-4 | Low | Inferred | `0017:1` + H-1 default department | Every user sees the "Engineering" department budgets |
| L-5 | Low | Verified (code) | `upload-link.server.ts:3-9` | The upload-link HMAC key is the service-role key |
| L-6 | Low | Inferred | `$token.ts:60` | Uploaded content type is chosen by the client |
| L-7 | Low | Verified (code) | `$token.ts:51-56` | Whole form body is buffered before the size check |
| L-8 | Low | Verified (code) | `src/routes/lovable/email/transactional/preview.ts:24` | API key compared without constant time (generated file) |
| I-1 | Info | Verified (PGlite) | `0066:65-66`; `entity-transactions-sql.test.ts:23` | Shared-company transactions are invisible; the test omits the restrictive policy |
| I-2 | Info | Verified (PGlite) | `finance_operations` ALL policy | Owners can edit their own idempotency rows |
| I-3 | Info | Cannot verify | (hosted) | Bucket privacy, size and MIME settings are not in the migrations |
| I-4 | Info | Verified (PGlite) | all definer functions | `search_path=public` rather than `''`; `bump_preferences_revision` has none |
| I-5 | Info | Verified (code) | `report-jobs.server.ts:95-97` | Client snapshot rendered as a report PDF |
| I-6 | Info | Verified (PGlite) | `.lovable/staged-sql/` | Applying the staged folder alphabetically re-creates the old upload policy (`entity-member-uploads.sql` after `company-bound-uploads.sql`) |

Positive results (verified): RLS is on for all 63 public tables; no anon or `true` policies; every definer function sets a search_path; service-only RPCs are revoked from clients; cron authentication uses a constant-time compare; search and MCP read only owner-filtered RLS data; family isolation and revocation work; company, family and link revocation take effect immediately at the database.

## Items requiring KK's approval

1. A hosted query of `user_roles` and `app_admins`, then deletion of unaudited legacy roles (H-2).
2. Changing the team model to organisation-scoped roles, and stopping the `'Engineering'` default (H-1). This changes who can see what for existing team users.
3. Applying the staged `company-bound-uploads.sql` and then `document-storage-boundary.sql`, in that explicit order, together with the H-3 `OLD.owner_id` trigger fix (H-3, M-1, M-2). Existing editor uploads outside `companies/<hex>/` stop being writable.
4. Deploying the passkey origin allowlist and its environment variables (M-3). Passkeys registered on non-listed hosts stop working.
5. Restricting MCP OAuth tokens from writing (M-4).
6. A dedicated upload-link secret (L-5). This invalidates every link already sent.
7. Revoking anon and public EXECUTE on the helper functions (L-3), and narrowing the `upload_links` and `accountant_uploads` column grants (L-1).

## Cannot be verified without hosted access

- Which migrations and staged files are actually applied in Lovable Cloud. This review assumes all of `drizzle/migrations` and none of the staged files.
- The real contents of `user_roles`, `app_admins` and `entity_members`.
- Bucket settings (public flag, limits, MIME types), and whether Storage serves the stored `contentType` inline.
- The real default privileges for `anon` and `authenticated`. PGlite simulated Supabase's defaults.
- JWT expiry and asymmetric-key settings, OAuth access and refresh token lifetimes and claims (`client_id`), and consent-revocation behaviour.
- Whether the Lovable proxies overwrite `X-Forwarded-Host` and `-Proto` for `/mcp`.
- Cron schedules and secret rotation.
- Actual browser behaviour of passkeys on preview hosts.
