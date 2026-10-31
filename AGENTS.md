<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Personal/family tracker, no approvals: expense rules live as pure tested functions in src/lib/expenses.ts.
- New visitors sign in at /auth; existing anonymous identities may upgrade by email to preserve owner-scoped records, and offline access never creates a new identity.
- Data lives in Lovable Cloud; src/lib/store.tsx is the single client data layer for pages under src/routes/_authenticated.
- Currency conversion happens server-side in src/lib/fx.functions.ts (Frankfurter/ECB rates for the bill date) so stored INR amounts can't be faked by the client.
- Reports are generated in the browser (src/lib/reports.ts) from data the user can already see, so RLS scoping applies automatically.
- Receipt reading runs in a server function (src/lib/receipt-extract.functions.ts) so the AI key stays server-side.
- Accounts/ledger rules (balances, cashflow, net worth) are pure tested functions in src/lib/ledger.ts; balances are derived from entries, never stored, and transfers/card payments never count as income or spending. store.expenses = expense-type only; store.transactions = all entries.
- Planning math (recurring schedule, forecast, safe-to-spend, loans, goals, subscription detection) lives in src/lib/planning.ts; src/lib/position.ts combines records into screen/AI figures. The AI assistant (src/lib/assistant.functions.ts) only explains facts from position.ts — never let it compute numbers.
- Owner-scoped finance_preferences holds category and grouped-tag catalogs, scoped budgets and display preferences; category moves use an RLS-protected database function to update ledger and budget references together.
- Offline entries and snapshots use owner-keyed IndexedDB; stable entry UUIDs make server-side synchronization idempotent and currency conversion stays server-side.
- Passkey device unlock uses SimpleWebAuthn with one-use expiring server challenges, required user verification and stored counters; it supplements account sign-in rather than replacing it.
- Offline app registration is centralized in src/lib/pwa.ts and refused in development and preview; vite-plugin-pwa generates the production worker with network-first navigation and no OAuth caching.
