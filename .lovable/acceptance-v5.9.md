# V5.9 first preview slice

## Implemented
- Saved-ledger issues remain visible beyond the old 120-day horizon, including 1 April 2026. Multiple issues are grouped into one transaction selection.
- Five evidence-based groups, search/account/workspace/organisation/date/INR-amount/confidence filters and visible/matching selection.
- Amex payment narration creates a type suggestion, not an expense category decision. Reciprocal configured account identifiers plus opposite direction/date/original currency/amount can create an own-transfer suggestion; equal amounts alone cannot.
- Exact merchant history provides tentative category suggestions only for consistent verified account/workspace/organisation/ownership/reimbursement contexts. It does not create rules or approve changes.
- Category-only bulk corrections require exact record preview and explicit confirmation; reuse persisted atomic category audit and revision-guarded undo. Snapshot changes invalidate confirmation, retry retains the operation identifier. No reconciliation flags or money fields are changed.
- Legacy dismissal cannot hide unresolved transaction issues. Non-transaction reminder dismissal is not labelled financial completion.
- Desktop table, tablet evidence panel and phone detail dialog; no new backend/schema or AI changes.

## Observed verification
- 14 pure financial rules pass, including the ₹2,50,000 Amex example, April retention, generic UPI, different merchant purposes, original-data preservation and unchanged balances/income/spending.
- Controlled component flow passes: select → category → exact preview → explicit save callback → audited batch undo callback. All writes mocked; this does not certify Cloud save or undo.
- Signed-in preview contained 166 unique transaction review records (not the document's approximate 198). Five type-confirmation candidates and 161 missing-information records; no account-complete category candidates. Select visible chose 40; clear removed all selection. No records saved or dismissed.
- Desktop 1280×1800, tablet 820×1180 and phone 402×850 had no horizontal page overflow or page errors. Screenshots inspected. Physical-device testing remains unverified.
- Regression suite passed 755 checks before the extra component flow; that component subsequently passed separately. Preview build OK.

## Not complete / blockers
- Ready-group bulk suggestion acceptance, generic bulk account/type/workspace/organisation/activity/recurring actions and pair merging remain unbuilt. Money-changing operations must not be simulated through category APIs.
- Full V5.8 configuration/recurring integration, editable scoped merchant rule learning in the ledger Inbox, additional extraction identifiers and independent reconciliation audit remain open.
- Source narration shown is the saved ledger description, explicitly labelled; missing original identifiers are not fabricated. Original statement storage/staged review remain unchanged.
- Real correction persistence, concurrent edits and undo acceptance need isolated Cloud because preview shares the live financial data. No testing writes performed.
- No deployment or paid infrastructure activation. No full V5.9 completion or production-readiness claim.