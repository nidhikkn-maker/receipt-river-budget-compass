# Connected reconciliation, report recovery and Inbox batch — 8 November 2026

## Actual functionality completed
- Supplier/customer reconciliation partitions own GST registration and explicit company ownership; payments from another company cannot settle the same-named party. Ambiguous ownership stays unmatched.
- Invoice allocations use current amended notes and deduplicate payment IDs. Retained investment events now participate in reconciliation, keep six-decimal units, exclude post-statement trades/events and retain unknown quantities as exceptions.
- Monthly, wealth and forecast balances and scheduled commitments respect the selected account. Frozen report snapshots include selected entry IDs and retained document references.
- Reports Centre now retains exact PDF bytes in a separate owner-encrypted recovery slot before history saving. Reload restores the PDF; Retry uses the same ID and bytes. Every save checks owner/id/path/size and downloaded bytes. Unknown outcomes never delete files. Offline PDFs remain pending rather than reporting a history save. Background jobs retain the queued source snapshot and existing completion/retry paths.
- Reconciliation differences from loans, suppliers, customers, investments and unconfirmed intercompany transfers, plus invalid GST allocations, enter the existing audit/Inbox. Fresh bank/card balance discrepancies no longer disappear merely because freshness is current.
- Missing-invoice exceptions are per-entry, include business shares of mixed-workspace entries, open existing supplier checks and clear when saved evidence arrives. A “resolved” note alone cannot hide a still-present reconciliation or missing-invoice issue.
- No styling, theme, financial posting, production migration, policy activation or publication changes.

## Acceptance and exact limits
- V60-0316 VERIFIED COMPLETE for the requested read-only missing-invoice tax/audit exception lifecycle: real Inbox -> supplier page, saved evidence -> reload -> exception removed; disposable owner-RLS persistence; bank entries remain present. Approval execution remains disabled and was not tested or activated.
- V60-0016 and V60-0026 remain PARTIAL. This batch materially completes connected isolated coverage, but does not certify hosted owner/entity access or the entire broad module. V60-0016 still needs complete all-kind source-backed acceptance, including GST liability/payment/return comparison. V60-0026 still needs broad source-to-history coverage across every applicable specialized family and hosted persistence/access. Eight financial families now have actual PDF/source/ownership/recovery comparisons; 32 builder families have targeted existing dependency coverage.
- V60-0312 remains PARTIAL: new source-linked queue and real links/resolution are verified; all reconciliation exception families still need full connected acceptance, especially GST liability differences beyond allocation checks.
- V60-0058 and V60-0716 retained VERIFIED COMPLETE, not reopened.
- V60-0066 stays BLOCKED on immutable upload authority/protection approval. V60-0082 stays BLOCKED on an authorized isolated hosted environment. No Main/Live fixtures were created.

## Tests and evidence
- Final principal run: **94/94 tests passed** in 10 suites, including changed rule regressions, encrypted preparation compatibility, report save, source/owner filtering and disposable disk workflow. Existing report-centre-all dependency tests cover 32 report builders.
- Later targeted dependency run: **8/8 passed** (background snapshot recovery + bank Inbox); last run **13/13 passed** (7 background recovery + 6 reconciliation regressions). Totals are runs, not summed unique-test claims.
- Earlier unchanged critical reconciliation dependencies: **36/36 passed** across 7 suites. Only changed/dependent workflows were rerun.
- Disposable disk test: company A invoice 250.25 versus saved payment 200.25 creates difference 50; company B payment 999.99 cannot settle A. Restart retains exception. Stable-ID remainder 50 saved twice results in one payment. Document link clears the original bill exception after restart. Eight real PDFs (monthly, expense, category, account, wealth, unreconciled, imports, budget) preserve source IDs and 250.25/749.75 figures, exclude 999.99/888.88, survive committed-insert/readback interruption and restart with one history row each. Other owner sees no report rows.
- `scripts/browser/test_exception_reports.py`: actual `/inbox` -> `/audit`, `/inbox` -> `/gst-check`, saved synthetic correction/evidence -> reload -> removal; actual `/report-centre` -> prepare -> interrupted committed reply/readback -> encrypted reload -> retry -> actual frozen PDF download. Exactly one upload and one history insertion. Zero page runtime errors. External writes blocked, local adapters only.
- Screenshots inspected: `/tmp/browser/exception-reports/1-inbox-exceptions.png`, `1b-audit-linked.png`, `2-recovered-report.png`; downloaded PDF text and source history compared independently.
- Initial browser selector timeout corrected; later actual-destination page-render wait strengthened. Final browser flow passed. Initial missing-field/type errors corrected; preview build OK at 04:54:08 UTC. jsdom emits its known canvas-not-implemented diagnostic in PDF tests; actual PDF comparisons and browser downloads passed. No outstanding failed tests.

## Credits
- Start measured workspace balance **979.54** (period usage 2794.445297743).
- Last measurement **967.35** (period usage 2806.634297743): observed decrease **12.19 credits**, workspace-wide and not exclusively attributable to this task; later chat charges excluded.
- Conservative cap charge **236.66 / 1100**, cap remaining **863.34**, including protected **300** reserve; expansion allowance **563.34**. No credit top-up or limit changes.