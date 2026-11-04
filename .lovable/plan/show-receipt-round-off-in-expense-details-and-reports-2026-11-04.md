# Show receipt round-off in expense details and reports

## What you'll see
1. **Expense details.** When you open an expense, a "Round-off" line appears under Tax and Tip (for example "Round-off +₹0.14"). It's labelled either "printed on bill" or "bill rounded to nearest rupee". If the expense has the parts saved, a short line also shows how they add up: "Subtotal 2,157.00 + Tax 107.86 + Round-off 0.14 = 2,265.00".
2. **Spreadsheet export (Reports).** The transaction export gets four new columns: Subtotal, Tax, Tip and Round-off, each in the bill's own currency. They're blank when the receipt didn't have them, so you can tick each one off against the receipt total.
3. **Expenditure statement PDF.** The itemised bill section counts the round-off when it checks whether the items add up. Each bill that has a round-off shows it on its own "Round-off" line. Rounded bills will no longer show as "No – shown as read from the bill" just because of a few paise.
4. **Older expenses.** Older expenses that have a subtotal and tax but no saved round-off get it worked out from the same rules, for display only. Saved records are not changed.

Amounts, balances and category totals stay exactly as they are; the round-off is already part of the bill total. Older PDFs you already made stay as they were.

## Technical details
- Add a shared helper `receiptRoundOffFor(expense)` in `src/lib/receipt-reading.ts`. It returns the saved `roundOff` if there is one, otherwise the amount worked out by `receiptRoundOff(originalAmount, receiptDetails, currency)`, plus where it came from (printed, implied, or saved).
- `src/components/ExpenseDialog.tsx`: add the Round-off line and the breakdown line next to the existing Tax and Tip lines.
- `src/lib/reports.ts` (transaction CSV): add Subtotal, Tax, Tip and Round-off columns, and keep running them through the existing csv-safe sanitizer.
- `src/lib/expenditure-statement.ts`: add `roundOff` to `RegisterRow`. `itemsReconcile` counts items + tax + tip + roundOff and keeps the ±0.5 allowance. `src/lib/expenditure-pdf.ts` shows a Round-off line in the itemised table when it isn't zero.
- Tests:
  - helper: a saved value wins; a legacy record gets the implied 0.14; USD stays 0.
  - CSV row includes the round-off.
  - Statement row for the 2,265 bill reconciles.
