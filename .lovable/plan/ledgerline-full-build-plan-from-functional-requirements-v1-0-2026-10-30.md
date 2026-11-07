# Ledgerline: full build plan (from Functional Requirements v1.0)

## Platform note
The document asks for a native SwiftUI iPhone app. Lovable builds web apps, so this will be an **iPhone-first web app you can add to your Home Screen**. It opens full-screen like an app, works in light and dark mode, and supports camera scanning and file import. Siri Shortcuts, Face ID unlock, the WhatsApp share button and full offline use are partly limited on iPhone web apps (see "Limits" at the end).

Design: iOS-style minimal blue. Large rounded cards, 44px+ tap targets, segmented pills, and an eye icon that hides balances. Five tabs (Home, Activity, AI, Insights, Wealth) with a floating "+" button on every screen.

The current expenses, receipts, family members, budgets and reconciliation carry over into the new structure.

## Phase 1: Foundation (accounts and the ledger)
- Accounts: savings, current, cash, credit card, wallet, investment, FD, loan, other asset or liability. Each has an opening balance, its own ledger and balance, and can be archived.
- Transaction types: expense, income, transfer, refund, adjustment. Transfers between your own accounts, and credit card bill payments, are never counted as income or spending.
- Entry fields: amount, date and time, type, category and subcategory, account, merchant (suggested), description, multiple tags, attachments, reimbursement status, recurring flag.
- Categories: the 18 categories in the document, plus your own. You can rename, merge, archive and reorder them.
- Tag groups: Person, Purpose, Organisation (VEI, MOVAC, AK Meridian, KR Enterprises), Nature and Project. The current business/personal label and family members become tags.
- The app remembers each merchant's last category, tags and account and suggests them next time.
- New 5-tab layout with the floating quick-add button.

## Phase 2: Fast entry
- Receipt scanner: reads merchant, date, total, tax, line items, currency and payment method. You review and correct everything before saving, and the original receipt is kept.
- Screenshot and document import: UPI, bank and card screenshots, invoices and bookings, as PDF or image.
- Voice entry: say "Spent ₹2,500 on dinner using AMEX yesterday" and get a filled-in entry to confirm.
- Statement import (CSV, Excel, PDF) with a review screen. It flags duplicates, missing entries, wrong amounts, transfers, card settlements and refunds before anything is applied.
- Multi-currency conversion at the bill date's rate, as it works today.

## Phase 3: Commitments
- Recurring income and expenses: daily, weekly, monthly, quarterly, half-yearly, yearly or custom. They stay "scheduled" until you confirm or reconcile them, and can be marked overdue, paid or cancelled.
- Credit cards: limit, billing cycle, statement and due dates, unbilled vs billed amounts, payments, EMI conversions, interest, utilisation alerts, and paid, partly paid or pending status.
- Loans and EMIs: full loan details, a repayment schedule split into principal and interest, the projected payoff date, and an early-repayment simulator comparing shorter tenure with lower EMI.
- Subscriptions: found automatically from past spending. Mark them active, paused or cancelled; see renewals, price increases, possible duplicates, and monthly and yearly totals.
- Income: expected vs received, expected credit dates and late-payment tracking.
- Financial calendar showing all of the above, with in-app reminders.

## Phase 4: Planning engine
- Budgets: overall, category, family member, travel, project and annual. Each shows spent, remaining, % used and a month-end estimate, with alerts and optional carry-forward of unused amounts.
- Annual expenses (insurance, school fees and so on) set aside month by month as reserves, not counted as spending.
- Forecast for 7, 15, 30, 60, 90 days or custom dates. It shows the projected balance day by day and flags dates when money runs short.
- Safe-to-spend: works payment by payment in date order, counting minimum balances and reserves, and shows how the figure was worked out. It leaves out unconfirmed income by default, with an option to include it. It also shows the lowest balance in the period.

## Phase 5: Home, Insights and Wealth
- Home: cash, income, spending, safe-to-spend, budget use, upcoming payments, card dues, pending reimbursements, recent activity, alerts and an AI briefing. You can rearrange or hide cards and switch between day, week and month views.
- Insights: income vs spending, categories, weekly trends, month-to-month, merchants, accounts, subscriptions, card use, loan progress, savings and net worth. Filter by date, category, account, payment method, tag, person, organisation, project or merchant, and tap any chart to see the transactions behind it.
- Wealth: assets, liabilities and net worth. Investment values show their date and whether you entered them yourself. Goals show target, saved so far, remaining and expected finish date.
- Document vault: searchable by merchant, date, amount, type and text, and linked to transactions, accounts or loans.

## Phase 6: AI assistant
- A chat that answers questions like "How much did I spend using AMEX?" or "Can I afford ₹50,000 today?"
- All numbers come from the app's own calculations, never AI guesses. Answers are labelled actual, estimated or hypothetical and say what data is missing.
- Spending summaries, unusual-spend alerts, savings tips and debt payoff what-ifs.

## Phase 7: Settings, security and data
- Proper sign-in, so your data follows you across devices. Today's data is tied to this one browser.
- App lock using passkey (Face ID on iPhone).
- Category, tag, account, notification, theme and AI settings.
- Export, backup, restore and delete all data.

## Acceptance checks (automated tests)
Each check in section 28 of the document gets its own test. Examples: transfers don't change income or spending, paying a card bill doesn't double-count purchases, imports flag duplicates, scheduled payments aren't marked paid until confirmed, safe-to-spend follows payment dates, forecasts flag shortfalls, reports match the transactions, and AI figures match the app's own calculations.

## Limits on iPhone web apps
- WhatsApp sharing: there is no direct button in the share sheet. You save or upload the file instead, and an Apple Shortcut can make this one tap.
- Siri: you can use Apple Shortcuts that open the app's quick-add, but not native Siri commands.
- Offline: new entries are queued while offline and synced when you reconnect. Reports need a connection.
- Notifications: these need the app added to your Home Screen.
- Bank feeds: there are no automatic bank connections. Use statement and screenshot imports instead, as the document allows.

## Technical details
- New tables, all private to your account with owner-only access rules: accounts, transactions (the existing expenses table is moved over and kept), categories, tag groups and tags, merchant memory, recurring rules and their occurrences, credit card details and statements, loans, subscriptions, budgets, goals, assets and valuations, documents, dashboard preferences and AI chat history.
- Each transfer is stored as a linked debit and credit pair. Card payments are transfers. Balances are worked out from the ledger, not stored separately.
- Calculations live in pure, tested modules: ledger, forecast, safe-to-spend, loan amortisation, budgets and subscription detection.
- AI work (receipt and voice reading, chat) runs on the server. The chat asks the calculation modules for every figure.
- Offline queue saved on the device, with an id per entry to prevent duplicates. Home Screen app setup includes the app icon and manifest.

Suggested order: Phase 1 first, then each later phase as its own step.
