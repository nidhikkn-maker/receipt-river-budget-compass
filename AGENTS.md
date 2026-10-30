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

- Approval transitions are enforced in the database (review_expense function + RLS); src/lib/expenses.ts mirrors them as pure, tested functions for the UI — the server is the source of truth.
- Data lives in Lovable Cloud; src/lib/store.tsx is the single client data layer for signed-in pages under src/routes/_authenticated.
- Reports are generated in the browser (src/lib/reports.ts) from data the user can already see, so RLS scoping applies automatically.
- Receipt reading runs in a server function (src/lib/receipt-extract.functions.ts) so the AI key stays server-side.
