# Accountant upload link (Mr. Durai)

## What you get
- **Accountant settings** (Settings > Accountant): name (Mr. Durai to start) and email, with a ⋯ menu to **Edit**, **Send link now**, **Copy link**, and **Turn off link**.
- **One private upload link** per round. It works for 30 days, takes at least 25 files in one go (up to 50, PDFs and photos, 20 MB each), and needs no sign-in. Your accountant sees only an upload page with your name, never your app or your records.
- **Automatic email**: on a day of the month you pick (1st by default), a fresh link is emailed to your accountant. You can also press **Send link now** at any time. Each new link replaces the old one.
- **Uploads go straight into Statement Desk**: each file is read, matched and categorised automatically. Exact matches save as usual; anything uncertain waits for your confirmation, exactly like your own uploads. Your Inbox shows "Mr. Durai uploaded 12 statements".
- **Password-protected PDFs**: the upload page has an optional password box per file; otherwise the file waits for you to enter the password.

## One thing needed from you
Sending email needs your own sender domain. I'll open the email setup for **ledgerline.biz** (emails would come from something like notify.ledgerline.biz). Until it's verified, "Copy link" still works so you can share it on WhatsApp.

## Safety
- The link holds a long random code; only a scrambled copy is stored. Expired or turned-off links show "This link is no longer active".
- The upload page can only add files to your private statement area. It cannot read, list or delete anything.
- Limits per link (file count, size, types) are enforced on the server, not just the page.
- Nothing from an upload is posted without the same checks as your own uploads.

## Technical details
- New owner-scoped tables: `accountant_contacts` (name, email, send day, enabled) and `upload_links` (hashed token, expires_at, file count, revoked). RLS owner-only; no anon access.
- Public page `/u/$token` plus server routes under `/api/public/upload/*` that validate the token hash, expiry and caps, then store files with the admin client under the owner's private `statement-uploads/<owner>/accountant/` prefix and create a pending Statement Desk batch.
- Statement Desk picks up pending batches on open and runs the existing pipeline (identify, match, classify, plan); uncertain lines stay in "needs decision".
- Email: Lovable app email with an `accountant-upload-link` template; daily managed schedule at `/api/public/jobs/accountant-links` sends only to owners whose send day is today, one recipient each, idempotent per month.
- Tests: token expiry/revocation, 25+ file cap, send-day selection.
