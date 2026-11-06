# Next: role-based access + monthly depreciation on its own

## Part 1 — Employee, manager and finance access

Today every role sees only their own expenses and tax; roles only change who can edit department budgets. Your choice: managers see their team, finance sees everyone plus company tax, personal tax stays private.

| Role | Expenses | Tax |
|---|---|---|
| Employee | Own only (add, edit, delete) | Own personal and own companies |
| Manager | Own + view-only for people in their department | Own only |
| Finance | Own + view-only for everyone | Own + view-only company tax figures of everyone; never anyone's personal tax |

- Nobody can edit, delete or reclassify someone else's expense; viewing never changes data.
- Receipts of others open only for managers (their department) and finance, read-only.
- A "Team" view appears on the Expenses page for managers and finance, with person and department filters. Employees don't see it.
- A "Company tax (all)" view appears in Tax Centre for finance only.
- Role is read from the protected roles record, never from anything the user can edit. A role badge shows on Settings → Account.

Tests (one per rule, against a real temporary database with three test people):
- Employee cannot read another person's expense, receipt or tax.
- Manager reads team expenses in their department, not other departments; cannot edit or delete them; cannot read anyone's tax.
- Finance reads all expenses, cannot edit them; reads company tax figures; cannot read personal tax.
- Nobody can give themselves a role.

## Part 2 — Monthly depreciation (document item 16)

Today the app only prepares each month's depreciation when you open the Assets page. The documents ask for it to run on a schedule. This makes it happen automatically on the 1st of every month, while keeping your approval before anything is posted.

## What you will see
- On the 1st of each month, last month's depreciation for every asset is prepared automatically, even if you never open the Assets page.
- A card appears in Inbox ("Depreciation ready for October: 6 assets, ₹48,200") with **Approve & post**, **Open assets** and **Dismiss**.
- If your approval rule for depreciation is switched off, it posts directly, and the Inbox card just confirms what was posted, with **Undo**.
- Assets that can't run (no cost, no put-to-use date, no life/rate, no linked account) are listed on the card with an **Edit** link each, instead of being silently skipped.
- Closed months are never touched; months already prepared or posted are never duplicated.
- An optional phone reminder ("Monthly depreciation is ready to review"), with no amounts on the lock screen, controlled from Settings → Notifications.

## Technical details — roles
- Migration: add SELECT-only policies on `expenses` and `expense_history` for `has_role(manager) AND department = my_department()` and `has_role(finance)`; existing owner-only INSERT/UPDATE/DELETE policies unchanged. Storage SELECT policy for receipts mirrors this.
- Company tax for finance: security-definer `finance_company_tax()` returns only the company tax summaries (per entity/year) from `finance_preferences`, checks `has_role(finance)` first; personal figures never leave the function.
- Client: `useRole()` in the store via the self-readable `user_roles` row; Team view and finance tax view gated by it (server still enforces).
- Tests: PGlite with migrations + simulated `auth.uid()` per role, in `src/lib/role-access.test.ts`.

## Technical details — depreciation
- New pure helper `scheduledRun(owner books, assets, today)` in `src/lib/books/assets-ledger.ts`, reusing `dueMonths`, `depreciationExceptions`, `depreciationEntry` and `stableUuid` so a rerun creates the same journal ids (no duplicates).
- New cron route `src/routes/api/public/jobs/monthly-depreciation.ts`, authenticated the same way as the other job routes; processes owners in pages, writes prepared journals into `finance_preferences` with a revision check, and records a run marker per owner-month so repeat calls are no-ops.
- Posting still goes through the existing approve flow (`AssetBooks` approve), or the existing finance operation when approval isn't required.
- Inbox card added to the review centre; new reminder kind added to the existing push dispatcher and settings.
- Hourly schedule registered alongside existing jobs; job only acts on the 1st–3rd (catch-up if a run is missed).
- Tests: rerun idempotency, closed-period refusal, exception listing, approval-on vs approval-off behaviour. Browser check of the Inbox card with isolated data.
