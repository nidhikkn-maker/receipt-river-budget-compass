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

- Expense workflow rules live as pure functions in src/lib/expenses.ts (tested); UI only calls them — keeps approval logic in one testable place.
- App data is demo-only, persisted in browser localStorage via src/lib/store.tsx; no backend yet.
- Receipt reading runs in a server function (src/lib/receipt-extract.functions.ts) so the AI key stays server-side.
