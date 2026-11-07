LEDGERLINE

Version 5.11 — Comprehensive Financial Integrity Audit and Reconciliation

Final Development and Verification Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Full Financial Audit, Reconciliation and Corrective Verification
Priority: Critical
Audit Period: 1 April 2026 onward
Platforms: iPhone, iPad and Desktop
Environment: Development or Isolated Audit Environment
Production Deployment: Not Authorised

⸻

1. OBJECTIVE

Conduct a comprehensive financial audit of the existing Ledgerline application.

The objective is to establish that every financial transaction, calculation, account balance, card liability, workspace allocation, reimbursement, transfer and report is accurate, consistent and traceable.

The audit must cover:

1. Financial accounts.
2. Credit and debit cards.
3. Bank statement imports.
4. Transaction classification.
5. Internal transfers.
6. Third-party payments.
7. Credit card settlements.
8. Loans and advances.
9. Income and expenditure.
10. Workspace allocations.
11. Organisation allocations.
12. Recurring payments.
13. Reimbursements.
14. Travel expenditure.
15. Budgets.
16. Wealth and net worth.
17. Financial forecasts.
18. Dashboards.
19. PDF financial reports.
20. Financial Inbox reconciliation.

The audit must establish financial correctness, not merely whether the application functions without errors.

⸻

2. AUDIT PRINCIPLES

The following principles are mandatory.

Principle 1 — One Authoritative Financial Ledger

All financial modules must use Ledgerline’s existing shared financial ledger.

Do not create independent financial calculations for individual modules.

Principle 2 — Preserve Source Records

Original imported bank statements and transaction information must remain unchanged.

Principle 3 — No Duplicate Financial Effects

One financial movement must not be counted multiple times.

Principle 4 — Traceable Calculations

Every financial total must be traceable to its underlying records.

Principle 5 — Verified Versus Estimated Data

Verified, estimated, pending and incomplete information must remain distinguishable.

Principle 6 — No Silent Corrections

Historical financial data must not be automatically changed during the audit.

Principle 7 — No Production Changes

Perform the initial audit using a securely isolated copy or approved non-production environment.

⸻

3. AUDIT PREPARATION

Before testing, Lovable must inspect and document the existing financial architecture.

Identify:

* Database tables.
* Financial transaction relationships.
* Account balance calculations.
* Credit card calculation logic.
* Workspace allocation rules.
* Organisation relationships.
* Loan and EMI calculations.
* Reimbursement treatment.
* Transfer reconciliation logic.
* Currency conversion services.
* Reporting calculations.

Prepare a dependency map showing which financial services are used by each application module.

Do not assume that previously requested features have been implemented correctly.

Verify the actual code, database structure and application behaviour.

⸻

4. FINANCIAL DATA INVENTORY

Prepare a complete inventory of existing records.

Inventory Requirements

Record Type	Required Audit
Bank Accounts	Count and ownership
Credit Cards	Count and liability treatment
Debit Cards	Account relationships
Transactions	Total and status breakdown
Statement Imports	Files, periods and linked accounts
Transfers	Matched and unmatched
Loans	Outstanding balances
Advances	Outstanding settlements
Reimbursements	Eligible, received and pending
Trips	Linked financial records
Organisations	Account and expense relationships
Workspaces	Transaction allocations
Recurring Payments	Scheduled and confirmed

Identify orphan records, missing references and duplicate relationships.

Do not delete anything during the inventory stage.

⸻

5. BANK ACCOUNT AUDIT

Audit every configured bank account individually.

Verification

For each account, establish:

1. Account ownership.
2. Correct account mapping.
3. Available statement periods.
4. Opening balance.
5. Imported debit total.
6. Imported credit total.
7. Closing statement balance.
8. Ledger-calculated balance.
9. Reconciliation difference.
10. Latest verified statement date.

Balance Formula

For accounts using conventional debit and credit statement presentation:

Closing Balance = Opening Balance + Credits − Debits

Adapt the calculation where the financial institution uses different account or liability conventions.

Important

Ledgerline must reconcile balances at the same statement cutoff date.

Do not compare a current ledger balance against an older statement closing balance without accounting for subsequent transactions.

Audit Results

For each account, display:

* Reconciled.
* Difference Found.
* Missing Statement.
* Incomplete Import.
* Awaiting Verification.

A recent statement upload does not automatically mean an account has been verified.

⸻

6. BANK STATEMENT IMPORT AUDIT

Test the complete import process.

Verify:

* Correct account recognition.
* Correct statement period.
* Correct debit and credit extraction.
* Correct transaction dates.
* Correct narration extraction.
* Correct transaction references.
* Correct opening and closing balances.
* Duplicate detection.
* Overlapping statement handling.
* Failed import recovery.

Repeated Import Test

Upload the same statement twice in the test environment.

Expected:

* No duplicated financial transactions.
* Existing records remain unchanged.
* Duplicate or overlapping entries are identified.
* A clear import summary is displayed.

Historical Coverage

Audit available statement coverage from:

1 April 2026 onward.

Identify missing months and incomplete periods.

Do not assume unprovided statements contain no transactions.

⸻

7. TRANSACTION CLASSIFICATION AUDIT

Audit all financial transaction types.

Required Classification Types

* Expense.
* Income.
* Internal Transfer.
* Third-Party Payment.
* Credit Card Settlement.
* Loan Given.
* Loan Received.
* Loan Repayment.
* Advance Given.
* Advance Received.
* Reimbursement.
* Refund.
* Investment.
* Other Financial Movement.

Test Requirements

For each financial type, verify:

1. Correct input fields.
2. Correct source account.
3. Correct recipient treatment.
4. Correct category.
5. Correct organisation.
6. Correct financial calculation.
7. Correct reporting.
8. Correct save behaviour.

An expense must not require selection of another internally owned bank account as its recipient.

External counterparties must be supported.

⸻

8. INTERNAL TRANSFER AUDIT

This is a critical component following Version 5.10.3.

Audit Requirements

Identify:

* Correctly linked transfers.
* Unmatched source entries.
* Unmatched destination entries.
* Duplicate transfer records.
* Transfers incorrectly classified as expenses.
* Transfers incorrectly classified as income.
* Transfers with incorrect account mappings.
* Entries linked to incompatible transfers.

Mandatory Test

Transfer ₹50,000 between two owned accounts using test data.

Expected:

* Source account decreases appropriately.
* Destination account increases appropriately.
* One logical transfer record.
* Two preserved statement observations where both exist.
* No duplicate postings.
* No increase in income.
* No increase in expenditure.

Single-Sided Transfers

When only one statement entry exists:

* Preserve the existing statement entry.
* Mark the transfer as awaiting its counterpart.
* Do not invent a confirmed bank transaction.

Repeated Confirmation

Confirm an already recorded transfer again.

Expected:

No duplicate record or financial effect.

⸻

9. CREDIT CARD AUDIT

Audit every configured credit card.

Verify

* Card opening liability.
* Purchases.
* Refunds.
* Payments.
* Fees.
* Interest.
* Adjustments.
* Closing liability.

Use the existing card liability model.

Credit Card Purchase

An eligible purchase should affect expenditure once.

Credit Card Bill Payment

A payment from a bank account towards a credit card must:

* Reduce the paying bank balance.
* Reduce the relevant card liability.
* Avoid creating additional expenditure.

Partial Payment

Test a partial card settlement.

The unpaid card liability must remain outstanding.

Duplicate Card Payment

A repeated statement import must not create a second settlement.

Required Evidence

Reconcile the card’s calculated balance with the corresponding statement balance at the same cutoff date.

⸻

10. INCOME AUDIT

Verify all income classifications.

Examples:

* Salary.
* Rental income.
* Business receipts.
* Interest.
* Other income.

Check

* Correct source.
* Correct receiving account.
* Correct workspace.
* Correct organisation.
* Correct reporting period.
* Correct income category.

Exclusions

Do not automatically treat the following as ordinary income:

* Transfers from owned accounts.
* Loan proceeds.
* Refunds.
* Reimbursement settlements.
* Return of advances.
* Movements of existing investments.

Their treatment must follow the existing financial model and verified transaction purpose.

⸻

11. EXPENDITURE AUDIT

Verify:

* Correct expense amount.
* Correct payment source.
* Correct category.
* Correct workspace.
* Correct organisation.
* Correct date.
* Correct currency.
* Correct reimbursement eligibility.
* Correct trip/project mapping.

Duplicate Prevention

The same expense must not be counted again when it appears in:

* Bank statements.
* Card statements.
* Travel Manager.
* Reimbursement reports.
* Budget reports.
* Financial dashboards.

Each view must reference the underlying authorised record or its reconciled relationship.

⸻

12. WORKSPACE RECONCILIATION

Audit:

* Personal.
* Family.
* Business.
* Official.
* Additional configured workspaces, if any.

Required Verification

Check:

1. Workspace ownership and configuration.
2. Transaction assignments.
3. Split allocations.
4. Consolidated totals.
5. Workspace-specific income.
6. Workspace-specific expenditure.
7. Workspace budgets.
8. Workspace reports.

Important

A transaction split across workspaces must reconcile to its original amount.

Example:

Original Expense: ₹10,000.

Business Allocation: ₹7,000.

Personal Allocation: ₹3,000.

Consolidated Expense: ₹10,000.

Not ₹20,000.

⸻

13. ORGANISATION RECONCILIATION

Audit every configured organisation.

Verify:

* Legal entity relationships.
* Operating brand relationships.
* Linked accounts.
* Linked cards.
* Assigned expenses.
* Reimbursement responsibilities.
* Organisation budgets.
* Organisation reports.

Important

A personal account may pay an organisation’s expense.

Account ownership and expense responsibility must remain separate.

Do not assume that an organisation’s linked account makes every transaction on that account an expense of that organisation.

⸻

14. REIMBURSEMENT AUDIT

Verify:

* Eligible reimbursement.
* Personal payment source.
* Responsible organisation.
* Amount submitted.
* Advances received.
* Partial reimbursements.
* Reimbursements received.
* Outstanding balance.
* Claim status.

Example

Eligible Expense: ₹12,000.

Reimbursement Received: ₹5,000.

Outstanding: ₹7,000.

Expected:

* Original expense counted once.
* Reimbursement settlement recorded correctly.
* Outstanding amount ₹7,000.
* No artificial income.

Reports

Verify that claim PDFs reconcile with the underlying reimbursement records.

Generating a PDF must not automatically change claim approval or payment status.

⸻

15. LOAN AND EMI AUDIT

Verify:

* Loan opening balance.
* Principal outstanding.
* Interest.
* Scheduled EMI.
* Actual payments.
* Prepayments.
* Closing liability.

Critical Rule

Loan principal repayment must not be incorrectly counted as ordinary consumption expenditure where the ledger separates principal and interest.

The payment must reconcile with the corresponding bank transaction.

Do not create duplicate EMI expenses.

⸻

16. RECURRING PAYMENT AUDIT

Verify:

* Subscription profiles.
* EMIs.
* Insurance premiums.
* Scheduled payments.
* Expected payment dates.
* Actual transaction matching.
* Price changes.
* Missed payments.
* Duplicate subscription suggestions.

Important

A recurring payment schedule is not itself proof that money has been paid.

The actual ledger transaction remains the financial record.

Do not double-count scheduled and confirmed payments.

⸻

17. TRAVEL MANAGER AUDIT

Audit the redesigned Travel Manager.

Verify

* Trip creation.
* Trip details.
* Bookings.
* Itinerary.
* Linked expenses.
* Travel advances.
* Budget calculations.
* Workspace allocations.
* Organisation allocations.
* Reimbursements.
* Trip settlements.
* Final trip reports.

Mandatory Test

Use a representative trip such as the existing Kovai Trip in a safe test copy.

Verify that:

1. Linked expenses are retrieved.
2. Existing expenses are not duplicated.
3. Payment methods are preserved.
4. Reimbursement eligibility is correct.
5. Trip spending reconciles with the ledger.
6. Budget allocations are not double-counted.
7. Reports display the correct totals.

⸻

18. BUDGET AUDIT

Verify the following:

* Primary budget.
* Workspace allocation.
* Traveller allocation.
* Category allocation.
* Currency allocation.
* Confirmed spending.
* Unpaid commitments.
* Remaining budget.

Example

Trip Budget: ₹10,000.

Workspace Allocation: ₹10,000.

Traveller Allocation: ₹10,000.

Correct total budget:

₹10,000

Do not add the different allocation dimensions together.

⸻

19. MULTI-CURRENCY AUDIT

Verify:

* Original transaction currency.
* Original transaction amount.
* Recorded conversion rate.
* Converted amount.
* Reporting currency.
* Exchange-rate source or assumption.
* Currency differences.
* Applicable fees.

Do not automatically rewrite historical financial values using current exchange rates.

Where conversion information is missing, flag the amount as unverified.

⸻

20. WEALTH AND NET WORTH AUDIT

Verify:

* Bank balances.
* Cash.
* Investments.
* Other configured assets.
* Loans.
* Credit card liabilities.
* Other financial obligations.

Net Worth

Use the application’s established asset and liability definitions.

Avoid duplicate asset or liability recognition.

Do not treat ordinary transfers between owned accounts as changes in net worth, apart from genuine fees, exchange effects or valuation changes.

Estimated asset values must be labelled.

⸻

21. FINANCIAL FORECAST AUDIT

Verify that forecasts distinguish:

* Actual recorded transactions.
* Scheduled future payments.
* Expected income.
* Estimated expenses.
* Loan commitments.
* Credit card dues.
* Recurring subscriptions.
* Pending reimbursements.

Forecast values must not be represented as verified financial balances.

Forecast calculations must be consistent with existing financial records.

⸻

22. FINANCIAL DASHBOARD AUDIT

Audit every major dashboard.

Verify that:

* Income matches the ledger.
* Expenditure matches the ledger.
* Account balances reconcile.
* Credit card liabilities are correct.
* Workspace allocations are accurate.
* Reimbursement totals are consistent.
* Financial commitments are not double-counted.

Changing filters must not change the underlying financial records.

⸻

23. PDF REPORT AUDIT

Audit all available financial report types.

Mandatory Reports

* Monthly Financial Summary.
* Income Report.
* Expense Report.
* Workspace Report.
* Organisation Report.
* Credit Card Report.
* Trip Financial Report.
* Detailed Expenditure Statement.
* Expense Claim Submission.
* Reimbursement Report.
* Loan Report.
* Budget Report.
* Financial Commitments Report.

Verification

For each report:

1. Confirm the reporting period.
2. Confirm filters.
3. Verify totals.
4. Check transaction completeness.
5. Check financial treatment.
6. Verify currency calculations.
7. Verify attached bills, where applicable.
8. Test PDF preview.
9. Test download.
10. Test iPhone and iPad compatibility.

The PDF must reconcile with the same financial information displayed inside Ledgerline.

⸻

24. FINANCIAL INBOX AUDIT

Audit the complete Financial Inbox workflow.

Verify:

* Correct transaction counts.
* Correct issue counts.
* Correct review groups.
* Select All Visible.
* Select All Matching.
* Merchant grouping.
* Bulk classification.
* Financial type correction.
* Account mapping.
* Missing information resolution.
* Save and confirmation.
* Automatic status updates.

Critical Test

Select a group of compatible transactions.

Apply a verified correction.

Expected:

* Correct records updated.
* No duplicate transactions.
* Financial totals remain correct.
* Pending issue count decreases appropriately.
* Unresolved issues remain visible.

⸻

25. CROSS-MODULE RECONCILIATION

Introduce a mandatory cross-module verification process.

The same financial transaction must reconcile across all relevant views.

Example

An official hotel expense paid using a personal credit card.

Check its representation in:

* Credit Card Management.
* Transaction Ledger.
* Official Workspace.
* Organisation Report.
* Travel Manager.
* Reimbursement Tracking.
* Budget Management.
* PDF Reports.

The transaction must remain financially consistent across every applicable module.

⸻

26. AUDIT EXCEPTION REGISTER

Create a structured audit exception register.

Required Fields

* Issue ID.
* Module.
* Account or transaction reference.
* Description.
* Severity.
* Financial impact.
* Root cause.
* Proposed correction.
* Status.
* Test result.
* Resolution evidence.

Severity

Critical

Incorrect balances, duplicate postings, unauthorised financial access or material financial data loss.

High

Incorrect financial categorisation, reimbursement or report totals.

Medium

Missing information, incorrect status display or incomplete workflow.

Low

Presentation, alignment or non-financial usability issues.

Critical financial defects must block production approval.

⸻

27. AUTOMATED REGRESSION TESTING

Create repeatable automated tests for core financial calculations.

Tests must cover:

* Income.
* Expense.
* Transfers.
* Card settlements.
* Loans.
* Advances.
* Reimbursements.
* Workspace splits.
* Organisation splits.
* Currency conversion.
* Budget totals.
* Financial reports.

These tests should run after future changes to relevant financial code.

Use deterministic test fixtures with known expected values.

Do not rely solely on AI-generated explanations or visual inspection as proof of financial correctness.

⸻

28. PERFORMANCE AND RELIABILITY

Test:

* Large statement imports.
* Historical records from April 2026.
* Hundreds of pending review items.
* Bulk correction operations.
* Large PDF reports.
* Concurrent application sessions.
* Repeated button taps.
* Interrupted network connections.
* Session expiry.
* Save and retry operations.

Requirements

* Visible processing status.
* No duplicate records.
* No silent data loss.
* Safe retry.
* Correct final status.
* Clear error information.

Where persistent background processing is implemented, verify that jobs survive navigation and supported session interruptions.

Otherwise, clearly disclose foreground-processing limitations.

⸻

29. SECURITY AND DATA PROTECTION

Audit:

* User authentication.
* Workspace permissions.
* Organisation permissions.
* Financial account access.
* Statement file access.
* Receipt access.
* Reimbursement profile access.
* Report download authorisation.
* Database access controls.
* Audit logs.
* Sensitive data handling.

Mask full account and card numbers in normal interfaces and reports.

Ensure users cannot access financial records they are not authorised to view.

Verify that backups and restoration procedures are available and tested in a safe environment.

⸻

30. AUDIT IMPLEMENTATION PHASES

Phase 1 — Inventory and Read-Only Diagnostics

* Inspect current financial architecture.
* Identify all accounts and financial records.
* Review statement coverage.
* Detect existing discrepancies.
* Prepare the exception register.

No historical financial modifications.

Phase 2 — Controlled Financial Test Suite

* Build deterministic financial test fixtures.
* Test transaction types.
* Test transfers and card settlements.
* Test balances and liabilities.
* Test split allocations.

Phase 3 — Module Reconciliation

* Bank.
* Credit Cards.
* Loans.
* Workspaces.
* Organisations.
* Reimbursements.
* Travel.
* Budgets.
* Recurring Payments.

Phase 4 — Reporting Verification

* Dashboards.
* Financial forecasts.
* PDF reports.
* Consolidated financial summaries.

Phase 5 — Reliability and Security

* Large data volumes.
* Error handling.
* Duplicate prevention.
* Authorisation.
* Backup and recovery.

Phase 6 — Final Audit Report

Present all findings, unresolved issues, test evidence and recommended corrections.

⸻

31. REQUIRED FINANCIAL AUDIT DASHBOARD

Provide an internal audit summary showing:

Audit Metric	Required Information
Accounts Audited	Completed / Total
Statements Verified	Completed / Total
Transactions Reviewed	Completed / Total
Transfer Discrepancies	Count
Credit Card Discrepancies	Count
Balance Differences	Amount and account
Duplicate Records	Count
Workspace Allocation Errors	Count
Reimbursement Differences	Count
Report Reconciliation Errors	Count
Critical Issues	Open / Resolved
Overall Audit Status	Pass / Conditional / Fail

All values must come from actual audit results.

Do not use fabricated success percentages.

⸻

32. ACCEPTANCE CRITERIA

The audit may be considered successfully completed only when:

1. Every configured financial account has an auditable reconciliation status.
2. Available statements are correctly matched to accounts.
3. Duplicate imports are prevented.
4. Internal transfers do not inflate income or expenses.
5. Credit card settlements do not duplicate spending.
6. Loan and advance calculations are correct.
7. Workspace allocations reconcile.
8. Organisation allocations reconcile.
9. Reimbursement balances are correct.
10. Travel expenses reconcile with the ledger.
11. Budgets do not double-count allocation dimensions.
12. Financial dashboards reconcile with underlying records.
13. PDF reports reconcile with the same records.
14. Critical financial tests pass.
15. No unresolved Critical defects remain.
16. Any remaining unverified information is explicitly disclosed.
17. Historical records are preserved.
18. Production remains unchanged.

A missing statement is not automatically a software failure, but it must prevent the affected balance from being described as verified.

⸻

33. REQUIRED DEVELOPER DELIVERABLES

Lovable must provide:

1. Financial architecture summary.
2. Financial data inventory.
3. Statement coverage report.
4. Account reconciliation report.
5. Credit card reconciliation report.
6. Transfer audit report.
7. Loan and advance audit report.
8. Workspace reconciliation report.
9. Organisation reconciliation report.
10. Reimbursement reconciliation report.
11. Travel financial audit report.
12. Budget reconciliation report.
13. Financial report verification.
14. Automated test results.
15. Security test summary.
16. Audit exception register.
17. Proposed correction plan.
18. Rollback and recovery plan.
19. Final production-readiness assessment.
20. Confirmation that live data and deployment remain unchanged.

Do not close an issue without verification evidence.

⸻

34. IMPORTANT DEVELOPMENT RESTRICTIONS

Do not:

* Delete historical transactions.
* Reset financial accounts.
* Re-import statements without duplicate protection.
* Automatically correct historical financial records.
* Merge unrelated transactions.
* Change account balances directly to force reconciliation.
* Replace the shared ledger.
* Create independent reporting calculations.
* Remove unresolved issues without correcting them.
* Activate new paid infrastructure without approval.
* Deploy changes to production without approval.

All proposed material corrections must be reviewed before implementation.

⸻

35. FINAL RECOMMENDATIONS

Recommendation 1 — Start With Financial Foundations

Audit bank accounts, transfers and credit cards before relying on higher-level financial reports.

Recommendation 2 — Prioritise Financial Accuracy

A premium interface has limited value if the financial calculations are incorrect.

Recommendation 3 — Audit Existing Data Before Reclassification

Do not blindly correct hundreds of existing transactions.

Identify the root causes and financial effects first.

Recommendation 4 — Create Permanent Financial Test Cases

Every future development must be tested against the same core financial scenarios.

Recommendation 5 — Keep Import and Reconciliation Separate

Successful statement import must not automatically mean successful balance verification.

Recommendation 6 — Maintain One Calculation Source

All modules and PDF reports must use the existing authoritative financial services.

Recommendation 7 — Preserve Complete Audit History

Maintain the original statement data, corrections, reconciliation evidence and relevant timestamps.

Recommendation 8 — Require Evidence of Completion

A developer declaration of completion is insufficient without test results and reconciliation evidence.

Recommendation 9 — Separate Software Defects From Missing Data

A financial record awaiting bank information must be identified differently from an application calculation defect.

Recommendation 10 — Obtain Approval Before Production Changes

Complete the audit, present the findings and obtain explicit approval before implementing material historical corrections or deploying changes.

⸻

36. FINAL DEVELOPMENT INSTRUCTION

Conduct a comprehensive financial integrity audit of the existing Ledgerline application.

Verify the accuracy and consistency of all financial accounts, card liabilities, transactions, transfers, loans, advances, income, expenses, workspaces, organisations, reimbursements, travel expenditure, budgets, forecasts, dashboards and reports.

Audit available historical records beginning 1 April 2026.

Identify calculation defects, duplicate transactions, reconciliation errors, missing information and inconsistent financial treatment.

Prepare an evidence-based audit report with root causes, financial impact, recommended corrections and test results.

Preserve all existing financial data, calculations, permissions and application functionality.

Do not automatically apply material historical corrections.

Do not deploy changes to the live application without explicit approval.

FINAL PRINCIPLE

EVERY TRANSACTION ACCOUNTED FOR. EVERY BALANCE RECONCILED. EVERY REPORT VERIFIED.

End of Ledgerline Version 5.11 Financial Audit Requirements.