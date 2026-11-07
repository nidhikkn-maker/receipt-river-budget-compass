# V5.4 approved fixes — 1 November 2026

## Financial regressions: Pass
- D-FIN-001: ₹10,000 reimbursable less ₹6,000 receipts gives ₹4,000 pending on Home and in assistant facts. Fully received, written-off, untracked and reimbursement-payment entries do not inflate receivables.
- D-FIN-002: legacy Business export includes the ₹6,000 business share of a ₹10,000 mixed-workspace payment; category exports share the same apportionment. Original USD shares use stored INR once.
- D-FIN-003: ₹1,100 split into ₹980 principal/₹120 interest leaves ₹9,020 loan liability and ₹98,900 bank balance from the audit opening balances; interest spending is ₹120. Foreign-currency splits use saved INR, and principal-only legacy repayments plus separate EMI interest remain compatible.
- All financial fixtures ran in memory, without creating or changing cloud records.

## Security warnings: Pass
- Active accepted invitation required for requester reads, submissions and withdrawals; owner access remains intact. An isolated in-memory PostgreSQL test proves revocation denies all three paths. Applied policy predicates were read back from the database. Permission changes do not update stored requests, transactions or documents.
- Assistant discards caller facts/owner IDs, reads saved records with the caller's authenticated RLS client and computes engine facts on the server. Record text and conversation history never enter the fixed system instructions. Boundary tests passed.
- Signed-in browser: assistant answered recorded November spending; no page errors. This was a read-only question, not a money movement. No publication.
- Both persisted deep-scan warnings marked fixed. Quick database rescan has one intentional informational item: legacy guests retain owner-scoped access for email upgrade. Guest behavior was not disabled or ignored.

## Dependencies: Partial
- Applied compatible updates, including Vite 8.1.6 and Vitest 4.1.12, plus updated transitive packages; patched esbuild 0.28.2 and glob 14.0.3 overrides.
- Registry audit now lists only deepmerge (low; no patched compatible release available) and minimatch (moderate; legacy callable-API consumers cannot safely use a blanket major override without a verified replacement). Findings are not ignored or misrepresented as fixed.
- SheetJS's externally hosted tarball is outside the registry advisory scan; no clean-supply-chain claim.

## Evidence and limits
- Full regression: 80 files, 675 tests passed. Latest observed build: OK.
- Screenshots and execution logs remained temporary; no private account content copied to deliverables.
- No live financial rows, documents, invitations or account identities were created, updated or deleted during tests.
- No publication, paid infrastructure activation or real-phone acceptance.
- This does not clear the separate isolated restore/recovery/job release gates from the initial audit.