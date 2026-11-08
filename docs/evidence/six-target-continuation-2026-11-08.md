# Six-target continuation — 8 Nov 2026, 03:38 UTC

Preview-only source changes; no production data, migrations, policies, approvals or publication. This batch does not close the six-target batch and does not begin optional expansion.

## Exact remaining acceptance gaps
| ID | Severity | Exact missing behaviour/evidence | Next action / blocker |
|---|---|---|---|
| V60-0016 | P0 | Full owner/entity-isolated reconciliation persistence and exception recovery are not certified. Existing connected screens correctly stop at statement-matched without independent closing evidence. | Complete isolated persistence/exception acceptance; hosted proof needs authorised isolated endpoint/session. |
| V60-0026 | P1 | Broad reporting/frozen report comparisons and owner/entity isolation exceed the connected export case. | Finish full report-history and source/entity comparisons; hosted portion requires isolated environment. |
| V60-0058 | P1 additional evidence | Already VERIFIED COMPLETE; new invoice case still substitutes extractor and saved-screen readout. No new failure established against prior acceptance. | Retain verified status; add non-mocked extraction and actual asset/vault screen evidence. |
| V60-0066 | P0 | Every bank/non-bank stage interruption is not covered; client upload checkpoints are not immutable cross-device authority. | Stage-specific recovery acceptance; staged authority installation needs separate approval, never Main/Live. |
| V60-0082 | P0 | Local original-byte retrieval cannot prove hosted owner/editor/viewer/unrelated denial, revocation or issued-link expiry. | Authorised isolated hosted storage session and test identities required. |
| V60-0716 | P1 | Non-mocked invoice extraction and saved actual asset/vault screens remain unverified. | Exercise existing reader with authorised synthetic invoice and actual screens; no second parser. |

## Buildable recovery defects corrected
- Frozen claim PDF was checkpointed only after report-version lookup. A failed lookup followed by reload lost the PDF while retaining preparation. Now bytes, report ID/path and snapshot checkpoint before that network read.
- Version resolution is checkpointed once; failed lookup/reload retries the exact job. Unresolved local PDFs disable replacement generation so they cannot accidentally be replaced by another report.
- Successful history insert acknowledgements previously bypassed readback. Every outcome now verifies exact owner/id/path/size before reporting saved. Unknown or mismatched outcomes retain bytes and retry the same identity.
- Existing statement PDFs retain version 1 and existing layout/finance rules; no redesign or new save pipeline.

## Executed acceptance
- **36/36 focused tests**, five files: claim-preparations (5), useClaimPreparation (6), report-save (6), reports (8), SmartAdd (11). New failures asserted for version lookup and acknowledged-but-mismatched persistence.
- **Actual claim builder/encrypted device store:** save preparation → reload → generate/document confirmation → failed version read → reload with same PDF → upload failure → reload → retry → one saved logical report. Version reads 2, upload attempts 2, claimed 37.02, downloaded PDF equals uploaded bytes; no runtime errors. Synthetic service adapter, not hosted certification.
- **Five actual PDF builder cases:** desktop/tablet/phone statement plus detailed/summary claim; original bill page dimensions preserved, missing evidence explicit, lost insert response recovered, one upload/insert, downloaded bytes equal upload. Zero runtime errors.
- **Connected real screens:** Statement Desk → Inbox → Account Reconciliation → DocuRepo reload/original-byte retrieval → Reports; actual CSV/PDF expenses/reimbursement/department exports compare 730/40/730. External writes blocked, audit/historical reads stubbed. No hosted/entity-isolation claim.
- Fresh unmodified live app opened `/auth` with zero page errors. Existing preview telemetry contains older generic module-import failures; fresh local navigation did not reproduce them. Build log latest **build OK 03:37:55Z**.
- Recovery screenshot inspected; PDF iframe rendering not certified by screenshot, only actual download bytes/content checks.

## Status / scope
No newly completed requirement IDs. V60-0058 stays previously VERIFIED COMPLETE; other five remain PARTIAL. No full six-target closure claim. Full Smart Add receipt → eligible claim/PDF integration, non-mocked invoice intake, cross-device recovery, hosted document access and immutable authority/atomic Undo activation remain open. Exact original one-off intermittent failure remains undiagnosed, not repeated broadly.

## Actual credits
Measured workspace **1002.46** at 03:38:32 UTC; period usage 2771.521989491. Start tool balance 1007.10; observed workspace decline **4.64**, not exact task attribution. Conservative cumulative cap charge **201.55**, cap remaining **898.45**, planning allowance after protected **300** reserve **598.45**. Later tool/chat charges are not included in this measurement.