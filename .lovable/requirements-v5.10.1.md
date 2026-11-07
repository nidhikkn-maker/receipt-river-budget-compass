# LEDGERLINE
## Version 5.10.1 — Transaction Classification & Third-Party Payment Correction

**Project:** Existing Ledgerline Application  
**Priority:** Critical Financial Logic and Usability Defect  
**Deployment:** Development/Preview Only

### 1. Objective

Correct the Financial Inbox classification workflow.

The current system incorrectly presents source and receiving bank account selections for ordinary expense transactions.

It also restricts receiving-account options to existing configured bank accounts, making it difficult to classify payments to external individuals and businesses.

Investigate and correct the underlying classification logic, data relationships and user interface.

### 2. Transaction-Type-Aware Forms

Display only the fields relevant to the selected financial transaction type.

**Expense**

- Payment account/card.
- Merchant or payee.
- Category.
- Workspace.
- Organisation, where applicable.
- Activity, where applicable.
- Reimbursement eligibility, where applicable.

Do not require a receiving bank account.

**Income**

- Source/payer, where known.
- Receiving account.
- Income category.
- Workspace.
- Organisation, where applicable.

**Transfer Between Own Accounts**

- Source account.
- Destination account.
- Amount.
- Date.
- Reference.

Only this transaction type should require two internally configured financial accounts.

**Third-Party Payment**

- Source account.
- External recipient.
- Purpose.
- Financial treatment.
- Category or loan/advance association, as applicable.

Support recipients who do not own a configured Ledgerline account.

**Credit Card Settlement**

- Paying bank account.
- Receiving credit card.
- Statement/payment reference.

Prevent duplicate expense recording.

**Loan or Advance**

- Source account.
- Recipient.
- Loan/advance classification.
- Related repayment or settlement information.

Do not treat loan principal or recoverable advances as ordinary expense categories.

### 3. External Recipient Directory

Introduce a reusable recipient/payee directory.

Support:

- Individual.
- Merchant.
- Business.
- Organisation.
- Other counterparty.

Store:

- Display name.
- Counterparty type.
- Available payment identifiers.
- Optional verified account details.
- Related organisation, where applicable.
- Preferred categorisation rules.

Do not require complete bank details to classify a transaction when the statement does not contain them.

Do not fabricate recipient information.

### 4. Account Mapping

Maintain a strict distinction between:

- Financial account ownership.
- Payment source.
- External counterparty.
- Expense responsibility.
- Reimbursement responsibility.

Do not list internal bank accounts as the only possible payees for third-party transactions.

### 5. Automatic Form Behaviour

When the user changes the financial type:

1. Update the form immediately.
2. Display relevant fields.
3. Hide irrelevant fields.
4. Preserve applicable user-entered information.
5. Clear or flag incompatible draft values.
6. Validate the proposed classification before saving.

Changing a financial type must not silently overwrite the confirmed original transaction.

### 6. Fix Existing Financial Inbox Classification

Investigate why categorisation is not functioning properly.

Check:

- Form validation.
- Transaction type selection.
- Source account mapping.
- Receiving account mapping.
- Category assignment.
- Organisation assignment.
- Bulk selection.
- Save operations.
- Backend persistence.
- Financial Inbox status refresh.

Determine whether incorrect required-field validation is preventing category changes.

Correct the actual defect rather than merely hiding validation errors.

### 7. Bulk Categorisation

Allow users to select multiple compatible transactions and assign:

- Financial type.
- Category.
- Workspace.
- Organisation.
- External recipient, where appropriate.
- Linked activity.

Mixed transaction types must be reviewed separately when their required fields or financial treatment differ.

Show a preview before applying changes.

### 8. Financial Integrity

Mandatory requirements:

1. Ordinary expenses must not require an internal destination account.
2. External payments must support external recipients.
3. Internal transfers must not inflate expenditure.
4. Credit card payments must not duplicate expenses.
5. Loan and advance movements must retain their appropriate treatment.
6. Original statement records must remain unchanged.
7. Confirmed financial corrections must be traceable.
8. Existing account balances and reports must reconcile.
9. No duplicate ledger records may be created.

### 9. Responsive Interface

Apply the corrected workflow across:

- iPhone.
- iPad portrait.
- iPad landscape.
- Desktop.

Use a compact, guided classification panel.

Avoid permanently displaying irrelevant account fields.

The Select → Correct → Preview → Confirm workflow must remain consistent across devices.

### 10. Testing

Verify the following cases:

1. UPI payment to a merchant.
2. NEFT payment to an external individual.
3. Payment to a business supplier.
4. Transfer between two owned bank accounts.
5. Payment towards AMEX card dues.
6. Personal expense.
7. Business expense.
8. Official expense paid personally.
9. Loan to another individual.
10. Recoverable advance.
11. Incoming reimbursement.
12. Unknown counterparty.
13. Bulk category assignment.
14. Changing the transaction type.
15. Saving and reopening a corrected transaction.
16. Correct Financial Inbox issue closure.
17. No duplicate expenses.
18. Accurate account reconciliation.

### 11. Required Completion Report

Lovable must provide:

- Root cause of the existing classification defect.
- Corrected transaction-type rules.
- Updated form behaviour.
- External recipient functionality.
- Bulk categorisation demonstration.
- Successful persistence tests.
- Financial reconciliation results.
- iPhone/iPad/desktop test results.
- Confirmation that existing data remains intact.
- Confirmation that production has not been modified.

### Final Instruction

Correct the existing Ledgerline Financial Inbox classification system so that every transaction type displays only relevant financial fields.

Support external payees and third-party transactions without requiring them to be configured as the user's own bank accounts.

Preserve the shared financial ledger, existing records and calculation rules.

**Do not deploy to production without approval.**

**Final Principle: CLASSIFY THE PURPOSE FIRST. SHOW ONLY THE RELEVANT FIELDS. RECONCILE CORRECTLY.**

**End of Ledgerline Version 5.10.1 Development Requirements.**