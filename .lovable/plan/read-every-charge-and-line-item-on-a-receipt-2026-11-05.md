# Read every charge and line item on a receipt

## Problem
The receipt reader only knows four parts of a bill: subtotal, tax, tip and round-off. It is told never to count a service charge as a tip, but it has nowhere else to put one. Discounts, packing, delivery and similar charges have the same gap. The total then fails to add up and the review shows a mismatch. Line items are also read only when that option is turned on.

## What changes for you
- **Every charge line is read as its own row**, using the name printed on the bill: service charge, packing, delivery, cover or convenience fee, discount (shown as a minus), and anything else printed between the subtotal and the grand total.
- **Tax keeps its parts**, such as CGST, SGST, IGST, VAT and cess, each with the rate printed next to it.
- **Line items are always read**, including the section headings on the bill (for example "Beverages" or "Starters"). Headings group the items and are never counted as money.
- **The check that the total adds up** becomes: items (or the printed subtotal) + charges − discounts + tax + tip + round-off = total paid. The sum is shown line by line, so you can see which part is off.
- **Service charge is not a tip.** It stays its own line, and the tip field is filled only if a tip or gratuity is printed.
- **Review screen:** charges and tax parts appear under the amount and can be edited or removed. The total re-checks on every edit. Nothing is saved until you confirm, as today.
- **Saved details and reports:** expense details, CSV exports, the expenditure statement and its PDF show the charges and tax parts.
- Older expenses stay as they are, with nothing rewritten.

## Technical details
- `receipt-reading.ts`: add `charges: [{label, kind: service|packing|delivery|fee|discount|other, amount (signed), confidence}]`, `tax_parts: [{label, rate|null, amount}]`, and `section: string|null` on each item. Every field stays required but can be null or empty, so strict reading keeps working (the earlier round-off failure is covered by a test). Mirror these in `ReceiptDetailsSchema`.
- `receiptBreakdownError`: include the sum of charges; check the sum of tax parts against tax when both are printed; when no subtotal is printed but items are, compare the sum of item amounts. Accepted rounding and the decimal-currency rules stay as they are.
- `receipt-extract.functions.ts`: always ask for items; tell the reader to list every printed line between subtotal and grand total as a charge with its printed label, never fold one into tax or tip, and never invent a missing one.
- `new.tsx` and `ExpenseDialog.tsx`: editable charge and tax-part rows, with items grouped under their headings.
- `reports.ts`, `expenditure-statement.ts`, `expenditure-pdf.ts`: add charge and tax-part columns and lines.
- Tests: the Cream Centre-style bill with a service charge reconciles; a discount reduces the total; headings never add money; a gap that doesn't add up is still an error; the strict-format guard still passes.
- Update the receipt rules note in `src/components/AGENTS.md`.

## Not checked yet
I haven't re-read your original receipt photo. After building, I'll re-read it with the real reader to confirm the service charge comes through.
