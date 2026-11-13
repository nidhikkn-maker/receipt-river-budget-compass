# Track A P14-e 6d56411a — REJECTED (development)

Independent review (PGlite, P1..P14, real cleanAssets/disposalResult/annualBook): REJECT.

- H1 (High): database pricing ignores non-number values and non-exact `openingWdv.fy` that the app's depreciation still reads, so edits change the reported disposal gain while the guard sees an unchanged book value. Examples on a sold SLM 20% row (approved value 59032.26, gain 40967.74): `openingWdv {fy:"2025",book:1}` → gain 100000; `usefulLifeYears:"10"` → gain 10483.87; `residualPct:"50"` → gain 40000; string adjustment amount → NaN. All saved `ok`.
- M1: openingWdv/paired adjustments dated on or before disposal rewrite disposed-asset history with an equal disposal figure. Lead ruling: freeze them by value.
- M2: a legacy string/boolean `bookRatePct` row is refused after the app's normal re-save (still a false refusal).
- L1: exclusion advice contradicts the rank rule. L2: `sharePct` editable on a sold asset — lead ruling: freeze.

Held: M-b exclusion refusal, rank rule, js_blank parity (all BMP), grants, duplicate/delete/swap/owner-move attacks.

Lead runner: typecheck and build PASSED; run-1 stopped by the lead after the rejection (not a test failure).
P14 remains BLOCKED / DO NOT INSTALL. Routed to Track A as P14-f.
