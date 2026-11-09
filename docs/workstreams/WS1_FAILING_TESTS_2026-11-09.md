# WS1: nine failing tests corrected, and the expenditure canvas checked in a real browser

**Date:** 9 Nov 2026 · **Branch:** `claude/git-up-thapal-audit-bbjy2k` · **Status:** complete

## Requirements addressed
- Audit §2 / P0-1: correct the 9 failing tests without reducing financial or security safeguards.
- Verify the expenditure-report canvas (image conversion) workflow in a real browser.

## Root causes

**No application code was wrong.** Each test predated an 8 Nov safeguard and had not been updated for it.

| Tests | Cause | Fix (in tests only) |
|---|---|---|
| `report-centre-all.test.ts` (5), `report-specialized-persistence.test.ts` (1) | Commit `a08ecd5` (8 Nov) added five company report types to `REPORT_TYPES`. `buildReportDoc` (`src/lib/report-centre.ts:181`) correctly refuses to build them without a company's complete ledger. These tests looped over every type using only a personal ledger. | Personal-ledger checks now cover personal report types only. New tests cover the five company types: (a) each **refuses** a personal ledger, and also refuses a company id given without books; (b) each **builds a complete document and PDF** from a company ledger, headed "Company: …", with no leakage from the other company. A coverage test checks that personal and company types together equal `REPORT_TYPES`. |
| `expenditure-builder-workflow.test.tsx` (3) | Commits `0ddf7de`/`4c4d4cc` (8 Nov) made the builder restore an encrypted local copy of an unsaved PDF when the page opens, and **block generation** until that check finishes or if it fails. jsdom has no IndexedDB, so the restore failed ("Saved PDF could not be restored") and generation stayed blocked. | Each test gets a fresh in-memory IndexedDB (`fake-indexeddb`, already used in `claim-preparations.test.ts`), so the encrypted recovery **runs for real**. The statement tests wait for "Generate" to be enabled, as the claim test already did. |

## Files changed
- `src/lib/report-centre-all.test.ts`: personal/company split, plus refusal, company-build and coverage tests.
- `src/lib/report-specialized-persistence.test.ts`: company types excluded from this personal-ledger persistence run, with an explanation.
- `src/lib/books/corporate-fixture.ts` (new, test-only): `corporateFixture`/`entry` moved out of `corporate-statements.test.ts` so the Reports Centre tests can reuse them. Importing from a test file would re-run that file's tests.
- `src/lib/books/corporate-statements.test.ts`: imports the moved fixture; assertions unchanged.
- `src/components/expenditure-builder-workflow.test.tsx`: in-memory IndexedDB per test, plus waits for the recovery check.
- `scripts/browser-checks/expenditure-canvas/` (new): reproducible real-browser harness. `.gitignore` excludes its `out/` folder.
- `docs/evidence/ws1-expenditure-canvas-2026-11-09/`: screenshots and the generated PDF.
- **Database objects:** none. **Application source:** none.

## Tests
| Check | Before | After |
|---|---|---|
| `bun run test` | 9 failed / 2,196 passed (2,205), 3 files failing | **2,211 passed / 0 failed**, 316 files |
| `bun run typecheck` | pass | pass |
| `bun run build` | pass | pass |

The test count rose by 6: 1 coverage test, 5 company refusal tests and 5 company build-and-PDF tests, minus the 5 company cases dropped from the personal loop.

## Real-browser canvas verification
`node scripts/browser-checks/expenditure-canvas/run.mjs <outDir>` bundles the **actual** `ExpenditureReportBuilder` with esbuild and runs it in Chromium 153 through Playwright. Storage and report history are replaced by in-page stubs, so nothing reaches Cloud. Steps:

1. Chromium draws a receipt and encodes it as **WebP** (`image/webp`, 1,992 bytes). WebP is not PNG or JPEG, so the builder must convert it with `<canvas>` (`toJpeg`, `ExpenditureReportBuilder.tsx:39`).
2. The builder fetches the original through `fetchPrivateFile`. The document check reports "A-01 · receipt.webp · Ready for annexure" (`1-document-check.png`).
3. After "Confirm documents & generate", the statement saves. Result: a 3-page PDF with **exactly one embedded JPEG (240×160, DCT)**, and the history row's `file_size` equals the uploaded bytes (`2-saved.png`, `generated-statement.pdf`). Page 3 is "Annexure A-01 · Original Bill image" showing the converted receipt, with footer "Thapal · …".

Output: `{"browser":"153.0.8010.12","fixture":["image/webp",1992],"documentCheckReady":1,"pages":3,"jpegImages":1,"history":{"kind":"expenditure-statement","file_size":31825},"pass":true}`

## Financial integrity checks
- Company statements still refuse a personal or incomplete ledger. That refusal is now an explicit test instead of an accidental failure.
- Company documents are still checked against another company's secrets (`beta-secret`, `Excluded Beta`, `7777`, `999999`).
- Builder tests still check that the source entry is unchanged, that the saved PDF bytes match the download, that a lost reply on the history insert is recovered once, and that a claim never creates a reimbursement payment.

## Security verification
No permissions, policies, RPCs or storage rules changed. The browser harness uses stub storage and history only, with no network access to Cloud.

## Outstanding risks
- The canvas check uses Chromium. Safari/iPhone WebP and HEIC conversion was not tested; it needs a real device.
- Saving a company report to history goes through the same type-agnostic `savePreparedReport` path tested for personal reports, but a company report has not been persisted end to end in a test (planned for WS5).

## Evidence
`docs/evidence/ws1-expenditure-canvas-2026-11-09/` (screenshots and PDF); full-suite output summarised above.

## Rollback
`git revert <WS1 commit>` restores the previous tests (and the 9 failures). No data or schema is involved.

## Items requiring KK's approval
None. This is test-only work and touches no production database.
