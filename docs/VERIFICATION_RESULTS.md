# Verification results (executed evidence only)

| Date | Requirement | Check | Result |
|---|---|---|---|
| 2026-11-06 | V60-0162, V60-0730 company access | `bunx vitest run src/lib/books/entity-access-sql.test.ts` (disposable PostgreSQL) | 6/6 pass: no grant → nothing; other company → refused; personal untagged file → refused; member write/self-grant → refused; stranger → nothing; revoke → immediate loss |
| 2026-11-06 | Company document suggestions | `entity-accounts.test.ts` companyDocuments | 2/2 pass |
| 2026-11-06 | Company access panel | Signed-in browser, /entities | Panel renders on 5 companies, no page errors. No grant was created against real data |
| 2026-11-06 | V61-0077 loan balance prefill | `loan-balances.test.ts` | 10/10 pass |
| 2026-11-06 | Full suite (prior run) | `bunx vitest run` | 1,595 pass |

Not verified: hosted two-account access, real-device behaviour, real-document extraction accuracy, statutory approval.
| 2026-11-06 | V60-0719 cross-entity access, member uploads | `entity-upload-sql.test.ts`, `entity-transactions-sql.test.ts` (disposable PostgreSQL) | 12/12 pass: edit-grant upload allowed into owner prefix; view-only/other-company/stranger refused; revocation immediate; members cannot retag to another company or personal |
| 2026-11-06 | Shared company view exports | `shared-company.test.ts` | 7/7 pass: company-only CSV/PDF rows, search, formula-injection safety |
| 2026-11-06 | Document intake server approval (migration 0079) | `intake-revision-sql.test.ts`, `typed-intake-sql.test.ts` | 17/17 pass: unreviewed payload refused, altered payload/lock refused, committed retry replays after run removal, typed validation intact |
| 2026-11-06 | Broker cash vs account double-count | `recon-extra.test.ts` broker-cash cases | 4/4 pass: broker-name overlap flagged; liabilities, archived and generic-word matches silent |
| 2026-11-06 | Field-level provenance to reports | `tax-workpaper.test.ts` provenance cases | 3/3 pass: printed originals kept for corrections, per-taxpayer scoping, personal section entry-based |
| 2026-11-06 | V60 §71 all 22 mandatory cases | `books.test.ts` acceptance matrix | 37/37 pass, cases 1–22 each asserted |
| 2026-11-06 | Full suite | `bunx vitest run` | 1,629 pass (before matrix additions); matrix re-run green after |
