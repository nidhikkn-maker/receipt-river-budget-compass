# Prioritised acceptance — 8 November 2026

## Scope and outcome
No application financial logic changed. Added narrowly scoped acceptance tests and opt-in actual invoice-reading workflow. No Cloud records, policy/approval activation, migrations or publication.

- **V60-0716 newly verified for its literal mandatory test in an isolated environment:** synthetic asset invoice uploaded, existing real AI reader (not mocked) returned the printed facts, real DocumentIntake review confirmed them, lost-response replay saved one source-linked asset, and actual Assets/DocuRepo route components displayed the retained record after reload. Authentication/privacy/database adapters are synthetic; not hosted service persistence certification. V60-0058 remains verified and was not reopened.
- **V60-0016 stays PARTIAL:** isolated checkpoint exception/restart/recovery and account separation now pass. Broad reconciliation and hosted end-to-end owner/entity evidence remain outside this narrow acceptance; do not infer general financial readiness.
- **V60-0026 stays PARTIAL:** real frozen PDF, source/entity account filtering, applied history owner RLS, interrupted insert/readback, disk restart and unchanged original bytes pass. Complete reporting-family/ownership comparisons and hosted persistence remain unverified.

## Executed tests
**26/26 focused tests passed on final combined run** in statement-review-sql, statement-pipeline/workflow-persistence, report-frozen-persistence, report-save and report-jobs-recovery.

### Reconciliation
- Applied existing statement identity/checkpoint SQL in disposable disk-backed PGlite, not Cloud.
- Original opening 1000 and debit 200 produce closing 800 only after independent source review; before review the persisted exception is Requires Review / Not Verified.
- Exception survives close/reopen; unrelated owner sees no checkpoint; unrelated account amount 999 stays outside comparison.
- Reviewed source resolves to Reconciled / Verified / difference 0 / matched 1; lost reply replay retains one checkpoint ID.
- Correction revision 1 rejects stale save, adds no checkpoint, and invalidates old certification after restart.
- Existing connected persistence suite covers saved source links, duplicate-safe replay, report totals and Undo.

### Actual invoice reader and saved screens
- One real inference through existing extractDocument; no model, prompt, parser or save-path changes. Only auth/privacy/owner reads are disposable adapters.
- Synthetic PNG includes invoice INV-GEN-44, supplier Engineering Works, generator GEN-44, cost INR150000, invoice 2026-04-01, put-to-use 2026-04-02, life10, residual0, straight-line method.
- Reader returned exact cost/date/serial/life/residual and source quotes. Browser consumed that retained real result against the same uploaded image; inference response delivery is replayed, not a second model call or hosted RPC test.
- Real review explicitly confirmed fields and the local capitalisation checkbox; production approvals unchanged.
- Injected committed-save/lost-reply → Retry: one commit, one document, one asset, asset.docId equals saved document.id, original data URL retained.
- Actual /assets and /vault route components read saved local records after reload; screenshots inspected. Ancillary property/depreciation/verification/obligation panels stubbed; not their acceptance. DocuRepo title is the canonical filed title, not the AI's suggested title.
- Browser driver: scripts/browser/test_actual_invoice_records.py. Opt-in reader: scripts/check-actual-invoice-extraction.ts. The driver requires the reader output and same synthetic PNG under /tmp/browser/invoice-acceptance.

### Frozen reporting
- Owner A source200.25, same-owner other entity/account999.99 and owner B888.88 persisted as distinguishable fixtures.
- Applied report_history migration owner RLS; browser-visible owner rows exclude B and report account filter excludes second entity.
- Real ReportDoc + real jsPDF, pdf-lib page validation and pypdf text extraction assert200.25 and absence of excluded figures; category plus transaction sections mean rowCount2, while actual entry count remains1.
- History insert commits but reply and first readback fail; PDF retained. Disk close/reopen → exact owner/id/path/size readback → one upload/insert, same PDF bytes/SHA256.
- Later ledger change to350 leaves frozen original unchanged; source entry/document IDs retained in report metadata. Other owner cannot read or insert owner A history.
- File bytes use disposable local filesystem, not private Cloud storage; no claim of hosted signing/access acceptance.

## Failures during fixture development
Resolved test-harness errors: privileged fixture revision read under an ungranted role; optional revision/checkpoint narrowing; report rowCount interpretation; raw PDF coordinate bytes mistaken for financial text; seeded serial collision; required local capitalisation checkbox; untransformed helper import and canonical DocuRepo title. Final focused run has zero failures. Earlier failures are not concealed as successful acceptance.

## Explicit blockers
- **V60-0066 P0:** all-stage bank/non-bank interruption and immutable upload authority remain incomplete; installing authority/atomic protections requires separate approval and compatible release.
- **V60-0082 P0:** current Main environment shares Live; owner/editor/viewer/unrelated hosted access, revocation and issued-link expiry need an authorised isolated hosted session. Never create fixtures in Main/Live.
- **V60-0016 P0 / V60-0026 P1:** broad module and hosted acceptance remains partial; these local tests do not close their entire source clauses.
- Full in-sheet claim/source integration and cross-device frozen-PDF recovery remain open; no next-workflow completion claim.

## Credits
Measured workspace **990.33**; period usage **2783.648297743**. Earlier current-turn measurement1000.88; observed workspace decrease10.55, not task-exclusive usage. Conservative cumulative charge213.67 against1100 cap, cap remaining886.33 including protected300 reserve; planning allowance586.33. Later chat/tool charges not included.