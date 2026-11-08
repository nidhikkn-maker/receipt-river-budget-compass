# Ledgerline continuation checkpoint — 8 Nov 2026 P1 handoffs and exports

## Latest P1 batch
- Smart Add asset follow-up links the same payment/transaction; receipt originals remain in DocuRepo through existing vaultItems. Claim follow-up opens the existing builder in the sheet with the saved entry ID, not a route jump. No second original upload/payment.
- 41 focused tests, 18 statement cases, Smart Add asset/receipt browser at 390/834/1280, 5 PDF builder cases and asset-document/document-search browser checks pass. Same-statement CSV/Excel/PDF download and balance 1000→270→Undo 1000 verified with synthetic adapters.
- Full in-sheet claim PDF/resume, actual same-data Inbox/reconciliation/DocuRepo screens, asset-invoice/holdings PDF and hosted readback remain open. No requirement promoted.
- Latest workspace 1,020.97; conservative cap 916.97 including protected 300 reserve; available planning allowance 616.97. See docs/evidence/p1-handoffs-2026-11-08.md.

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
2. Verify in-sheet claim preparation/PDF/recovery with saved receipt source; continue the same synthetic dataset through actual Inbox/reconciliation/DocuRepo screens. Preserve current UIX; no broad redesign.
