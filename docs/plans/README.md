# Security and accounting migration plans: approval package (9 Nov 2026)

**Status:** prepared and tested **in isolation only**. Nothing has been applied to the live database, merged into a protected branch or published. Gate 1 remains open.

## Where the proposed SQL lives
`.lovable/staged-sql/proposed/`. These files are deliberately **not** in `drizzle/migrations`, so no tool treats them as applied history. Each has a matching `.rollback.sql`.

| Order | File | Purpose | Plan |
|---|---|---|---|
| 1 | `P1_security_containment.sql` | H-1/H-2 team roles need an explicit per-company owner grant; H-3 ownership and link changes blocked; M-1/M-2 company upload boundary; erasure covers about 30 more tables | `SECURITY_MIGRATION_PLAN_2026-11-09.md` |
| 2 | `P2_v31_role_model.sql` | Additive V3.1 roles: grants, permission matrix, identity-checked acceptance, expiry, immediate revocation, audit log. Existing policies are not switched yet | same |
| 3 | `P3_accounting_posting_layer.sql` | One posting layer on the existing ledger (DN-04): balance enforced per posting, entity and currency; idempotency; immutable lines with reversals; period lock; preview → review → commit backfill | `ACCOUNTING_MIGRATION_PLAN_2026-11-09.md` |

Rollback runs in reverse order (P3 → P2 → P1). Rolling back P2 moves its tables to an archive schema instead of dropping them.

## Isolated test evidence (PGlite, every applied migration 0000–0088 replayed via `src/test/full-schema-pglite.ts`)
| Test file | Result | Covers |
|---|---|---|
| `src/lib/security-proposed-sql.test.ts` | 80 / 80 | Each exploit reproduced on 0088 and blocked after P1 and P1+P2. Legitimate owner, editor, read-only, family, guest and admin flows still work. Per-table count and md5 identical across apply and rollback. Catalog equals 0088 after rollback |
| `src/lib/security-proposed-restore-sql.test.ts` | 4 / 4 | Same-account and cross-account backup restore still work after P1 and after P1+P2 |
| `src/lib/accounting-posting-proposed-sql.test.ts` | 11 / 11 | Invariants; parity with the TypeScript `corporateStatements`; no expense from card settlement or income from transfers; erasure and restore with postings present; RLS; `store.tsx` RPC compatibility; data preservation; rollback; P1→P2→P3 ordering |
| Full suite | 2,317 / 2,317 (321 files) | Typecheck and build pass |

The three proposed-migration files were run three times each with no flakiness. One earlier failure happened only while two heavy database test runs shared the machine.

## Already in application code on the branch (not deployed)
- **Passkey relying-party allowlist (M-3):** `src/lib/passkey-origin.ts`, 8 unit tests. **Pre-deployment check:** set `PASSKEY_ALLOWED_ORIGINS` (and optionally `PASSKEY_RP_ID`) to every host where Face ID is used, or Face ID stops working on an unlisted host.

## Not yet covered
- **M-4:** an external assistant's token can write the user's own rows until it expires.
- **Session timeouts and step-up (DN-06):** an app-code change, not designed yet.
- **Team Access page wording:** it says "finance on everyone", which will be wrong after P1.
- **Hosted Postgres differences:** storage owner column, function overloads, PG version (P3 needs 15+ for its view), and concurrency.
- **P3 rules in two places:** posting rules exist in both SQL and TypeScript, so a parity test must guard every rule change.

## Decisions requested from KK before production approval
1. **P2 backfill mapping:** company write grant → `bookkeeper` (adds propose/post rights the old grant lacked) or → `company_secretary` (narrower).
2. **DN-P3-1 … DN-P3-14** in the accounting plan, §10. Defaults are proposed there; none is chosen silently.
3. **Pre-checks:** the read-only production pre-checks listed in both plans each need separate approval. That includes the live role-holder query, which is **not authorised**.
4. **Activation and release:** approving P3 also switches on accounting UI paths that are closed today, so it needs both an access approval and a release decision.
