LEDGERLINE

Version 5.10.3 — Financial Transaction Classification and Safe Transfer Reconciliation

Complete Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Financial Logic Correction, Transaction Classification and Reconciliation Enhancement
Priority: Critical
Platforms: iPhone, iPad and Desktop
Deployment: Development/Preview Only

⸻

1. OBJECTIVE

Correct the existing Financial Inbox transaction classification system and introduce safe handling of payments and transfers.

The current application creates confusion by asking users to select both From and To bank accounts even when categorising an ordinary expense.

The receiving-account dropdown also displays the user’s own configured bank accounts, making it difficult to record payments to third parties.

Additionally, matching two transactions as a transfer must not create duplicate financial movements.

The redesigned system must:

1. Display only relevant fields for each financial transaction type.
2. Support external recipients and third-party payments.
3. Distinguish expenses from transfers.
4. Correctly handle credit card settlements.
5. Support loans and advances.
6. Record internal transfers as one logical financial movement.
7. Preserve both original bank statement entries.
8. Prevent duplicate financial postings.
9. Reconcile transfers safely.
10. Correct historical misclassifications.
11. Support bulk classification.
12. Preserve all existing financial records and calculations.

Financial accuracy must take priority over automation.

⸻

2. CURRENT PROBLEMS

The following issues require investigation and correction.

A. Incorrect Classification Fields

When a user selects Expense, Ledgerline requests:

* From account.
* To account.

This is inappropriate for ordinary expenditure.

An expense normally requires the actual payment source and a merchant or external payee.

B. Incorrect Receiving Account Options

The To dropdown currently displays the user’s configured bank accounts.

This prevents users from properly identifying external recipients.

C. Unclear Third-Party Transfers

The system does not clearly distinguish:

* Third-party expense payments.
* Loans given.
* Advances given.
* Personal transfers.
* Internal transfers between owned accounts.

D. Unsafe Internal Transfer Linking

Two matching statement entries must represent one financial movement.

Linking them incorrectly may create duplicate debits, credits or expense records.

E. Financial Inbox Categorisation Problems

The current categorisation process is not working consistently.

Investigate:

* Validation errors.
* Incorrect required fields.
* Account mapping.
* Category selection.
* Financial type changes.
* Save operations.
* Bulk corrections.
* Backend persistence.
* Review status updates.

Correct the underlying causes.

⸻

3. TRANSACTION TYPE SELECTION

Introduce a primary field:

What is this transaction?

Available options:

1. Expense.
2. Income.
3. Transfer Between My Accounts.
4. Payment to Third Party.
5. Credit Card Bill Payment.
6. Loan Given.
7. Loan Received.
8. Advance Given.
9. Advance Received.
10. Refund.
11. Reimbursement.
12. Investment.
13. Other Financial Movement.

Changing the selected financial type must dynamically update the relevant fields.

Do not display irrelevant inputs.

⸻

4. EXPENSE CLASSIFICATION

When the user selects Expense, display:

* Date.
* Merchant/payee.
* Amount.
* Currency.
* Paid From.
* Expense category.
* Workspace.
* Organisation, where applicable.
* Trip/project/event, where applicable.
* Reimbursement eligibility.
* Notes.
* Bill attachment.

Important

Do not ask for a receiving bank account.

The receiving party is the merchant or payee.

Example:

Payment:

₹4,500.

Paid From:

IDFC Personal Account.

Paid To:

External Merchant.

Category:

Shopping.

This must be saved as a valid expense without requiring the external merchant to be configured as one of the user’s bank accounts.

⸻

5. THIRD-PARTY PAYMENTS

Introduce proper third-party payment handling.

A payment made to someone outside the user’s own bank accounts can represent different financial activities.

Supported Treatments

A. Expense

Payment for goods or services.

B. Loan Given

Money lent to another person or organisation.

C. Advance Given

Money provided for future settlement.

D. Reimbursement Paid

Settlement of an amount owed to another person.

E. Other Transfer

A financial movement requiring an appropriate classification.

Required Fields

* Source account.
* Recipient.
* Amount.
* Date.
* Payment reference.
* Purpose.
* Financial treatment.

Do not automatically classify every outward transfer as expenditure.

⸻

6. EXTERNAL RECIPIENT DIRECTORY

Introduce:

Settings → Financial Setup → Recipients & Payees

Support:

* Individuals.
* Merchants.
* Businesses.
* Organisations.
* Other counterparties.

Recipient Details

* Name.
* Recipient type.
* Available bank information.
* UPI identifier, if available.
* Payment reference information.
* Default category, where applicable.
* Associated organisation, where applicable.

Do not require users to provide account details that are unavailable in the original statement.

Recipient records must remain separate from the user’s owned financial accounts.

⸻

7. TRANSFERS BETWEEN OWN ACCOUNTS

When the user selects:

Transfer Between My Accounts

Display:

* Source account.
* Destination account.
* Amount.
* Currency.
* Date.
* Transfer reference.

Both accounts must belong to the user’s configured financial account structure.

Example

₹50,000 transferred from IDFC Personal to another owned bank account.

Correct financial treatment:

* Source account decreases by ₹50,000.
* Destination account increases by ₹50,000.
* Income does not increase.
* Expenditure does not increase.

The system must represent this as one logical transfer.

⸻

8. SINGLE INTERNAL TRANSFER RECORD

Introduce or reuse an authoritative transfer record.

Required Information

* Transfer ID.
* Source account.
* Destination account.
* Transfer date.
* Source amount.
* Destination amount.
* Currency.
* Exchange rate, where applicable.
* Transaction reference.
* Transfer status.
* Linked debit statement entry.
* Linked credit statement entry.

Core Rule

One transfer must not create additional financial postings when the corresponding bank statement entries already exist in the ledger.

The transfer record should identify the relationship between the two entries.

Both original statement entries must remain preserved.

⸻

9. SAFE TRANSFER RECONCILIATION WORKFLOW

Implement the following process.

Step 1 — Identify Transfer

The user selects a transaction and chooses:

Classify as Internal Transfer

Step 2 — Select Destination

Ledgerline asks for the receiving owned account.

Step 3 — Search Existing Records

Before creating a transfer record, Ledgerline must check:

* Existing transfers.
* Matching debit entries.
* Matching credit entries.
* Previously linked statement records.

Step 4 — Identify Possible Matches

Use:

* Source account.
* Destination account.
* Amount.
* Debit/credit direction.
* Currency.
* Date.
* Value date.
* UTR/reference.
* Bank narration.

Do not match transactions solely because their amounts are identical.

Step 5 — Preview

Show:

* Source transaction.
* Destination transaction.
* Proposed relationship.
* Existing posting state.
* Financial effect.
* Conflicts.

Step 6 — Confirm

Provide:

Confirm Transfer

Step 7 — Save

Create or update one transfer record.

Link existing statement entries without creating duplicate postings.

Step 8 — Reconcile

Update reconciliation status only when sufficient evidence exists.

⸻

10. SINGLE-SIDED TRANSFERS

Sometimes only one bank statement has been imported.

Example:

₹50,000 debited from Account A.

The statement for Account B has not yet been uploaded.

Ledgerline must allow:

Transfer Awaiting Destination Entry

Do not require the user to upload both statements immediately.

Do not fabricate the missing bank statement entry.

When the destination statement is uploaded later, Ledgerline should automatically suggest the matching transaction.

The user must be able to confirm the match.

⸻

11. TRANSFER STATUSES

Support:

1. Proposed.
2. Awaiting Source Entry.
3. Awaiting Destination Entry.
4. Partially Matched.
5. Matched.
6. Reconciled.
7. Conflict.
8. Cancelled.

Do not describe a one-sided transfer as fully reconciled.

⸻

12. DUPLICATE PREVENTION

Before confirming a transfer:

1. Check for an existing transfer record.
2. Check whether the source entry is already linked.
3. Check whether the destination entry is already linked.
4. Identify incompatible relationships.
5. Prevent duplicate postings.
6. Prevent repeated confirmation from creating another transfer.

Use database transactions and idempotent processing.

If an operation fails, roll back the incomplete linking changes.

Preserve the original statement entries.

⸻

13. CREDIT CARD BILL PAYMENTS

When selecting:

Credit Card Bill Payment

Display:

* Paying bank account.
* Receiving credit card.
* Payment amount.
* Payment date.
* Payment reference.

Example

₹2,50,000 paid from IDFC Personal towards AMEX.

Correct treatment:

* The bank balance reduces.
* The credit card liability reduces.
* The payment does not create another expense.

The original credit card purchases must remain correctly recorded.

Do not count the bill payment as additional expenditure.

⸻

14. LOANS AND ADVANCES

Provide separate financial treatment for:

* Loan Given.
* Loan Received.
* Advance Given.
* Advance Received.
* Loan Repayment.
* Advance Settlement.

Link repayments to existing loan or advance records where available.

Do not automatically classify the principal amount as ordinary expense or income.

Use Ledgerline’s existing loan and advance calculation services.

⸻

15. FINANCIAL INBOX BULK CLASSIFICATION

Integrate these corrections with the existing Financial Review Centre.

Support:

* Select Individual.
* Select All Visible.
* Select All Matching.
* Select Merchant Group.
* Clear Selection.

Once records are selected, display:

Selected Transactions

Available actions:

* Change Financial Type.
* Assign Category.
* Assign Organisation.
* Link Account.
* Link External Recipient.
* Link Internal Transfer.
* Mark Credit Card Payment.
* Review & Apply.

Bulk changes must be previewed before confirmation.

Different financial types must be handled separately where required.

⸻

16. CORRECT FORM VALIDATION

Investigate why Financial Inbox categorisation currently fails.

When an ordinary expense is selected:

* Do not require an internal destination account.
* Require only genuinely necessary fields.
* Allow valid merchant/payee information.
* Save the classification correctly.

When a transfer is selected:

* Validate source and destination accounts.
* Check account ownership.
* Check existing transfer relationships.

When a third-party payment is selected:

* Allow an external recipient.
* Require the financial treatment.
* Do not require a recipient to have an account inside Ledgerline.

All validation errors must clearly explain what needs correction.

⸻

17. AUTOMATIC ISSUE RESOLUTION

After a successful correction:

1. Save the corrected information.
2. Update affected financial calculations.
3. Recalculate review issues.
4. Refresh the Financial Inbox.
5. Remove genuinely resolved issues from the pending count.
6. Preserve other unresolved issues.

A selected checkbox must not automatically resolve an issue.

A failed save must not display a successful result.

⸻

18. HISTORICAL TRANSFER AUDIT

Mandatory Additional Recommendation

Before enabling bulk transfer correction, perform a read-only audit of existing financial records from April 2026 onward.

Identify:

A. Transfers Incorrectly Classified as Expenses

Transactions representing movement between owned accounts but currently counted as expenditure.

B. Transfers Incorrectly Classified as Income

Incoming transfers from owned accounts currently counted as income.

C. Duplicate Transfer Records

Multiple logical transfer records representing the same financial movement.

D. Multiple Transfer Links

A statement entry linked to more than one incompatible transfer.

E. Unmatched Transfers

Source debits without identified destination credits, and vice versa.

F. Account Mapping Errors

Transfers linked to incorrect source or destination accounts.

G. Balance Differences

Potential inconsistencies between account balances and imported statement balances.

H. Currency Differences

Cross-currency transfers with missing or inconsistent recorded conversion information.

⸻

19. HISTORICAL AUDIT REPORT

Produce a report containing:

* Transaction reference.
* Date.
* Masked source account.
* Masked destination account.
* Amount.
* Current financial type.
* Suggested financial type.
* Identified issue.
* Proposed correction.
* Confidence.
* Expected financial impact.

Allow users to select multiple verified corrections.

Do not automatically rewrite historical financial records.

Require preview and confirmation before applying material corrections.

⸻

20. MULTI-CURRENCY TRANSFERS

Support transfers between accounts holding different currencies.

Preserve:

* Original debit amount.
* Original credit amount.
* Original currencies.
* Recorded exchange rate.
* Transfer fees, where available.
* Relevant reference information.

Do not automatically assume that differences between the two values are expenses.

Exchange differences and fees must follow Ledgerline’s established accounting treatment.

⸻

21. TRANSACTION PREVIEW

Before saving a correction, display:

Original Transaction

* Financial type.
* Account.
* Amount.
* Category.
* Organisation.

Proposed Correction

* New financial type.
* Source account.
* Destination account or external recipient.
* Updated category.
* Relevant relationships.

Financial Impact

* Income impact.
* Expense impact.
* Account balance impact.
* Liability/receivable impact.
* Reconciliation status.

The preview must reflect the existing posting state.

Do not display an additional debit or credit where none will be created.

⸻

22. iPHONE, iPAD AND DESKTOP SUPPORT

iPhone

* Compact transaction cards.
* Guided financial type selection.
* Searchable account and recipient selectors.
* Clear confirmation actions.
* No unnecessary fields.

iPad

* Transaction list on the left.
* Classification and reconciliation details on the right.
* Bulk selection.
* Preview panel.
* Proper portrait and landscape layouts.

Desktop

* Structured financial transaction table.
* Side correction panel.
* Multi-selection.
* Bulk review.
* Keyboard support.

All devices must display consistent financial results.

⸻

23. PROCESSING AND SAVE STATUS

Display clear states:

* Analysing Transaction.
* Searching for Matching Transfer.
* Checking Existing Records.
* Preparing Correction.
* Saving.
* Reconciled.
* Needs Review.
* Failed — Retry.

Prevent repeated confirmation while a save is in progress.

Do not leave the interface appearing frozen.

⸻

24. TESTING REQUIREMENTS

Test:

1. Ordinary UPI expense.
2. Payment to an external merchant.
3. Payment to another individual.
4. Loan given to another individual.
5. Advance given.
6. Internal transfer between two owned accounts.
7. Transfer with only one statement available.
8. Transfer with two matching statement entries.
9. Multiple possible matching transfers.
10. Identical amounts belonging to unrelated transactions.
11. Transfer already recorded.
12. Repeated confirmation.
13. Failed linking operation.
14. Duplicate statement import.
15. Credit card bill payment.
16. Loan repayment.
17. Refund.
18. Reimbursement.
19. Multi-currency transfer.
20. Transfer fees.
21. Bulk classification.
22. Historical correction.
23. Financial Inbox status update.
24. Account balance reconciliation.
25. Consolidated income and expense verification.
26. iPhone layout.
27. iPad portrait and landscape.
28. Desktop layout.

⸻

25. REQUIRED ACCEPTANCE DEMONSTRATIONS

Demonstration A — Ordinary Expense

A ₹4,500 UPI payment to an external merchant must be saved as an expense without requiring an owned receiving account.

Demonstration B — Internal Transfer

₹50,000 transferred between two owned bank accounts.

Expected:

* One logical transfer.
* Two preserved statement entries.
* No additional debit or credit postings when both entries are already recorded.
* No income inflation.
* No expense inflation.

Demonstration C — AMEX Settlement

₹2,50,000 paid towards AMEX.

Expected:

* Correct bank movement.
* Correct card liability treatment.
* No duplicated expenditure.

Demonstration D — Third-Party Loan

₹25,000 paid to another individual as a loan.

Expected:

* Correct source account movement.
* Loan/receivable treatment.
* No ordinary expense classification.

Demonstration E — Historical Audit

Identify and report existing duplicate or incorrectly classified transfers without automatically modifying them.

⸻

26. DEVELOPMENT PRIORITY

Priority 1 — Critical Corrections

1. Correct transaction-type forms.
2. Fix expense categorisation.
3. Enable external recipients.
4. Correct validation and saving.

Priority 2 — Safe Transfers

5. One authoritative transfer record.
6. Safe matching.
7. Atomic linking.
8. Duplicate prevention.
9. One-sided transfer handling.

Priority 3 — Financial Integrity

10. Credit card settlement verification.
11. Loan and advance treatment.
12. Historical transfer audit.
13. Account reconciliation.

Priority 4 — Usability

14. Bulk classification.
15. Guided correction.
16. Responsive layouts.
17. Processing feedback.

Priority 5 — Verification

18. Financial regression testing.
19. Database preservation.
20. Security review.
21. Production readiness assessment.

⸻

27. STRICT DEVELOPMENT RESTRICTIONS

Do not:

* Rebuild Ledgerline.
* Delete existing financial records.
* Replace the shared ledger.
* Create duplicate transfer postings.
* Duplicate credit card expenses.
* Automatically rewrite historical transactions.
* Invent missing statement entries.
* Link uncertain transactions without appropriate confirmation.
* Break existing reports.
* Reset account or organisation mappings.
* Deploy changes to the live application.
* Activate paid infrastructure without approval.

Preserve all existing transactions, statements, accounts, cards, permissions and financial calculations.

Any necessary migration must include a verified backup and rollback plan.

⸻

28. REQUIRED COMPLETION REPORT

Lovable must provide:

1. Root cause of the classification defects.
2. Corrected transaction form behaviour.
3. External recipient configuration.
4. Transfer data-model changes.
5. Safe transfer-linking demonstration.
6. Duplicate prevention test results.
7. Historical transfer audit findings.
8. Account reconciliation results.
9. Financial impact verification.
10. Bulk classification results.
11. iPhone testing.
12. iPad testing.
13. Desktop testing.
14. Existing data preservation confirmation.
15. Outstanding defects.
16. Preview link.
17. Confirmation that production remains unchanged.

Do not declare completion merely because the interface renders or the application compiles.

The actual financial workflow must be verified.

⸻

29. FINAL RECOMMENDATIONS

Adopt the following preferred approach:

Recommendation 1 — Classify the Financial Purpose First

The selected transaction type must determine which fields are displayed.

Recommendation 2 — Separate External Recipients From Owned Accounts

A third-party payee must not be treated as one of the user’s bank accounts.

Recommendation 3 — One Logical Transfer

An internal transfer must be represented by one authoritative transfer record linked to its source and destination statement entries.

Recommendation 4 — Prevent Duplicate Financial Effects

Transfer reconciliation must never create additional postings for statement movements already recorded.

Recommendation 5 — Support Incomplete Statement Coverage

Allow pending one-sided transfers until the matching statement becomes available.

Recommendation 6 — Audit Existing Transactions

Identify historical misclassifications before applying corrections.

Recommendation 7 — Preserve Financial Traceability

Every correction must retain the original statement information and an audit trail.

Recommendation 8 — Make Bulk Review Practical

Users must be able to classify and reconcile multiple compatible transactions in a guided workflow.

Recommendation 9 — Verify Financial Totals

Account balances, liabilities, receivables, income and expenditure must reconcile after corrections.

Recommendation 10 — Do Not Deploy Without Approval

Complete all implementation and testing in an approved development or preview environment.

⸻

30. FINAL DEVELOPMENT INSTRUCTION

Correct Ledgerline’s existing Financial Inbox transaction classification and transfer reconciliation systems.

Introduce transaction-type-aware forms, external recipient support, safe internal transfer recording, duplicate prevention and reliable financial reconciliation.

Integrate these capabilities with existing accounts, cards, organisations, statement imports, Universal Expense Entry and the shared financial ledger.

Perform a complete read-only diagnostic audit of historical transfers beginning 1 April 2026.

Present proposed corrections and their financial effects before modifying historical records.

Preserve all existing data, calculations, permissions and functionality.

Do not deploy changes to the live application without explicit approval.

FINAL PRINCIPLE

ONE FINANCIAL MOVEMENT. CORRECT CLASSIFICATION. NO DOUBLE COUNTING. COMPLETE TRACEABILITY.

End of Ledgerline Version 5.10.3 Development Requirements.