# Corporate accounting implementation — 8 November 2026

## Code baseline and restrictions
Available initial checkout SHA: `9794997512db4dc6056a06f6ef067b73320b4022`, branch `edit/edt-d34cd690-a527-4bf2-95fa-5f27174c456a`. Lovable-managed read-only metadata showed an internal repository, not the connected GitHub origin. GitHub branch parity is **unverified**: agent tools cannot inspect Git-sync connection/branch/status. Do not equate checkout SHA with remote GitHub SHA. Subsequent automated checkpoint SHA observed `1485ccd7b879f3034825e637d45fe4a8d64a9f5b`; no stateful Git command executed.

No production migration, policy, approval activation, real-record modification, UIX redesign, credit purchase or publication.

## Completed actual functions
- Reports Centre now has Company Trial Balance, Profit & Loss, Balance Sheet, Cash Flow and Audit Supporting Schedules, with explicit company selection and period.
- `books/corporate-statements.ts` projects balanced debit/credit legs from the canonical `accountBalance`, never a second persisted ledger. Category splits retain saved INR; loan principal/interest, credit-card settlement, receiving transfer evidence and posted depreciation are not duplicated.
- Cross-company transfers and manually company-attributed externally paid bills carry due-from/to counterpart accounts; no invented sales or company profit.
- Missing dated opening capital mapping, unclassified adjustments, unreconciled movements, missing originals and register-only invoices remain explicit. Balanced projection is **not** proof that accrual accounts or statutory books are complete.
- Existing encrypted PDF checkpoint/report-history retry freezes the entire company working: historical input IDs, debit/credit legs, source document IDs, original file paths and original currencies/amounts.
- Saved/current CSV and real XLSX derive from frozen working, not later transactions. Full evidence JSON resolves each figure through input line IDs.
- Audit pack ZIP includes all five statements in CSV/XLSX/PDF, the full evidence/check list and deduplicated actual private-original bytes with SHA-256, 18 files for a one-original fixture. Revoked/empty originals refuse the bundle; no misleading partial successful pack.
- Company financial-year counts now use only that company's entries, statement evidence and source-associated documents; other company and personal history no longer falsely indicates coverage.

## Focused acceptance
17 distinct targeted tests passed across corporate-statements (8), corporate-audit-pack (2), corporate-persistence (1), company-report (2), report-scope-completion (4). Reruns were confined to changed paths/failing assertions; count excludes repetition.
- Concrete canonical example: 10,000 bank opening / 2,000 loan opening; 5,000 sale / 1,000 bank bill / 500 card bill and settlement / 1,100 repayment (1,000 principal,100 interest) / 2,000 asset investment. Profit 3,400; bank closes10,400; cash operating3,400/investing−2,000/financing−1,000; trial/balance/cash differences0. Unknown net opening counterpart−8,000 remains unclassified, **not** invented equity.
- Disposable PGlite disk: saved ledger read after restart → five real PDFs → owner-RLS history → lost committed response/readback → disk restart → same report retry. One upload and insert per family, exact bytes, frozen figures unchanged after ledger update; second owner reads zero records/history.
- Real route browser `test_corporate_accounting.py`: Reports Centre company selector → Trial Balance PDF → lost history acknowledgement → encrypted reload → same-ID retry → original evidence JSON → source change/reload → saved CSV/XLSX/PDF unchanged → actual audit ZIP. One upload/history, zero runtime errors. Screenshot `/tmp/browser/corporate/corporate.png` inspected. Original retrieval/signing in this browser uses isolated adapters, NOT hosted Cloud storage.
- Final build signal OK. Initial failures were negative-zero test comparison, fixture missing service_role and wrong expected bank total; corrected and relevant tests rerun. Browser harness needed stable combobox selector and isolated signedUrl adapter; final flow passed. No unresolved executed-test failures.

## Exact unfinished corporate functions
1. Confirmed chart-of-accounts/opening equity/retained earnings, tax recoverability and accrual postings from unpaid invoices; source-register presence is never substituted for a posting.
2. Statutory Schedule III/current corporate finalisation, complete supporting schedules and accountant approval. These reports are working statements, not audited accounts.
3. Full incorporation/registration/historical schedules → actual extraction → reviewed posting → correction/reconciliation → period close/reopen in one realistic connected dataset. This batch did not rerun already verified extraction or certify that broader journey.
4. Full specialised asset/property/valuation/tax source completeness; advances/reimbursements and generic adjustments need confirmed accounting classification and stay unclassified.
5. Hosted owner/member access, signing/revocation/issued-URL expiry and cross-device acceptance: separately backed authenticated environment required. V60-0082 stays BLOCKED.
6. Immutable upload authority/all-stage recoverable atomic Undo: separately approved compatible deployment and isolated hosted installation. V60-0066 stays BLOCKED.
7. Remote GitHub branch parity: connection/status/branch unavailable to agent, local revision only recorded.

## Requirement disposition and next work
No IDs newly VERIFIED COMPLETE; V60-0026 remains PARTIAL because full corporate/report criteria above remain. V60-0016/0312 remain PARTIAL for all-family/hosted acceptance. V60-0058/0716 remain VERIFIED without reopening.
Next executable group: confirmed dated opening/head mappings and source-backed loan/asset/accrual integration into these statements, then connected document-to-close acceptance. No extra ledger or balancing plug.

## Credits
Measured start921.16 →910.55 remaining; observed workspace decline10.61, recorded usage increase10.605504673. Measurement is workspace-wide and excludes later charges, not exclusive task attribution. Prior cap withdrawn; 300-credit security reserve remains feasible (610.55 above it). No purchase.