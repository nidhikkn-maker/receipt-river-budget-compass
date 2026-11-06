# Depreciation phone reminder + manager/finance screen checks

## 1. Phone reminder when monthly depreciation is ready
- New switch in Settings → Notifications: "Monthly depreciation ready" (on by default, can be turned off).
- After the monthly run prepares last month's depreciation, each owner with this switch on gets one lock-screen message per device: "Last month's depreciation is ready for your approval." No amounts or asset names.
- Tapping it opens the Inbox, where the existing Approve & post card is.
- Sent once per owner per month; reruns on the 2nd/3rd never repeat it. Nothing is sent if nothing new was prepared, or if it was already approved/dismissed.
- Posting still always needs your approval.

## 2. End-to-end screen checks for manager and finance
Using made-up records only (real data untouched), sign in as each role and confirm on screen:
- **Manager:** Expenses shows own entries plus same-department team entries as view-only; other departments' entries never appear; no edit/delete on team rows unless the admin switch allows it; Tax Centre shows no company tax and no one else's personal tax.
- **Finance:** sees everyone's expenses view-only; sees company tax figures; never sees another person's personal tax; edit buttons appear only when the admin switch is on.
- Each check also flips one admin switch and confirms the screen changes accordingly.

## Technical details
- `notification-settings.ts`: add `depreciation` key (+ test).
- `push-dispatch.server.ts`: `dispatchDepreciationReminders(db, seed, owners, month)` using `push_reminder_log` claim with item_key `depreciation:<YYYY-MM>` (unique constraint prevents duplicates); generic payload, url `/inbox`.
- `/api/public/jobs/monthly-depreciation.ts`: collect owners whose run added new journals and call dispatcher after writes; respect `depreciationDismissed`.
- Unit tests in `push-dispatch.test.ts` for: sends once, rerun skipped, switch off skipped, nothing prepared skipped.
- New `scripts/browser/test_role_screens.py` + fixture/mocks following the existing fixture pattern, intercepting team/expense/tax requests with role-specific responses mirroring the database rules already proven by the PGlite role tests.
- Add both items to roadmap.md.
