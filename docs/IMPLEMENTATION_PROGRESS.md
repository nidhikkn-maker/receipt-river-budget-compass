# Implementation progress — top 15 gaps (baseline: Ledgerline_v6_Requirements_Checklist.md)

Statuses follow the strict rule in MASTER_REQUIREMENTS.md. "PARTIAL" = real code + tests exist but at least one condition is unmet. Nothing here is COMPLETE yet.

| Rank | Gap | Status | What exists (code) | Still missing |
|---|---|---|---|---|
| 1 | Entity-level authorisation | PARTIAL | `0075_entity_level_access.sql` (entity_members, can_access_entity, grant/revoke RPCs, document + file read policies); `CompanyAccess.tsx`; owner list filtered to own documents in `store.tsx` + `0076` company transactions readable by members, editable only with edit grant, no retagging (`entity-transactions-sql.test.ts`, 4 tests) + `0077` my_shared_companies; Companies page shows each shared company (view/edit badge, entries, files, one-company CSV via `shared-company.ts`) | PDF/Excel per-company export for members; Statement Desk uploads by members; hosted two-account check (needs second account) |
| 2 | Source-to-figure traceability | PARTIAL | DocField page/quote/confidence; `source-corrections.ts`; loan balances need a retained statement + quote (`loan-balances.ts`, prefill `proposePrintedBalance`) | Universal EvidenceRef on every register figure |
| 3 | Server-enforced approvals | PARTIAL | Rule activation/approval history; period close via `change_accounting_period`; role permissions | Document intake now server-approved (`0079`, 3 SQL tests). Still missing: server approval for register (preferences) changes |
| 4 | Atomic Statement Desk processing | PARTIAL | `commit_document_intake_reviewed` (revision, replay, evidence lock), typed validation `0074` | Typed + approved commits done (`0074`, `0079`); field provenance exported in tax workpaper (`recordProvenance`). Still missing: nested schedule-line validation |
| 5 | Tax computations | PARTIAL | `tax-full.ts`, `from-entities.ts`, regression tests | Accountant-reviewed figures; all entity kinds |
| 6 | Official statutory schemas | BLOCKED | Return-format registry (labels only, no compliance claim) | Owner deferred official ITR/GST schema adoption |
| 7 | GST | PARTIAL | `gst.ts` drafts, Rule 88A set-off, GSTR-2B match | Full return content, amendments, credit notes |
| 8 | Opening balances | PARTIAL | `post_opening_balances`, opening balance sheet in `fy.ts` | Fixed assets / accumulated depreciation / reserves lines |
| 9 | Customer/supplier reconciliation | PARTIAL | `customerRecon()`, `gst-recon.ts` | Allocation-level matching |
| 10 | Rent vs deposit | PARTIAL | `receiptKind()` deposits never rent; tests | Hosted check on real receipts |
| 11 | Missing-field correction | PARTIAL | Exact-label corrections refresh typed proposals | Unknown labels stay as details by design |
| 12 | Historical protection | PARTIAL | Closed-period triggers `0062`, `0069`; close evidence; recovery authority `0072/0073` | Coverage of every derived calculation |
| 13 | Assets & depreciation | PARTIAL | Book/tax depreciation, monthly prepare cron, posting once per asset-month | Impairment/disposal postings added (`eventPostings`, AssetBooks post button, stable ids, closed-period refusal; `asset-events-posting.test.ts` 3 tests). Still missing: browser check of posting on a real asset |
| 14 | Investments & corporate actions | PARTIAL | Bonus/split/merger in recon, retained events `0064`, ISIN dedup | Ownership share (`sharePct`) and broker-cash overlap audit (`brokerCashOverlap`, 4 tests) done; manual price overrides with history (`price-overrides.ts`, 3 tests). Licensed live feed BLOCKED (owner choice) |
| 15 | Acceptance suite | PARTIAL | PGlite DB tests, scripts/browser checks | §71 22 cases end-to-end on real documents |

## Current task (resume here)
Next: rank 2 universal EvidenceRef on register figures (assets, leases, opening lines), then rank 3 server approval for register changes, rank 7 GST credit notes/amendments, rank 8 fixed-asset/reserve opening lines, rank 9 allocation-level matching, rank 12 derived-calculation freeze coverage. Rank 6 BLOCKED (owner deferred schema); ranks 10/15 need real documents.
