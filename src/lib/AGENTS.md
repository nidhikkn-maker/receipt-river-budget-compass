# Finance rule modules

- Personal/family tracker, no approvals: expense rules live as pure tested functions in src/lib/expenses.ts.
- Accounts/ledger rules (balances, cashflow, net worth) are pure tested functions in src/lib/ledger.ts; balances are derived from entries, never stored, and transfers/card payments never count as income or spending. store.expenses = expense-type only; store.transactions = all entries.
- Planning math (recurring schedule, forecast, safe-to-spend, loans, goals, subscription detection) lives in src/lib/planning.ts; src/lib/position.ts combines records into screen/AI figures. The AI assistant (src/lib/assistant.functions.ts) only explains facts from position.ts — never let it compute numbers.
- Mutual fund portfolio charts use pure tested rules in src/lib/portfolio.ts on owner-visible NAV snapshots; gain is change since the first saved NAV net of ledger flows, not lifetime return, because acquisition cost is not recorded.
- Long-range predictions are pure tested rules in src/lib/projection.ts (editable category inflation assumptions); suggestions are rule-based from those figures, not AI, so numbers stay verifiable.
- Financial inbox, data freshness and balance-discrepancy checks are pure derived rules in src/lib/inbox.ts; items are never stored, only dismissals, so they clear automatically when records are fixed and discrepancies never auto-create entries.
- Reimbursement claim detail lives in expenses.reimbursement (src/lib/reimbursements.ts); money back is a linked reimbursement-type entry, never income, and reimbursement_status is derived from it.
- Health score (src/lib/health.ts) and monthly review figures (src/lib/monthly-review.ts) are computed by tested rules; the AI only narrates saved reviews, which store a data hash to flag outdated reports.
- Phase 2/3 rules (simulator, behaviour, emergency fund, irregular bills, milestones, trips, merchants, weekly brief) are pure tested functions in src/lib/intelligence.ts; their settings live in finance_preferences, trips link entries by a 'Trip: <name>' tag so stored INR and exchange rates are never rewritten, and simulations never write records unless the user explicitly saves a planned commitment.
- Saved payment methods (UPI IDs, cards, wallets, cash) live in owner-scoped finance_preferences.paymentInstruments with pure tested rules in src/lib/payment-instruments.ts; each is linked to an account of a compatible kind and entries keep the method id plus the general payment type, so balances still flow through the linked account.
- Currency conversion happens server-side in src/lib/fx.functions.ts (Frankfurter/ECB rates for the bill date) so stored INR amounts can't be faked by the client.
- Reports are generated in the browser (src/lib/reports.ts) from data the user can already see, so RLS scoping applies automatically.
- Receipt reading runs in a server function (src/lib/receipt-extract.functions.ts) so the AI key stays server-side.
- Vault document scanning uses a server function (src/lib/document-extract.functions.ts) gated by the same AI privacy settings; extracted fields are always reviewed before saving.
- Category splits live in expenses.allocations and all category reporting goes through categoryTotals/categoryParts so a split transaction is counted once.
