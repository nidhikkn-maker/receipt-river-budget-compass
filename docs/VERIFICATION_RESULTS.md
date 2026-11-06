# Verification results (executed evidence only)

| Date | Requirement | Check | Result |
|---|---|---|---|
| 2026-11-06 | V60-0162, V60-0730 company access | `bunx vitest run src/lib/books/entity-access-sql.test.ts` (disposable PostgreSQL) | 6/6 pass: no grant → nothing; other company → refused; personal untagged file → refused; member write/self-grant → refused; stranger → nothing; revoke → immediate loss |
| 2026-11-06 | Company document suggestions | `entity-accounts.test.ts` companyDocuments | 2/2 pass |
| 2026-11-06 | Company access panel | Signed-in browser, /entities | Panel renders on 5 companies, no page errors. No grant was created against real data |
| 2026-11-06 | V61-0077 loan balance prefill | `loan-balances.test.ts` | 10/10 pass |
| 2026-11-06 | Full suite (prior run) | `bunx vitest run` | 1,595 pass |

Not verified: hosted two-account access, real-device behaviour, real-document extraction accuracy, statutory approval.
