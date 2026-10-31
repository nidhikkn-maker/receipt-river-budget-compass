# Your own payment methods (UPI IDs, cards, cash)

## What exists today
- **Wealth → Accounts**: you can already add named accounts such as bank accounts, credit cards (with limit, statement and due day) and cash.
- **New entry**: you pick a general payment type (Cash, UPI, Credit card, Debit card, Forex card, Company card, Bank transfer) plus an account.
- Missing: you can't save *your specific* methods, like "GPay – kk@okhdfc", "PhonePe – kk@ybl", "HDFC Debit ••4821", and pick them by name.

## What I'll add
1. **Settings → Payment methods** page: add, rename, set default, archive.
   - Types: UPI ID, Debit card, Credit card, Cash, Forex card, Company card, Wallet.
   - Fields: nickname, UPI ID or last 4 card digits (never full card numbers), linked account (e.g. UPI ID → HDFC savings, debit card → its bank, credit card → its card account).
2. **New entry / bill review**: one "Paid with" picker showing your saved methods; choosing one fills the payment type and the linked account automatically, so balances stay correct.
3. Shop memory remembers the method you last used at each shop.
4. **Expenses filter and reports**: filter and total by a specific UPI ID or card.
5. Existing entries keep working unchanged.

## Technical details
- New owner-scoped `payment_instruments` table with RLS (type, nickname, handle/last4, linked account, default, archived); optional `payment_instrument_id` on expenses.
- Masking validation: only last 4 digits stored for cards; UPI handle format check.
- Tests for auto-filling type/account from a method and per-method totals.
