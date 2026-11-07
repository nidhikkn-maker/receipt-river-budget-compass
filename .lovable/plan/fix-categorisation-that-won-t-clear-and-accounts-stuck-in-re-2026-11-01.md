# Fix: categorisation that won't clear, and accounts stuck "in review"

## What the records show
- **The 5 AMEX rows in your screenshot** are saved as **credit-card bill payments** from IDFC Krupa, with the category "Miscellaneous". A card bill payment moves money between your own accounts, so it isn't spending. Even so, the Inbox flags it for a category, and changing the category doesn't clear the flag. That's why it keeps coming back. There are 7 saved corrections, and the flag still shows.
- **Both uploaded statements** (IDFC MOVAC, 224 lines, and IDFC KR Enterprises, 30 lines) are still at the review step. No line has been approved or imported, and the account-identity confirmation was never saved. The account status depends on that, so it stays "In review" whatever you upload.
- There's no statement uploaded for IDFC Krupa at all, so that account can't show as current yet.

## Changes
1. **Categorisation rule:** card bill payments, transfers and loan repayments won't ask for a spending category. They leave the "needs category" list and are counted as settled. Your saved records stay exactly as they are.
2. **Clear feedback after a correction:** after you apply a change, the Inbox reloads the entries. If an item is still open, it says why ("this is a card payment, so a category isn't needed" or "the change wasn't saved"), so it no longer looks unchanged.
3. **Status that explains itself:** each account in review shows its next step, for example "Confirm account identity", "Approve 224 lines" or "No statement uploaded". The step links straight to that statement.
4. **Shortcut to finish review:** a "Continue review" button on each batch takes you to identity confirmation, then approval and import. You still confirm each step yourself. Nothing is imported automatically.

## Not changed
No existing records are edited or posted automatically, and nothing is published.

## Technical details
- In `review-centre.ts`, the uncategorised/misc issue is skipped for the movement types (card_payment, transfer, loan_repayment), with tests.
- After applying, the Inbox reloads entries and, when an item is still open, shows the rule that keeps it open.
- In `account-statement-status.ts`, the status output gets a `blocker` reason (identity missing, rows pending, no batch), with tests. It's shown in the Inbox accounts view with a deep link.
