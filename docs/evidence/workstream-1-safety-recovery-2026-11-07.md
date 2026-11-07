# Workstream 1 — 7 November 2026, 14:40 UTC checkpoint

## Counts and status discipline
- Previous and current historical: **1,543 implemented / 948 partial / 31 missing / 19 superseded**.
- v6 previous and current: **566 verified / 331 partial / 2 externally blocked**.
- Newly verified IDs: **none**. No broad completion inferred from controlled tests or existence of code.
- Follow-up implementation evidence: **C-1501, C-2094, C-1065, C-0517, C-0391, C-0581** remain PARTIAL.

## Defects addressed on Main
1. `category-merge.sql`: table-level writer locks exclude phantom inserts while committing; null-safe reviewed identity; reversed requests cannot replay as current merges; snapshots reread actual saved preferences; undo restores full monthly-budget records including timestamps. `category-merge-sql.test.ts`: eight disposable PostgreSQL cases, including new row invalidation, queued insert/stale undo, source/split/amount preservation, exact replay, unrelated owner, rollback and synthetic closed-period guard refusal. **Independent-connection contention, real closed-period/approval guard compatibility and hosted rollout still unverified. SQL is staged and UI held.**
2. `merchant-management.ts`, `patterns.tsx`: reversal consults later history, refusing ABA edits that change and later restore an alias. Originals remain unchanged. Merchant component/rule tests pass. Immutable server history authority is still missing.
3. Decimal migration: `period-figures.ts` entry/GST/depreciation sums and balance rounding/drift; `tax-workpaper.ts` source grouping/export; `loan-balances.ts` lender-evidence liabilities; `investment-flows.ts` boundary flows; `projection.ts` baseline/compounding/purchasing power; `position.ts` Home/assistant cash, reserve, minimum balance, liability, reimbursement and grouped facts. Numeric record shape unchanged. Connected/evidence reproduction/export tests assert exact fractional values. **Not all financial engines have yet been audited/migrated.**
4. `report-jobs.server.ts`: recover orphan PDF before reading changed ledger/rendering; retain bytes; checksum/size/type readback before recording history; stored SHA-256 in history filters; accepted-history retrieval checked before marking done; same-size corruption or missing originals refused; completion-status failure retry retains original. Five controlled service-adapter tests; PDF rendering mocked there. Actual report builder/annexure/download browser checks separately verify uploaded/downloaded SHA-256 equality and independently decode retained original pages. **Queued-job accepted-input snapshot, atomic version allocation and hosted restart/retrieval remain open.**
5. `expense-review-security.test.ts`: actual retained function + actual 0002 execution revocation denies reviewer, owner reimbursement and anonymous calls without changing status/12.34/history. Live read-only privilege query confirms authenticated=false, anonymous=false and staged approval trigger=false. `role-access.test.ts`19 and `intake-revision-sql.test.ts`9 pass for active boundaries. See `approval-test-replacement.md`; the retired sequential approval workflow is not certified or restored.

## Executed evidence
- Full Main suite: **262 files / 1,933 tests PASS**. Final fixture typing correction narrows the seed before spread; latest preview build must be checked after that edit.
- Browser: Workstream1 three sizes PASS; report builder three sizes PASS. Controlled local persistence, not hosted. Actual PDF bytes are identical to uploaded bytes and original page dimensions survive; screenshots inspected.
- Hosted acceptance delegated in isolated draft **Budget and merchant hosted acceptance**, not Main: completion notification reports **24 PASS / 2 FAIL**. Failures: complete-budget validation and immutable merchant history. Three draft files changed, build passing; no draft acceptance or policy installation. Evidence in draft `docs/evidence/hosted-budget-merchant-acceptance.md` must be read/merged safely before detailed conclusions; Main current-turn edits were absent there. Requirements remain partial.

## Exact next executable work
1. Inspect returned hosted draft evidence; fix complete-budget validation and immutable merchant history in staged compatible authority, integrate with reviewed preferences, preserve source history and closed-year behavior. Do not activate on Live without explicit approval.
2. Add independent-connection category concurrency and actual installed closed-period/approval compatibility tests before any rollout.
3. Frozen accepted report input and atomically assigned history version; hosted interrupted job/history/evidence retrieval.
4. Remaining monetary engines and systematic partial-workflow acceptance. Do not restart historical audit or repeatedly revisit providers.

External dependencies remain licensed intraday prices/official filing schemas; physical devices and owner financial originals remain separate acceptance prerequisites. Email work stays set aside. No real financial records changed, no production publication, no approval or category safeguard activation, no statutory filing.