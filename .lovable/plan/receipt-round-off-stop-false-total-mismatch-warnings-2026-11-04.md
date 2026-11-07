# Receipt round-off: stop false "total mismatch" warnings

## The problem
Indian bills often round the final amount to the nearest rupee without printing a "Round off" line. Example: subtotal 2,157 + tax 107.86 = 2,264.86, but the bill says 2,265. Right now the app treats the 0.14 difference as an error and blocks saving.

## What will change
1. **Unprinted round-off is understood.** If the total is a whole amount and the gap is less than one rupee (or one unit of the currency), the app accepts it as rounding instead of an error.
2. **The round-off is shown, not hidden.** Under the amounts you'll see a quiet note: "Round-off +0.14 (bill rounded to nearest rupee)". It is saved with the receipt details so the numbers always add up later.
3. **Printed round-off lines are read too.** When a bill does print "Round off", "Rounding" or "R/O", the receipt reader picks it up as its own value (it can be plus or minus), and the check counts it.
4. **Real mismatches still get caught.** A gap of a rupee or more, or a total that isn't a whole amount, still shows the red warning, as today.
5. **The item-total check** (items vs subtotal) gets the same rounding allowance, so it doesn't nag over paise.
6. **Editing keeps it live.** If you change the subtotal, tax, tip or total, the round-off is worked out again straight away.

What's saved as the expense total stays exactly what the bill says (2,265). Only the explanation of the gap is new.

## Technical details
- `src/lib/receipt-reading.ts`:
  - Add optional `roundOff` (signed number, at most ±1 currency unit) to `ReceiptDetailsSchema` and `ExtractedReceiptSchema`. Its description tells the reader to read only an explicitly printed rounding line and never to calculate one.
  - New pure `receiptRoundOff(total, details, currency)` works in cents and returns `{ printed, implied }`. The gap counts as implied rounding only when the total is a whole unit, the absolute gap is under 100 cents, and there's no printed round-off. It does not apply to currencies that keep decimals in their totals (USD, EUR and so on stay strict unless the bill prints a round-off).
  - `receiptBreakdownError` uses `subtotal + tax + tip + roundOff` and accepts implied rounding; `receiptItemTotalError` gets the same allowance.
- `src/routes/_authenticated/new.tsx` (receipt review panel): show the round-off note and keep the computed `roundOff` in the saved details. The server-side save check reuses the same function, so the browser and server can't disagree.
- Extraction prompt in `receipt-extract.functions.ts`: one line asking for a separate printed round-off value.
- Tests in `receipt-reading.test.ts`:
  - 2157 + 107.86 vs 2265: accepted, with implied rounding of +0.14.
  - 2157 + 107.86 vs 2266: still a mismatch.
  - A printed −0.40 round-off is counted.
  - USD 10.00 + 0.86 vs 11: still a mismatch.
  - Item totals off by paise on a rounded INR bill: no prompt.
- Add a one-line rounding rule to the receipt note in `src/lib/AGENTS.md`.
