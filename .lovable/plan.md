# Bring Statement Desk smarts to New entry

Statement Desk already suggests categories, matches lines against saved entries, links or creates the account, and spots transfers and card payments. New entry will use those same rules, so an entry typed by hand gets the same checks as one from a statement.

Nothing saves on its own. Every suggestion stays visible and can be changed or ignored before you press Save.

## 1. Auto-categorise
- When you type a description, payee or note, New entry suggests a category, using the same rules and wording as Statement Desk (for example AMEX, MOVAC, cash withdrawal and charges).
- The suggestion fills the category with an "Auto-filled" mark. It never replaces a category you chose yourself.
- Your saved category rules come first, then the shared statement rules.

## 2. Match existing entries
- As you enter the amount, date and account, New entry checks saved entries within 3 days, the same way Statement Desk matches lines. That includes entries that came from statements.
- If it finds a likely match, a card shows the matching entry next to yours. You can choose "Open existing", "It's separate, save anyway", or "Link as the same". The existing duplicate-bill check stays in place.
- An exact match blocks Save until you choose one of those options.

## 3. Link account
- New entry suggests the account from the description (card or bank name, last four digits), using the same account-detection rules as Statement Desk.
- If no account fits, "Add account" opens the shared account form with an opening balance, as Statement Desk does today.

## 4. Spot transfers
- Words like "card payment", "NEFT to own", "AMEX payment" or a known account name switch the type to Transfer or Card payment, and suggest the other account. This is the same detection Statement Desk uses.
- It also finds the opposite side already saved in the other account (same amount, within 2 days) and offers to link the two instead of saving a second copy.
- Transfers stay suggestions, and a guess is never based on the amount alone.

## What doesn't change
- Statement Desk stays the only place to upload bank statements.
- Saves, offline entries and retries work the same as today.
- No existing records are changed.

## Technical details
- Add `src/lib/statement-pipeline/single-entry.ts`, a pure adapter that turns the draft entry into a `StmtLine`. It reuses `classifyMissing`/category rules, `scoreRecord`/`matchLines` (records via `ledgerRec`), `detectIssuer`/`detectAccountNumber`, and `pairOpposites`. It returns `{ category?, accountId?, txnType?, toAccountId?, matches[], opposite? }`.
- `src/routes/_authenticated/new.tsx`: call the adapter, debounced, as fields change. Apply suggestions only to fields not in a user-edited set. Show a match card that reuses the duplicate-compare component. Reuse `AccountForm`.
- "Link as the same" and "link opposite" use the existing owner-scoped correction/link paths. No schema change.
- Tests: adapter category, account, transfer and opposite-pair cases; a user-chosen category is never overwritten; an amount-only match never infers a transfer.
- The earlier calendar-wording plan stays queued and will be built after this one.
