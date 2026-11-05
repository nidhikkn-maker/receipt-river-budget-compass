# Finish both documents, test on iPhone/iPad sizes, then publish

Deferred by you (not in this plan): live NSE/BSE price provider, final ITR filing format, Mercedes GLS sanction letter.

## Part 1 — Complete the remaining document items (one continuous run, no "Continue" stops)
Work straight through the requirements checklist, ticking each line with where it lives and its test:
1. Share holdings: bonus/split (done), rights issues, mergers, buybacks; verified vs provisional quantities; broker cash kept separate.
2. Separate access per company (who can see/edit each company), checked by the server.
3. Approvals enforced by the server, with an append-only approval history.
4. Safer document saving: a document and everything it creates save together or not at all; each figure links to its document and page.
5. Reconciliations that compare real figures: suppliers, customers, loans, investments, between your own companies.
6. Asset lifecycle entries (purchase, transfer, sale, write-off) and property page with joint ownership, tenants and lease versions.
7. Net worth: one calculation with an as-of time, daily snapshots, valuation quality per holding, gold valuation.
8. Closed periods keep frozen evidence; version history for schedules and returns.

## Part 2 — iPhone and iPad testing
- I check every main page at iPhone (402px) and iPad portrait/landscape sizes, fix layout problems, and save screenshots.
- After publishing, you test on your real devices: install to Home Screen, Face ID, camera scan, offline opening, push test notification. I give you a short checklist.

## Part 3 — Publish
- Full test suite, build and a fresh security check must pass first.
- Then publish to ledgerline.biz; scheduled jobs (closing prices, rule watch, reminders) start after this.

## Technical notes
- Additive migrations only; owner-scoped RLS on every new table; pure rules in src/lib/books with tests; no new tabs.
- Checklist file in Files updated with final status of every line in v6.0 §1–72 and v6.1 §1–15.
- If a reply runs out of room, the next reply resumes from the checklist automatically.
