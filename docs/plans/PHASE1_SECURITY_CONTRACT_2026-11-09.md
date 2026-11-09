# Phase 1 security: interface contract between database and app work (9 Nov 2026)

Both tracks build to these exact names. All database changes are **proposed SQL** in `.lovable/staged-sql/proposed/`, tested in isolated PGlite only. Nothing is applied to production.

## Re-confirmation ("step-up") for sensitive actions, enforced in the database
- **Table `public.step_up_grants`:**
  - columns: `id uuid pk`, `owner_id uuid`, `method text` ('passkey' | 'password'), `created_at`, `expires_at`
  - RLS: the owner may SELECT their own rows; clients cannot insert, update or delete
- **`public.record_step_up(_owner uuid, _method text, _seconds int DEFAULT 300) RETURNS void`:**
  - SECURITY DEFINER, `EXECUTE` granted to `service_role` **only**
  - called by server functions after verifying a passkey or the account password
  - **The 4-digit PIN never calls it** (Decision 30).
- **`public.has_recent_step_up() RETURNS boolean`:** true when the caller has an unexpired grant.
- **`public.require_recent_step_up(_action text) RETURNS void`:**
  - raises `STEP_UP_REQUIRED: <action>` (SQLSTATE `42501`) when there is no unexpired grant
  - also raises it **always** for external-assistant sessions
- **Guarded functions:** same names and signatures, now requiring step-up. The original body is preserved as `<name>__unguarded`, which only the wrapper may execute.
  - `grant_entity_access`, `revoke_entity_access`, `admin_set_member`, `admin_set_permission`
  - `delete_my_finance_data`, `restore_finance_backup`
  - `change_accounting_period` (all overloads)
  - P2's `invite_access`, `accept_access`, `revoke_access`
  - `save_reviewed_preferences` **only when `_approved = true`** (a financial approval)
- **New guarded functions:**
  - `public.remove_device_passkey(_id uuid)`: removes the caller's own passkey
  - `public.revoke_assistant_client(_client_id text)`: revokes an external assistant for the caller
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
