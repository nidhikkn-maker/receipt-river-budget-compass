# Phase 1: Security — completion report (isolated development only)

**Branch:** GitLab `krna-group/THAPAL-project`, branch `phase1/security`.
**Scope approved by KK (9 Nov 2026):** develop and test in an isolated environment only.

**What did not happen:**
- **Production database:** nothing was read, written or applied.
- **Hosted changes:** nothing was deployed, published, merged into `main` or changed in Lovable.
- **Database changes:** all are **proposed SQL** in `.lovable/staged-sql/proposed/`. Nothing was added to `drizzle/migrations`.

## 1. What changed

### 1.1 Database (proposed SQL, tested in isolated PGlite with all applied migrations 0000–0088 replayed)

| File | Purpose |
|---|---|
| `P1_security_containment.sql` (from the earlier audit) | Closes H-1, H-2 and H-3 |
| `P2_v31_role_model.sql` (revised) | V3.1 roles and permissions. Legacy company grants map to **`legacy_company_editor`** (view, upload, draft_edit, export) and **`legacy_company_viewer`** (view, export). These rights are exactly today's, never more. Legacy roles cannot be newly invited. |
| `P4_step_up_and_assistant_limits.sql` (new) | Re-confirmation enforced in the database; limits on external assistants; append-only audit history; passkey removal |
| `P4b_api_pre_request.sql` (new, optional) | PostgREST hook that blocks non-GET assistant calls. **Needs hosted verification before it can be activated.** |
| Rollback scripts for P2, P4 and P4b | Restore the exact earlier objects. The P2 rollback refuses to run while P4 is installed. Grant and revocation tables are archived, never dropped. |

**Re-confirmation ("step-up")**
- Re-confirmation is recorded only by the server (`record_step_up`, service role only), after a verified passkey or the account password.
- It lasts 5 minutes. The 4-digit PIN can never satisfy it (Decision 30).
- Functions that require it: `grant_entity_access`, `revoke_entity_access`, `admin_set_member`, `admin_set_permission`, `delete_my_finance_data`, `restore_finance_backup`, `change_accounting_period`, `invite_access`, `accept_access`, `revoke_access`, `save_reviewed_preferences` (approvals), and the new `remove_device_passkey` and `revoke_assistant_client`.
- Each original function is kept as `<name>__unguarded` and cannot be called by clients.

**External assistants** (tokens that carry a `client_id`)
- Every table in `public` and `storage.objects` has restrictive policies that deny assistant inserts, updates and deletes.
- 26 money-moving and record-changing functions refuse assistant sessions.
- Revoking an assistant blocks its reads immediately, including through 6 readers that bypass row security.

**Audit history.** Six audit and evidence tables cannot be updated or deleted by clients: `transaction_audit`, `role_permission_audit`, `access_grant_audit`, `period_close_evidence`, `imported_period_history` and `preference_approvals`.

### 1.2 App (server and client)
**Server functions**
- **Password re-confirmation** (`step-up.functions.ts`, `step-up-server.ts`):
  - checked with a separate, non-persistent sign-in, so the person's session never changes;
  - limited to 5 failed attempts per 15 minutes per owner, shared in the database across all server instances (§3.1);
  - refused for assistant tokens.
- **Passkey re-confirmation** (`passkeys.functions.ts`, kind `stepup`): uses its own single-use challenge, which is bound to its kind, origin and a 5-minute expiry. An unlock challenge therefore cannot be replayed as a re-confirmation.

**Client**
- **Re-confirm and retry:** `step-up.ts`, `step-up-check.ts` and `StepUpHost.tsx`. When the database says `STEP_UP_REQUIRED`, the app asks for Face ID / passkey or the password, then retries the same call once.
- **Idle lock** (`idle-policy.ts`, `use-idle-lock.ts`, `DeviceLock.tsx`): **5 minutes** on phones and touch devices, **15 minutes** on desktop, shared across tabs.
- **Settings → Security** (`DeviceSecurity.tsx`, `passkey-devices.ts`):
  - passkey list with Remove;
  - "Sign out all other devices" (requires re-confirmation);
  - account-recovery guidance (the MPIN never recovers an account).
- **Re-confirmation wired into:** access screens (`TeamAccess.tsx`, `CompanyAccess.tsx`), data deletion, Assistants (revoke), Audit (period changes) and the approval saves in `store.tsx`. Team Access wording now says plainly what a role can see.
- **Older database:** against the current production schema, which has no step-up functions yet, the app keeps working as it does today.

### 1.3 The three High findings
| Finding | Status (isolated) | Evidence |
|---|---|---|
| H-1: team roles reach every account | **Blocked** by P1/P2 | `security-proposed-sql.test.ts` (80 tests) |
| H-2: legacy self-assigned roles | **Blocked** by P1/P2 | same file |
| H-3: a company editor can take over document ownership | **Blocked** by P1 | same file |

All three remain **open in production** until KK approves applying P1, P2 and P4.

## 2. Test evidence (all local, isolated)
| Check | Result |
|---|---|
| `bun run typecheck` | Pass. No new `@ts-nocheck`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable` in any changed or new file. |
| Full suite, run 1 | 2,496 / 2,496 passed, 333 files |
| Full suite, run 2 | 2,497 / 2,497 passed, 334 files (adds the independent test below) |
| Full suite, run 3 | 2,497 / 2,497 passed, 334 files (identical to run 2; JSON report in `docs/registers/implementation/vitest-report.json`) |
| `bun run build` | Pass |
| Database security suites ×3 (run by the database developer) | 156 / 156 each run: `security-phase1-sql` 72, `security-proposed-sql` 80, restore 4 |
| Independent attack test (written separately by the reviewer) | `security-phase1-independent.test.ts` passes. It confirms: a signed-in person cannot self-grant re-confirmation through the function or the table; erasure and access grants are refused without a fresh confirmation; `__unguarded` copies cannot be called; an assistant token reads but cannot write; one person's confirmation does not cover another person; assistants are always refused; a confirmed owner proceeds; an expired confirmation is refused. |
| Legacy-rights proof | For each of the 11 actions, the legacy-grant probe results are identical at 0088, P1, P1+P2 and P1+P2+P4, and match `has_permission`. **No privilege increase.** |
| Backup and restore | Same-account and cross-account restore still work under P1+P2 (`security-proposed-restore-sql.test.ts`). Under P4, restore requires a step-up and then succeeds (`security-phase1-sql.test.ts`). |
| Authorised workflows | Passkey registration, unlock and counter updates; owner preference saves; family and company access with step-up; finance operations by a normal session. All pass in `security-phase1-sql.test.ts`. |

**Second round (after KK's four findings and the passkey-registration decision):**

| Check | Result |
|---|---|
| `bun run typecheck` | Pass. No new suppressions in any changed or new file. |
| `bun run build` | Pass |
| Full suite, run 1 | **2,580 / 2,580** passed, 339 files |
| Full suite, run 2 | 2,580 / 2,580 passed, 339 files |
| Full suite, run 3 | 2,580 / 2,580 passed, 339 files (JSON report: `docs/registers/implementation/vitest-report.json`) |
| Security suites ×3 (database developer) | 216+ per run, all passed: phase1-sql 72, phase1-e2e 20, independent 1, proposed-sql 80, restore 4, DeviceSecurity 8, step-up-server 18, step-up 10, step-up-check 4, StepUpHost 7, AuthFaceIdOffer 4 |
| Lock suites ×3 (lock developer) | idle-policy 28, use-idle-lock 7, OwnerLock 14, device-reauth 10 |
| Flaky-test fix | One OwnerLock test (5 wrong guest PINs) timed out once under parallel load, because its final wait was 1 s while five PBKDF2 checks ran. The wait was raised to 10 s with the same assertion. It then passed in all three full runs. |
| Release-blocker guard | `release-blockers.test.ts` passes: all 7 blockers are present and open, and none of their requirements is marked complete |

First round notes: run 1 started before the independent test file existed, which is why it has one file fewer. A first attempt at run 3 was stopped by a 10-minute background limit before it finished. It was re-run on its own and passed.

## 3. KK's review findings (second round) and status of every Phase 1 item

KK asked for four findings to be closed, and added a passkey-registration decision. Each item below is put in **exactly one** of KK's four categories. Release blockers RB-P1-01 to RB-P1-07 (`docs/registers/blockers/production_release_blockers.csv`) stay **Open** whatever the local status, because each also needs hosted, device or production-like evidence.

### 3.1 Completed and tested locally
| Item | What was built | Evidence |
|---|---|---|
| Finding 1: idle lock for guests, Google-only accounts and fresh starts | **Fresh start:** the app opens locked when the last activity, or the server's last sign-in time if there is no record, is older than 5 min (phones) or 15 min (computers). If the server can't be reached, the app locks. Future timestamps are ignored. **Guests:** always locked; a guest with no PIN or Face ID has the session ended on idle (local sign-out, device copies cleared, notice on /auth). **Google-only accounts:** unlock with an email one-time code on an isolated client; the code must belong to the locked owner. **PIN:** reopens only; 5 wrong tries force a full method. **Lock-screen sign-out:** local only. **Extra gap closed:** the assistant-consent page is now also behind the lock. | `idle-policy.test.ts` (28), `use-idle-lock.test.tsx` (7), `device-reauth.test.ts` (10), `OwnerLock.test.tsx` (14) |
| Finding 2: shared password-attempt limit | `begin_step_up_attempt` / `finish_step_up_attempt` in the database (service role only). Per-owner advisory lock. 5 failed or unfinished attempts in 15 minutes, counted together across password, passkey step-up and email code. Every server instance shares it. The in-memory count is used only when the functions are missing (today's schema). | e2e: 12 concurrent attempts produce exactly 5; lock-out holds across separate limiter instances; window expiry re-opens; clients cannot touch the table |
| Finding 3: passkey removal against the real schema | The real `device_passkeys` key is `credential_id`; P4 no longer adds an `id` column. `remove_device_passkey(_credential_id text)`: step-up required, assistants refused, deletes exactly the caller's one row, otherwise nothing changes. Direct client delete is refused. | e2e: owner with two passkeys removes exactly one; foreign, unknown or NULL id refused with nothing changed; the remaining passkey still unlocks |
| Finding 4: end-to-end security tests | `security-phase1-e2e.test.ts` (20) with **real** WebAuthn verification (`@simplewebauthn/server`, software P-256 authenticator) against the full schema plus P1, P2 and P4. Covers success; expiry (grant and challenge); replay (same assertion twice, stale assertion, unlock challenge used for step-up, counter regression); ownership; assistant refusal at every step; audit events. Also the password path with the real database limiter. | Plus `security-phase1-independent.test.ts`, written separately by the reviewer |
| KK decision 2: fresh authentication before passkey registration | Database RESTRICTIVE INSERT policy: registration needs a fresh grant **from the same session**. Server refuses registration without a grant. Google-only accounts use a server-verified email code that creates a `credential`-scope grant, valid **only** for passkey registration. The PIN is refused by the app rule, `record_step_up`, the limiter and a table CHECK. The /auth Face ID offer now asks for confirmation first. | e2e section 1; `StepUpHost.test.tsx` (7); `AuthFaceIdOffer.test.tsx` (4) |
| Session-bound grants | A grant authorises only the session that confirmed (`session_id` claim). | e2e: session A's grant does not help session B or a token without a session |
| Security audit log | Append-only `security_events`: step_up_recorded, step_up_failed, step_up_rate_limited, sensitive_action_authorised, passkey_registered, passkey_removed, assistant_client_revoked. Owner reads only their own rows; nobody can edit or delete them. | e2e (v) |
| Signature counter can only increase | A trigger refuses a lower counter and any change of owner, credential or key, for every role | e2e |
| Bug found and fixed | `record_step_up` used two clock readings, so on real Postgres a 5-minute grant would usually violate its own CHECK. Fixed: one timestamp is used for both columns. | Regression test: 40 grants, each exactly 300 s |
| Rollback | Restores the exact P1+P2 catalog, including column grants. The four P4 tables are archived, never dropped. | `security-phase1-sql.test.ts` rollback test |

### 3.2 Implemented but not fully verified
- **Real browsers and devices** (blocker RB-P1-05): Face ID and passkey flows, the idle lock and cross-tab locking, the /auth confirmation dialog, the email-code screens. All are tested only in jsdom with mocks.
- **Wiring to the real auth client:** `requestStepUpEmailCode` / `stepUpWithEmailCode` and the lock-screen email code. The server and client logic is tested with a stubbed code check.
- **Phones pausing background timers:** handled by the visibility check and the fresh-start rule, but not tried on a phone.

### 3.3 Pending production-like verification
- **Email one-time codes** (RB-P1-01, RB-P1-03). Hosted auth has email sign-in on (read-only evidence 9 Nov). Not yet checked:
  - that the email template sends a code (`{{ .Token }}`) rather than only a link;
  - that `shouldCreateUser:false` works for Google-only accounts;
  - sending limits.
- **Hosted token claims** (RB-P1-06): `session_id`, `amr` and the assistant `client_id`. Needs a non-sensitive test account (KK decision 3).
- **Advisory locking across real multi-connection Postgres** (PGlite has one connection), and `hashtextextended` availability (hosted pre-checks H-P4-7 to H-P4-9).
- **Production-like migration rehearsal of P1, P2 and P4** (RB-P1-07): migration, rollback, backup, restore, compatibility and access control on a restored copy. Not authorised yet.

### 3.4 Blocked on hosting or external services
- **Applying P1, P2, P4 and P4b** to Lovable Cloud. Not authorised (KK decision 1).
- **Effective assistant-token revocation** (RB-P1-04). The database refuses a revoked client at once, but ending its OAuth token or grant needs the managed OAuth service. Not available to us yet.
- **The PostgREST pre-request hook (P4b)** depends on Lovable Cloud allowing it.
- **Trusted server-side authorisation for sensitive exports** (RB-P1-02). Not started: exports are built in the browser. This needs a server export service, which is planned work rather than a hosting block. It stays an open release blocker.

### 3.5 Residual risks (accepted for now, recorded)
1. Anyone with both a stolen session and access to the person's mailbox can add a passkey with an emailed code. This follows from KK's choice of method for accounts without a password.
2. Someone holding the session can lock the real person out of re-confirmation for 15 minutes. This is the cost of failing closed.
3. A grant recorded without a session (older server code) works for all of the owner's sessions for 5 minutes.
4. A `sensitive_action_authorised` event means "authorised", not "completed". A client holding a fresh grant can write one without doing the action.
5. `step_up_attempts` and `security_events` are never pruned (retention depends on C13).
6. The idle lock works on the screen. Tokens stay valid on the server until they expire, and sensitive actions are still re-checked on the server.
7. New tables and functions are not covered automatically. Every future migration must add the assistant policies and wrap new writers. This is now a Phase 2 checklist item.
8. Setting the device clock backwards can lengthen the idle window.

## 4. Requirement updates (implementation register, `recheck_phase1.tsv`)
- **Requirements updated (18):** REQ-SEC-001, 003, 004, 011, 012, 016, 025, 045, 049, 050, 051, 058, 065, 090, 092, 093, plus REQ-ROL-020 and 028.
- **Status:** all remain **Partial, Tested (local)**. Each row records what Phase 1 proves and what stays open.
- **Why none is Complete:** the database changes are not applied and there is no device evidence.

## 5. Revised production-readiness scores
| Area | After Phase 0 | After Phase 1 | Reason |
|---|---|---|---|
| Security implementation | 5.0 | **6.0** | H-1/H-2/H-3, re-confirmation, assistant limits and append-only audit are fixed and tested in the database (isolated). Not higher: nothing is applied, hosted token claims are unverified, and the passkey-registration gap remains. |
| Automated testing | 7.5 | **8.0** | 156 database security tests, an independent attack test, triple full runs, and app tests for step-up, idle lock and device security. Still no device, visual or browser-in-CI tests. |
| Entity/database implementation | 4.0 | **4.5** | Role model with permission-level enforcement and legacy mapping proven equal. Entities are still not relational (Phase 2). |
| Historical financial verification | 4.0 | 4.0 | Unchanged. The baseline is still not run. |
| Accounting implementation | 4.0 | 4.0 | Unchanged (Phase 3). |
| UIX implementation | 4.0 | 4.0 | New screens use existing components and semantic tokens. Not visually verified. |
| Disaster recovery | 4.0 | 4.0 | Unchanged. |
| Production readiness | 3.0 | **3.0** | Nothing applied or deployed. Gates G1–G9 are still open. |

## 6. Rollback
- **App:** revert the Phase 1 commits on `phase1/security`. Nothing is deployed.
- **Database:** nothing is applied. If P4, P2 and P1 are applied later, roll back in reverse order: P4b, then P4, then P2, then P1, each using its rollback script. Exact steps: `docs/plans/SECURITY_MIGRATION_PLAN_2026-11-09.md` §8 and §13.

## 7. Items needing KK's approval or decision
1. **Test account:** a non-sensitive test account for the read-only hosted token-claims check (KK decision 3). Signing in creates a session for that account only.
2. **Hosted auth checks:** approval to read whether the email template sends a code. This is read-only if done in the dashboard by KK. Any change to the template is a state-changing action and needs separate approval.
3. **Production-like rehearsal:** approval and a target for a production-like restored copy to rehearse P1, P2 and P4 (RB-P1-07).
4. **Open conflicts:** decisions on C11, C13 and C14 (`docs/decisions/OPEN_CONFLICTS_C11_C13_C14_2026-11-09.md`).
5. **Production deployment:** applying P1, P2 and P4 remains **not authorised**. Phase 2 is approved for isolated development (KK, 9 Nov).
