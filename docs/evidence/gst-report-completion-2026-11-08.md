# Connected GST/reports completion — 8 November 2026, 05:43 UTC

## Newly implemented functionality
- Ended-period GST cash liability, frozen GSTR-1/3B working variances and unavailable/differing filed-original totals enter the existing Audit/Financial Inbox and resolve on the existing Tax page. Read-only: no entries or filings are created.
- GST payments require unique amount/date/narration evidence and explicit company ownership. Same-owner other-company payments cannot settle liabilities. Multiple registrations require the named GSTIN; unknown/ambiguous ownership/payment stays open. Duplicate stable payment IDs cannot settle another period.
- Existing Save drafts for review replaces only the exact registration/form/period working, preserves its ID and unrelated history, and no longer silently retains obsolete monthly drafts. Filing evidence can explicitly link an existing company GST-return document. Comparison reads confirmed exact-label printed totals; missing/unreviewed/wrong-company originals are not zero or passing.
- Filtered loan reports exclude other-account and unlinked loans. Balance report snapshots retain historical ledger inputs outside the report period, avoiding source lists that omit inputs supporting current balances.
- Next register group V60-0731/0021: calculated GST source chains now use the same reviewed ITC eligibility as Tax Centre, retain held-purchase originals, include dated reverse-charge credit and show an explicit qualification when only the first100 inputs appear.
- Current UIX/theme preserved. No live financial records, hosted fixtures, production migrations, policies, approvals or publication changed.

## IDs and exact remaining acceptance
**No newly VERIFIED COMPLETE IDs.** Implementation and isolated evidence do not establish broad-clause completion.
- **V60-0016 (P0, PARTIAL):** local GST comparisons/exception recovery added; source-backed connected acceptance across every reconciliation family and independently verified closing evidence remain, along with hosted owner/entity checks. Local disposable data is not verified customer statement evidence.
- **V60-0026 (P1, PARTIAL):** remaining23 Reports Centre families have real PDF/history/source metadata/interrupted-save acceptance, complementing prior8 (31 total). Remaining: specialized report/export paths outside Centre, every material input/provenance chain (openings, valuation, planning, etc.), hosted owner/entity/access evidence. Broad-source closure is not inferred from one synthetic dataset.
- **V60-0312 (P1, PARTIAL):** GST difference→Inbox→Tax→refresh/save→reload is accepted locally; every other family still needs complete connected source-backed resolution/persistence evidence, beyond existing rule/routing checks.
- **V60-0731 and V60-0021:** next source/GST group advanced, not closed. Full material-figure drill-through and full document-read-to-GST-module acceptance remain.
- **V60-0058, V60-0716:** verified status retained; unchanged tests not rerun intentionally.
- **V60-0066 (P0, BLOCKED):** immutable upload-bound authority/atomic Undo installation requires separate explicit approval and a compatible isolated hosted environment, then all-stage interruption/cross-device acceptance. No Live installation authorized.
- **V60-0082 (P0, BLOCKED):** open the existing independently backed Hosted workflow acceptance draft in its authenticated session; provide isolated owner/member contexts and private storage. Execute original-byte download, denial, revocation and signed-URL expiry there. Main shares Live and must not receive fixtures.
- Hosted0016/0026 require the same authorized isolated project, its authenticated synthetic owners/entities and private storage with applicable existing migrations; this is not permission to run tests against Live.

## Tests: new paths and critical dependencies only
- Initial **32/32** in6 suites: new GST connected acceptance, specialized scope, GST notes/specials, reconciliation changes and filtered source rules.
- Targeted **6/6**: new remaining-family persistence plus rerun corrected GST/scope cases. Overlap5 excluded from unique count.
- Source-chain/report dependency **71/71**: new2 source-chain cases, changed4 derived-evidence cases and65 all-report builder/calculation dependencies because report-source/loan behavior changed.
- **104 distinct automated tests passed.** No outstanding failed tests. Known jsdom canvas-not-implemented diagnostic emitted while all PDF tests passed; actual PDF bytes/text independently compared in the node persistence suite.
- `src/lib/books/gst-connected-completion.test.ts`: disk-backed PostgreSQL-like persistence/RLS; original invoice180→changed200; obsolete GSTR-1/3B and wrong-company200 payment yield3 exceptions, notes cannot hide them; explicit correct-company payment and stable-ID working refresh saved/replayed/restarted clear them. Wrong-company/unreviewed/mismatched return originals remain open. Other owner reads zero records. Synthetic field facts, not actual extraction evidence.
- `src/lib/report-specialized-persistence.test.ts`: remaining23 families generate real PDFs, save frozen history through committed reply/readback loss, retry with one upload/insert per report, compare retained bytes+snapshot, restart disk and enforce other-owner denial. Independently extracted loan1200.25/subscription100.25/trip200.25/draft75.25 PDF values. Fixtures are not hosted storage.
- `scripts/browser/test_gst_connected.py` + `gst-connected.fixture.tsx`: actual Inbox controls open Tax; obsolete3B shown; selectOctober, save/double tap, reload; obsolete difference absent, exactly3 working keys and old-three ID preserved. Zero final runtime errors. Synthetic local data/storage adapters, all external writes blocked. Screenshots inspected in `/tmp/browser/gst-connected/`.
- Fixture startup errors (raw JSX and uncompiled React import) corrected. Initial type errors corrected. Final preview build OK05:41:42UTC. An accidental helper import also ran the unchanged prior browser workflow once; it passed, but is not counted as new acceptance.

## Credits at measurement
- Start965.92 / period usage2808.061968079.
- Last955.61 / usage2818.370968079.
- Observed decline10.31 credits, workspace-wide, not exclusive attribution; later tool/chat charges excluded.
- Conservative cap charge248.40/1100, cap851.60 remaining, including protected300; expansion allowance551.60. No top-up/limit changes.
