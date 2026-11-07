# Clean-up: remove overlapping pages and options

Statement Desk is already the single place for bank statements. The same "one home per job" rule applied across the app shows these overlaps.

## Overlaps found

1. **Old statement pages still exist** — "Match & fix", "Forex reconcile" and "Statement cross-check" only redirect to Statement Desk now. Remove them fully (keep the redirect so old links still work).
2. **Historical import has its own upload list** — it still carries a separate upload manifest. Turn it into a read-only "past imports" history that links to Statement Desk.
3. **Two review places** — "Transaction Review Centre" and the Inbox "Review" tab show the same entries. Keep one (Inbox → Review), redirect the other.
4. **Two reports pages** — "Reports" and "Reports Centre". Merge into one Reports page with tabs.
5. **Two rules pages** — "Financial rules" and "Classification rules" (the second is a tiny stub). Merge into one Rules page.
6. **Three checking pages** — Records check, Statement coverage and Account reconciliation all answer "are my accounts complete?". Group them under one "Account health" page with three tabs.
7. **Three planning pages** — Plan, 10-year prediction, Strategy. Group under one Plan page with tabs (no features removed).
8. **Two assistant pages** — AI assistant and Connected assistants. Keep the chat; move "Connected assistants" into Settings.
9. **Accountant tools in two places** — the accountant link settings (in Settings) and the monthly requests page move into Statement Desk as tabs: "Upload", "From accountant" (link, contact, send/turn off, reminders) and "Monthly requests". The old Settings section and separate page are removed and redirect there. The accountant's own upload page stays, since he has no app access.

Kept as they are (different jobs): receipt photos on New entry, Vault documents, trip booking imports and family evidence.

## New: side-by-side duplicate check

- From "Possible duplicates", open a pair in a centred pop-up: two columns (date, amount, payee, account, category, notes, receipt, source statement), with differences highlighted.
- Buttons: "Same transaction — keep left / keep right" (other one removed, with Undo) and "Separate transactions" (remembered, never flagged again).

## New: fix entries inside the review lists

- In the "Missing details" and "Type checks" lists, each row gets small inline fields (category, type such as expense / transfer / income, and the missing field), plus a Save button for that row.
- Ticking several rows lets you set the same type or category for all of them at once.
- Saving goes through the same safe saving used everywhere else, so currency and account rules still apply.

## New: live counts

- The Inbox summary and each review list's counts update the moment an entry is saved, confirmed or marked separate. No page refresh is needed.
- A resolved row fades out of the list, with Undo for a few seconds.

## Order

1. Duplicate comparison
2. Inline fixes and live counts
3. Overlaps 1–3 and 9 (statements, review, accountant)
4. Overlaps 4–8 (menu tidy-up)

Every old address will redirect, so bookmarks keep working. No financial records change apart from your own decisions.

## Technical notes

- Redirect routes via beforeLoad; menu entries updated in AppShell; Statement Desk tabs via a `tab` search param.
- Duplicate decisions use the existing owner-scoped atomic correction RPC with undo; "separate" stored in finance_preferences so review-centre excludes the pair.
- Inline edits call the store's existing update path; counts derive from store state via reviewCounts, so they recompute on every store change.
- Add tests for duplicate decisions, the inline type/category rules and count recomputation; existing browser tests updated for new paths.
