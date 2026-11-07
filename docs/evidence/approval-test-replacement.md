# Retired approval test and active security coverage

The skipped `ExpenseReceiptButtons.test_department_manager_then_finance_approval` exercised the old employee → department manager → Finance → reimbursement workflow. Migration `0002_personal_family_tracker.sql:32-37,54` retired its status model and revoked authenticated execution of `review_expense`; later role access does not grant that function back. No current page presents that sequential workflow.

**Replacement for the relevant security requirement (no unauthorized approval/payment):** `src/lib/expense-review-security.test.ts` loads the actual original function and actual retirement revocation into disposable PostgreSQL. Authenticated reviewer, authenticated owner/reimbursement and anonymous calls must fail with permission denial; all retain the exact status, ₹12.34 amount and empty history. Even permissive test role helpers cannot bypass the execute boundary.

**Current role authorization:** `src/lib/role-access.test.ts` runs installed 0066/0086 definitions with employee/manager/Finance/admin identities and RLS, verifying department scope, edit-switch revocation, tax privacy and denied privilege escalation.

**Current reviewed financial saves:** `src/lib/books/intake-revision-sql.test.ts` rejects absent approval, altered quantities/lock, stale revisions and cross-owner documents, while exact completed retries do not duplicate saves. `src/lib/books/preference-approval-sql.test.ts` verifies the staged direct-write guard and compatible reviewed saving; this guard remains uninstalled in production.

These replace security coverage, **not** sequential approval feature acceptance. The old sequence remains retired, not “passed”, and browser fixtures/isolated PostgreSQL are not hosted permission evidence.