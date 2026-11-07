LEDGERLINE

Version 5.3 — Intelligent Statement Import, Bulk Review & Reconciliation

Final Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Statement Import, Financial Accuracy and Mobile UI/UX Enhancement
Priority: Critical
Historical Records Start Date: 1 April 2026
Primary Platform: iPhone-Optimised Application

⸻

1. Project Objective

Redesign Ledgerline’s existing bank and credit card statement import experience to make importing and classifying large numbers of transactions simple, accurate and reliable.

The current statement-import screen displays extensive transaction information within long cards, requires excessive manual review and does not clearly distinguish transactions that are ready for confirmation from those with uncertain classifications.

The objective is to allow users to:

1. Upload one or several statements.
2. Automatically extract transactions.
3. Identify merchants and financial transaction types.
4. Group similar transactions.
5. Apply categories and workspaces to multiple records.
6. Review only unresolved items.
7. Detect duplicates and transfers.
8. Confirm transactions in controlled batches.
9. Reconcile imported records with statement balances.
10. Resume unfinished imports later.

This is an enhancement to the existing Ledgerline application. Do not create a new project or replace the existing ledger.

⸻

2. Existing Screen Review

The screenshots supplied for this development review show the following sample import state:

Displayed Information	Observed Value
New transaction lines	50
Proposed automatic registrations	37
Transactions needing review	13
Possible duplicates	0
Already recorded	0
Amount shown for the 37 proposed registrations	₹10,24,175.10
Older lines identified	27

These values describe the displayed import session and must not be hardcoded.

The redesigned interface must calculate its counts and totals from the current import batch.

2.1 Problems Identified

Problem A — Uncertain Classifications Included in Automatic Registration

Several transactions are displayed with:

Miscellaneous — check

These transactions appear selected for registration.

The system must not treat an unresolved classification as a verified classification.

Problem B — Misleading Financial Summary

The screen states that ₹10,24,175.10 of spending will be added.

However, transaction descriptions alone may not establish whether every record represents an actual expense.

Separate actual expenses from:

* Income.
* Transfers.
* Credit card settlements.
* Refunds.
* Reimbursements.
* Loan transactions.
* Investments.
* Other adjustments.

Do not call the total imported amount “spending” until the included transactions have been classified appropriately.

Problem C — Very Long Transaction Lists

The current screen displays numerous transactions within a large card.

Users must scroll extensively to inspect records.

Replace this with a dedicated transaction-review view supporting grouping, filtering and multiple selection.

Problem D — Truncated Financial Details

The current interface truncates merchant descriptions and displays long information strings that are difficult to read.

Use compact transaction rows with a separate detail view.

Important amounts must remain completely visible.

Problem E — Bottom Navigation Obstructs Content

The screenshots show the fixed navigation bar covering part of the review content.

Correct the bottom safe-area spacing and scrolling behaviour.

Problem F — Unclear Processing Status

When users select Register, a spinner appears without sufficient explanation.

Display the current operation and a clear completion or failure state.

Problem G — Missing Review Structure

Transactions requiring review are displayed sequentially.

Users need grouped review actions rather than opening every transaction individually.

⸻

PART A — NEW IMPORT WORKFLOW

3. Four-Stage Statement Import

Redesign the existing process into four clearly identified stages.

Stage 1 — Upload

Upload and identify the statement.

Stage 2 — Analyse

Extract transactions, detect duplicates and prepare classifications.

Stage 3 — Review

Review grouped transactions, correct classifications and approve eligible records.

Stage 4 — Confirm & Reconcile

Post approved records and reconcile the resulting ledger against the statement.

Display the current stage using a compact progress indicator.

Do not show all four stages as one long page.

⸻

4. Upload Screen

4.1 Supported Upload Methods

Support applicable formats:

* PDF.
* CSV.
* Excel.
* Supported structured bank statement exports.

Allow users to select multiple files.

4.2 Upload Screen Layout

Display:

Header

Import Statement

File Selection

* Choose Files.
* Select Multiple.
* Recent Imports.

Account Selection

* Financial institution.
* Account or credit card.

Statement Information

* Statement period.
* Opening balance where available.
* Closing balance where available.

Primary Action

Analyse Statement

Only display fields that cannot be reliably obtained from the uploaded document.

4.3 Multiple Statements

Support selecting several monthly statements.

Users should be able to:

* Add files.
* Remove files before processing.
* Review detected account identities.
* Confirm statement periods.
* Process the selected files.

Preserve each file’s independent source identity.

⸻

PART B — PERSISTENT ANALYSIS

5. Statement Analysis

After upload, Ledgerline should:

1. Read transaction details.
2. Identify transaction dates.
3. Identify descriptions.
4. Extract debit and credit amounts.
5. Detect transaction references.
6. Identify merchants.
7. Normalise similar descriptions.
8. Detect recurring patterns.
9. Match existing transactions.
10. Identify duplicates.
11. Suggest categories.
12. Suggest workspaces.
13. Identify potential transfers.
14. Identify credit card settlements.
15. Identify other special financial transactions.
16. Prepare review groups.

Retain original statement descriptions and source references.

⸻

6. Processing Status

Display understandable progress messages.

Examples:

Uploading statement…

Reading transactions…

Identifying merchants…

Checking existing records…

Preparing classifications…

Ready for review

Do not display a stationary page without feedback.

6.1 Persistent Processing

Use the existing or planned persistent background-job infrastructure.

After the server accepts an import job:

* Save the job.
* Continue processing independently of the page.
* Preserve its progress.
* Notify the user when ready.
* Allow reopening through Financial Inbox.

Do not claim background processing works until it has been tested after the page is closed.

6.2 Duplicate Submission Protection

Disable repeated submission of the same active operation.

Use stable import batch and job identifiers.

Retries must not duplicate transactions.

⸻

PART C — IMPORT SUMMARY

7. Compact Review Dashboard

Replace the current large summary cards with a compact review dashboard.

Display:

Statement Review

Account name
Statement period
Total extracted transactions

Summary Indicators

* Ready to approve.
* Suggested classification.
* Needs review.
* Possible duplicates.
* Already recorded.
* Processing errors.

Counts must be mutually understandable.

If a transaction appears in more than one category, explain the relationship rather than presenting overlapping counts as a single total.

7.1 Financial Summary

Display separate amounts for:

* Total debits.
* Total credits.
* Proposed expense transactions.
* Proposed income transactions.
* Potential transfers.
* Potential card settlements.
* Unclassified amount.

Do not combine these into one misleading spending figure.

7.2 Historical Records

Clearly identify transactions dated earlier than the latest recorded import period.

Do not treat older transactions as duplicates merely because they predate the most recent import.

Show historical coverage gaps.

⸻

PART D — INTELLIGENT TRANSACTION GROUPING

8. Smart Grouping

Group similar transactions using:

* Merchant.
* Description pattern.
* Transaction type.
* Account.
* Suggested category.
* Suggested workspace.
* Recurring behaviour.
* Confidence level.

The user should not need to review every line independently.

8.1 Example

Ledgerline identifies 24 similar restaurant transactions.

Suggested category:

Food & Dining

Suggested workspace:

Personal

Display:

Restaurant Payments — 24 transactions

Total amount: calculated from the selected records.

Actions:

* Review Group.
* Apply Category.
* Assign Workspace.
* Add Tags.
* Approve Eligible.

The user must be able to exclude individual exceptions.

⸻

9. Merchant Recognition

Create a reusable merchant-normalisation system.

Examples:

SWIGGY ORDER
SWIGGY UPI
SWIGGY INSTAMART

The application may associate these with a merchant family while preserving their original statement descriptions.

Do not automatically assume every transaction from the same merchant belongs to the same category.

Use previously confirmed classifications and user-approved rules.

⸻

10. Classification Confidence

Use three levels.

High Confidence

Reliable category or transaction-type classification supported by existing rules or strong matching evidence.

Medium Confidence

Plausible recommendation requiring review.

Low Confidence

Uncertain transaction requiring user input.

Do not treat “Miscellaneous — check” as a high-confidence category.

If a transaction’s accounting treatment is uncertain, it must remain outside automatic final approval.

A user may explicitly accept Miscellaneous as the final category where appropriate.

⸻

PART E — BULK SELECTION AND CLASSIFICATION

11. Universal Multi-Selection

Use the multi-selection framework approved for Ledgerline Version 5.0.

Support:

* Select individual transaction.
* Select multiple transactions.
* Select all visible.
* Select all matching filters.
* Select merchant group.
* Select category group.
* Select date range.
* Select workspace group.
* Clear selection.

Clearly distinguish selection of the current page from selection of all matching results.

⸻

12. Bulk Classification Toolbar

When transactions are selected, display:

X transactions selected

Provide applicable actions:

* Set Category.
* Set Subcategory.
* Assign Workspace.
* Assign Organisation.
* Add Tags.
* Link Trip.
* Assign Person.
* Mark Reimbursable.
* Mark for Review.
* Approve Eligible.

Do not show invalid bulk actions.

12.1 Bulk Edit Preview

Before applying changes, display:

* Number of selected records.
* Proposed classification.
* Existing classifications being replaced.
* Exceptions.
* Validation warnings.
* Resulting approval eligibility.

12.2 Bulk Approval

Allow approval of multiple eligible transactions.

However, approval must not bypass validation of:

* Account identity.
* Date.
* Amount.
* Transaction direction.
* Transaction type.
* Duplicate status.
* Required ledger relationships.

⸻

13. Apply Classification to Similar Transactions

When a user corrects a transaction, offer:

1. Apply to this transaction.
2. Apply to selected similar transactions.
3. Apply to all eligible matches in this import.
4. Remember for future imports.

Use a clear confirmation before creating permanent rules.

Do not automatically rewrite confirmed records when a new rule is created.

⸻

PART F — EXCEPTION REVIEW

14. Dedicated Needs Review Screen

Replace the current large list of individual review cards with a dedicated exception-review screen.

Group exceptions under:

* Transfers.
* Cash Withdrawals.
* Unclear Credits.
* Potential Refunds.
* Possible Reimbursements.
* Unknown Merchants.
* Missing Information.
* Duplicate Candidates.

14.1 Compact Transaction Rows

Each transaction row should show:

* Merchant or description.
* Date.
* Amount.
* Debit or credit indicator.
* Suggested financial type.
* Review status.

Do not display long technical descriptions in the primary row.

Allow the user to tap for full details.

14.2 Transaction Detail Sheet

Display:

* Complete original bank narration.
* Transaction reference.
* Account.
* Date.
* Amount.
* Transaction direction.
* Suggested merchant.
* Suggested financial treatment.
* Category.
* Workspace.
* Organisation.
* Tags.
* Trip.
* Reimbursement status.
* Source statement reference.

Provide Confirm and Save for Later actions.

⸻

15. Transfer Recognition

Detect potential transfers between owned accounts.

Examples include transfers between configured personal accounts or other owned financial accounts.

Match both sides of a transfer where possible.

Do not count internal transfers as income or expenditure.

If account ownership is uncertain, request confirmation.

Do not infer ownership solely from a person’s name appearing in the bank description.

⸻

16. Credit Card Settlements

Identify bank payments made toward credit card liabilities.

Link them to the relevant credit card account where possible.

Do not classify the payment as another expense when the underlying card purchases are already recorded.

⸻

17. Unclear Credits

Credits from organisations or institutions may represent:

* Salary.
* Reimbursement.
* Transfer.
* Loan proceeds.
* Business receipts.
* Other income.
* Other adjustments.

Do not automatically classify every incoming credit as ordinary income.

Allow users to confirm the correct financial treatment.

⸻

PART G — MOBILE PAGE REDESIGN

18. Overall Page Structure

The current screenshot shows long content blocks and transaction descriptions extending beyond the comfortable display area.

Rebuild the statement review experience using dedicated screens rather than one continuously expanded page.

18.1 Mobile Navigation Structure

Recommended:

Import Overview → Review Groups → Transaction Details → Confirm Import

Each screen should have one clear purpose.

18.2 Header

Use a compact page-specific header:

* Back.
* Statement Review.
* Help or More.

Avoid repeating an oversized application header within every step of the import workflow.

Preserve access to the application’s main navigation where appropriate.

18.3 Summary Cards

Use compact, readable cards.

Avoid excessive borders, oversized headings and unnecessary empty space.

18.4 Transaction Lists

Use full-width mobile rows.

Do not force transaction details into narrow multi-column layouts.

Recommended structure:

Merchant or Description

Date · Suggested Type

Amount aligned consistently

Review status

18.5 Text Handling

Long bank narrations should:

* Display a readable shortened description.
* Preserve the full original description.
* Open fully when selected.
* Never push amounts outside the viewport.

18.6 Horizontal Overflow

Fix all horizontal overflow.

No transaction amount, heading, button or category badge should extend beyond the supported screen width.

18.7 Bottom Navigation

Correct bottom safe-area spacing.

The fixed navigation must not cover:

* Review buttons.
* Transaction rows.
* Form inputs.
* Confirmation actions.
* Error messages.

When a multi-selection toolbar appears, coordinate its placement with the main navigation.

18.8 Selection Controls

Use checkboxes with comfortable touch targets.

Selected records should remain clearly distinguishable.

Avoid placing tiny checkboxes beside truncated descriptions.

⸻

19. Recommended Review Screen Layout

Top

Statement Review

Account name and period.

Summary

* Extracted.
* Ready.
* Needs Review.
* Duplicates.

Filter Bar

* All.
* Suggested.
* Uncategorised.
* Transfers.
* Credits.
* Duplicates.

Transaction Groups

Compact grouped records.

Selection Toolbar

Visible when records are selected.

Primary Action

Continue to Confirmation.

Do not place the final posting action above unresolved review groups.

⸻

PART H — FINANCIAL CONFIRMATION

20. Confirmation Screen

Before posting approved records, display a final confirmation summary.

Include:

* Number of transactions to post.
* Number already matched.
* Number excluded.
* Number pending review.
* Total proposed expenses.
* Total proposed income.
* Transfers.
* Settlements.
* Other transaction types.
* Account affected.
* Statement period.

Do not describe all imported debit transactions as expenses.

20.1 Final Action

Use:

Confirm & Import X Transactions

Do not use ambiguous wording such as “Register 37 automatically” when the system is about to post confirmed financial records.

20.2 Confirmation Safeguards

Require explicit user approval.

Prevent duplicate submission.

Post records idempotently.

Provide a clear result summary.

⸻

21. Import Result

After confirmation, show:

* Transactions successfully imported.
* Transactions matched.
* Transactions skipped.
* Transactions awaiting review.
* Failed records.
* Reconciliation status.

Allow users to reopen unresolved items later.

Do not lose pending records after a partial import.

⸻

PART I — ACCOUNT RECONCILIATION

22. Statement Reconciliation

After posting, compare:

* Opening balance.
* Confirmed debits.
* Confirmed credits.
* Closing balance.
* Ledger balance.
* Unreconciled difference.

Use the applicable bank statement conventions.

Clearly identify missing transactions and unresolved discrepancies.

Do not create balancing adjustments automatically.

⸻

PART J — HISTORICAL IMPORTS

23. Historical Records From April 2026

Ledgerline must support historical record maintenance from 1 April 2026.

Recommended process:

1. Configure accounts.
2. Establish opening balances.
3. Import April 2026 statements.
4. Classify and reconcile April.
5. Establish reusable rules.
6. Import subsequent months.
7. Apply validated rules.
8. Review exceptions.
9. Reconcile monthly balances.

Allow multiple statements within a month.

Do not force strictly sequential imports if the user needs to upload older records later.

⸻

24. Historical Coverage

Display:

* Imported periods.
* Missing periods.
* Overlapping statements.
* Incomplete imports.
* Reconciliation discrepancies.

Older transactions should be matched against existing records before posting.

⸻

PART K — RULE MANAGEMENT

25. Central Classification Rules

Provide:

Settings → Financial Automation → Import Rules

Allow users to:

* Create rules.
* Edit rules.
* Disable rules.
* Review rule conflicts.
* Delete obsolete rules.
* View affected transactions.

Rules should support:

* Merchant.
* Description pattern.
* Account.
* Debit or credit direction.
* Amount condition.
* Category.
* Workspace.
* Organisation.
* Tags.
* Transaction type.

Financial transaction-type rules require appropriate safeguards.

⸻

PART L — DATA INTEGRITY AND SECURITY

26. Preserve Source Records

Retain:

* Original statement.
* Original bank narration.
* Source line.
* Statement period.
* Import batch identifier.
* Extracted transaction information.
* Classification suggestions.
* User corrections.
* Approval history.

Do not overwrite source information when classifications change.

⸻

27. Ledger Integrity

Preserve the existing transaction engine.

Ensure:

1. Transfers do not inflate income or expenses.
2. Credit card settlements do not duplicate purchases.
3. Refunds and reversals are correctly treated.
4. Reimbursements retain proper financial classification.
5. Loan principal and interest are distinguished.
6. Investment transactions are not automatically treated as expenses.
7. Workspace allocations reconcile correctly.
8. Drafts do not affect confirmed balances.

⸻

28. Access Controls

Ensure imported financial information is visible only to authorised users.

Apply permission checks to:

* Uploaded statements.
* Extracted transactions.
* Bulk actions.
* Classification rules.
* Background jobs.
* Reconciliation reports.

⸻

PART M — DEVELOPMENT PRIORITIES

29. Priority 1 — Financial Safety

1. Correct import confirmation logic.
2. Separate transaction types.
3. Prevent uncertain automatic approvals.
4. Improve duplicate detection.
5. Protect confirmed ledger records.
6. Preserve source references.

30. Priority 2 — Bulk Classification

7. Merchant recognition.
8. Smart transaction grouping.
9. Multiple selection.
10. Bulk categorisation.
11. Workspace bulk assignment.
12. Reusable classification rules.
13. Exception review.

31. Priority 3 — Interface Redesign

14. Four-stage import workflow.
15. Compact overview.
16. Dedicated review screen.
17. Transaction detail sheet.
18. Responsive transaction rows.
19. Overflow corrections.
20. Bottom navigation corrections.

32. Priority 4 — Reliability

21. Persistent import jobs.
22. Processing status.
23. Safe retries.
24. Draft review recovery.
25. Import result history.
26. Financial Inbox integration.

33. Priority 5 — Historical Setup

27. April 2026 historical start.
28. Opening balances.
29. Monthly reconciliation.
30. Historical coverage monitoring.
31. Multi-month imports.
32. Comprehensive testing.

⸻

PART N — ACCEPTANCE REQUIREMENTS

34. Mandatory Tests

Before completion, demonstrate:

1. The current sample import can be processed without data loss.
2. Transaction counts reconcile between stages.
3. “Miscellaneous — check” is not silently treated as verified.
4. Bulk categorisation works.
5. Similar merchants can be classified together.
6. Individual exceptions can be excluded.
7. Users can select all matching filtered transactions.
8. Debit and credit amounts are displayed separately.
9. Transfers are not counted as expenses.
10. Credit card settlements are not counted twice.
11. Unclear credits require appropriate classification.
12. Repeated imports do not create duplicates.
13. Historical transactions are handled correctly.
14. Source narrations remain accessible.
15. The final confirmation shows accurate accounting totals.
16. Failed imports can be retried.
17. Background processing survives page closure.
18. The mobile interface has no horizontal overflow.
19. Full transaction amounts remain visible.
20. The bottom navigation does not obscure content.
21. User permissions are enforced.
22. Existing Ledgerline functionality remains operational.

⸻

35. Final Development Instruction

Redesign the existing Statement Import workflow into a guided, mobile-first process.

Replace long transaction lists with grouped review screens.

Use intelligent categorisation and multiple selection to minimise manual work.

Separate financial transaction types before posting records.

Preserve source statements and original transaction details.

Do not automatically post transactions with unresolved financial classifications.

Implement clear processing status, safe retries and persistent background jobs.

Ensure accurate reconciliation and support historical records from 1 April 2026.

Use the existing transaction ledger, account services and workspace classification engine.

Do not duplicate modules.

Do not modify confirmed financial records without authorisation.

Do not deploy changes to the live application or activate paid infrastructure without approval.

Complete testing using the actual sample import workflow before declaring the feature finished.

⸻

FINAL PRODUCT PRINCIPLE

UPLOAD ONCE.

GROUP INTELLIGENTLY.

CLASSIFY IN BULK.

REVIEW EXCEPTIONS.

CONFIRM SAFELY.

RECONCILE ACCURATELY.

LEDGERLINE VERSION 5.3

LESS MANUAL WORK. BETTER FINANCIAL ACCURACY.

End of Development Requirements.