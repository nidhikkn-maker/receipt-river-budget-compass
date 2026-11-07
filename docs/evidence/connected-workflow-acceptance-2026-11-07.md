# Connected workflow acceptance — 7 Nov 2026, 11:57 UTC

Baseline and result: **565 verified / 332 partial / 2 externally blocked; zero promotions**.
These are completion criteria, not claims that every criterion passed.

## 1. Hosted file security
Required: isolated owner/editor/viewer/unrelated identities; exact company upload namespace and uploader identity; no personal or other-company access; original upload and downloaded SHA-256 equality; private download and 60-second signed URL; revocation blocks new access; previously issued bearer URL expires; metadata lost-response readback; retry cannot delete committed evidence; real browser downloads contain original bytes.

The new **Hosted workflow acceptance** draft has its own test database, confirmed by the surfaces tool. The prior blanket statement that no isolated hosted environment is available is no longer current. No fixtures, grants, migrations or financial writes were made on Main/Live.

Completed draft result received from thread `thr_ttu91evvwqif`: **nine actual-API checks passed; browser downloads returned empty files**. The draft reports four changed files and passing build. The detailed draft evidence has not been merged or independently inspected on Main; the result is delegated hosted evidence, not Main service certification. No requirement promoted. **Workflow FAIL/incomplete: byte-preserving browser download remains unresolved.** Staged company policy remains uninstalled on Main; approval guard remains disabled.

## 2. Complete brokerage processing
Required: real-format upload → reading → security/cash separation → reviewed classification/account selection → unique matching → cash reconciliation → explicit save → owner database readback → investment valuation/net worth → generated report. Include buy/sell, funding/withdrawal transfers, dividends, fees, bonus/split/merger ambiguity, duplicates, FX, failure retry and original traceability; missing information stays unresolved.

Changes and observed evidence:
- Fixed the InvestmentReview cash button's self-link: it now passes the same file and selected cash account to canonical Statement Desk review. Explicit cash handoff bypasses investment detection; it does not save or classify money automatically.
- Added broker-cash denomination entry/retention. Foreign cash uses dated owner FX both when independently valued and when compared against an INR ledger balance. Linked account balances are counted once, never converted again; missing FX leaves comparison/value unavailable.
- Production `createDemat` reads back the exact owner-visible DP/client identity after failed insert response. No fallback inference from holder/name or unidentified accounts.
- `investment-review-persistence.test.tsx`: actual InvestmentReview and production holdings-store, synthetic CSV files, installed 0056/0064 SQL in PGlite. Lost account response and failed holdings write; reviewed retry; two content-addressed originals retained; one demat/ISIN; one trade and two events after repeated upload; original bytes resolve from lot/event sources; Home reads ₹640; unrelated owner sees no holdings. **PASS**. Data API/storage adapters are local, not hosted.
- Foreign-cash form → installed reviewed preference RPC → reload → actual shared Home hook → saved valuation: unlinked USD100 at ₹83 yields portfolio ₹8,500/net ₹11,700 including independent pre-existing components; linked case preserves ₹7,300 discrepancy and portfolio ₹200/net ₹3,400. **Two PASS**, local store/Cloud adapters, actual SQL/controls/calculations.
- Existing synthetic broker cash persistence case covers funding ₹1,000, purchase transfer ₹600, fee ₹10, dividend ₹20, closing ₹410, bonus 6+2=8 and duplicate/ambiguous matching. It starts with controlled ledger records; it is not a complete upload-to-post acceptance.

**Workflow PARTIAL:** broker cash handoff has not been driven through full reviewed posting with the same mixed broker document; full corporate-action quantity/cost confirmation, broker formats, all currencies and generated report with canonical market-valued securities remain unverified. Do not infer all-stage success from the passing component persistence test.

## 3. Cross-device import recovery
Required: source evidence durable/discoverable before postings; fresh sessions/authorised devices retrieve original bytes and pass integrity check; account identity retained after lost response; failed extraction/storage/network stages recover; repeated retries create no duplicate postings; stale checkpoint cannot erase later progress or unrelated preferences; source links on every posted line; stale-safe Undo; completion never restored as automatic approval.

Changes and observed evidence:
- `Store.saveStatementUpload` uses fresh owner-scoped reads, monotone merge and existing revision-checked `save_reviewed_preferences` RPC. A stale device cannot erase newer confirmed ids or downgrade completion, and the merged payload preserves unrelated fresh preferences. No new live SQL or approval activation.
- `history-persistence.test.ts` installs production reviewed-save SQL: concurrent other-device tag edit, rejected stale revision, lost successful response, repeated late partial checkpoint, owner isolation; all source/progress ids survive. **Two PASS**, disposable PostgreSQL, not hosted devices.
- Recovery refreshes current document metadata before checking/issuing download URLs. Stored originals still reopen fresh review, never restored approval or automatic posting.
- Existing Statement Desk real-route Playwright acceptance **four PASS**, actual synthetic CSV/text-PDF, local store/storage/extraction adapters and blocked external writes. Upload/review/save/retry/Undo and report-balance evidence inspected. These are not hosted two-device checks.

**Workflow PARTIAL:** source storage/metadata/checkpoint are separate commits; a failure before source checkpoint may remain device-only. Bank account creation lost-response and stale-safe Undo are not resolved. Full hosted two-browser interruption/re-sign-in and failed actual extraction/storage recovery have not passed. No atomic cross-system recovery guarantee asserted.

## Execution evidence
- Full Main suite: **241 files / 1,853 tests PASS**, 11:56 UTC; previous 239/1,847. Six added tests. Targeted runs: history 2 PASS, FX 8 PASS, market persistence 27 PASS, investment-review persistence 1 PASS.
- Statement Desk Playwright: **4/4 PASS**, final 11:57 rerun; screenshots in `/tmp/browser/statement-desk-tests` (ephemeral).
- Latest harness output **build OK**, 11:55:40 UTC. Earlier test compatibility error corrected; no manual build/typecheck.
- Actual AI CSV/JPEG/image-PDF/text-PDF results are from the prior 11:23 batch; **not rerun this batch**. Do not count synthetic original CSV reading as AI extraction.
- Hosted delegated acceptance: nine API checks PASS, browser download FAIL; draft only, not merged, no production certification.

Resume exact gaps: inspect/fix isolated draft's empty browser-download result; then execute hosted original-byte/revoke/expiry/retry acceptance. Main: durable source/account operation intent before interruption, full broker cash review/post/report acceptance, stale-safe Undo. No ordinary approval needed; publication, trigger activation and real-record changes remain held.