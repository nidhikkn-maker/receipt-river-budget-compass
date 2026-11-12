# Delta review — WS-E bfa5b9d vs 254bd73 (2026-11-12 ~16:30Z)
Verified: no net-worth sum uses an unchecked share (only the 100% gap base, checkedShareValue itself, and the I01 display call shareValue); I02 / I07 row and "counted through" figure / net worth use the same propertyFigure/checkedShareValue; mismatch wording is one string from shareMismatchNotes; tests exact and would fail on 254bd73.
Medium (non-blocking for figures): share flags are effectively unreachable in the real app because cleanAssets (assets.ts:154, via normalizePreferences on every load/save) silently normalises 0/missing/NaN/>100 to 100 before computeNetWorth. Figures are safe (never >100%) and consistent across screens incl. I01.
Lows: negative legacy share → I01/depreciation 0% vs net worth 100% (only raw/legacy data); share flag shown for a sold property; two prefixes for the same flag.
Lead decision: figures acceptable; flag reachability + lows routed as follow-up (task) after the gate.
