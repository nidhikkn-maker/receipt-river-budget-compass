# Ledgerline V5.4 — Initial audit and release-gate assessment

**Date:** 1 November 2026 UTC. **Recommendation: NOT approved for full financial use.**

This is an initial evidence-based audit, not the completed ten-stage acceptance programme. No production financial records, documents, user accounts or settings were modified. Nothing was published and no paid infrastructure was activated. Source inspection findings are distinguished from executed tests and operational verification.

## 1. Application Architecture Review
TanStack Start/React client, Lovable Cloud owner-scoped records, a shared client store, pure ledger/planning/report functions, authenticated server functions and privileged scheduled workers. See AGENTS.md and src/lib/AGENTS.md. Architecture inspected; end-to-end isolation/security not yet certified.

## 2. Complete Feature Inventory
Inspected areas: sign-in/device lock; manual/receipt/voice/repeat entry; encrypted drafts/offline snapshots; accounts/cards/loans/investments; transactions/splits/workspaces; budgets/planning/calendar; reimbursements; travel/bookings/itinerary/advances; vault; statement imports/rules/review/reconciliation; AI; PDF/claim/expenditure reporting; backups; search/settings/themes; reminders; read-only external assistant access. Availability in source is not a functional Pass. The requirement register retains individual unresolved checks rather than treating visible screens as acceptance.

## 3. Test Case Register
requirement-register.csv enumerates checklist requirements with source line, status, expected result, execution steps, owner, evidence and retest fields. Requirements not exercised individually remain Blocked/unassessed. Exact financial scenarios are in src/lib/financial-audit-v54.test.ts. Do not confuse the broad register with completed coverage.

## 4. Test Execution Results
Initial regression: 655 tests/77 files passed. Final regression: 663 passed and **3 expected failures**, 78 files, 666 total. Expected failures demonstrate unresolved defects and are NOT successful financial acceptance. Latest preview build log: build OK at 04:52:55 UTC. No manual build/typecheck was run.

## 5. Financial Calculation Verification
Eight controlled in-memory F-001–F-008 helper scenarios passed:

| ID | Expected and observed helper result | Scope |
|---|---|---|
| F-001 | Bank 97,500; spending 2,500 | Ledger and position cash |
| F-002 | A 85,000; B 35,000; total 120,000; income/spending zero | Ledger |
| F-003 | Bank 100,000; card liability 10,000; spending 10,000 | Ledger |
| F-004 | Bank 90,000; card zero; cumulative spending 10,000 | Ledger |
| F-005 | Bank 92,000; net spending 8,000 after 2,000 refund | Arithmetic only; original/refund linkage not certified |
| F-006 | Personal 4,000; Business 6,000; one payment 10,000 | Shared workspace helper; legacy report fails separately |
| F-007 | Bank 90,000; Business cost 10,000; separate receivable 10,000 | Helpers; no actual cloud write |
| F-008 | Receipt 6,000; outstanding 4,000; bank 96,000; ordinary income zero | Helpers; Home/AI fails separately |

No real posting, authorised correction, audit-history, or replay acceptance was performed in this audit stage. Previous checks are historical evidence only, not substitutes for the requested isolated retest.

## 6. Statement Import Audit
Durable staging, explicit approval, fingerprints, four-page scanned extraction chunks and lease recovery exist. Existing import tests reran within the suite. New isolated posting/reimport/overlap/completeness/worker concurrency acceptance is Blocked. Dense-page completeness and stale-worker fencing need review; no historical user statement was imported.

## 7. Workspace Allocation Audit
F-006 conserved one payment and returned exact shares. Legacy Business export omits a Business share when the parent scope is Personal (confirmed expected-failure D-FIN-002). Workspace-specific cloud permissions and budgets require isolated runtime checks.

## 8. Reimbursement Verification
Reimbursement helpers correctly compute 6,000 received/4,000 remaining. Home/AI position pendingAmount sums original pending expense amounts instead of remaining claims (D-FIN-001); expected 4,000, implementation gives 10,000. No provider answer or real claim receipt was exercised.

## 9. Travel Manager Verification
Travel, booking, itinerary, advance and closure logic exist; existing pure tests passed. New isolated booking/payment/refund/closure E2E is Blocked. Actual phone interactions not executed.

## 10. PDF Report Verification
Existing report tests passed, not a fresh inspection of every generated document. Recovered jobs reload current data rather than a frozen request snapshot; worker reads are unpaginated; enqueue errors are not checked. Browser/server generation may compete for the same artifact. Non-Latin server PDFs fall back to question marks. These prevent full report acceptance.

## 11. AI Numerical Accuracy Report
The assistant receives deterministic position facts, but deterministic does not necessarily mean correct: partial claim outstanding is overstated (D-FIN-001). Gross/net breakdown semantics and future-dated balances require dedicated verification. Existing timing tests exclude unconfirmed income and deny later salary for an earlier bill; this is automated helper coverage, not live AI accuracy certification.

## 12. Security Assessment
Quick database scan returned one informational finding: guest identities pass through signed-in access rules. This does not prove cross-owner exposure and was not changed. Production dependency scan found high/moderate transitive advisories involving source-map-js, js-yaml, zod, brace-expansion, seroval, glob and minimatch; exploitability/reachability and compatible fixes remain to assess. SheetJS external-tarball dependency was not checked by the registry scanner. Deep security scan started; its results are pending and no clean-security claim is made. No sign-in configuration was altered.

## 13. Backup and Recovery Results
Atomic record restore and fresh file staging exist. Source review identifies an ambiguous-commit risk: if records commit but the response is lost, client cleanup may delete the newly referenced files. This is a Critical risk requiring isolated reproduction, not a demonstrated live incident. ZIP allowlist omits drafts and newer report/import/idempotency records; embedded preference account references are not completely remapped. No actual restore was run because this environment is not isolated.

## 14. Mobile Usability Review
Previous emulated evidence is historical only. This audit did not perform a fresh phone sweep, real iPhone, Face ID, installed-app offline cold start, keyboard/safe-area, sharing or assistive-technology acceptance. These remain Blocked/Pending, not Pass.

## 15. Performance Test Results
Controlled in-memory accountBalance/cashflow/workspaceTotals at 100/1,000/10,000 rows, 20 repetitions. Correct balances and totals observed. Median combined helper times: 0.034 / 0.062 / 0.376 ms; observed high-end samples: 1.011 / 1.876 / 4.033 ms. Environment-dependent microbenchmarks only; not UI, network, upload, OCR, saving, search or report-generation timing. Raw evidence in performance.jsonl.

## 16. Defect Register
| ID | Severity | Status/evidence | Impact |
|---|---|---|---|
| D-FIN-001 | High | Executed expected-failure; position.ts:76,103 | Home/AI overstated partial claim remaining |
| D-FIN-002 | High | Executed expected-failure; reports.ts:33–43 | Legacy report omits split Business allocation |
| D-FIN-003 | High | Executed expected-failure; ledger.ts:59–82,119–128 | A manual 1,100 loan split moves full 1,100 principal; expected principal 980/interest 120. Dedicated EMI workflow uses separate correct entries; universal-entry normalization requires correction/retest |
| D-REC-001 | Critical risk | Source-supported lost-response scenario; settings.tsx:99–108 | Successful restore may lose referenced staged binaries during cleanup; isolated reproduction pending |
| D-REC-002 | High | Source review; backup.ts:3,28–49 | Backup scope and cross-account remapping incomplete |
| D-JOB-001 | High | Source review; receipt/document extract functions and vault.tsx | Receipt/document OCR has no recoverable persisted completion job |
| D-REP-001 | High | Source review; report-centre.tsx:81–104/report-jobs.server.ts:13–77 | Enqueue failures, data drift, unpaged rows and artifact races |
| D-REP-002 | High | Source review; pdf-unicode.ts server fallbacks | Non-Latin background PDF fidelity incomplete |
| D-DEP-001 | Unassessed exposure; scanner High/Moderate | Dependency scanner | Known library advisories need reachability review and compatible updates |

Owner: Ledgerline development. Date: 1 November 2026. No correction retests claimed; three financial reproductions are retained in the project.

## 17. Corrective Action Plan
1. Establish a genuinely isolated cloud test environment before financial writes, restore, user/permission manipulation or destructive fault injection.
2. Approve targeted corrections: remaining reimbursement facts; legacy allocation reporting; principal/interest treatment; restore operation receipts and ambiguity-safe cleanup.
3. Define full backup scope and remap embedded links; make accepted OCR/document jobs durable; freeze report inputs, paginate reads, enforce artifact ownership and preserve Unicode.
4. Assess/update compatible vulnerable dependencies in isolation.
5. Execute isolated negative/replay/concurrent/offline/restore/job tests, then all critical regression and mobile/performance checks.

## 18. Regression Test Results
663 successful tests plus 3 intentionally failing defect reproductions. Regression suite passing as a test runner does not remove the three failing business requirements. Evidence logs preserved alongside this report. No application behaviour was changed by this audit.

## 19. Outstanding Risks
The current main project uses the live database. A V5.4 draft was created with an explicit instruction to stop all mutating work unless isolated; its creation result confirms it also uses live data. Therefore it is NOT a safe destructive test environment. Deep scan, isolated cloud workflows, real device/provider tests, live schedulers, full PDF output inspection and complete performance acceptance remain unresolved. Prior claims that all requirements were complete are superseded by this evidence-based assessment.

## 20. Final Production Readiness Recommendation
**Do not approve for full financial use.**

| Mandatory gate | Current status |
|---|---|
| Correct financial calculations everywhere | Fail: 3 concrete financial integration defects |
| Transfers/card settlements | Helper Pass; isolated posting Blocked |
| Repeated import idempotency | Regression coverage Pass; requested isolated retest Blocked |
| Workspace allocations/reports reconcile | Partial/Fail: shared shares Pass, legacy export Fail |
| Reports match ledger | Partial; report recovery/Unicode/volume gaps |
| Authorisation negative tests | Blocked in isolated environment; scan pending |
| Backup restore demonstrated | Blocked; Critical ambiguity risk unresolved |
| Draft recovery demonstrated | Historical/automated evidence only; fresh isolated acceptance Blocked |
| Persistent accepted jobs | Partial: imports/reports exist, receipt/document jobs missing |
| No critical usability blocker | Not established by fresh full device testing |

This assessment is not a release approval or an assertion that private data has been exposed. The next stage requires isolation and approved corrections.
