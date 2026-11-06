# Next item: monthly depreciation runs on its own (document item 16)

Today the app only prepares each month's depreciation when you open the Assets page. The documents ask for it to run on a schedule. This makes it happen automatically on the 1st of every month, while keeping your approval before anything is posted.

## What you will see
- On the 1st of each month, last month's depreciation for every asset is prepared automatically, even if you never open the Assets page.
- A card appears in Inbox ("Depreciation ready for October: 6 assets, ₹48,200") with **Approve & post**, **Open assets** and **Dismiss**.
- If your approval rule for depreciation is switched off, it posts directly, and the Inbox card just confirms what was posted, with **Undo**.
- Assets that can't run (no cost, no put-to-use date, no life/rate, no linked account) are listed on the card with an **Edit** link each, instead of being silently skipped.
- Closed months are never touched; months already prepared or posted are never duplicated.
- An optional phone reminder ("Monthly depreciation is ready to review"), with no amounts on the lock screen, controlled from Settings → Notifications.

## Technical details
- New pure helper `scheduledRun(owner books, assets, today)` in `src/lib/books/assets-ledger.ts`, reusing `dueMonths`, `depreciationExceptions`, `depreciationEntry` and `stableUuid` so a rerun creates the same journal ids (no duplicates).
- New cron route `src/routes/api/public/jobs/monthly-depreciation.ts`, authenticated the same way as the other job routes; processes owners in pages, writes prepared journals into `finance_preferences` with a revision check, and records a run marker per owner-month so repeat calls are no-ops.
- Posting still goes through the existing approve flow (`AssetBooks` approve), or the existing finance operation when approval isn't required.
- Inbox card added to the review centre; new reminder kind added to the existing push dispatcher and settings.
- Hourly schedule registered alongside existing jobs; job only acts on the 1st–3rd (catch-up if a run is missed).
- Tests: rerun idempotency, closed-period refusal, exception listing, approval-on vs approval-off behaviour. Browser check of the Inbox card with isolated data.
