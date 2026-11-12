# Lead note — WS-E 83f3d27 (ws/e-records-next23), 12 Nov 2026

Commit 83f3d2749df6b743cba29bba3f2a603b835b4386, tree f0a199bf20f2cb485e5a34a490858621674af2f3 (from f8883a5).

**Runner:** ACCEPTED. Typecheck and build passed; three runs, each 4,243 passed of 4,244 (1 skipped, from the base), 483 files, with the tree unchanged.

**Lead review:** NOT ACCEPTED, and it does not go to the gate. The Records preview stays on bfa5b9d.

- **M1 (regression from the M1 fix, TaxCentre.tsx:330).** `e.kind === "proprietorship"` drops a firm's share review even when a personal figure rests on the flagged depreciation.
  - Partner remuneration is `min(paid, remunerationCap(bookProfit))` (from-entities.ts:50). Book profit includes the flagged asset's depreciation.
  - The cap never falls below ₹3,00,000. So once remuneration paid is above ₹3,00,000, the cap, and with it the taxable remuneration, can depend on the flagged share.
  - The figure is unchanged, but its flag is removed. The cfbc2c5 ruling applies: a tax figure that rests on a flagged share must carry the flag.
- **Ruling, routed to WS-E as next24 (from 83f3d27):**
  - A firm or LLP with a computed profit carries the note only when remuneration paid is above ₹3,00,000. A proprietorship always carries it.
  - Interest on capital and the exempt disclosure line never carry it.
  - Tests: partnership ₹9L remuneration → note; ₹2.5L → no note; LLP → note; the interest-only and proprietorship controls still pass.
- **Question routed (not blocking):** does a duplicated asset id double the tax depreciation? If so, count it once and flag it, as net worth does.
- **L1, L2, L4, L5 and L3 (de-duplication by id):** reviewed; no findings.

No mutation check: the candidate is not accepted.
