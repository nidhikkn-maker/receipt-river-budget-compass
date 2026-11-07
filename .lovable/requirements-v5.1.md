LEDGERLINE

Version 5.1 — Smart Historical Import & Bulk Reconciliation

Additional Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Enhancement to Statement Import and Transaction Management
Priority: Critical
Historical Records Start Date: 1 April 2026

⸻

1. Objective

Develop an intelligent bulk-import system that significantly reduces manual work when importing historical bank and credit card statements.

The system should automatically analyse transactions, recommend classifications, identify duplicates, apply reusable rules and allow multiple transactions to be reviewed and approved together.

Integrate this into the existing Ledgerline application and Version 5.0 usability programme.

Do not create a separate transaction ledger.

Do not change existing confirmed records without authorisation.

⸻

2. Historical Financial Records

Enable users to establish financial records retrospectively from 1 April 2026.

The system must support:

* Bank statements.
* Credit card statements.
* Cash transactions.
* Digital wallet records.
* Imported expense records.
* Manually entered historical transactions.

Support PDF, CSV and Excel imports where technically feasible.

Retain original statements securely.

Historical Opening Balances

Allow users to configure account opening balances as of the historical start date.

Avoid combining an opening balance with imported transactions in a way that double-counts money.

Support reconciliation against statement closing balances.

The user should be able to distinguish between:

* Verified historical balance.
* Manually supplied opening balance.
* Imported transaction balance.
* Unreconciled difference.

Do not invent missing historical transactions merely to force balances to match.

⸻

3. Intelligent Statement Import

When a statement is uploaded:

1. Identify the financial institution where possible.
2. Identify the account or credit card.
3. Detect the statement period.
4. Extract transaction dates.
5. Extract descriptions.
6. Identify debit and credit amounts.
7. Identify available transaction references.
8. Detect merchant names.
9. Identify recurring transactions.
10. Suggest categories.
11. Suggest workspaces.
12. Detect possible duplicates.
13. Identify transfers and card settlements.
14. Group similar transactions.
15. Generate a bulk review screen.

If account identification is uncertain, request confirmation.

⸻

4. Smart Merchant Recognition

Develop a merchant-normalisation system.

Examples:

SWIGGY INSTAMART
SWIGGY ORDER
SWIGGY UPI

These may be associated with the same merchant family while retaining the original transaction descriptions.

Do not automatically assume every transaction from a merchant belongs to the same category.

For example, a merchant may sell both groceries and household products.

Allow the user to establish reusable classification rules.

⸻

5. Bulk Classification

This is the most important feature.

Users should be able to select multiple transactions and classify them together.

Bulk Actions

* Set category.
* Set subcategory.
* Assign workspace.
* Assign organisation.
* Add tags.
* Assign person.
* Link trip.
* Mark reimbursable.
* Assign reimbursement organisation.
* Confirm payment account.
* Mark for individual review.
* Approve selected transactions.

Example

The application identifies 36 similar restaurant transactions.

It suggests:

Category: Food & Dining
Workspace: Personal

The user reviews the group and selects:

Apply to 36 transactions

This should update the proposed classifications in one operation.

Provide an opportunity to review the changes before posting them to the ledger.

⸻

6. Learn From Corrections

When users correct a transaction classification, Ledgerline should offer:

Apply to this transaction only

Apply to similar transactions in this import

Remember this rule for future imports

Do not automatically create permanent rules from a single correction without an appropriate confidence threshold or user confirmation.

Rules should be editable from central Settings.

⸻

7. Intelligent Workspace Classification

Use existing Ledgerline workspaces:

* Personal.
* Family.
* Business.
* Official.

Suggest classification using:

* Merchant history.
* Account ownership.
* Existing rules.
* Organisation references.
* Transaction descriptions.
* Linked trips.
* Previous user-confirmed classifications.

Do not assume that a personal credit card transaction is necessarily a personal expense.

For example, an AMEX purchase may relate to VEI official travel or MOVAC business.

Keep payment source and financial purpose as separate attributes.

⸻

8. Smart Review Dashboard

Introduce a statement review interface with the following groups:

A. Ready to Approve

Transactions with sufficiently reliable classifications and no unresolved accounting conflicts.

B. Suggested Classification

Transactions for which Ledgerline can recommend a category or workspace.

C. Needs Your Decision

Transactions requiring user input.

D. Possible Duplicates

Transactions potentially matching existing records.

E. Transfers and Settlements

Internal transfers and credit card payments requiring correct financial treatment.

F. Unmatched or Uncertain

Transactions with insufficient information.

Display the number of transactions in each group.

Allow users to review groups rather than individual transactions wherever appropriate.

⸻

9. Missing Information Management

Do not require every optional field to be completed before import approval.

Distinguish between:

Mandatory financial information

Information required to post the transaction accurately.

Recommended classification

Information that improves reports but may be completed later.

Optional enrichment

Merchant details, descriptions, tags, projects and other supporting information.

Allow approved transactions with incomplete optional details to be identified for later enrichment.

If information required for correct accounting is missing, keep the transaction in review.

⸻

10. Duplicate Detection

Detect possible duplicates using combinations of:

* Account.
* Transaction date.
* Amount.
* Debit or credit direction.
* Merchant or description.
* Bank reference.
* Existing transaction identifiers.
* Import source.

Use both exact and approximate matching.

Classify matches as:

* Exact match.
* Likely duplicate.
* Possible duplicate.
* New transaction.

Do not automatically discard legitimate repeated payments.

Repeated imports of the same statement must not create duplicate ledger records.

⸻

11. Transfer and Credit Card Recognition

Identify possible:

* Transfers between owned accounts.
* Bank-to-credit-card payments.
* Refunds.
* Reversals.
* Loan repayments.
* Investment contributions.
* Reimbursements.
* Cash withdrawals.

These transactions must use the existing financial ledger rules.

A credit card purchase should be treated as expenditure when appropriate.

Subsequent payment of that card liability must not be counted as a second expense.

A transfer between owned accounts must not inflate income or expenditure.

⸻

12. Historical Import Assistant

Introduce a guided setup process for importing records from April 2026.

Step 1 — Configure Accounts

Confirm accounts and cards to be included.

Step 2 — Establish Opening Balances

Record or verify balances at the historical start date.

Step 3 — Upload Statements

Allow multiple statements to be uploaded.

Step 4 — Process Statements

Extract, normalise and identify transactions.

Use persistent background processing.

Step 5 — Group and Classify

Present intelligent classification suggestions.

Step 6 — Bulk Review

Allow corrections and bulk approval.

Step 7 — Reconcile

Compare recorded transactions with statement balances.

Step 8 — Complete Historical Setup

Display import coverage, unresolved items and reconciliation status.

Do not declare historical records complete while material gaps remain unresolved.

⸻

13. Import Progress and Recovery

Because historical imports may contain hundreds or thousands of transactions:

* Processing must be persistent.
* Users must be able to leave the page.
* Progress must be saved.
* Completed imports must appear in the Financial Inbox.
* Partial work must be recoverable.
* Failed batches must support safe retries.

Show stages such as:

Uploading statements
Extracting transactions
Finding duplicates
Suggesting classifications
Ready for review

Do not show misleading percentages when reliable progress measurement is unavailable.

⸻

14. Import Coverage and Data Quality

Display:

* Number of accounts configured.
* Statement periods covered.
* Missing statement periods.
* Transactions extracted.
* Transactions matched.
* Transactions approved.
* Transactions awaiting review.
* Possible duplicates.
* Reconciliation differences.

The dashboard should clearly distinguish between incomplete historical data and verified financial records.

Safe-to-spend calculations and forecasts must not treat unverified historical balances as confirmed available funds.

⸻

15. Recommended User Experience

The user should not need to review every line item independently.

The default experience should be:

1. Upload statements.
2. Wait for processing to complete.
3. Review grouped classifications.
4. Apply bulk corrections.
5. Review uncertain transactions.
6. Confirm import.
7. View reconciliation results.

Include selection controls such as:

* Select all eligible.
* Select merchant group.
* Select date range.
* Select category.
* Select workspace.
* Exclude selected.
* Review individually.

Require explicit confirmation before posting new transactions.

⸻

16. Central Rule Management

Add a section under:

Settings → Financial Automation → Import Rules

Allow users to:

* View learned rules.
* Create merchant rules.
* Edit category mappings.
* Edit workspace mappings.
* Disable rules.
* Review conflicting rules.
* Delete obsolete rules.

Use these rules across all compatible statement-import workflows.

⸻

17. Technical Requirements

Implement:

1. Secure import batch records.
2. Persistent processing jobs.
3. Transaction extraction staging.
4. Merchant normalisation.
5. Classification suggestions.
6. Confidence indicators.
7. Bulk review operations.
8. Duplicate detection.
9. Reconciliation services.
10. Rule management.
11. Audit history.
12. Import provenance.

Preserve the source statement, original transaction description and relevant source reference.

Use the existing ledger as the financial source of truth.

Ensure that bulk operations are transactional or safely recoverable, and that retries are idempotent.

⸻

18. Development Priorities

Priority 1 — Historical Import Foundation

1. Historical start-date configuration.
2. Opening balance setup.
3. Multiple statement uploads.
4. Persistent import processing.
5. Secure staging of extracted transactions.
6. Duplicate detection.

Priority 2 — Intelligent Bulk Classification

7. Merchant recognition.
8. Category suggestions.
9. Workspace suggestions.
10. Bulk classification.
11. Reusable classification rules.
12. Grouped review interface.

Priority 3 — Financial Reconciliation

13. Transfer identification.
14. Card settlement identification.
15. Refund and reversal recognition.
16. Statement balance reconciliation.
17. Historical coverage monitoring.

Priority 4 — Usability Refinement

18. Import progress tracking.
19. Draft review recovery.
20. Missing-information management.
21. Import audit reports.
22. Comprehensive testing.

⸻

19. Acceptance Requirements

Demonstrate that:

1. Statements from April 2026 onward can be imported.
2. Multiple statements can be processed.
3. Similar transactions can be grouped.
4. A group can be categorised through one action.
5. User-approved rules are reused.
6. Workspace suggestions remain editable.
7. Duplicate statement imports do not duplicate transactions.
8. Legitimate repeated payments are preserved.
9. Credit card settlements do not duplicate expenses.
10. Internal transfers do not inflate income or expenses.
11. Incomplete optional fields do not unnecessarily block imports.
12. Uncertain accounting entries remain subject to review.
13. The user can leave and return to an import.
14. Statement balances can be reconciled.
15. Historical coverage gaps are displayed.
16. Original statements remain accessible.
17. Imported transactions retain source references.
18. Existing confirmed transactions are preserved.
19. All imported records respect workspace permissions.
20. Existing Ledgerline functionality remains operational.

⸻

20. Final Development Instruction

Implement the Smart Historical Import & Bulk Reconciliation Engine within the existing Ledgerline application.

Prioritise the ability to establish accurate financial records from 1 April 2026 without requiring the user to classify every historical transaction individually.

Integrate the new functionality with:

* Universal Expense Entry.
* Transaction Ledger.
* Accounts.
* Credit Cards.
* Workspaces.
* Travel Manager.
* Reimbursements.
* Financial Inbox.
* Background Processing.
* Universal Search.
* Reports Centre.
* Central Settings.

Reuse existing components and calculation services.

Do not independently alter confirmed financial records.

Do not post uncertain transactions automatically.

Do not create duplicate records.

Do not deploy changes to the live application or activate new paid services without approval.

Final Principle:

IMPORT IN BULK. CLASSIFY INTELLIGENTLY. REVIEW EXCEPTIONS. RECONCILE ACCURATELY.

End of Version 5.1 Development Requirements.