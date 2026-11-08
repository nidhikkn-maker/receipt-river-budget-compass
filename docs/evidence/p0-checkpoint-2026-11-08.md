# P0 checkpoint continuation — 8 November 2026

Development preview only. Synthetic fixtures and disposable PGlite databases; no real financial records, policies, migrations, approval triggers or publication changed. Financial Companion styling unchanged.

## Defect, impact and correction

**Defect:** Statement Desk rebuilt Undo's expected revision/reference from refreshed current records. A later amount edit retaining the same source could become the new baseline and be deleted by Undo.

**Correction:** The upload now reads owner-scoped revisions/references during each confirmed save/evidence step and checkpoints them in `undoRows`. New records must have revision 0 before evidence and exactly 1 after evidence; matched records must retain their reviewed revision before linking and advance exactly once. A failed/mismatched read stops the upload visibly. History permits only the initial null-to-linked source transition; stale/later checkpoints cannot overwrite the baseline. Undo takes the saved upload baseline, and the authenticated server re-reads owner preferences instead of trusting a client-supplied replacement. Later same-source edit → reload → Undo produces zero reversal calls and preserves ₹251.

**Not immutable authority:** owner preferences are editable. This correction protects ordinary upload/Undo paths but is NOT a database-bound immutable upload receipt. Missing legacy baselines fail closed. Matched entries with pre-existing evidence require individual review; original evidence restoration is not claimed.

## Observed acceptance

- Focused first run: 53/53 tests across 8 files, including 8 interruption points plus draft/account cleanup, persisted history, source/report figures, atomic SQL refusal/rollback/lost responses and sharing policies.
- Additional preferences/history run: 14/14, including repeated tests above (not additive distinct counts).
- Full suite: 2,080/2,080; captured machine-readable results. This preceded the final added view-only sharing regression.
- Final privacy/snapshot run: 9/9, including the newly added view-only, revoked and signed-out restriction case. Current suite contains one more test than the full run; no claim of a full 2,081-test run.
- Browser acceptance: 17/17 actual Statement Desk/Smart Add component cases, synthetic local store/SQL adapters, all external traffic and writes blocked. Includes CSV byte-content preview, explicit account/row review, double-click single posting, reload/re-upload matching, interrupted evidence recovery in place, failed Undo and cleanup retention, missing staged authority, lost transaction/evidence response and card settlement balances. Final URL remains `/smart` for Smart Add cases.
- An initial browser run against stale transformed modules failed (8 failures/3 errors); fresh reproduction showed captured baseline present, then all 17 passed after preview transformation settled and one assertion waited for actual saved-row state. These failures are retained in temporary logs, not described as initial success.
- Preview build log: build OK at 01:21:22 UTC.

Screenshots and captured test results: `docs/evidence/p0-checkpoint-2026-11-08/`. Screenshots inspected: source preview/review and later-edit refusal. Fixture unfinished-document read error is unrelated mocked data access, not hosted document acceptance.

## Remaining P0 release blockers

1. **Full durable upload recovery:** account creation/source metadata/draft file outcomes and unknown commits across a new authorised device are not all bound to immutable operation receipts. Current source-first checkpoints and fresh re-review prevent duplicate ledger identities, but unknown outcomes must stay interrupted. Isolated controller/database/browser coverage does not close cross-device hosted acceptance.
2. **Trusted immutable upload baseline + atomic Undo release:** install compatible upload-bound authority and staged atomic Undo only after explicit release approval. No unapproved database changes were made. Preference baselines are not a substitute for this authority.
3. **Hosted shared-file signing/download/revocation:** surface listing confirmed `Hosted workflow acceptance` has its own test database. The current main-session tools do not provide its authenticated storage execution context. Do NOT use the two other drafts that share the live database. Local installed-policy acceptance passes editor/viewer/unrelated/personal/other-company/revoked/signed-out cases, including the permissive legacy team policy. Hosted original-byte browser download (previous empty-file result), denial, revocation and existing bearer URL expiry still need execution in that isolated draft. Previously issued URLs are designed to remain usable for up to 60 seconds; instant revocation is not claimed.

## Intermittent automated failure

The earlier 2,074-pass/one-failure run's failing test name/stack is absent from retained execution logs and checkpoint. The current full run passes 2,080 with JSON output retained. This cannot identify or disprove the old intermittent defect; diagnosis remains open rather than calling it harmless. Browser timing failure observed this batch was separately corrected by waiting for persisted row state and is not attributed to the unidentified Vitest failure.

## Requirements and credits

V60-0066 and V60-0082 evidence appended; both remain PARTIAL. V6 counts unchanged: 566 verified / 331 partial / 2 blocked. No historical-count promotions.

Owner start balance: 1,039.12. First tool balance: 1,040.11. Latest tool balance: 1,035.71 at approximately 01:21 UTC. Tool-to-tool observed decline: 4.40; billing usage growth: 4.404. These are workspace observations, not exact task attribution. Conservative cumulative cap charge: 168.30 (workspace usage growth from retained baseline, rounded upward), cap remaining 931.70, of which 300 remains reserved; planning allowance after reserve 631.70. No invented explanation for the initial balance difference.

## Exact changed files

- `src/lib/statement-pipeline/apply.ts`
- `src/lib/statement-pipeline/history.ts`
- `src/lib/statement-pipeline/atomic-undo.functions.ts`
- `src/lib/statement-pipeline/upload-snapshot.test.ts` (new)
- `src/lib/statement-pipeline/AGENTS.md`
- `src/lib/preferences.ts`
- `src/routes/_authenticated/statements.tsx`
- `src/lib/books/company-upload-workflow.test.ts`
- `scripts/browser/statement-desk-mocks.tsx`
- `scripts/browser/test_statement_desk.py`
- `.lovable/requirements/register.json` and generated `docs/MASTER_REQUIREMENTS.md`
- `.lovable/credit-budget.json`, `roadmap.md`, `docs/CHECKPOINT.md`, this evidence report and its captures.