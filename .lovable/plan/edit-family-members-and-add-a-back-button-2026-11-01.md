# Edit family members and add a Back button

## 1. Fix a wrongly typed invite email
On the Family page, under "Family sign-ins", each invited person gets an **Edit email** button next to Remove access / Restore.
- Tapping it shows the email in an input with **Save** and **Cancel**.
- Save checks the email looks valid and isn't already used for another member.
- If the person **hasn't signed in yet**, the email is simply corrected.
- If they **already connected**, changing the email removes the old connection and they'll need to sign in again with the new email. The app warns you before saving.
- Their past requests stay as they are.

## 2. Edit a family member's details
Each member card on the Family page gets an **Edit** (pencil) button to change their name and relationship (e.g. "Brother in Law"). Past expenses stay linked to the same person.

## 3. Back button on pages
Every page you open from somewhere else (for example Search, Rules, Family, a trip, a transaction) gets a back arrow at the top left, next to the page title.
- Tapping it goes back to the page you came from.
- If you opened the page directly (no previous page), it takes you to the dashboard.
- It isn't shown on the dashboard itself.

## Technical details
- `family-requests.ts`: add `updateInviteEmail(id, email)`; for accepted invites reset `accepted_by` and acceptance so the new address must accept. First check the `family_invites` update policy and any column guards; if the owner can't update `email`/`accepted_by`, add a small owner-scoped database function (migration) to do it atomically.
- `FamilyRequests.tsx`: inline edit state per invite, uniqueness check against existing invites, in-app confirmation (no `window.confirm`).
- Store: add `updateMember(id, name, relation)` against the existing members table (owner RLS); edit UI in `family.tsx`. Also replace its `confirm()` remove prompt with in-app confirmation.
- `AppShell`: render a `BackButton` (ArrowLeft icon, aria-label "Back") on all routes except `/` and `/dashboard`; uses `router.history.canGoBack()` → `history.back()`, else navigate to `/dashboard`. Remove duplicate back arrows on trip detail / new entry if they conflict.
- Tests: email edit validation/duplicate rule and back-fallback rule.
