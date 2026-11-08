# Grouped financial functionality — 8 November 2026, 04:42 UTC

## Actual functionality delivered
- Reports filter by company or Personal using the existing effectiveEntity rule; manual ownership overrides account inheritance. CSV/Excel/PDF use the selected ledger and linked claims, company heading and filename. Existing appearance is unchanged apart from requested workflow controls.
- Shared-company Excel has company/access metadata, exact owner/company entries and document sheets with IDs, numeric INR and literal cells. Other companies/owners never enter exports. PDF spending uses decimal money totals.
- Account checks export current saved reconciliation status, period, closing/difference availability, unresolved count, check timestamp, statement source/path/reference and linked ledger IDs in CSV/Excel/PDF. Prepare PDF and separate Download retain the existing workflow; absent evidence stays Not Verified.
- Supplier/customer balances now count effective amendments and signed notes. Narration must uniquely identify a party (or unique GSTIN); ambiguous payments no longer settle an arbitrary first party. Duplicate payment IDs are not reused for a party.
- GST add/edit/allocation/removal validates the entire retained list, including untouched bad allocations, wrong registration/customer, replaced/note/purchase targets and nonfinite/negative money.
- Differing-rate allocations now propose the minimum supported advance/invoice tax heads and remaining capacity; residual tax remains on the advance rather than over-adjusting the invoice. Over-allocation fails before save. Saved lower-rate adjustment persists once across retry/restart.
- PDF headings/subtitles wrap and use existing Unicode helpers, retaining long company/period descriptions and Tamil support without changing report formats or UIX design.

## Changed-path verification only
- 50 tests in nine relevant files passed (shared-company, company-report, gst-special, reconciliation-report, recon-ambiguity, recon, recon-extra, allocation-recon, reports).
- One new disposable owner-RLS disk integration test passed: owner/company isolation across all six export families, real XLSX roundtrip, actual receipt50 vs expense200.25, lower-rate GST adjustment60, retry/restart single identity and unrelated-owner denial. Total **51 distinct tests**, not rerun counts.
- After the final nonfinite-money correction, only gst-special and grouped persistence reran:11/11 pass. No unrelated old acceptance/full audit rerun.
- Actual routes: company Alpha CSV/XLSX/PDF contains200.25 and excludes personal888.88; reconciliation CSV/PDF retains Not Verified. Downloaded PDF text and screenshots inspected. Driver retained in scripts/browser/test_grouped_exports.py; synthetic adapters, no Cloud writes or hosted certification.
- Latest preview build OK04:42:22UTC. Initial test fixture Blob environment/required fields and PDF linewrap assertions were corrected; final failures0.

## Requirement status and remaining work
- **No newly closed IDs:** broad V60-0016/0026 still require complete source-clause coverage; narrow export/reconciliation functionality and all-family isolated readback are delivered, not proof of every accounting/financial workflow.
- Related V60-0021 GST, V60-0696 connected reconciliation/classification and V60-0731 material source traceability advanced. Existing supplier/customer clauses0307/0308 remain verified; improved safeguards do not reopen them.
- **V60-0716 and V60-0058 stay verified**, not rerun.
- **P0 V60-0066:** immutable upload authority/compatible production protections require separate approval; full every-stage coverage remains open.
- **P0 V60-0082:** owner/editor/viewer/unrelated hosted reads, denial, revocation and expiry require an authorised isolated hosted environment.
- **P0/P1 broad reconciliation/report coverage and full in-sheet claim/source recovery** remain open; remaining material tax/holding traceability and register workflow gaps are next, not redesign or repeated reporting.
- No publication, production migrations, policies, safeguard activation, real financial writes, additional AI inference or optional design work.

## Measured credits
Start988.23 / period usage2785.748297743; final981.14 / usage2792.845297743. Observed workspace decrease**7.09**, usage growth**7.097**; shared workspace measurements are not exclusive task attribution and later charges may follow. Conservative cumulative cap charge222.87 of1100, remaining**877.13**, including protected300 reserve; expansion allowance577.13.