# Workstream 1 — 7 November 2026, recovery and document evidence batch

## Completed development
- Statement completion requires unique confirmed counts, exact planned source/line references and saved receipt-link read-back. Unrelated evidence cannot certify completion.
- Intent references are checkpointed before financial writes; interrupted ledger responses remain visible. Undo performs explicit owner-scoped ID reads, rejects offline/read failure, and retains unknown committed writes or failed draft/account cleanup.
- A refresh failure cannot relabel confirmed financial writes unsuccessful. Document records saved with failed parked-original cleanup stay successful with a separate cleanup-only retry; retry does not recommit records. Discard no longer hides cleanup errors.
- Parked document originals require successful storage plus original size/SHA-256. Resume rejects legacy unverified, empty, truncated or same-size modified originals before extraction.
- DocuRepo company inference refuses multiple seller/buyer identities and conflicting explicit links instead of choosing the first company.
- Controlled export resolves every selected visible document, checks current signed access and nonempty/size-matched downloads, retains original corrected values and page/section locators, and uses full document IDs to avoid filename collisions. No ZIP is returned on a missing selection, access denial or failed/truncated download. Existing VaultDoc has no checksum: same-size corruption in legacy DocuRepo export is NOT detected (parked-run hashes are separate).
- Demat Upload now opens Statement Desk with investments context; universal receipt-intake consolidation remains partial.

## Acceptance evidence and limits
- Actual Statement Desk route component, isolated browser adapter, external traffic/writes blocked: six tests pass. Completed save with final status failure and double click reloads as complete with exactly two entries, Undo removes both and remains removed on reload. Evidence-link interruption reloads as interrupted with exactly one entry, never hidden as complete; Undo removes that entry.
- Ten disposable PGlite interruption/cleanup tests exercise source-before, save-before/after, evidence-before/after, draft-after, checkpoint-after and refresh-after. Stable IDs prevent duplicates; persisted balances, cashflow, reports and evidence agree; undo restores the synthetic ledger. These are real orchestration over an isolated simplified schema, NOT hosted RPC acceptance.
- Document review tests verify exact approved request replay and separate cleanup-only retry. Original-run tests include same-size corruption. Export six tests verify selected ZIP contents, complete provenance, full-ID collision avoidance and denied/missing/failed/empty/truncated refusal.
- Browser screenshots inspected: recovered-completion.png and partial-remains-interrupted.png under /tmp/browser/statement-desk-tests; 5000-row Inbox screenshot under /tmp/browser/inbox-timing. These temporary artifacts are not permanent release proof.
- No new hosted document-extraction or actual phone acceptance claimed. Previously verified C-0734/C-0735 and card-payment flows are not promoted again. Entire live document-to-report workflow is still open.

## Automated test-count correction
The report of 1,894 tests after 1,917 with 15 additions was inconsistent and unsupported. Historical commit 5f36b4c0 records 261 files/1,917 PASS. Current saved baseline JSON records 272 files/1,978 PASS: +11 files and +61 test cases. Comparing historical test paths against the baseline finds zero removed historical paths and no path renames. Vitest still includes src/**/*.{test,spec}.{ts,tsx}; Python browser checks are separate. The eleven added paths are budget-merchant-authority, report-history-versions, expense-review-security, perf-check, request-dedupe, shared-files, statement-desk-reconciliation, card-payment-flow, running-balance, save-status and travel-precision-connected. No evidence supports the previous 1,894 or '+15' accounting. File retention and the passing suite show no discovered coverage regression; they do not prove every behavioural assertion is unchanged.
This batch adds three test files (runs, interruption-flow, docrepo-export) and extends existing tests. Final inventory is recorded below after the final run. Vitest numTotalTestSuites includes nested suites: use len(testResults) for file counts.

## Inbox observation (not an improvement claim)
Phone-sized 402x874 browser, actual Inbox review component with synthetic local records; three fresh contexts per dataset, reload to ready heading plus two animation frames:
- 91 records: 1.109, 1.106, 1.121 seconds.
- 1,000 records: 1.100, 1.134, 1.122 seconds.
- 5,000 records: 1.829, 1.940, 1.850 seconds.
All nine runs had no page errors; search remained usable. Each run counted 468 local development module requests across initial open plus reload, NOT Cloud data queries. This local-data experiment does not reproduce the prior 5.45-second hosted-data run and cannot establish its cause or blame the environment. Cloud/network/auth and real device measurements remain open.

## Counts and release holds
No requirement promotions in this batch. Historical: 1,553 implemented / 948 partial / 21 missing / 19 superseded. V6 unchanged: 566 verified / 331 partial / 2 blocked. C-0292, C-0993, C-1139, V60-0037 and V60-0173 receive additional evidence while remaining partial. No real financial records changed, no database migration applied, approval activation remains disabled and publication is held.

Final full-suite inventory: 275 files / 2010 passed / 0 failed / 0 pending.
