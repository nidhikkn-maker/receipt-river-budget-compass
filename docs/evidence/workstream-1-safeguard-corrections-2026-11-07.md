# Workstream 1 — safeguard corrections, 7 November 2026

## Counts and requirement IDs
Previous/current historical: **1,543 implemented / 948 partial / 31 missing / 19 superseded**.
Previous/current v6: **566 verified / 331 partial / 2 blocked**.
Newly verified requirement IDs: **none**. Follow-up code and acceptance evidence added to **C-0391, C-2094, C-1065, C-0517**; all remain PARTIAL.

## 1. Complete-budget persistence defect
- Module: `src/components/trip/TripBudget.tsx`, `src/lib/store.tsx:savePreferences`, installed `drizzle/migrations/0080_reviewed_preference_saves.sql`.
- Defect/root cause: complete dimension promises were checked in the budget editor, but the preference RPC and direct database writes accepted incomplete plans. UI-only checks do not enforce financial invariants.
- Impact: misleading saved budget reconciliation, including a changed primary budget retaining allocations labelled complete. No ledger posting is performed by these plans.
- Correction: central client save validates changed trip plans. `.lovable/staged-sql/budget-merchant-authority.sql` validates every changed trip on INSERT/UPDATE, independently reconciling each promised workspace/traveller/category/currency/organisation dimension with NUMERIC arithmetic. Positive rows/rates and known dimensions required. Unpromised partial plans and untouched legacy plans remain compatible. Currency rows use saved planning rates, not a fetched FX rate.
- Acceptance: actual 0080 RPC plus staged trigger installed in disposable PostgreSQL rejects invalid RPC/direct writes without changing revision/audit, persists 0.1+0.2=0.3 independently across dimensions, replays once, refuses mismatched primary edits/invalid rates/unknown dimensions and permits unpromised partial plans.

## 2. Mutable merchant-history defect
- Module: `src/lib/merchant-management.ts`, `src/routes/_authenticated/patterns.tsx`, preference persistence.
- Defect/root cause: history lived in replaceable JSON, with safe-reversal checks only in the browser. Direct preference saves could delete or alter prior events and bypass client guards.
- Impact: compromised audit/reversal authority and changed merchant grouping in reports; source merchant names and transaction amounts are not rewritten by grouping.
- Correction: staged database trigger enforces unchanged history prefix + exactly one new event for each alias change. Before/after aliases must match persisted state. Event IDs cannot repeat. Affected owner entries and original amount/date/currency/merchant/title snapshots must match the database at commit. Reversal must restore prior changed keys, retain both events and refuse repeated reversal, later edits (including ABA), and new dependent aliases. Client review now includes original-field snapshots, using stored-amount fallback when no original amount exists.
- Acceptance: actual RPC disposable tests save/read history, reject deletion/mutation/direct tampering and missing events, reject changed affected-source amounts and wrong owner previews, reverse without editing originals, retain history, refuse repeat/ABA reversal, reject stale revisions and hide approval audit under the authenticated unrelated role.
- Boundary: independent database connections/phantom insertion concurrency and production backup/import compatibility still need explicit acceptance before rollout. No universal hosted certification inferred.

## Independent work continued
- **C-1065:** `src/lib/travel.ts` booking payments/refunds/outstanding commitments, workspace actuals, advances/returns, claims, category planning and reconciliation totals now use decimal helpers. `trip-budget.ts` percentages/reimbursement sums and `intelligence.ts` trip totals/currency/daily/category aggregation use decimal boundaries. `travel-precision-connected.test.ts` proves the same fractional ledger agrees across booking/budget/reimbursement/reconciliation/CSV/report without source mutation. This does not certify all remaining calculation engines.
- **C-0517:** `report-jobs.server.ts` retry identity now compares every accepted filter, not only period/style. `report-jobs-recovery.test.ts` rejects reuse of the same job with changed workspace filters while retaining the original PDF. Frozen input snapshot and atomic history-version allocation remain unfinished.

## Executed results
- Full suite after report/precision corrections: **264 files / 1,942 tests PASS**. Subsequent additional ABA/direct-tamper case: focused staged authority **8/8 PASS** (one case added after that full run).
- Browser: existing isolated adapter exercise **3/3 widths PASS** (1280×1800, 1180×820, 402×725), merge/cancel/confirm/unmerge, budget promises and required-document gate. Screenshots inspected; no overflow/runtime errors. This is NOT hosted persistence acceptance.
- Preview build OK at 15:28:22 UTC.
- Prior hosted draft detailed report cannot be read from Main; saved checkpoint records 24 PASS / 2 FAIL. Fresh isolated correction draft **Budget merchant safeguard corrections** has reproduced both failures against its isolated backend: invalid budget save and deleted merchant history. Corrected hosted API/browser results have not yet returned at this checkpoint. Do not mark those verified from the disposable results.

## Remaining executable work and holds
1. Inspect fresh isolated hosted correction results; compare exact staged SQL/client paths before any integration. Do not accept draft or install Main policies automatically.
2. Category true concurrency/closed-period compatibility; merchant phantom protection and backup/import compatibility.
3. Persist accepted report inputs; atomically assign versions; hosted interrupted job/history/evidence retrieval.
4. Continue remaining financial engines and independent partial workflows. The 31 missing items were checked against saved IDs, not re-audited: they concern owner originals, real devices/live-site exercises, deferred integrations, publication or final-process deliverables. Do not manufacture zero missing while those acceptance conditions remain unavailable.

Real records unchanged. Approval trigger, category/merchant/budget production activation and publication held. Licensed prices/official filing schemas remain the two external dependencies; email work remains set aside.