# Ledgerline continuation checkpoint — 8 Nov 2026 P1 intake batch

## Latest P1 batch
- Smart Add now retains explicit document intent for scanned images and asset context for invoice entry; asset Add from invoice opens the sheet, not a page. The batch-statement shortcut also opens the in-place file picker.
- 29 targeted automated checks passed; Statement Desk 17 browser cases passed. Photo raw-byte preview/corrections/hide-resume/failed-save retry/double click linked single-entry save passed at 390/834/1280 with synthetic adapters only.
- Existing claim/asset post-save suggestions are not a completed source association; representative payment OCR, asset/PDF/holdings in-place end-to-end and hosted DocuRepo readback remain open.
- Credit observation: workspace 1,029.88, conservative cap 925.87 including protected 300 reserve; usable planning allowance 625.87. See docs/evidence/p1-intake-2026-11-08.md.

## Latest P0 batch
- Upload-time owner-read Undo baseline retained, same-source later edits blocked, server uses saved owner upload history. Preferences are not immutable authority; staged database release still pending.
- 17 actual-component synthetic browser cases passed; full suite 2,080 passed before one final added privacy test; final privacy/snapshot 9 passed. Exact evidence: docs/evidence/p0-checkpoint-2026-11-08.md.
- Hosted workflow acceptance draft is confirmed isolated, but this Main session cannot execute its authenticated storage tests. Do not use drafts sharing the live database. Original-byte hosted downloads/revocation/expiry remain open.
- Full account/source/draft unknown-outcome cross-device recovery and immutable operation receipts remain open; no false P0 completion.
- Old one-off test failure identity/stack unavailable; current captured full suite passes, intermittent defect remains undiagnosed.
- Latest observed balance 1,035.71; conservative cap remaining 931.70 including protected 300 reserve. No real records, publishing, policies, migrations or approvals changed; no UI redesign.

## Credit position
- Workspace balance 1,039.12 (was 1,148.01 at the 19:05 snapshot). Conservative cap remaining ≈ 940 of 1,100 including the untouched 300 reserve.

## Last completed batch (owner iPhone defects A–F)
- Smart Add panel mode (no nested page chrome), Review (Needs checking / Checked / Set aside + Bring back, grouped de-duplicated reminders), accounts with honest balance labels behind Manage account, More directory with search/categories, Today density, 320px overflow fixes.
- Tests: full suite 2,075/2,075 on the final run (one flaky failure on the previous run); browser fixture check scripts/browser/test_journal_uix.py passes at 320/375/390/430/834/1180/1440. Evidence: docs/evidence/companion-v2/.

## Holds (unchanged)
- No publish, no real-record changes, approval trigger off, staged SQL not activated.

## Open P0 (need isolated hosted endpoint or owner activation approval)
- Full-upload durable recovery across all stages; trusted upload-time pre-Undo snapshots; production atomic Undo activation; hosted shared-file denial/revocation.

## Open P1 / UIX
- Smart Add statement batch review styling and CSV/PDF batch browser test (no double posting, closed period, workspace isolation).
- Demat holdings via Smart Add browser test; Bring back browser test with fixture data.
- Remaining route families on companion styling; plain-language pass on remaining pages; axe accessibility + focus-trap scan.
- Owner's six iPhone screenshots never received; real iPhone/iPad checks pending.

## Exact next action
1. Verify asset invoice / holdings PDF through Smart Add → existing DocumentIntake/InvestmentReview → source-linked persisted readback with isolated fixtures.
2. Finish source-aware asset and claim post-save handoffs without a second financial posting. Preserve current UIX; no broad redesign.
