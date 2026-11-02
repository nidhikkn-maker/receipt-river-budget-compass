# New expense page: "Paper receipt" look

Restyle the New expense page to look like the Paper receipt design you picked: a cream printed-bill card on deep blue with a gold Save button. Every current feature stays and works the same way. Only the look and layout change.

## What you'll see
- Deep blue page with round **Scan**, **Upload**, **Voice** and **Repeat** buttons at the top.
- A cream receipt card with zigzag top and bottom edges:
  - "NEW EXPENSE" heading, the type picker (Expense / Income / …) and a dotted divider.
  - A large typewriter-style amount (₹ 0.00) with the currency chip beside it.
  - Dotted-leader rows: **Category …… Groceries ›**, **Paid with …… AMEX ›**, **Workspace …… Personal ›**, **Date …… Today ›**, **Note …… add ›**. Tap a row to change it, using the same choices as today. Today and Yesterday stay as quick options under Date.
  - "Add account", "Split across workspaces" and "Extract receipt items" become small links on the receipt.
  - **More details** stays folded at the bottom of the receipt.
- Receipt-scan review, suggestions, duplicate warnings and totals checks look like printed sections on the same paper.
- A wide gold **SAVE EXPENSE →** button stays fixed at the bottom.
- The design adapts to dark mode and the other app themes, and works on iPhone and desktop.

## What does not change
- Saving, validation, receipt checks, confirmations, offline saving and currency conversion.
- The Edit expense view, which uses the same form.

## Technical details
- Add receipt tokens to `src/styles.css`: paper, ink, a dotted rule and a zigzag edge mask, with variants for each theme and for dark mode. Components use these tokens only.
- New presentational pieces: `ReceiptSheet` (paper card with zigzag edges) and `ReceiptRow` (label, dotted leader, value and chevron, opening the existing select/popover). Use a monospace font for the amount and labels.
- Restructure the JSX in `src/routes/_authenticated/new.tsx` to use these pieces. State, handlers and save logic stay untouched.
- Verify with the existing receipt browser tests and unit tests, then take screenshots at 402px wide and on desktop in light and dark mode.
- Add this task to roadmap.md.
