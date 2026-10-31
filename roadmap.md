# Roadmap (Functional Requirements v1.0)
- [x] Yaba excluded at the user's request; no further review
- [x] Earlier: receipts + review, multi-currency, payment methods, bank reconciliation, family, splits, budgets, reports
- [x] Accounts + ledger, transaction types, tags, merchant memory, 5-tab nav (Home, Activity, AI, Insights, Wealth)
- [x] Voice/typed entry ("Spent ₹2,500 on dinner using AMEX yesterday")
- [x] Recurring income/bills/subscriptions/EMIs, calendar, mark paid, subscription detection
- [x] Credit card limit/due day/utilisation; loans with schedule + prepayment simulator; goals & reserves
- [x] Forecast (7–90 days, shortfall dates) and safe-to-spend with breakdown
- [x] AI assistant using engine figures only
- [x] Backup / restore / delete all; privacy (hide amounts)
- [x] Editable categories (rename/merge/archive/reorder) + grouped tags
- [x] Receipt tax & line items; XLSX/text-PDF statement import, reviewed missing entries and duplicate warnings
- [x] Family/project/travel/annual budgets with carry-forward; category Insights drill-down; hide/reorder Home sections
- [x] Searchable receipt vault, owner-scoped offline queue, in-app upcoming-payment reminders, theme settings
- [x] Real email/Google/Lovable sign-in and verified passkey device lock; existing anonymous records can upgrade by email

## Production completion (PRD gap list, Oct 31)
- [ ] Schema: card details (issuer, last four, statement day, interest), loan details (provider, type, original, start, prepayment terms, foreclosure %, linked account, payment log), reimbursement status, documents, valuations, transaction audit trail, push subscriptions
- [ ] Credit card module: billing cycle, statement vs unbilled, payments since statement, paid/partly paid/pending, interest & charges, EMI conversions, utilisation alerts
- [ ] Loans: full details, record EMI (principal vs interest split), foreclosure charges in simulator, full schedule, closure date
- [ ] Ledger integrity: reimbursements + pending reimbursements, reconciled balance, balance adjustment to actual, investment buy/redeem via transfers
- [ ] Income: sources, expected vs received, late income
- [ ] Subscriptions module: statuses, monthly/annual totals, renewals, price rises, duplicates
- [ ] Calendar month view, planned purchases (one-off), configurable advance reminders, custom forecast range
- [ ] Insights: monthly income vs spend, weekly trend, month comparison, merchants, accounts, subscriptions, card use, loan progress, savings & net worth trends; full filter set; account-level reports
- [ ] Wealth: investment valuations with date/source, mutual fund NAV feed, personal borrowings
- [ ] Home: quick actions, day/week/month view, alerts, pending reimbursements, budget use, AI briefing, selected cash accounts
- [ ] Document vault uploads (statements, insurance, loan, warranty) linked to transactions/accounts/loans, expiry reminders
- [ ] Audit history shown per transaction
- [ ] Settings: profile name, default currency, language for AI, AI privacy controls, reminder lead days, Siri Shortcut quick-add link, share sheet
- [ ] AI: anomalies, budget recommendations, month-over-month explanation, savings ideas in verified facts; user categories in receipt/voice reading
- [ ] Reconciliation: credits, refunds/reversals, card settlements, transfers, incorrect amounts, duplicates
- [ ] Backup ZIP with receipt/document files; legacy XLS; scanned PDF/screenshot statements via AI
- [ ] Encrypted on-device cache
- [ ] Web push payment reminders (device subscription, test push, daily dispatch route)
- [ ] Signed-in end-to-end verification of the main flows

## Waiting on something outside the app
- [ ] Installed-app offline cold-start — needs publication; app workers intentionally disabled in preview
- [ ] Real iPhone Face ID — needs a compatible device on a stable HTTPS origin; simulated platform passkey verified
- [ ] Daily push schedule — needs the published web address to call
- [ ] Native-only items (Siri voice commands, iOS widgets) — not available to web apps; Shortcut quick-add link offered instead
