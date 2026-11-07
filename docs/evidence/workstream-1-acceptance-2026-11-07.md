# Workstream 1 connected acceptance — 7 November 2026, 13:37 UTC

## Counts and exact status changes
Previous historical checkpoint: **1539 implemented / 941 partial / 42 missing / 19 superseded**.
Updated saved register: **1542 implemented / 944 partial / 36 missing / 19 superseded** (2541 total).
Newly verified narrow requirements: **C-1252, C-1249, C-2024**.
New implementation/acceptance but still PARTIAL: **C-1253, C-1493, C-0879**.
v6 register unchanged: **566 VERIFIED COMPLETE / 331 PARTIAL / 2 externally BLOCKED**. Historical implemented is not a hosted/full-financial verification certificate.

## Completed features and actual evidence
- **Decimal planning/allocation extension — C-1065 remains PARTIAL.** `src/lib/planning.ts:1,116-160,171-230`, `src/lib/allocation.ts:1,64-150`; exact decimal forecast, safe-to-spend, EMI/amortisation/prepayment/foreclosure/goal and allocation/carry-forward amounts. `planning-decimal-workflow.test.ts` verifies ledger1.31 → forecast1.01 → available0.71; monthly interest1.005 rounds1.01; principal100.50 closes exactly; allocation1.01 and carry0.70. Existing planning15 and allocation9 tests pass. Broader tax/depreciation/report arithmetic remains unmigrated.
- **Report evidence and recovery — C-1487/C-1857/C-0879 remain PARTIAL.** `ExpenditureReportBuilder.tsx:143-198, retryHistory, result status`; `src/lib/report-save.ts:1-29`. Fixed destructive deletion after uncertain insert outcomes, false saved-history text, missing save retry and late cancellation before verification. Stable owner/report/path/size readback handles lost responses and same-blob retries. `expenditure-builder-workflow.test.tsx` drives actual fetched original PDF→document decision→real statement/claim renderer→isolated mocked upload/history→identical download bytes. Claim12.64, original321×456 page and missing-bill list retained. Cancel zero writes, failed upload zero history and retry pass. `report-save.test.ts` validates matching/unrelated identity, unknown outcome retention and no duplicate insert. NOT hosted database/private storage certification; saved history retrieval page and cross-device recovery remain open.
- **Actual browser PDF workflow:** `scripts/browser/test_report_builder.py`, three sizes1280×1800/1180×820/402×725, real builder/PDF/browser Download; downloaded bytes exactly equal captured upload, independent pypdf decoder confirms original page, local lost-response readback PASS. SHA256: desktop fce5b09d875383b8c3aa70955d151b0bfc89fa65416e20484d99e9362f93a7df, tablet66383afe59e211e16f9422df0f4aff9644d9e93c523634652be416863e6e43fe, phone44d33704a2f4a90d601ad7e713223cac0fe2902ce77ab8a7a2a38c9ea92cfc75.29,343/29,338/29,338bytes respectively. No external writes. These are controlled storage adapters, NOT hosted checks.
- **Budget controls:** `TripBudget.tsx:47-55,106-117,147-153,207-210`; `budget-controls.test.tsx`4PASS. Actual historical review/cancel/save/reload keeps primary100 with independent workspace100/traveller40, partial plan never assumed complete. C-1252 and C-1249 narrow display acceptance pass; C-1253/C-0389 remain partial until hosted revision/persistence authority acceptance.
- **Merchant merge/unmerge — C-2094 remains PARTIAL.** Actual control cancel/failure/retry/reopen/unmerge test and three-size browser PASS; underlying hosted alias concurrent updates not certified.
- **Loan CSV — C-0409 remains PARTIAL.** `loan-export-workflow.test.tsx` drives actual LoansPanel/LoanCard Export CSV; originalFX1 maps to storedINR83, principal74.70/interest8.30/remaining425.30, filename/MIME/content exact; no writes. Hosted repayment persistence and actual browser save remain open.
- **Setup completion — C-1493 remains PARTIAL.** `SetupAssistant.tsx:26-35`, `SettingsDirectory.tsx:60,79-84`; actual Settings/guide failure stays open, retry persists isolated done, remount suppresses repeated Start setup while explicit guide reopen works. Hosted preference save still unverified. No financial changes.
- **Selected summary scrolling — C-2024 IMPLEMENTED.** Original `LEDGERLINE_pasted-27.md:225-242` is selected TRANSACTION summary, not report summary. `FinancialReview.tsx:154` now sticky at all widths, phone/tablet height bounded with internal scrolling so it cannot obscure the entire list. Actual Inbox91-entry selection stays fully in viewport at desktop/tablet/phone; zero fixture saves. Updated older browser fixture with empty documents/loans/members/valuations and isolated unrelated audit findings. All9Inbox tests PASS.
- **Atomic category merge — C-1501 remains PARTIAL.** `.lovable/staged-sql/category-merge.sql`, `books/category-merge-sql.test.ts`4PASS: owner exact read-only preview, stale refusal, split amounts/tags/original retained, scoped/trip plans retained, decimal monthly0.10+0.20=0.30, exact replay, cross-owner invisible/refused, injected write failure rolls back all tables. SQL naming collision found and fixed. STAGED ONLY; NOT installed or connected to live UI. Existing split refusal remains until compatible deployment approval. Full writer concurrency/phantom insert/closed-period compatibility and safe undo acceptance remain open before rollout.

## Verification results
- Full final Vitest: **257 files / 1905 tests PASS**,13:35:54UTC.
- Actual Inbox browser suite: **9PASS**; scoped controlled records/external writes blocked.
- Existing workstream browser: **3sizesPASS** (merchant/budget/required-document cancel).
- Actual report browser: **3sizesPASS**, checksum/output decoding; mocked storage clearly labelled.
- Preview build signal: **build OK**. Route descriptions inspected on index/Inbox/claim/expenditure/patterns; existing unique metadata retained.
- jsdom logs a canvas-not-implemented warning for unicode fallback; browser renderer uses real canvas and passes. No Tamil shaping certification added.

## Remaining executable gaps and verification
1. Finish category authority concurrency/phantom/closed-period/undo compatibility, then deployment is held for approval (do not install).
2. Remaining formerly buildable missing: C-0214 request-admin status (inspect existing upload requests first), C-0391 complete optional breakdown functions against source section, C-0517 interrupted accepted report jobs, C-0553 receipt attachment browser persistence, C-0581 threshold alerts beyond current trip warning setting.
3. Finish report history retrieval and hosted interrupted-save/cross-device recovery in isolated hosted environment; actual JPEG matrix/Tamil/mobile evidence acceptance.
4. Decimal tax/depreciation/report modules and concrete budget/merchant hosted revision tests; then continue944partial historical clusters and331v6partials in connected workflows.

## Genuine external blockers and holds
Licensed market-price provider/credentials and owner-selected official statutory schemas remain the2v6external blockers. Bank/email providers remain deferred; no repeated integration attempts. Physical iPhone/iPad camera/FaceID/push/Safari checks await devices. Company storage authority and approval trigger rollout require compatible authorised deployment; these are approval holds, not permission to mutate live data. Sanction/disbursal loan evidence requires owner document. Publication stays held.

No real financial records changed, no Cloud fixtures/access-policy installation, no approval-trigger activation, no publication, no statutory submission.
