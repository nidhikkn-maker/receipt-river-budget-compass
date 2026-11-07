# Visitor demo on the sign-in page

## What visitors will see
- A clear "Try the live demo" link on the sign-in page, under the normal sign-in options, with one line saying "Sample data only, nothing is saved to a real account."
- Tapping it asks for any email address (no password, no confirmation email). The email is only a label shown in the demo, e.g. "Demo — visitor@company.com", and is not checked or emailed.
- After entering it, the full app opens straight away (Home, Activity, Statements, Reports and the rest) filled with realistic sample accounts, cards, expenses, receipts and a trip.
- Entering the same email again on the same device reopens that visitor's demo; on another device it starts a fresh one (no password means it can't safely be shared across devices).
- A slim "Demo mode — Create your own account" banner stays at the top, so visitors can sign up whenever they like.
- Each visitor gets their own private sample copy. Nobody sees another visitor's changes, and your real records are never visible or touched.
- Demo copies are removed automatically after 24 hours.

## Limits in demo mode
- AI receipt scanning, statement reading, push reminders, family invites, Face ID/PIN setup and data export are turned off, each with a short note saying they're available with a real account (this keeps costs and abuse down).
- A simple rate limit on starting demos stops misuse.

## Also included
- Publish the faster-loading fonts change (and this demo) to ledgerline.biz once you approve.

## Technical details
- Uses the existing guest (anonymous) sign-in, so no shared password and no unverified real accounts. The entered email is validated for format and stored only as a demo display label in the guest's preferences; it never becomes a login identity, so nobody can claim someone else's address. A server function seeds sample rows for the new guest owner id (owner-scoped, RLS unchanged), idempotently.
- `is_anonymous` flags demo mode; AI/push/invite/export server functions refuse anonymous callers.
- A scheduled cleanup route (cron-authenticated) deletes guest owners older than 24h and their storage.
- Existing guest-to-email upgrade keeps working, so a visitor can convert their demo into a real account.
- Browser test: click demo, see sample Home, confirm the banner, confirm AI scan is disabled.
