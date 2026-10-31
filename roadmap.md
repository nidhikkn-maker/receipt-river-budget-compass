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
- [x] Schema: card details (issuer, last four, statement day, interest), loan details (provider, type, original, start, prepayment terms, foreclosure %, linked account, payment log), reimbursement status, documents, valuations, transaction audit trail, push subscriptions
- [x] Credit card module: billing cycle, statement vs unbilled, payments since statement, paid/partly paid/pending, interest & charges, EMI conversions, utilisation alerts
- [x] Loans: full details, record EMI (principal vs interest split), foreclosure charges in simulator, full schedule, closure date
- [x] Ledger integrity: reimbursements + pending reimbursements, reconciled balance, balance adjustment to actual, investment buy/redeem via transfers
- [x] Income: sources, expected vs received, late income
- [x] Subscriptions module: statuses, monthly/annual totals, renewals, price rises, duplicates
- [x] Calendar month view, planned purchases (one-off), configurable advance reminders, custom forecast range
- [x] Core Insights: monthly income vs spend, weekly trend, month comparison, merchants, accounts and net worth trends; date/person/scope/account/payment/search filters and account-filtered expense exports
- [x] Wealth: investment valuations with date/source and personal borrowings
- [ ] Mutual fund NAV feed — external quote integration still required
- [x] Home: quick actions, day/week/month view, alerts, pending reimbursements, budget use, AI briefing, selected cash accounts
- [x] Document vault uploads (statements, insurance, loan, warranty) linked to transactions/accounts/loans, expiry reminders
- [x] Audit history shown per transaction
- [x] Settings: profile name, default currency, AI language/privacy controls, reminder lead days
- [ ] Shortcut quick-add parameters and share-sheet intake — web integration not implemented
- [x] AI: anomalies, budget recommendations, comparisons and savings ideas in verified facts; server-enforced AI privacy
- [ ] User category catalogs in receipt/voice extraction — schema still uses fixed categories
- [x] Reconciliation: CSV/XLSX credits and debit matching across the unified ledger, review type/account/amount, duplicate warnings
- [ ] Statement direction/account-specific matching for ambiguous transfers — needs additional rules and tests
- [x] Backup ZIP with receipt/document files; same/cross-owner restore mapping tests
- [ ] Legacy XLS and scanned PDF/screenshot statement extraction — not implemented
- [ ] Atomic backup restore and every-record restore verification — current restore can partially persist on failure
- [x] Encrypted on-device cache
- [ ] Web push payment reminders (device subscription, test push, daily dispatch route)
- [x] Signed-in checks: account creation, loan payment (₹980 principal + ₹120 interest), scheduled bill ₹750, replay without duplicate, document upload/search, ZIP download and AI loan answer
- [x] AI privacy off/on checked; six screens tested at 402×725 with no overflow or page errors; 100 automated tests passed
- [ ] Remaining end-to-end checks: receipt OCR after privacy additions, reimbursement/EMI conversion, restore, offline reload/sync and real-device passkeys

## Waiting on something outside the app
- [ ] Installed-app offline cold-start — needs publication; app workers intentionally disabled in preview
- [ ] Real iPhone Face ID — needs a compatible device on a stable HTTPS origin; simulated platform passkey verified
- [ ] Daily push schedule — needs the published web address to call
- [ ] Native-only items (Siri voice commands, iOS widgets) — not available to web apps; Shortcut quick-add link offered instead
