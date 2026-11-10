# Proof: the V4 "one universal expense-entry form" rule still catches a second production form

- **Change being proved:** `src/lib/acceptance-v4.test.ts` rule 1 now skips `*.test.tsx` files. Test doubles are not product forms; the Intelligent Canvas test's stand-in form uses the amount field id `"a"` because the canvas summary reads that field from the real form.
- **Method:** mutation test in a throwaway copy of the Track B tree, so the real tree and its running verification were untouched. Only rule 1 was run each time.

| Case | Result |
|---|---|
| Baseline: no second form | **pass** (1 passed) |
| Mutation 1: a production component `src/components/SecondExpenseForm.tsx` containing `<label htmlFor="a">Amount</label>` | **fail**, naming `src/components/SecondExpenseForm.tsx` |
| Mutation 2: a production route `src/routes/_authenticated/second-entry.tsx` with the same form | **fail**, naming `src/routes/_authenticated/second-entry.tsx` |

**Conclusion:** the rule still enforces exactly one product expense-entry form (`src/routes/_authenticated/new.tsx`). Only test doubles are excluded.
