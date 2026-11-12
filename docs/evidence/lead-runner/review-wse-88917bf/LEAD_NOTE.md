# Lead note — WS-E 88917bf (ws/e-records-next24), 12 Nov 2026

Developer runner (reported): ACCEPTED, 3 × 4,284 of 4,285 tests. The lead runner was not started, because the independent review rejected the candidate.

**Independent review: REJECT.**
- **M1 (regression).** De-duplicating assets by id happens before the in-use/sold filtering in the tax draft (tax-summary.ts:22) and the tax computation (taxcomp.ts:35). Copy A, sold the previous year, plus copy B, live, gives ₹0 depreciation (it should be ₹48,000) under a note that says "counted once".
- **M2.** blockSchedule, bookVsTax and the audit still double count a duplicated id, with no flag.
- Verified correct:
  - R1: the firm remuneration > ₹3L note uses the same `paid` figure as fromEntities, and an entered profit gives no note.
  - The onceById flag always fires.
  - No leakage between workings.
  - The books heads de-duplicate after filtering.
  - The R3 guards hold.

**Pre-existing defects found and routed to WS-E next25, as lead rulings under existing rules:**
- **P1.** The /tax personal draft includes every entity's income, spending and depreciation; it breaks the legal-entity boundary. Use the TaxComputationCard scope.
- **P2.** A duplicated asset id gets a second full book-depreciation journal (it would post twice). Rule: one journal per asset id per month.
- **P3.** A partner's "salary" from a firm is dropped from personal income with no flag. Rule: salary, bonus, commission or remuneration from a firm or LLP is s.28(v) remuneration, subject to the s.40(b) cap.
- **P4 (flag).** In a multi-partner firm, the s.40(b) cap applies to all partners together.
- **P5 (flag).** Remuneration recorded as the firm's own expense understates the cap.
- **P6.** Duplicate ids in net worth, the /assets total and I06 are counted once and flagged.
- **L3/L4.** Assert the hand-calculated figures in test (a), and add edge tests; the duplicate note names the copy used.
