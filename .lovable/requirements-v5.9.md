# LEDGERLINE
## Version 5.9 — Smart Financial Inbox & Historical Transaction Auto-Resolution

### Development Requirements for Lovable

**Project:** Existing Ledgerline Application  
**Priority:** Critical — Financial Data Usability  
**Platforms:** iPhone, iPad and Desktop  
**Deployment:** Development/Preview Only

---

# 1. Objective

Redesign the existing Financial Inbox to minimise manual transaction categorisation and missing-information correction.

The current application shows approximately 198 pending financial review items.

Opening every transaction individually and manually entering its category, account, organisation and other information is not an acceptable long-term workflow.

The system should intelligently process imported bank and credit card statements, recognise financial relationships, generate proposed classifications and support safe bulk approval.

The objective is to make historical financial maintenance from 1 April 2026 practical.

---

# 2. Complete Statement Information Extraction

When a statement is uploaded, inspect all available information, including:

- Bank name.
- Statement account number or masked identifier.
- Account holder, where available.
- Statement period.
- Transaction date.
- Value date.
- Original transaction narration.
- Debit amount.
- Credit amount.
- Reference number.
- UTR or transaction identifier.
- Counterparty name.
- Counterparty account information, where provided.
- IFSC or other available payment identifiers.
- UPI information, where available.
- Opening balance.
- Closing balance.
- Running balance.

Not every bank statement provides every field.

Missing information must remain explicitly unknown.

Never invent a counterparty account number, category or payment purpose.

Associate the statement with the correct configured financial account before posting transactions.

If account ownership or identification is ambiguous, request confirmation.

---

# 3. Account and Organisation Recognition

Integrate with Version 5.8 Central Financial Configuration.

Use existing mappings to identify:

- Statement account.
- Account owner.
- Workspace defaults.
- Associated organisations.
- Payment method.
- Confirmed transaction classification rules.

Do not assume that the bank account owner and the organisation responsible for an expense are always the same.

Allow a personal account to pay expenses for different organisations.

---

# 4. Intelligent Transaction Classification

Analyse imported transactions and generate suggested financial classifications.

Supported types:

1. Income.
2. Expense.
3. Transfer between own accounts.
4. Credit card bill payment.
5. Loan repayment.
6. Investment contribution.
7. Reimbursement received.
8. Refund.
9. Recurring subscription.
10. Cash withdrawal.
11. Advance received or repaid.
12. Unidentified transaction.

Transaction type must be determined before assigning an ordinary expense category.

For example, a credit card bill settlement must not be treated as a miscellaneous expense.

---

# 5. Internal Transfer Detection

Identify possible transfers between the user's configured accounts.

Use:

- Transaction references.
- Account identifiers.
- Amount.
- Date.
- Debit/credit direction.
- Counterparty evidence.

When matching debit and credit transactions are found, suggest linking them as a transfer.

Do not automatically assume two transactions represent a transfer merely because their amounts match.

Unmatched transfers must remain reviewable.

Transfers must not inflate income or expenditure.

---

# 6. Credit Card Settlement Detection

Identify payments made towards configured credit cards.

Example from the current Financial Inbox:

**Ecom Indiaideas Amexcard Amexbillpayment — ₹2,50,000**

This is a strong candidate for a credit card settlement.

The application should:

1. Identify the possible receiving credit card.
2. Check available account and card relationships.
3. Search for a corresponding card payment or credit.
4. Suggest the appropriate settlement classification.
5. Prevent duplicated expense recording.
6. Request confirmation when evidence is incomplete.

Do not treat an unverified statement description as conclusive proof.

Credit card purchases remain expenses according to their existing ledger treatment.

Paying the card bill must not count as spending a second time.

---

# 7. Merchant and Counterparty Intelligence

Create reusable merchant and counterparty recognition rules.

For example, repeated payments to a confirmed merchant should inherit the user's approved:

- Merchant name.
- Category.
- Workspace.
- Organisation.
- Recurring payment association, where applicable.

Use reference identifiers and transaction context where available.

A generic UPI narration must not be assigned a category solely from the payment rail.

Allow users to assign categories to multiple transactions from the same confirmed merchant.

---

# 8. Smart Financial Inbox Groups

Replace the existing long list with five principal review groups.

### Group A — Ready for Bulk Approval

High-confidence proposed corrections supported by clear evidence or established user rules.

### Group B — Confirm Transaction Type

Possible transfers, card payments, loan repayments and similar transactions requiring confirmation.

### Group C — Assign Categories

Transactions with a known financial type but an unresolved category.

### Group D — Missing Information

Transactions lacking sufficient evidence for the required classification.

### Group E — Possible Duplicates and Conflicts

Transactions that may already exist or conflict with current records.

Allow users to filter by:

- Account.
- Date.
- Organisation.
- Merchant.
- Amount.
- Confidence.
- Issue type.
- Workspace.

---

# 9. Multi-Selection and Bulk Resolution

Every review group must support multiple selections.

Actions:

- Select All Visible.
- Select Matching Transactions.
- Assign Category.
- Assign Workspace.
- Assign Organisation.
- Set Financial Type.
- Link Account.
- Link Trip/Project.
- Mark Recurring.
- Confirm Suggested Changes.
- Review Later.

Provide a preview showing:

**Number of transactions affected, proposed changes and financial impact.**

Require confirmation before applying changes.

Bulk operations must be reversible through a controlled correction mechanism where practical, with an audit trail.

---

# 10. Intelligent Batch Review

Allow users to review groups instead of individual records.

Example:

**12 transactions matched to a confirmed subscription merchant**

Recommended treatment:

Software Subscription → Business → KRNA Enterprises.

Actions:

**Approve 12 | Review Individually | Change Classification**

If transactions have materially different ownership, reimbursement treatment or financial types, separate them into different groups.

Do not group transactions based solely on similar amounts.

---

# 11. Learn From User Corrections

When a user confirms a correction, Ledgerline should offer to save a reusable rule.

Example:

**Remember this classification for future matching transactions?**

Options:

- Apply Only Once.
- Remember for This Account.
- Remember for This Merchant.
- Remember for This Organisation.
- Remember With These Conditions.

Rules must be editable from Settings.

Do not blindly apply a merchant-level rule when the same merchant legitimately serves different purposes.

---

# 12. Recurring Payment Recognition

Integrate with Version 5.8 Recurring Payment Management.

When imported statements show recurring patterns:

- Suggest a recurring payment profile.
- Match existing recurring profiles.
- Identify possible unknown subscriptions.
- Detect possible amount changes.
- Identify potentially overlapping subscriptions.

Do not create duplicate financial expenses.

Recurring profiles must remain separate from the confirmed ledger transactions.

---

# 13. Reimbursement and Activity Mapping

Use configured organisation and activity relationships to suggest:

- Responsible organisation.
- Trip.
- Project.
- Event.
- Reimbursement eligibility.

A transaction paid using a personal card may be an official expense.

Payment account ownership must remain separate from expense responsibility.

Do not automatically make an expense reimbursable solely because it belongs to a Business or Official workspace.

---

# 14. Preserve Original Financial Data

For every imported transaction, retain:

- Original statement.
- Original narration.
- Original date.
- Original amount.
- Original account reference.
- Original transaction identifier.
- Import source and timestamp.
- User-confirmed classifications.
- Correction history.

Normalisation, categorisation and merchant-name cleanup must not destroy the original statement information.

---

# 15. Financial Inbox Status

Replace vague pending statuses with specific states:

- Ready for Review.
- Suggested Correction.
- Needs Information.
- Possible Duplicate.
- Confirmed.
- Unresolved.

A review item should automatically clear when its underlying issue is genuinely corrected.

Do not allow a simple **Dismiss / Resolved** action to mark a financial problem corrected when required information is still missing.

Provide a separate **Dismiss Suggestion** action, with appropriate audit history.

---

# 16. Statement Reconciliation

Before declaring an import complete, verify:

1. The correct financial account was selected.
2. The imported statement period is correct.
3. Opening and closing balances match where available.
4. Debit and credit totals reconcile.
5. Duplicated statement rows are identified.
6. Missing statement periods are disclosed.
7. Import status is accurate.
8. Existing confirmed records are preserved.

Do not use categorisation completion as proof that financial reconciliation has succeeded.

---

# 17. Responsive Interface

### iPhone

Provide:

- Compact grouped review cards.
- Searchable filters.
- Multi-select.
- Bulk action toolbar.
- Individual detail sheet.
- No horizontal page overflow.
- No fixed-navigation overlap.

### iPad

Use available screen space for:

**Left Panel:** Review groups and transaction list.

**Right Panel:** Selected transaction details, evidence and proposed corrections.

Support portrait, landscape, Split View and Stage Manager.

### Desktop

Use a full transaction review table with:

- Checkbox selection.
- Date.
- Merchant.
- Account.
- Amount.
- Financial type.
- Suggested category.
- Organisation.
- Confidence.
- Review status.

Allow sorting, filtering and bulk actions.

---

# 18. Processing and Background Jobs

Statement analysis may require significant processing time.

Display clear states:

- Uploading.
- Reading Statement.
- Extracting Transactions.
- Matching Accounts.
- Identifying Transfers.
- Classifying Transactions.
- Preparing Review.
- Completed.
- Failed — Retry.

Where persistent backend jobs are implemented, users may leave and return after a job has been accepted.

Otherwise, clearly state that the page must remain open.

Never leave the interface apparently frozen.

Prevent repeated submissions from creating duplicate imports.

---

# 19. Testing Requirements

Test with a controlled copy of the existing pending-review data.

Include:

1. Known expense.
2. Known income.
3. Personal account transfer.
4. Credit card bill settlement.
5. Loan EMI.
6. Investment contribution.
7. Refund.
8. Reimbursement receipt.
9. Recurring subscription.
10. Unknown UPI transaction.
11. Same merchant with different expense purposes.
12. Missing account identifier.
13. Duplicate import.
14. Overlapping statement dates.
15. Statement with incomplete information.
16. Multi-organisation expense.
17. Bulk classification.
18. Incorrect suggestion rejection.
19. Rule editing.
20. Reconciliation failure.

Verify that account balances, expenditure totals, income totals and card liabilities remain correct.

---

# 20. Required Acceptance Criteria

Before declaring completion:

1. The 198 pending items can be grouped by issue and suggested resolution.
2. Users can review multiple transactions simultaneously.
3. Card bill settlements are not misclassified as ordinary expenses.
4. Transfers are not counted as income or expenditure.
5. Original statement data is preserved.
6. Account ownership remains accurate.
7. Merchant rules can be reused.
8. Uncertain classifications remain reviewable.
9. Recurring payments are recognised without expense duplication.
10. Review counts update after confirmed corrections.
11. No actual financial records are silently changed.
12. iPhone, iPad and desktop layouts work correctly.
13. Statement reconciliation is independently verified.
14. Existing Ledgerline functionality remains unaffected.

---

# 21. Implementation Priority

### Priority 1

- Financial Inbox grouping.
- Account identification.
- Transaction type detection.
- Transfer and card settlement matching.
- Bulk review.

### Priority 2

- Merchant intelligence.
- Reusable rules.
- Organisation mapping.
- Recurring payment detection.

### Priority 3

- Enhanced confidence scoring.
- Historical analysis.
- Intelligent exception review.
- Advanced responsive layouts.

### Priority 4

- Full reconciliation audit.
- Regression testing.
- Performance testing.
- Production readiness report.

---

# 22. Mandatory Restrictions

Do not:

- Delete the 198 pending review items.
- Mark unresolved issues as completed.
- Automatically assign uncertain categories.
- Duplicate existing transactions.
- Rewrite original bank statements.
- Replace the shared ledger.
- Alter confirmed financial balances without validated transaction changes.
- Deploy changes to the live application.
- Activate additional paid infrastructure without approval.

Before applying a bulk operation to existing financial data, provide an exact preview of the proposed changes and affected records.

Use an approved development or preview environment and preserve rollback capability.

---

# 23. Final Development Instruction

Redesign Ledgerline's Financial Inbox into an intelligent, evidence-based bulk financial review system.

Maximise the use of information already available in uploaded bank statements, configured accounts, merchant rules, organisation settings and historic financial records.

Users should only need to review genuinely uncertain financial information.

Provide fast multi-selection, safe bulk confirmation and reusable rules.

The system must be capable of processing financial history beginning 1 April 2026 without requiring manual correction of every transaction.

Financial accuracy, traceability and data preservation are mandatory.

Do not deploy to production without explicit approval.

**FINAL PRINCIPLE:**

**READ THE STATEMENT. RECOGNISE THE TRANSACTIONS. GROUP THE EXCEPTIONS. CONFIRM IN BULK.**

**End of Ledgerline Version 5.9 Development Requirements.**