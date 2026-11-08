# Six-requirement closure acceptance — 8 Nov 2026

Development preview, no production records/policies/migrations/approvals/publication. Synthetic local adapters explicitly labelled. Source read: .lovable/specifications/v6.0.md and both original registers; historical export context .lovable/requirements-v5.0-consolidated.md.

## Exact criteria and decisions

| ID | Original criterion | Fixed/observed result | Final |
|---|---|---|---|
| V60-0016 | 4. Financial reconciliation. | Real /statements → /inbox → /account-reconciliation → /vault driven using same saved 250/480 debits; status is correctly Statement-matched, NOT falsely balance-verified without independent closing evidence. Same original downloaded after reload. Full owner/entity isolated persistence/exception coverage not passed. | PARTIAL; hosted portion BLOCKED on authorised isolated acceptance |
| V60-0026 | 14. Financial reporting. | Actual /reports from same saved dataset and source; CSV/PDF contents agree. Prior XLSX byte/content test retained. Broad reporting, owner/entity isolation and complete frozen report workflow exceed this observed case. | PARTIAL |
| V60-0058 | * Asset purchase invoices. | Register was already VERIFIED COMPLETE from prior intake/SQL evidence; previous chat incorrectly described it as partial. Added real file reader → proposed invoice asset → explicit use date/life/residual/capitalisation → one document-linked asset → reload, extractor mocked. | VERIFIED (pre-existing, not newly promoted); non-mocked extraction acceptance still open |
| V60-0066 | Upload → Identify → Extract → Validate → Match → Classify → Prepare Records → Confirm Where Required → Save → Reconcile → Audit | Connected bank screens and non-bank invoice review driven. Claim recovery fixes improve independent failure behavior. Every bank/non-bank pipeline-stage failure is not newly verified; immutable upload authority remains external. | PARTIAL; authority activation BLOCKED pending separate approval |
| V60-0082 | Every document processed through Statement Desk must be stored in DocuRepo with appropriate access controls. | Actual DocuRepo contains same statement source after reload and downloads original bytes. Local adapter cannot certify hosted owner/editor/viewer/unrelated/revoked/issued-link expiry. | PARTIAL; hosted portion BLOCKED on authorised isolated endpoint/test identity access |
| V60-0716 | 5. Upload an asset invoice and generate a proposed asset record. | Uploaded image bytes pass actual FileReader/preparation into controlled extractor; actual proposed values 150000, invoice date 2026-04-01; confirmed use date 2026-04-02/life10/residual0; one source-linked asset and document survive reload. Extractor still mocked, so original acceptance is not fully certified. | PARTIAL; non-mocked extraction and actual asset/vault screens remain executable gaps |

No six-target promotion invented. One historical criterion newly promoted: HC-0031, “Add CSV and PDF exports for my expenses, reimbursement payments, and department budget summaries.” Actual controls download all six files; PDFs parsed and CSV content checked against 250/480 expenses, 40 received reimbursement, 730 department spend. No hosted dependency exists in this bounded browser-side export criterion. H-7591 not promoted: its Reports Centre integration/multiselection context needs broader evidence.

## Missing issues fixed
- Wrong explicit purchase could be replaced by another preparation because both subjects were named entries; compare normalized entry sets now.
- Pending recovery could be overwritten by automatic writes; writes pause until Resume saved preparation or Start this claim.
- Advance choice was omitted from durable preparation; optional backward-compatible field now retains it without auto-applying an advance.
- Switching claim/asset unmounted claim processing; claim remains mounted after first opening, hidden when not selected. Actual PDF generation single-flight guard; unmount cancels further processing.
- Interrupted PDF save lost report ID/blob after reload; encrypted owner-bound frozen bytes/job/row checkpoint before upload restores same job and retry uses the same report ID/path/content. Cleared after successful history readback and owner cleanup. One pending job per owner; pre-version/checkpoint interruptions and cross-device retrieval are not certified.

## Acceptance evidence
- 29 targeted tests pass: source recovery, encrypted preparation/job storage, Smart Add source handoff, reports values.
- test_connected_finance.py PASS: actual connected routes with strict external-write block; historical/audit reads are stubbed, NOT hosted evidence. Same original bytes retrieved after DocuRepo reload. All three requested CSV/PDF report families validated by parsed contents.
- test_claim_recovery.py PASS: real builder and real encrypted recovery hook/storage, preparation save/reload, confirmed generation with double-click, deliberately failed first upload, reload frozen PDF, retry, exactly two upload attempts/one logical report, snapshot claimed37.02 and exact saved/download bytes. Cloud service adapter synthetic; standalone actual builder, not full Smart Add saved-receipt flow.
- test_asset_document_workflow.py PASS: existing interrupted maintenance recovery plus new invoice proposal/explicit review/save/reload. Extraction mocked. Same displayed initial use-date fill does not trigger an edit; acceptance uses a distinct reviewed date.
- Screenshots inspected: connected Inbox/reconciliation/DocuRepo/reports, invoice proposal and recovered report. PDF iframe screenshot does not certify preview rendering; downloaded PDF bytes validated.
- New fixture import missing export resolved by read-only adapter; unrelated test suite accidentally ran on helper import, fixed with main guard. Old unidentified intermittent test remains unresolved; no attribution to these fixture issues.
- Preview build OK 03:22:47 UTC before final cleanup patch; final signal checked separately. No full-suite/manual build/typecheck.

## Remaining prerequisites
Hosted portions require the authorised isolated backend/storage session and approval to install staged authority there (not Main/Live). Physical/cross-device evidence remains separate. Existing P0 release blockers unchanged. This execution does not claim six requirements closed.

## Credits
Latest measured workspace1009.74 versus prior1020.97: observed decline11.23, workspace-wide not exact task attribution. Usage2764.236989491; conservative cap905.74 including protected300; planning605.74. Update if later measurement changes.

## Changed files
src/lib/claim-preparations.ts/.test.ts; src/components/useClaimPreparation.ts/.test.tsx; ExpenditureReportBuilder.tsx; SmartAdd.tsx; src/components/AGENTS.md; scripts/browser/connected-finance.fixture.tsx, test_connected_finance.py, statement-desk-mocks.tsx, asset-document.fixture.tsx, asset-document-mocks.tsx, test_asset_document_workflow.py, report-builder.fixture.tsx, test_report_builder.py, test_claim_recovery.py; roadmap.md; checkpoint/register/generated requirement docs/credit-budget and this evidence.