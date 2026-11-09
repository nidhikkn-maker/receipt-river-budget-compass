# Phase 1 security: interface contract between database and app work (9 Nov 2026)

Both tracks build to these exact names. All database changes are **proposed SQL** in `.lovable/staged-sql/proposed/`, tested in isolated PGlite only. Nothing is applied to production.

## Re-confirmation ("step-up") for sensitive actions, enforced in the database
- **Table `public.step_up_grants`:**
  - columns: `id uuid pk`, `owner_id uuid`, `method text` ('passkey' | 'password' | 'email_otp'), `scope text` ('all' | 'credential', default 'all'), `session_id uuid` (nullable), `created_at`, `expires_at`
  - CHECKs: expires within 5 minutes of creation; `email_otp` only with scope `credential`
  - RLS: the owner may SELECT their own rows; clients cannot insert, update or delete
- **`public.record_step_up(_owner uuid, _method text, _seconds int DEFAULT 300, _session uuid DEFAULT NULL, _scope text DEFAULT NULL) RETURNS void`:**
  - SECURITY DEFINER, `EXECUTE` granted to `service_role` **only**; 2-, 3-, 4- and 5-argument calls all resolve to this one function
  - called by server functions after verifying a passkey, the account password or an emailed one-time code; they pass the caller's JWT `session_id` as `_session` when present
  - `_scope` NULL derives it: passkey/password → `all`, email_otp → `credential`; email_otp with `all` is refused
  - writes a `step_up_recorded` security event
  - **The 4-digit PIN never calls it** (Decision 30); any method other than passkey/password/email_otp is refused.
- **Session binding:** a grant with a `session_id` only satisfies requests whose `auth.jwt()->>'session_id'` equals it (a token without that claim does not match). A grant without one (older server code) satisfies any session of the owner.
- **Scopes:** `all` satisfies every guarded action. `credential` (emailed code) satisfies **only** passkey registration (`register_passkey`), never a guarded function.
- **`public.has_recent_step_up_for(_action text) RETURNS boolean`:** true when the caller (never an assistant) holds an unexpired grant from this session for `_action` (scope `all`, or `credential` when `_action = 'register_passkey'`). EXECUTE: anon, authenticated, service_role (used by an RLS policy).
- **`public.has_recent_step_up() RETURNS boolean`:** `has_recent_step_up_for(NULL)`: an unexpired scope-`all` grant from this session.
- **`public.require_recent_step_up(_action text) RETURNS void`** (VOLATILE):
  - raises `STEP_UP_REQUIRED: <action>` (SQLSTATE `42501`) when there is no unexpired scope-`all` grant from this session
  - also raises it **always** for external-assistant sessions
  - only accepts registered sensitive actions (the guarded functions, `remove_device_passkey`, `revoke_assistant_client`); anything else raises `Unknown sensitive action` (22023)
  - on success writes a `sensitive_action_authorised` security event (action, grant method, session); it rolls back with the action if the action fails

## Shared rate limit for step-up verification
- **Table `public.step_up_attempts`** (`id`, `owner_id`, `method`, `session_id`, `started_at`, `finished_at`, `outcome` NULL | 'ok' | 'fail'): RLS on, no client or service_role table access.
- **`public.begin_step_up_attempt(_owner uuid, _method text, _session uuid DEFAULT NULL) RETURNS uuid`** and **`public.finish_step_up_attempt(_id uuid, _ok boolean) RETURNS void`**: SECURITY DEFINER, `service_role` only.
- **Rule:** per owner, across methods (password, passkey step-up, email code). Counted: attempts started in the last **15 minutes** that failed **or never finished** (fail closed) and started after the owner's latest success. At **5**, `begin` writes a `step_up_rate_limited` event and returns **NULL** (no exception, so the audit row is kept); the server reports "Too many failed confirmations. Wait 15 minutes and try again." `pg_advisory_xact_lock` per owner serialises concurrent begins. A success keeps all rows as evidence. `finish(false)` writes `step_up_failed`.
- **App:** server functions use this limiter; only when the functions are missing (today's production schema, which also lacks `record_step_up`) do they fall back to the per-instance in-memory count.

## Security audit log
- **Table `public.security_events`** (`id`, `seq`, `owner_id`, `event`, `action`, `method`, `session_id`, `client_id`, `created_at`, `detail jsonb`): append-only. The owner may SELECT their own rows; no client (or service_role) INSERT/UPDATE/DELETE; RESTRICTIVE UPDATE/DELETE deny like the other audit tables. Written only by SECURITY DEFINER functions and the passkey registration trigger.
- **Events:** `step_up_recorded`, `step_up_failed`, `step_up_rate_limited`, `sensitive_action_authorised`, `passkey_registered`, `passkey_removed`, `assistant_client_revoked`. `client_id` is the caller's own claim (NULL for first-party sessions).
- **Erasure:** `delete_my_finance_data` keeps `security_events`, `step_up_attempts` and `step_up_grants` (like `role_permission_audit`), pending KK decision C13.
- **Guarded functions:** same names and signatures, now requiring step-up. The original body is preserved as `<name>__unguarded`, which only the wrapper may execute.
  - `grant_entity_access`, `revoke_entity_access`, `admin_set_member`, `admin_set_permission`
  - `delete_my_finance_data`, `restore_finance_backup`
  - `change_accounting_period` (all overloads)
  - P2's `invite_access`, `accept_access`, `revoke_access`
  - `save_reviewed_preferences` **only when `_approved = true`** (a financial approval)
- **New guarded functions:**
  - `public.remove_device_passkey(_credential_id text)`: removes exactly the caller's row `credential_id = _credential_id AND owner_id = auth.uid()` (the applied table has no `id` column; none is added). Refuses without step-up and for assistants; raises `Passkey not found` (P0002) and deletes nothing when no such row is the caller's. Writes `passkey_removed`.
  - `public.revoke_assistant_client(_client_id text)`: revokes an external assistant for the caller. Writes `assistant_client_revoked`.

## Passkey registration (KK decision: fresh strong authentication before registering or replacing a passkey)
- **Database:** a RESTRICTIVE INSERT policy on `device_passkeys` requires `has_recent_step_up_for('register_passkey')` (assistants never). Clients may UPDATE only `counter` (column grant), and a BEFORE UPDATE trigger (every role) refuses a lower counter and any change of `owner_id`/`credential_id`/`public_key`, so a key cannot be replaced in place; replacement = remove + register. An AFTER INSERT trigger writes `passkey_registered` (with the grant method).
- **Server:** the "register" options and verify paths refuse with `STEP_UP_REQUIRED: register_passkey` unless `has_recent_step_up_for('register_passkey')` (caller's token) is true; on a database without that function (today's production schema) behaviour is unchanged.
- **Trusted methods:** an existing passkey, the account password, or, for accounts without a password (e.g. Google sign-in), an **emailed one-time code** verified server-side (`requestStepUpEmailCode` / `stepUpWithEmailCode`: isolated non-persistent client, `signInWithOtp({ shouldCreateUser: false })` + `verifyOtp({ type: 'email' })`, local-only sign-out, verified user id must equal the caller). It is counted by the shared limiter (method `email_otp`) and records an `email_otp` grant with scope `credential`, bound to the session. The 4-digit PIN never authorises it.
- **App:** registration calls `ensureStepUp('register_passkey', { always: true })`; the confirmation dialog offers the emailed code only for that action, the password only to accounts that have one and Face ID / passkey only when one exists, and never the PIN. /auth mounts the dialog only for the post-sign-in Face ID offer (server-validated session, never over the remembered-account screen).
- **App behaviour:** when an RPC fails with a message starting `STEP_UP_REQUIRED`, the app asks the person to confirm with Face ID / passkey or the account password. The server function records a grant, and the app retries the same call once.

## External assistants (OAuth tokens with a `client_id` claim)
- **`public.is_assistant_session() RETURNS boolean`:** `coalesce(auth.jwt()->>'client_id','') <> ''`.
- **Writes:** RESTRICTIVE policies on every RLS table deny INSERT/UPDATE/DELETE to assistant sessions. Guarded and money-moving SECURITY DEFINER functions refuse assistant sessions.
- **Revocation table `public.revoked_assistant_clients`** (`owner_id`, `client_id`, `revoked_at`):
  - a RESTRICTIVE SELECT policy denies reads to an assistant session whose client is revoked by that owner
  - the effect is immediate, without waiting for token expiry
- **Optional `public.api_pre_request()`** for the PostgREST `db_pre_request` hook: blocks non-GET calls from assistant sessions. Shipped as a separate statement that needs hosted verification before activation.

## Legacy company-editor rights (V4 FND-04, decision V4-P2MAP)
- In P2, `entity_members.can_write` maps to the new role `legacy_company_editor` and read-only grants map to `legacy_company_viewer`.
- Their permission sets must equal **exactly** what those grants allow today. That is never more: no `post`, `approve`, `export`-beyond-read, `manage_access` or `reopen` that the legacy grant lacked.

## Audit history protection
- `transaction_audit`, `role_permission_audit`, `access_grant_audit`, `period_close_evidence`, `imported_period_history` and `preference_approvals` cannot be updated or deleted by clients (RESTRICTIVE policies).
- The owner's explicit data erasure (`delete_my_finance_data`, guarded) keeps its current behaviour pending KK decision C13.

## Session rules (app)
- Idle lock after **5 minutes** on phones/narrow screens and **15 minutes** on desktop.
- The lock is mandatory once signed in. The PIN may reopen the app (Decision 30), but never satisfies step-up.
- Sensitive actions always need a fresh step-up (at most 5 minutes old).
