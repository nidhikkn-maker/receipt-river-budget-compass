LEDGERLINE

Version 5.4 — Complete Application Testing, Financial Audit & Production Readiness

Final Quality Assurance and Acceptance Programme for Lovable

Project: Existing Ledgerline Application
Development Stage: Features developed; full testing pending
Audit Type: Functional, Financial, Security, Reliability, Performance and UX
Priority: Critical
Historical Accounting Start Date: 1 April 2026
Environment: Isolated testing environment using controlled sample data

⸻

1. AUDIT OBJECTIVE

Conduct a comprehensive audit of the existing Ledgerline application before it is relied upon for actual financial management.

The objective is to establish that:

1. All developed features function correctly.
2. Financial calculations are accurate.
3. Account balances reconcile.
4. Transactions are not duplicated.
5. Workspaces remain properly separated.
6. Imported bank statements are processed safely.
7. Reimbursement calculations are reliable.
8. Travel management integrates correctly with the financial ledger.
9. PDF reports match the underlying financial records.
10. AI-generated numerical explanations use verified calculations.
11. Financial information remains protected.
12. Unfinished work can be recovered.
13. Background processing functions reliably.
14. The iPhone interface is usable.
15. Backups and data recovery work.
16. The application is suitable for controlled real-world use.

Do not declare Ledgerline production-ready merely because all modules are visible or individual buttons appear functional.

⸻

2. AUDIT GOVERNANCE

Before testing:

1. Inspect the current application architecture.
2. Identify all implemented modules.
3. Identify incomplete features.
4. Review relevant database structures.
5. Review authentication and authorisation.
6. Review financial calculation services.
7. Review integrations and background jobs.
8. Document existing known issues.
9. Establish a controlled test environment.
10. Prepare a complete feature and test register.

2.1 Testing Environment

Use an isolated environment with test data.

Do not conduct destructive tests against actual financial records.

Ensure the test environment cannot accidentally:

* Send real financial instructions.
* Modify production balances.
* Delete production documents.
* Trigger real payments.
* Expose private statements.
* Affect live user access.

2.2 Test Data

Use realistic sample records covering:

* Personal.
* Family.
* Business.
* Official.
* Travel.
* Credit cards.
* Loans.
* Reimbursements.
* Multiple currencies.

Test data must be clearly distinguishable from actual user records.

⸻

3. TEST RESULT CLASSIFICATION

Every test must receive one of the following outcomes:

* Pass: Requirement demonstrated successfully.
* Fail: Expected behaviour not achieved.
* Partial: Some functionality works, but requirements are incomplete.
* Blocked: Testing cannot proceed because of a documented dependency.
* Not Implemented: Feature has not been built.
* Not Applicable: Requirement does not apply to the current deployment.

Do not mark a test as passed solely because implementation code exists.

Each test should record:

* Test ID.
* Module.
* Requirement.
* Test steps.
* Expected result.
* Actual result.
* Status.
* Evidence.
* Severity.
* Responsible developer or owner.
* Date tested.
* Retest result.

⸻

PART A — CORE FUNCTIONAL TESTING

4. Authentication and User Management

Verify:

1. Google authentication.
2. Correct login and logout behaviour.
3. Session expiration.
4. Reauthentication where required.
5. Unauthorised access prevention.
6. Profile management.
7. Password-related security where password authentication remains enabled.
8. Device and browser compatibility.
9. Session handling after application closure.
10. Proper access to user-specific records.

Required Negative Tests

* Attempt access without authentication.
* Attempt access using an expired session.
* Attempt direct access to another user’s record.
* Attempt access to restricted routes or backend operations.
* Verify that logout prevents further access to protected information.

⸻

5. Universal Expense Entry

Test all supported entry methods:

* Manual entry.
* Camera.
* Gallery.
* File upload.
* Voice.
* Saved templates.
* Repeated transaction.

5.1 Required Functional Tests

Verify:

1. Amount entry.
2. Category selection.
3. Date selection.
4. Payment method.
5. Workspace.
6. Organisation.
7. Tags.
8. Merchant.
9. Description.
10. Attachments.
11. Split allocation.
12. Reimbursement classification.
13. Transaction confirmation.

5.2 Usability

Verify:

* Keyboard does not open automatically.
* Quick Entry is compact.
* Additional fields remain accessible.
* Save button is visible.
* User receives saving feedback.
* Duplicate taps do not create duplicate transactions.
* Existing drafts can be resumed.

5.3 Financial Result

Adding an expense must:

* Create one confirmed ledger transaction.
* Affect the correct account or liability.
* Update the correct workspace reporting.
* Preserve linked documents.
* Appear in transaction history.
* Reconcile with reports.

⸻

PART B — FINANCIAL LEDGER TESTING

6. Financial Transaction Integrity

This is the highest-priority testing stage.

The following transaction types must be tested independently:

1. Expense.
2. Income.
3. Internal transfer.
4. Credit card purchase.
5. Credit card settlement.
6. Refund.
7. Reimbursement.
8. Loan principal repayment.
9. Loan interest payment.
10. Investment purchase.
11. Investment redemption.
12. Cash withdrawal.
13. Travel advance.
14. Advance return.
15. Balance adjustment.

6.1 Ledger Rules

Confirm:

* Transfers are not expenditure.
* Transfers are not income.
* Credit card settlements are not duplicate expenses.
* Loan principal is distinguished from interest.
* Investment purchases are not ordinary expenses.
* Refunds correctly reverse the relevant financial effect.
* Reimbursements use the appropriate accounting treatment.
* Travel advances are not automatically ordinary income or expenditure.
* Adjustments preserve a complete audit trail.

6.2 Transaction Correction

Test:

* Editing a confirmed transaction.
* Correcting its category.
* Changing its workspace allocation.
* Correcting its amount through the authorised workflow.
* Handling an invalid edit.
* Viewing modification history.

Financial corrections must not silently corrupt balances.

⸻

7. Deterministic Financial Test Scenarios

Use controlled examples with exact expected outcomes.

Test F-001 — Normal Expense

Opening bank balance: ₹1,00,000.

Record expense: ₹2,500.

Expected bank balance: ₹97,500.

Expected expenditure: ₹2,500.

Test F-002 — Internal Transfer

Account A: ₹1,00,000.

Account B: ₹20,000.

Transfer ₹15,000 from A to B.

Expected:

Account A: ₹85,000.

Account B: ₹35,000.

Combined balance: ₹1,20,000.

Income increase: ₹0.

Expense increase: ₹0.

Test F-003 — Credit Card Purchase

Opening bank balance: ₹1,00,000.

Opening credit card liability: ₹0.

Record card purchase: ₹10,000.

Expected:

Bank balance: ₹1,00,000.

Card liability: ₹10,000.

Expenditure: ₹10,000.

Test F-004 — Credit Card Settlement

Pay ₹10,000 from bank to settle the card.

Expected:

Bank balance: ₹90,000.

Card liability: ₹0.

Cumulative expenditure remains ₹10,000.

No additional purchase expense should be recognised.

Test F-005 — Refund

Record a ₹2,000 refund linked to an earlier ₹10,000 purchase.

Expected:

The refund reduces the appropriate expense or cost total according to Ledgerline’s approved reporting policy.

The receiving account or card balance updates correctly.

The original purchase and refund remain traceable.

Test F-006 — Split Workspace Expense

Record a ₹10,000 expense.

Allocate:

Personal: ₹4,000.

Business: ₹6,000.

Expected:

One underlying payment.

Total expenditure: ₹10,000.

Personal allocation: ₹4,000.

Business allocation: ₹6,000.

No duplicate expenditure.

Test F-007 — Reimbursable Expense

Record a ₹10,000 expense paid personally on behalf of an organisation.

Mark the eligible amount as reimbursable.

Expected:

The payment appears against the correct payment account.

The business or official expenditure allocation is correct.

The reimbursement receivable is recorded separately.

The same payment is not counted twice.

Test F-008 — Reimbursement Receipt

Record reimbursement receipt of ₹6,000 against a ₹10,000 eligible receivable.

Expected:

Reimbursement received: ₹6,000.

Outstanding reimbursement: ₹4,000.

The receiving account updates.

The receipt is not automatically counted as unrelated ordinary income.

⸻

PART C — BANK STATEMENT IMPORT

8. Statement Import Testing

Use the statement-import workflow shown in the previously shared screenshots as a regression test.

The example displayed:

* 50 extracted transaction lines.
* 37 proposed registrations.
* 13 requiring review.
* No possible duplicates displayed.
* ₹10,24,175.10 shown against proposed registrations.

These values should be treated only as the reference session’s displayed results.

8.1 Extraction Tests

Verify:

* Correct dates.
* Correct amounts.
* Correct debit and credit directions.
* Complete original narrations.
* Account identity.
* Statement period.
* Transaction references.
* Balance extraction where available.

8.2 Classification Tests

Verify:

* Merchant recognition.
* Category suggestions.
* Workspace suggestions.
* Organisation suggestions.
* Confidence indicators.
* Unknown merchant handling.
* Uncertain classification handling.

8.3 Bulk Selection Tests

Verify:

* Select individual.
* Select multiple.
* Select all visible.
* Select all matching filters.
* Exclude exceptions.
* Bulk categorise.
* Bulk assign workspace.
* Bulk tag.
* Bulk confirm eligible transactions.

8.4 Approval Safety

Transactions labelled “Miscellaneous — check” must not be silently treated as verified.

Users must see the proposed financial impact before confirmation.

8.5 Reimport Tests

Import the same statement twice.

Expected:

* No duplicate confirmed transactions.
* Existing matches identified.
* Original source references preserved.
* Clear duplicate or already-imported status.

8.6 Historical Import Tests

Test statements beginning in April 2026.

Verify:

* Historical opening balances.
* Overlapping statement periods.
* Missing months.
* Older transaction detection.
* Monthly reconciliation.
* Import coverage.

⸻

PART D — ACCOUNTS AND RECONCILIATION

9. Accounts

Test:

* Savings accounts.
* Current accounts.
* Cash.
* Credit cards.
* Digital wallets.
* Investment accounts.
* Loans.

Verify:

* Opening balance.
* Current balance.
* Transaction history.
* Transfers.
* Adjustments.
* Archiving.
* Account-level reporting.

9.1 Reconciliation

For each account:

1. Establish a known opening balance.
2. Import controlled transactions.
3. Calculate the expected closing balance independently.
4. Compare it with Ledgerline.
5. Identify discrepancies.
6. Verify correction handling.

No account should be marked reconciled merely because an adjustment forces the closing balance to match.

⸻

PART E — WORKSPACE MANAGEMENT

10. Multi-Workspace Testing

Test:

* Personal.
* Family.
* Business.
* Official.
* Consolidated.

Verify:

1. Correct transaction assignments.
2. Multiple workspace allocations.
3. Allocation totals.
4. Workspace-specific budgets.
5. Workspace-specific reports.
6. Workspace filtering.
7. Organisation linking.
8. User permissions.

Consolidation Test

A transaction allocated across multiple workspaces must be counted once in the consolidated financial total.

⸻

PART F — TRAVEL MANAGER

11. Travel Functionality

Test the redesigned Travel Manager.

11.1 Navigation

Verify:

* Compact Travel Manager overview.
* Individual trip views.
* Trip details.
* Bookings.
* Itinerary.
* Expenses.
* Budget & Settlements.
* Reports.

11.2 Trip Creation

Test:

* New trip.
* Edit trip.
* Multiple travellers.
* Multiple organisations.
* Multiple currencies.
* Draft recovery.

11.3 Bookings

Verify:

* Flight booking.
* Hotel booking.
* Transport booking.
* Other reservations.
* Booking attachments.
* Cancellation.
* Refunds.
* Payment status.

Unpaid bookings must remain commitments rather than actual expenses.

11.4 Itinerary

Verify:

* Add item.
* Edit item.
* Change date.
* Assign participants.
* Link booking.
* Link document.
* View chronological order.

11.5 Expenses

Trip expenses must use Universal Expense Entry.

Verify:

* Trip preselection.
* Workspace selection.
* Payment account.
* Currency.
* Merchant.
* Reimbursement status.

11.6 Travel Settlements

Verify:

* Advances.
* Advance returns.
* Reimbursements.
* Outstanding balances.
* Trip financial closure.

11.7 Trip Closure

Do not permit a trip to be represented as financially settled while unresolved financial commitments remain.

⸻

PART G — REPORTING

12. Reports Centre Testing

Test:

* Monthly Summary.
* Income Report.
* Expense Report.
* Account Report.
* Workspace Report.
* Credit Card Report.
* Budget Report.
* Loan Report.
* Travel Report.
* Reimbursement Report.
* Detailed Expenditure Statement.

12.1 PDF Functionality

Verify:

1. Generate.
2. Preview.
3. Download.
4. Share.
5. Retrieve from history.
6. Regenerate.
7. Multi-page formatting.
8. Correct page breaks.
9. Readable tables.
10. Accurate totals.
11. iPhone compatibility.

12.2 Detailed Expenditure Statement

Verify:

* Activity or trip.
* Expense line items.
* Merchant.
* Payment date.
* Payment method.
* Masked card reference.
* Original payer.
* Reimbursable amount.
* Received reimbursement.
* Outstanding amount.
* Original bills as annexures.

12.3 Financial Reconciliation

Every report total must agree with the shared financial calculation engine for the same scope, period and filters.

⸻

PART H — AI AND FORECASTING

13. AI Assistant

Test questions such as:

* How much did I spend this month?
* How much did I spend using AMEX?
* What are my upcoming payments?
* Which categories increased?
* How much can I safely spend?
* What is my outstanding reimbursement?
* How much did I spend on a particular trip?

The numerical answers must match deterministic application calculations.

The AI must distinguish:

* Actual.
* Estimated.
* Hypothetical.
* Incomplete information.

Do not allow unsupported numerical conclusions.

⸻

14. Forecasting and Safe-to-Spend

Test:

* Upcoming salary.
* Delayed income.
* Credit card due dates.
* EMI commitments.
* Essential expenditure.
* Protected reserves.
* Minimum account balances.
* Hypothetical purchases.

Timing Test

A confirmed incoming salary scheduled after a credit card payment date must not be treated as available to cover that earlier payment.

Test the lowest projected balance within the selected forecast period.

Verify that conservative calculations exclude unconfirmed income by default.

⸻

PART I — RELIABILITY

15. Draft Recovery

Test:

1. Begin an expense.
2. Capture a receipt.
3. Save partial information.
4. Close the application.
5. Reopen later.
6. Resume the draft.

Expected:

All successfully saved information remains available.

No confirmed expense is created until approval.

⸻

16. Persistent Background Processing

Test:

* Receipt OCR.
* Statement import.
* Large report generation.
* Document extraction.

For every applicable job:

1. Submit.
2. Confirm job acceptance.
3. Navigate away.
4. Close the application.
5. Reopen later.
6. Retrieve job status.
7. Open completed result.

The job must continue independently of the open page after the backend has accepted it.

If any operation still requires the page to remain open, mark that requirement as incomplete.

⸻

17. Error Handling

Test:

* Failed upload.
* Invalid statement.
* Unsupported document.
* Interrupted internet connection.
* Server timeout.
* Duplicate submission.
* Expired session.
* Missing required fields.
* Insufficient permissions.
* Failed PDF generation.

Users should receive understandable error messages.

Preserve recoverable work.

⸻

PART J — SECURITY AND PRIVACY

18. Security Audit

Review:

1. Authentication.
2. Session management.
3. User-level authorisation.
4. Workspace permissions.
5. Database access policies.
6. Secure document storage.
7. Protected report downloads.
8. Background-job permissions.
9. API access.
10. Secrets management.
11. Logging.
12. Data export.
13. Data deletion.
14. Backup and recovery.
15. AI data processing permissions.

18.1 Sensitive Data

Verify that:

* Bank passwords are not stored.
* Card CVVs are not stored.
* Authentication secrets are protected.
* Full card numbers are not unnecessarily exposed.
* Financial statements are not publicly accessible.
* Private user data is not leaked through logs.

18.2 Access Testing

Attempt unauthorised access to records using manipulated identifiers.

The server must deny access even if a user bypasses the interface.

18.3 Recovery Testing

Test an actual restore into an isolated environment.

A backup existing is not sufficient evidence that recovery works.

⸻

PART K — MOBILE USER EXPERIENCE

19. iPhone Usability Testing

Test the application on representative supported iPhone screen sizes.

Verify:

* Header.
* Bottom navigation.
* Central +.
* Workspace selector.
* Forms.
* Tables.
* Transaction lists.
* Reports.
* Search.
* Upload controls.
* Keyboard behaviour.
* Modal windows.
* Scroll position.
* Safe areas.

19.1 Specific Layout Issues

Confirm that the previously identified problems are fixed:

* Excessively long Travel Manager page.
* Overcrowded Expense Entry.
* Long statement-review lists.
* Horizontal overflow.
* Truncated financial information.
* Bottom navigation covering buttons.
* Misaligned date controls.
* Oversized cards.
* Excessively repeated explanations.

⸻

20. Accessibility

Test:

* Readable typography.
* Text scaling.
* Contrast.
* Touch-target size.
* Screen-reader labels.
* Keyboard accessibility where applicable.
* Clear status indicators.
* Validation messaging.

Financial information must remain understandable without relying only on colour.

⸻

PART L — PERFORMANCE

21. Performance Testing

Measure:

* Initial app load.
* Homepage navigation.
* Expense entry opening.
* Transaction saving.
* Search response.
* Statement extraction.
* Bulk classification.
* Report generation.
* Large transaction list performance.

Test with realistic transaction volumes.

Suggested test datasets:

* 100 transactions.
* 1,000 transactions.
* 10,000 transactions.

Record actual performance rather than declaring the app fast without measurement.

21.1 Concurrent Operations

Test:

* Multiple uploads.
* Multiple saved drafts.
* Repeated button taps.
* Simultaneous report generation.
* Returning to background jobs.

The application must remain consistent and prevent duplicate financial writes.

⸻

PART M — TEST EXECUTION ORDER

22. Stage 1 — Foundation

Audit:

* Architecture.
* Authentication.
* Database.
* Permissions.
* Core navigation.

23. Stage 2 — Financial Ledger

Test:

* Expenses.
* Income.
* Transfers.
* Credit cards.
* Loans.
* Refunds.
* Reimbursements.
* Investments.
* Workspace splits.

24. Stage 3 — Imports

Test:

* Statement extraction.
* Bulk classification.
* Duplicate detection.
* Historical imports.
* Reconciliation.

25. Stage 4 — Functional Modules

Test:

* Travel.
* Budgets.
* Loans.
* Subscriptions.
* Wealth.
* Financial calendar.
* Notifications.

26. Stage 5 — AI and Reports

Test:

* AI numerical accuracy.
* Forecasts.
* Safe-to-spend.
* PDF reporting.
* Detailed Expenditure Statements.

27. Stage 6 — Reliability

Test:

* Draft recovery.
* Background processing.
* Offline behaviour where implemented.
* Error recovery.

28. Stage 7 — Security

Test:

* Authorisation.
* Data isolation.
* Documents.
* Backups.
* Restore.
* Audit logs.

29. Stage 8 — Usability

Test:

* iPhone layouts.
* Navigation.
* Forms.
* Search.
* Multi-selection.
* Themes.
* Accessibility.

30. Stage 9 — Performance

Test realistic data volumes and concurrent operations.

31. Stage 10 — Final Regression

After corrections, rerun all critical financial, security and integration tests.

Do not rely exclusively on the original test results.

⸻

PART N — DEFECT MANAGEMENT

32. Severity Classification

Critical

Examples:

* Incorrect financial balances.
* Duplicate financial posting.
* Unauthorised data exposure.
* Loss of confirmed transactions.
* Broken recovery capability affecting critical data.

High

Examples:

* Incorrect reimbursement balances.
* Failed statement reconciliation.
* Incorrect report totals.
* Background jobs losing accepted work.
* Major unusable workflows.

Medium

Examples:

* Non-critical navigation problems.
* Recoverable form errors.
* Incorrect optional suggestions.
* Poor mobile layout.

Low

Examples:

* Minor spacing inconsistencies.
* Cosmetic alignment issues.
* Non-essential text improvements.

⸻

33. Release Gates

Ledgerline must not be approved for full financial use while any unresolved Critical issue exists.

High-severity issues affecting financial correctness, security, data recovery or core workflows must also be resolved before approval.

All critical financial invariants must pass.

Required minimum conditions:

1. Financial calculation tests pass.
2. Transfers and card settlements are accurate.
3. Repeated imports are idempotent.
4. Workspace allocations reconcile.
5. Reports match ledger calculations.
6. Authorisation tests pass.
7. Backup restore is demonstrated.
8. Draft recovery is demonstrated.
9. Persistent jobs work as specified.
10. No unresolved critical usability blocker exists.

Any remaining lower-severity issues must be documented and accepted explicitly before release.

⸻

PART O — FINAL AUDIT DELIVERABLES

34. Required Reports

Provide:

1. Application Architecture Review.
2. Complete Feature Inventory.
3. Test Case Register.
4. Test Execution Results.
5. Financial Calculation Verification.
6. Statement Import Audit.
7. Workspace Allocation Audit.
8. Reimbursement Verification.
9. Travel Manager Verification.
10. PDF Report Verification.
11. AI Numerical Accuracy Report.
12. Security Assessment.
13. Backup and Recovery Results.
14. Mobile Usability Review.
15. Performance Test Results.
16. Defect Register.
17. Corrective Action Plan.
18. Regression Test Results.
19. Outstanding Risks.
20. Final Production Readiness Recommendation.

Each major test must have supporting evidence.

⸻

35. Final Development Instruction

Conduct a complete application testing and audit programme for the existing Ledgerline application.

Begin with architecture, data protection and the financial transaction engine.

Verify the correctness of all financial calculations before importing historical financial records.

Use controlled test data and preserve all existing records.

Test statement imports, duplicate detection, bulk classification, transfers, card settlements, reimbursements, workspace allocations, travel management and PDF reporting.

Verify persistent drafts, background processing and data recovery.

Conduct security and mobile usability testing.

Record every identified defect with severity, evidence and a recommended correction.

Do not mark features as complete merely because the interface exists.

Do not deploy code changes or activate new paid infrastructure without approval.

Do not modify production financial records while testing.

After correcting issues in an approved testing environment, rerun the affected tests and full critical regression suite.

Provide a comprehensive final audit report.

Do not declare Ledgerline ready for full financial use until the mandatory release gates have passed.

FINAL PRINCIPLE

TEST EVERY WORKFLOW.

RECONCILE EVERY CALCULATION.

PROTECT EVERY RECORD.

VERIFY BEFORE RELEASE.

LEDGERLINE VERSION 5.4

ACCURATE. RELIABLE. SECURE. READY FOR REAL FINANCES.

End of Testing & Audit Requirements.