# Corporate Accounting Milestone 1 — foundation batch

## Implemented, not activated on production
- Balanced source-bound journals cover assets, liabilities, equity/capital, loans, receivables/payables, unpaid costs, outstanding income, supplier/customer advances, prepayments/releases, depreciation and adjusting entries.
- Explicit opening-target planner calculates movements against existing accounting balances, refuses incomplete/unbalanced targets and never derives capital as a plug. The journal review accepts explicit balanced legs; automatic historical schedule-to-target mapping remains unfinished.
- Printed GST invoice proposals retain exact invoice identity and totals; purchase tax remains cost unless eligibility and a tax account are explicitly supplied. Existing linked invoices refuse a second posting.
- Staged SQL atomically posts canonical linked-account adjustments (noncash journals use a canonical no-account anchor), immutable journal evidence and original locking. Owner-row revision checks, exact request replay, one-cent balance rejection, company account/document binding and closed-period checks apply. Ordinary writes cannot forge journal attachments.
- Exact reversals and replacement journals preserve earlier entries. Referenced document paths, ownership and evidence locking cannot be changed or deleted through the staged authority.
- Statements replace generic projections only after complete primary/member/source/account-delta checks. Opening journals appear as opening movements, not income/cashflow. Adjustments flow into all five company reports and retained accounting evidence; missing originals/unclassified balances/differences enter existing Audit findings.
- Existing Reports Centre treatment gains a journal review disclosure and unpaid-invoice proposal actions, without theme/navigation redesign. Drafts use existing encrypted owner-local draft storage; serial writes preserve edits, attempted payloads lock for identical retry.
- Staged owner-created accountant grants allow read-only company journal evidence and append-only exception notes; revoked/unrelated users are denied, accountants cannot post. This SQL is **not installed** and accountant app sign-in/review screens remain incomplete.

## Observed acceptance
- Final focused run: **22/22** tests across accounting-foundation (7), invoice-accrual (2), accounting-authority (1), corporate-statements (8), corporate-audit-pack (2), corporate-persistence (1), exception-workflow-persistence (1).
- Disposable on-disk database: opening bank100000 + machine50000 + receivables10000 = loan20000 + payables5000 + equity135000. Accrued income3000, accrued rent1200, exact reversal and corrected rent1000 produce profit2000, assets163000, liabilities26000, equity137000; Trial Balance/Balance Sheet differences0, cash opening/closing100000 and no fabricated cash activity.
- Lost committed acknowledgement + failed readback + database restart resolves the same journal with one write. Stale revisions, unbalanced requests, direct evidence forgery, edited/deleted originals, edited journal entries, unauthorised accountant posting and revoked review are rejected.
- Actual Reports Centre: fill balanced unpaid-rent journal → interrupted committed response → encrypted draft reload → identical retry → one retained journal → actual PDF → interrupted history response → reload/retry → downloaded accounting JSON shows rent1200 payable1200 and profit−1400.25 with pre-existing expense200.25. One PDF upload/history, zero page errors. Browser adapter isolates all writes, not hosted authentication/storage proof.
- Browser test retained: `scripts/browser/test_accounting_foundation.py`; screenshots `/tmp/browser/accounting/review.png`, `/tmp/browser/accounting/report.png`. The PDF iframe was blank in headless Chromium; downloaded accounting JSON and PDF generation/persistence, rather than iframe legibility, establish this test's result.
- Initial SQL CASE parser, exact-optional/index-signature typing, JSONB key-order readback and browser premature-reload failures were corrected. Final executed tests pass; preview build OK.

## Exact remaining work / blockers
1. Milestone not closed: automatic reviewed historical schedule→complete opening mapping; cash settlement matching/reclassification against accrual invoices without double recognition; confirmed recurring accrual/prepayment schedules; full original-upload/extraction/classification→journal→statement→close journey with upload interruption; connected original correction and regenerated PDFs after journal correction; statutory Schedule III/tax/chart completeness.
2. Production accounting authority needs explicit approval to install `scripts/accounting-foundation.sql` after compatible deployment/security acceptance. The shared Cloud instance is production; no migration was run. Posting is disabled when authority tables are absent. Do not confuse staged SQL acceptance with a live feature.
3. Accountant grant administration and authenticated accountant exception-review screen are still buildable; staged permission/notes logic alone does not complete that user journey.
4. V60-0066 remains blocked by immutable-upload authority/activation and hosted cross-device acceptance. V60-0082 requires an isolated hosted environment with owner, authorised/unrelated/revoked accounts and real private signing/expiry checks. No production safeguards activated.
5. No requirement IDs newly verified. V60-0013/0026 and related opening/accrual clauses remain partial; V60-0058/0716 unchanged.

## Git evidence
- Initial local checkout: `9454d03dbecea54e4eadf1507e00056963f7cc77`.
- Final financial test run local HEAD: `bc9d45ee56c376ed6634cbe1a7a7d4ff0ea7d082`.
- Branch: `edit/edt-be946b8b-ee13-43be-a70c-cd6ac11826d5`.
- GitHub parity **unverified**: exposed remotes are Lovable internal storage/bundle services, not GitHub; agent cannot inspect the provider Git-sync connection/status or independently obtain the corresponding GitHub branch/ref. Local commits are automatically managed; no git write commands used. A matching remote GitHub SHA cannot be claimed.
- Tested financial source SHA-256 fingerprints include corporate-statements `2ac8936a43ea8459122b0c250def8ed9aac714f42041d13538ca37d35bcd4d78`, staged SQL `b599ded9f6d619613a55a17d03ffcf470721a7ed0a38b31c0ea70dcb9fcb6b5d`, journal review `cd4a90b61ea893affa302c29cfb0b43d0b9676eefc7a5f5b69d8210f3e8b498c`. Later documentation/test-retention commits do not change these financial sources.

## Credits and release
Measured workspace908.55→896.55 at the recorded query: decline12.00, period usage +12.004 credits. Later turn charges excluded; workspace decline is not exclusive task attribution. Cap withdrawn, no credits purchased. No real records, migrations, activation, publishing, or UIX redesign.