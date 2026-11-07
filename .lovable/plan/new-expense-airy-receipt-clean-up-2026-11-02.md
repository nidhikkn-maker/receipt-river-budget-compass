# New expense: "Airy receipt" clean-up

Keep the paper-receipt idea, but make it calm and easy to read on iPhone.

## What changes
- **Normal letters everywhere.** The typewriter font stays only on the big amount; labels, values and notes use the regular app font with normal letter spacing.
- **One receipt card, inset from the screen edges** (about 16–20px side margin) so the zigzag edges no longer touch the sides.
- **Big amount.** "₹ 0" is large and centred, with a small INR chip next to it; the "Amount" label is removed (the "NEW EXPENSE" heading is enough).
- **Label-left, value-right rows.** Category, Paid with, Workspace and Date are tall rows: small grey label on the left, the chosen value on the right, a thin dotted line between rows. Tapping a row opens its picker as before.
- **Shorter account names.** "IDFC Krupa 10178745345 · Savings" shows as "IDFC Savings ••5345" in the row; the full name stays in the picker.
- **Quieter extras.** "Extract receipt items", "+ Add account", "Split across workspaces" and the smart-defaults note ("Filled with your usual choices · Why?") become one small line or link each, placed below their row instead of squeezed beside it.
- **Header and buttons.** Scan/Upload/Voice/Repeat stay as round buttons with more breathing room; the Expense type picker gets a smaller pill.
- **Save button.** Gold pill "Save expense" in normal case (no wide letter spacing), fixed at the bottom.
- Light and dark mode and all themes keep working; nothing about saving, scanning, checks or smart defaults changes.

## Technical details
- `src/styles.css`: limit `--receipt-font` to the amount; reduce tracking on receipt headings; add side margin to `.receipt-paper`; add a `receipt-row` grid utility (`grid-cols-[auto_minmax(0,1fr)]`, value right-aligned, truncate).
- `src/routes/_authenticated/new.tsx`: restructure the detail fieldset into rows; Select triggers become borderless right-aligned values; move helper links/checkboxes under their row; short account label helper (bank name + last 4 digits).
- Verify with the existing receipt browser tests and screenshots at 402px wide in light and dark mode.
