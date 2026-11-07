# Your own payment methods (UPI IDs, cards, cash)

## What exists today
- **Wealth → Accounts**: you can already add named accounts such as bank accounts, credit cards (with limit, statement and due day) and cash.
- **New entry**: you pick a general payment type (Cash, UPI, Credit card, Debit card, Forex card, Company card, Bank transfer) plus an account.
- Missing: you can't save *your specific* methods, like "GPay – kk@okhdfc", "PhonePe – kk@ybl", "HDFC Debit ••4821", and pick them by name.

## What I'll add
1. **Settings → Payment methods** page: add, rename, set default, archive.
   - Types: UPI ID, Debit card, Credit card, Cash, Forex card, Company card, Wallet.
   - Fields: nickname, UPI ID or last 4 card digits (never full card numbers).
   - **Linked bank account (required for UPI and debit cards):** every UPI ID and debit card is linked to one of your bank accounts (e.g. kk@okhdfc → HDFC Savings). Credit cards link to their card account. Cash links to your cash wallet.
   - Each bank account on Wealth lists the UPI IDs and cards linked to it, with an "Add payment method" button there too.
2. **New entry / bill review**: one "Paid with" picker showing your saved methods; choosing one fills the payment type and the linked bank account automatically, so that bank's balance updates correctly.
3. Shop memory remembers the method you last used at each shop.
3a. Extra types: wallets (Paytm, Amazon Pay) and UPI Lite with their own balance; RuPay credit card on UPI (counts against the card, not the bank); net banking; cheque.
3b. Owner per method (you or a family member) and add-on cards linked to the main card.
4. **Expenses filter and reports**: filter and total by a specific UPI ID or card.
5. Existing entries keep working unchanged.

## Technical details
- New owner-scoped `payment_instruments` table with RLS (type, nickname, handle/last4, linked account, default, archived); optional `payment_instrument_id` on expenses.
- Masking validation: only last 4 digits stored for cards; UPI handle format check.
- Tests for auto-filling type/account from a method and per-method totals.
