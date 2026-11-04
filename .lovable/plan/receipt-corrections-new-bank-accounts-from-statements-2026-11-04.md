# Receipt corrections + new bank accounts from statements

## 1. Correct amount, shop and date before confirming a receipt draft

The bill check card already has editable boxes, but it isn't obvious, and a corrected value isn't remembered or marked. Changes:

- Show the shop, date and total as clear editable fields with a small "Edit" hint, opened straight from Drafts.
- Next to each field you've changed, show "Corrected (bill read ₹2,265)" with an **Undo** link back to what was read.
- A changed field counts as checked by you, so its warning goes away and you don't have to confirm it twice.
- Corrections are kept with the draft. Reopening it shows your corrected values, not the original reading.
- When you correct a shop name, the app remembers it for that shop, so the next bill from them shows the right name. A corrected amount or date is never reused on other bills.
- Nothing is saved as an expense until you confirm, same as now.

## 2. Statement for a bank account you haven't added yet

Today, a statement from an unknown bank shows "unknown account" and you have to pick one. New flow:

1. **Detect:** the app reads the bank name, account or card number (last 4), account type (savings, current, credit card), currency, holder name, IFSC/branch if printed, statement period and opening/closing balance. More Indian banks will be recognised (CUB, SBI, Axis, Kotak and others), along with any bank name printed in the statement header.
2. **One-tap new account:** instead of "unknown account", you see a **New account found** card already filled in with those details. Tap **Create account** to add it. You can edit any detail first. The opening balance comes from the statement's printed balance, never a made-up figure. If the statement could belong to an account you already have, the app asks which one rather than creating a duplicate.
3. **Then it runs as usual:** once the account exists, the statement goes straight into the normal Statement Desk steps: categorise, find duplicates, check balances, then post after you confirm.
4. **Link transfers automatically:** the app looks for matching movements between the new account and your other accounts (for example a debit in IDFC and a credit here with the same reference or a narration naming the account). These come up as suggested transfer links. Clear matches are pre-ticked and confirmed with one tap. Matches based only on the amount stay for you to decide, so nothing is linked wrongly.
5. **Link loans and cards:** if the narration names a loan or card you already have (like the GLS EMI or Amex), the app suggests linking it as the pay-from account. You confirm it.

Rule kept as before: the app sets up and suggests everything, but no account, posting or transfer link is made until you tap to confirm.

## Technical section

- `new.tsx`: track `scanOriginal` (the reading) separate from `scan` (edited values) and persist both in the draft `scan` payload. A changed field marks its confidence as user-confirmed for `unconfirmedFields`. Shop correction writes a merchant alias through the existing per-shop rules.
- `statement-pipeline/identify.ts`: extend `BANKS` and add `detectAccountDetails(rows)` (holder, IFSC, type, last4, currency, period, printed balances), labelled headers only. Pure, with tests.
- `statements.tsx`: when `accountId` is null and a hint exists, render a prefilled shared `AccountForm` (dedupe via `master-data.ts`). On create, set `file.accountId` and re-run the existing plan/match.
- Transfers: run `transfer-match.ts` across the new account and existing accounts. "Strong" pairs are preselected and confirmed through the existing `confirm_transfer` RPC. Loan/card hints reuse `emi-match.ts` and account `matchRefs`.
- Tests: corrected fields persist and clear warnings; identify extracts details from sample headers; dedupe blocks a duplicate account; amount-only transfer pairs are never preselected.
