# Connected capture, claims and recovery — 8 November 2026

## Functionality delivered
- All eight document contexts survive the shared Smart Add → existing Statement Desk boundary, including scanned investment documents. Existing investment/property/GST/tax/FY/company/DocuRepo upload actions now open that same in-place service; no additional parser, ledger or posting path.
- Claims edit/add bills through the existing NewExpense review mounted in the detail sheet. Exact entry ID retained; refreshed receipts read from store on return; no claim-preparation reset or duplicate expense.
- Detailed expenditure PDFs now checkpoint encrypted exact bytes, frozen snapshot, report identity and annexure list before upload, independently from pending claim and Centre PDFs. Reload restores even when the current activity changes; unresolved PDFs block regeneration. Retry uses the original bytes/identity; owner cleanup removes all three report slots.
- Failed document reading has an immediate retry action using the same parked run. Successful extraction checkpoints before later stages; retained readings bypass repeated extraction. Reopening refuses unknown read outcomes, different original bytes, other-owner runs, terminal runs and cleanup-only runs before writes.
- Explicit investment context now routes scanned originals to DocumentIntake rather than the bank scanned-statement reader; text-readable demat detection still runs first.

## Newly verified IDs
- V60-0072: actual DematHoldings Add holdings action emits investments context (rendered module test); Smart Add tests preserve it on scan/hide/reopen; browser uses real Smart Add and StatementDeskPage and reaches document-review boundary in place. No registration form blocks capture.
- V60-0073: both actual PropertyPanel document launchers emit property context (rendered module test); same shared scan/review boundary verified without a registration prerequisite.
- These are narrow navigation clauses, not extraction, hosted-save or broad-module certification. V60-0074/0075 retain partial status pending actual origin-action connected acceptance. V60-0058/0716 remain verified and were not retested.

## Tests and limitations
- 60 distinct automated tests passed: SmartAdd18, ClaimExpenseDetails1, encrypted claim/expenditure slots7, expenditure-statement15, report-save6, runs9, DocumentIntake retry2, actual module launchers2. Relevant claim financial dependencies add11 passed (claim-workflow6, advance-claim5): total71 distinct. No outstanding failures; initial mock export/router fixture failures corrected and rerun. Known jsdom canvas diagnostic in passing statement PDF test is not browser verification.
- Actual expenditure builder: original PDF → review → confirm → failed upload → encrypted reload → regeneration blocked → retry/lost committed response → one saved history → download bytes identical; source total12.34 and original annexure independently read with pypdf. Zero page errors. Local adapters only, not hosted storage evidence.
- Browser eight-context event → Smart Add → actual StatementDeskPage → document-review boundary passes with no navigation or financial writes. DocumentIntake is stubbed only at the boundary: NOT extraction/save acceptance. Empty-service unfinished-run error visible in fixture is not counted as recovery acceptance. Screenshots under /tmp/browser/capture-context and /tmp/browser/expenditure-recovery.
- Tests retained in src/components/DocumentIntake-retry.test.tsx, ClaimExpenseDetails.test.tsx, books/ModuleCapture.test.tsx, expanded SmartAdd/claim-preparations/runs tests; scripts/browser/test_capture_context.py and test_expenditure_recovery.py retained.
- Final preview build OK06:24:32UTC. No manual build/typecheck or unchanged broad audit.

## Exact remaining gaps and prerequisites
- V60-0016 PARTIAL: all-family source-backed reconciliation/resolution and independent closing evidence; hosted owner/entity isolation needs an authorised isolated hosted project/session with synthetic owners/documents. No Live fixtures.
- V60-0026 PARTIAL: expenditure interruption now covered; specialized exports outside Centre, every material opening/valuation/planning source chain, hosted owner/entity/access acceptance remain.
- V60-0312 PARTIAL: non-GST families still need source-backed resolution/persistence journeys beyond routing/helper checks.
- V60-0068 PARTIAL: changed extraction/retry accepted locally; all-stage bank/card/document failure coverage and actual hosted permission/storage paths remain.
- V60-0066 BLOCKED: explicit approval to install immutable upload-bound authority/atomic Undo with compatible release, plus isolated hosted cross-device interruption environment.
- V60-0082 BLOCKED: authorised isolated hosted two-owner/company private storage environment to check denial, revocation, empty-byte handling and URL expiry; shared production backend cannot host these fixtures.
- Remaining functional next group: loan-document/provenance proposal linking and saved loan/asset journey; broad typed intake/provenance and non-Centre export sources. Optional provider/email work remains deferred.

## Credit measurement
- Start953.31 / recorded period usage2820.670968079; latest941.97 / usage2832.007646181. Workspace decline11.34, not exclusive task attribution; later charges excluded.
- Conservative cumulative cap charge262.03 of1100; cap remaining837.97 including protected300; expansion allowance537.97.
- No production data, policies, migrations, release activation or publishing changes. Current UIX visual system unchanged; only existing action destinations/recovery wiring changed.
