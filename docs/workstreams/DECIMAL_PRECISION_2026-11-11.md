# Decimal precision: reimbursement, claim and receipt-reading paths (KK decision, 11 Nov 2026)

Track A, branch `tracka/decimal-precision`, base `develop/sf-base` 000ac2d2.

## Policy being applied

- A read bill keeps the exact source amount, currency and every visible decimal as evidence. Nothing is rounded, truncated or replaced without review.
- Arithmetic uses `src/lib/money.ts` (decimal.js, ROUND_HALF_UP). Rounding happens once, at the paise boundary where a figure leaves the function.
- INR posts at exact paise. Other currencies use their own ISO 4217 minor unit (`currencyMinorUnits`).
- Stored records, posting signatures, statement identity and fingerprint code are unchanged (`statement-pipeline/apply.ts` and `statement-fingerprint.ts` were not touched).
- Display may format a value but never writes it back.

## Paths: before and after

| Path | Before (000ac2d2) | After |
|---|---|---|
| `reimbursements.ts` `r2` | `Math.round(n*100)/100` | `roundMoney` (decimal, half-up) |
| `reimbursements.ts` `reimbursableOf` | `r2(Math.min(...))` | decimal comparison, then one `roundMoney`; a non-finite saved claim amount falls back to the entry amount |
| `reimbursements.ts` `receivedOf` | float `reduce` + `r2` | `sumMoney` |
| `reimbursements.ts` `outstandingOf` | `r2(max(0, a-b))` | `subtractMoney` |
| `reimbursements.ts` `reimbursementSummary` | float `+=` totals, `r2` per bucket | decimal accumulators rounded once on return; buckets use `addMoney` |
| `expense-claim.ts` `r2`, `buildClaim` sums | float | `roundMoney` / `sumMoney` |
| `expense-claim.ts` `applyAdvance` | `r2` plus `+0.004` float tolerances | half-up `roundMoney`, exact decimal caps, `subtractMoney` for payable |
| `claim-pdf.ts` `claimCategoryTotals` | raw float `+=` (no rounding at all) | `addMoney` |
| `claim-pdf.ts` summary sums and `n()` display | float `reduce`, `Math.round` | `sumMoney`, `roundMoney` (display only) |
| `expenditure-statement.ts` `biz`, `itemsTotal`, `personalShare`, `sumBy`, source and workspace totals | float `reduce` / `+=` + `r2` | `sumMoney` / `addMoney` / `subtractMoney` |
| `expenditure-statement.ts` `itemsReconcile` | items counted as "reconciling" within **±0.50** of the bill | exact paise (items, or items without tax, equal the bill total; round-off is already included) |
| `reimbursement-profiles.ts` `organisationStatement` | float ratio `n * share / amount`, `Math.round` | `proportionMoney`; the last organisation takes the exact remainder (`subtractMoney`) |
| `reimbursement-profiles.ts` `responsibilityShares`, `validateResponsibility` | float sums with `.009` tolerance | `sumMoney` with exact decimal equality |
| `travel-reports.ts` `personParts` | float ratio + `r2` | `proportionMoney`, the same rule as `workspaceParts` |
| `travel-reports.ts` totals, `group`, unpaid, committed, planned, pending, received | float `reduce` + `r2`, raw `s.total + un` | `sumMoney` / `addMoney` / `subtractMoney` / `proportionMoney` |
| `receipt-reading.ts` `cents` and every `Math.round(x*100)` | binary | decimal half-up; sums are added in decimal and rounded once |
| `receipt-reading.ts` precision review | none: ₹1234.567 passed review and was posted as 1234.57 by the `numeric(14,2)` column | `receiptPrecisionFlags` (added to `receiptReviewCheck.precision` and `needed`) flags any read amount finer than the currency's minor unit: total, subtotal, tax, tip, round-off, charges, tax lines and items. The read digits are shown in the review |
| Posting boundary | `saveExpense` accepted ₹1234.567 and the database rounded it silently | `postingPrecisionError` refuses anything finer than the stored two decimals in `saveExpense` (server), in Confirm details and in Save (`new.tsx`). Binary noise beyond 8 decimals (`0.1 + 0.2`) is not treated as a source digit |
| `receipt-audit.ts` `buildReceiptAudit` | compared amounts in whole cents, so a change from 1234.567 to 1234.57 left `corrected` empty | exact decimal comparison (noise beyond 8 decimals ignored); the correction is recorded |

## Tests that fail on 000ac2d2 (actual wrong figures)

`src/lib/decimal-precision.test.ts`:

1. `reimbursableOf`, claimable ₹1234.245: expected 1234.25, got **1234.24**.
2. `reimbursableOf`, claimable ₹1.005: expected 1.01, got **1** (1.00).
3. `outstandingOf`, ₹1234.245 claim less a ₹1000 receipt: expected 234.25, got **234.24**.
4. `claimCategoryTotals`: expected claimed 0.30 and received 0.80, got **0.30000000000000004** and **0.7999999999999999**.
5. `applyAdvance` with ₹1.005: expected advanceApplied 1.01 and payable 9.00, got **1** and **9.01**.
6. Statement row eligible and outstanding, plus summary eligible, for ₹1234.245: got **1234.24**.
7. `itemsReconcile`, items USD 150.00 against a USD 150.40 bill: expected false, got **true** (a 0.40 gap shown as "Yes").
8. `organisationStatement`, ₹2.01 split equally between AET and MOVAC: expected [1.01, 1.00], got **[1.00, 1.01]**. The first share is rounded half-down by binary floating point.
9. `travelReport('traveller')`, USD 2.00 posted at ₹2.01 and split 1 : 1: expected Me 1.01 and Asha 1.00, got **Me 1.00 and Asha 1.01**.

`src/lib/receipt-precision.test.ts`:

10. `buildReceiptAudit`, read 1234.567 and confirmed 1234.57: expected `{ amount: 1234.57 }`, got **`{}`**, so the correction left no trace.
11. `receiptReviewCheck(1234.567)`: expected `needed: true`, got **false**, so the sub-paise source was not flagged.
12. An item line of 1234.567 against a subtotal of 1234.57: expected a review flag, got **none**.

The other tests in that file (`currencyMinorUnits`, `receiptPrecisionFlags`, `postingPrecisionError`) fail on 000ac2d2 only because those functions are new.

### Guards that pass both before and after

These pin results that were already correct for exact-paise input:

- **₹1234.565 through `r2`:** gives 1234.57 under binary floating point by luck, so there is no failing case on this value. Failing half-paise values in that range are 1234.215, 1234.225, 1234.235, 1234.245, 1234.465 and others.
- **₹1234.56 and ₹1234.50:** stay exact.
- **Partial receipts of 0.1 + 0.2:** settle a ₹0.30 claim.
- **Summary over 100 × ₹0.10 and 3 × ₹33.33:** gives 109.99.
- **Exact items, partial refunds and many small amounts in the statement:** total exactly.
- **Planned totals over fractional budgets:** stay exact.

Sum-then-round over stored two-decimal values cannot produce a wrong paise value at these sizes, because the accumulated binary error is far below half a paise. The real errors on these paths come from three sources:

- half-paise inputs (saved claimable amounts, typed advances, proportional shares);
- unrounded accumulation (`claimCategoryTotals`);
- tolerances that hide discrepancies (`itemsReconcile`).

### Existing tests adjusted

- **`receipt-audit.test.ts`:** previously asserted that 450 → 450.001 is "rounded to paise" and not a correction. That contradicts the decision, so it now asserts binary noise is ignored (0.1 + 0.2 vs 0.3) and 450.001 is recorded as a correction.
- **`receipt-reading.test.ts`:** one `toEqual` now includes the new `precision: []` field.

## Follow-up after lead review of ed20f1a1

**FX conversion: resolved by lead decision under KK's existing ruling.** The rule is to round once at the posting boundary and never retroactively change posted records.

- **New entries, and edits that change the source amount, currency or rate:** `saveExpense` computes the posted INR amount with `postedInrAmount`, which is `multiplyMoney` rounded half-up once to paise. Example: USD 1.15 × 83.3 = ₹95.795, posted as ₹95.80; binary floating point gave ₹95.79.
- **Edits that keep the source amount, currency and entry date (tightened after review of 50fe4c56):** `unchangedPosting` keeps the stored `fx_rate`, `fx_date` and INR amount exactly, and no rate is fetched. A provider revising a historical rate can therefore never move a posted record. This holds even for an amount posted under the old binary rounding. The edit read selects `original_amount, currency, expense_date, fx_rate, fx_date, amount`; no schema change was needed.
- **Edits that change the amount, currency or date:** the rate for that date is fetched, and the INR amount is computed with `postedInrAmount` and rounded half-up once. The earlier rule, which recomputed whenever the newly fetched rate differed from the stored one, is withdrawn.

**Server-side test coverage.** The new tests call the real `saveExpense` server path with a fake Supabase client and a stubbed rate fetch.

- `src/lib/save-expense-precision.test.ts`:
  - ₹1234.567 is refused with the precision error, nothing is written and no rate is fetched;
  - ₹1234.56 is accepted;
  - JPY 1234.5 is accepted at the server but flagged for review;
  - a new USD 1.15 entry at 83.3 posts 95.80;
  - a category-only edit of an existing ₹95.79 entry keeps 95.79;
  - a category-only edit while the provider now returns 83.1 keeps ₹95.79 and fx_rate 83.3, and fetches no rate;
  - a date-only edit recomputes: 95.80 at 83.3, and 95.57 at 83.1 (binary rounding gave 95.56);
  - an edit that changes the amount or currency recomputes half-up.
- `src/components/smart-add/receipt-precision-flow.test.tsx`, the real NewExpense screen:
  - Confirm details refuses a read ₹1234.567, even after the review dialog;
  - Save refuses ₹1234.567;
  - Save accepts ₹1234.56.

**Mutation checks:**

- **Precision refusal in `saveExpense` neutralised:** 1 test fails.
- **Confirm check in `new.tsx` neutralised:** 1 test fails.
- **Save check in `new.tsx` neutralised:** 1 test fails.
- **The stored-amount rule disabled:** 2 tests fail.

**Fails on 50fe4c56:**

- the category-only edit under a revised provider rate (50fe4c56 refetched the rate and posted ₹95.57 at fx_rate 83.1);
- the date-only edit at an unchanged rate (50fe4c56 kept 95.79);
- the `unchangedPosting` helper test (the helper did not exist).

**Fails on ed20f1a1:**

- the new-entry 95.80 test (got 95.79);
- the date-only edit test (got 95.79 at 83.3);
- the helper test (the helper did not exist).

The other four tests, and the UI tests, pass on ed20f1a1 because they guard checks that commit already had.

**Other conversion sites still use binary rounding.** These are outside the reimbursement/claim scope and are not changed here:

- `booking-import.ts:26` (booking drafts, not payments);
- `historical-import.functions.ts:61` (import staging);
- `books/market.ts:122` (valuation).

## What was left, with reasons

- **Blocked (lead-recorded, pending KK approval of a hosted migration): schema change needed.** Three-decimal currencies (KWD, BHD, OMR, JOD, TND, LYD, IQD) cannot be stored at their own minor unit because `original_amount` is `numeric(14,2)`. They are kept in the reading evidence (`receipt_details.audit.read`, JSON), but `postingPrecisionError` refuses to post them rather than let the database round them. Supporting them needs a column-scale change.
- **Zero-decimal currencies** (JPY, KRW and others) with a stray fraction are flagged for review but still postable. Refusing them would block edits of any existing stored record that carries a fraction.
- **Not present in this tree:** `trip-claims.ts` (`overReceived`) exists only on the WS-F1 branch (3690717f and earlier), not at 000ac2d2, so it was not converted. Apply the same `money.ts` rules when that branch lands.
- **Display-only float left as is:**
  - `travel-reports.ts` `share()` percentages;
  - `new.tsx` `splitLeft` and the `0.009` share tolerance on the entry screen;
  - the `saveExpense` split and principal/interest sum checks, which compare stored two-decimal inputs with tolerances that already cover binary noise.
- **INR whole-unit rounding:** when the total is a whole rupee, an INR bill whose items differ from the subtotal by less than ₹1 is still treated as rounding. This is the existing owner-approved rule in `src/components/AGENTS.md`. The round-off itself is saved explicitly as `roundOff`.
