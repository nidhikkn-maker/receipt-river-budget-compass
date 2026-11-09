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
  - limited to 5 wrong passwords per 15 minutes;
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

Run 1 started before the independent test file existed, which is why it has one file fewer. A first attempt at run 3 was stopped by a 10-minute background limit before it finished. It was re-run on its own and passed.

## 3. Remaining findings and risks
1. **Passkey registration has no step-up (R-P1-1).** A stolen app session could add its own passkey and then pass a passkey re-confirmation. Fix: move registration to a server function behind a password re-confirmation. **Needs KK's decision.**
2. **Client-side exports** (CSV, PDF, Excel built in the browser) cannot be enforced by the database. They are guarded only in the app.
3. **Hosted claims not verified:**
   - that assistant tokens carry `client_id` and app tokens do not;
   - whether Lovable Cloud allows the PostgREST pre-request hook (P4b).
4. **Revoking an assistant** blocks it in the database but does not revoke its OAuth token at the auth server.
5. **New tables and functions** are not covered automatically. Every future migration must add the assistant policies and wrap new writers. To be made a release check.
6. **The password attempt limit** is per server instance. The auth service has its own limits on top.
7. **Idle lock gaps:**
   - guest sessions lock only if a PIN or Face ID is set;
   - Google-only accounts must sign out to unlock;
   - there is no lock on a cold start.
8. **After P4 is applied,** the app's fallback direct passkey delete stops working by design. Removal goes through `remove_device_passkey`.
9. **Device checks outstanding:** Face ID re-confirmation and the idle lock have not been checked on a real iPhone or iPad.
10. **Decisions still open:**
    - C13: audit retention after owner erasure. Erasure behaviour is unchanged until it is decided.
    - C11 and C14.

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
1. Apply P1, P2 and P4 to production. This needs a separate approval, after the read-only live-role query (also not yet authorised) and the baseline check.
2. R-P1-1: move passkey registration behind a password re-confirmation.
3. P4b: approve a hosted check of token claims and of hook support.
4. Open decisions C11, C13 and C14.
5. Permission to begin **Phase 2**. Work is stopped until then.
