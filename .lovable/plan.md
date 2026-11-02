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

Kept as they are (different jobs): receipt photos on New entry, Vault documents, trip booking imports, family evidence, and the accountant upload page, whose files already land in Statement Desk.

## New: side-by-side duplicate check
- From "Possible duplicates", open a pair in a centred pop-up: two columns (date, amount, payee, account, category, notes, receipt, source statement), with differences highlighted.
- Buttons: "Same transaction — keep left / keep right" (other one removed, with Undo) and "Separate transactions" (remembered, never flagged again).

## Order
1. Duplicate comparison (newest request)
2. Overlaps 1–3 (statements and review)
3. Overlaps 4–8 (menu tidy-up)

Every old address will redirect, so bookmarks keep working. No financial records change apart from your own duplicate decisions.

## Technical notes
- Redirect routes via beforeLoad; menu entries updated in AppShell.
- Duplicate decisions use the existing owner-scoped atomic correction RPC with undo; "separate" stored in finance_preferences so review-centre excludes the pair.
- Add tests for the duplicate decision rules; existing browser tests updated for new paths.
