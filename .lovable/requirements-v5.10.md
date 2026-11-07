# LEDGERLINE
## Version 5.10 — Intelligent Financial Inbox & Bulk Transaction Resolution

### Final Comprehensive Development Requirements for Lovable

**Project:** Existing Ledgerline Application  
**Development Type:** Complete Financial Inbox UI/UX Redesign, Intelligent Review and Workflow Enhancement  
**Priority:** Critical  
**Platforms:** iPhone, iPad and Desktop  
**Deployment:** Development/Preview Only

---

# 1. OBJECTIVE

Completely redesign the existing Ledgerline Financial Inbox into a simple, intelligent and efficient financial review system.

The current interface is unnecessarily complicated, contains too many controls and requires excessive scrolling.

Users should be able to:

1. Understand what requires attention.
2. Select multiple transactions easily.
3. Select all applicable transactions.
4. Group similar transactions.
5. Review suggested corrections.
6. Apply corrections in bulk.
7. Automatically reuse confirmed classifications.
8. Resolve missing information.
9. Identify transfers and card settlements.
10. Reconcile accounts.
11. Track progress.
12. Complete historical financial classification with minimum manual intervention.

The redesigned system must retain the complete existing financial database and functionality.

---

# 2. CURRENT PROBLEMS

The supplied screenshots demonstrate:

- 412 items requiring review.
- 265 transactions in Financial Review.
- 91 transactions requiring categorisation.
- 169 transactions requiring missing information.
- Five requiring financial type confirmation.
- Excessive scrolling.
- Inconsistent selection behaviour.
- Confusing bulk action controls.
- Repeated Miscellaneous classifications.
- Incomplete organisation mapping.
- Poor use of iPad screen space.
- Unclear status updates.
- Inconsistent issue counts.
- No clear guidance on what action to perform next.

These problems must be addressed as one coordinated redesign.

---

# 3. FINANCIAL INBOX INFORMATION ARCHITECTURE

Separate the existing page into three distinct views.

## A. Financial Inbox — Overview

Purpose:

Show the user what requires attention.

## B. Transaction Review Centre

Purpose:

Review, categorise and correct transactions.

## C. Account Reconciliation

Purpose:

Verify statement imports, account balances and transaction matching.

The main Financial Inbox should not contain the full forms and tables of all three functions.

---

# 4. FINANCIAL INBOX OVERVIEW

Display a simple dashboard.

### Summary Cards

- Transactions Needing Review.
- Categorisation Required.
- Missing Information.
- Financial Type Confirmation.
- Possible Duplicates.
- Accounts Needing Reconciliation.

Each card must open the corresponding filtered review.

### Additional Sections

**Statement Imports**

Show new statements ready for review.

**Reports & Notifications**

Show generated reports and relevant completion notices.

**Other Financial Reminders**

Keep separate from transaction correction tasks.

Do not combine report notifications, transaction issues and account warnings into one unexplained count.

---

# 5. CLEAR REVIEW COUNTS

Differentiate:

- Unique transactions requiring attention.
- Total unresolved issues.
- Transactions with multiple issues.
- Resolved transactions.
- Pending statement imports.

One transaction may have several issues.

Example:

A transaction may simultaneously have:

- Missing category.
- Unknown organisation.
- Unconfirmed account.

Resolving its category must not incorrectly remove its remaining issues.

The displayed totals must remain mathematically consistent.

---

# 6. TRANSACTION REVIEW CENTRE

Introduce a dedicated page:

**Financial Inbox → Review Transactions**

### Recommended Layout

**Header**

- Transaction Review.
- Number requiring attention.
- Search.
- Filters.
- Select control.

**Main Content**

- Transactions.
- Suggested classifications.
- Issue status.

**Review Panel**

- Selected transaction details.
- Missing information.
- Recommended corrections.

**Action Area**

- Bulk correction.
- Preview.
- Confirm.

Avoid permanently displaying advanced configuration controls.

---

# 7. MANDATORY SELECTION SYSTEM

Introduce a clearly visible **Select** control.

### Selection Options

1. Select All Visible.
2. Select All Matching Current Filters.
3. Select Current Merchant Group.
4. Select Current Page.
5. Clear Selection.

The user must understand the exact scope of each selection.

### Example

Current filter:

Categorisation Required.

Matching transactions:

91.

Selecting **Select All Matching** should display:

**91 Transactions Selected**

The selection must not be limited to the first visible rows unless the user specifically chooses Select All Visible or Select Current Page.

### Important

Bulk selection must work correctly with pagination or incremental loading.

Selection must be based on stable transaction identifiers.

Do not rely only on currently rendered table rows.

---

# 8. SELECTED TRANSACTION SUMMARY

Once one or more transactions are selected, show a prominent selection summary.

### Example

**12 Transactions Selected**

- Total selected amount.
- Accounts involved.
- Organisations involved.
- Financial types.
- Missing information.
- Conflicts requiring attention.

The combined amount must be labelled as a selected transaction total, not automatically treated as expenditure.

The summary should remain visible while scrolling.

### Actions

- Categorise.
- Assign Workspace.
- Assign Organisation.
- Correct Financial Type.
- Link Account.
- Link Trip/Project.
- Mark Recurring.
- Clear Selection.

If an action is unavailable, explain why.

---

# 9. GUIDED BULK CORRECTION

Use a simple workflow.

## STEP 1 — SELECT

Select transactions individually or in groups.

## STEP 2 — CORRECT

Choose the action.

Examples:

- Assign Category.
- Assign Organisation.
- Correct Financial Type.
- Link Receiving Account.
- Confirm Payment Source.

## STEP 3 — REVIEW & CONFIRM

Show:

- Selected transaction count.
- Proposed changes.
- Excluded transactions.
- Financial consequences.
- Warnings.
- Remaining unresolved issues.

Primary action:

**Confirm & Apply Changes**

Secondary action:

**Cancel**

After successful confirmation:

- Save corrections.
- Update affected ledger classifications.
- Recalculate review status.
- Refresh pending counts.
- Show a completion summary.

Do not require individual confirmation for each transaction when a safe bulk action has been approved.

---

# 10. BULK CATEGORY ASSIGNMENT

Users should be able to classify multiple transactions together.

### Example

Selected Merchant Group:

Grab.

Transactions:

12.

Suggested Category:

Local Transport.

Actions:

- Apply Suggested Category.
- Choose Another Category.
- Review Individually.

### Important

Do not assume that all transactions from the same merchant have the same financial purpose.

Where the classification is ambiguous, separate those transactions for review.

---

# 11. MERCHANT GROUPING

Introduce a merchant-based review option.

Group transactions by:

- Normalised merchant name.
- Available merchant identifiers.
- Payment references.
- Account.
- Transaction characteristics.

Display:

- Merchant name.
- Transaction count.
- Total transaction value.
- Suggested category.
- Confidence.
- Action required.

### Actions

- Select Group.
- Apply Category.
- Assign Organisation.
- Save Merchant Rule.
- Review Transactions.

Merchant grouping must preserve the original statement narration.

---

# 12. LEARNED CLASSIFICATION RULES

When a user confirms a classification, allow Ledgerline to remember it.

### Example

Merchant:

Recurring Software Provider.

Confirmed Category:

Software Subscription.

Organisation:

KRNA Enterprises.

### Options

- Apply Once.
- Remember for This Merchant.
- Remember for This Account.
- Remember for This Organisation.
- Remember with Specific Conditions.

Rules must be editable under:

**Settings → Transaction Classification Rules**

Avoid broad rules that incorrectly classify unrelated payments.

---

# 13. MISSING INFORMATION RESOLUTION

Group transactions according to what is actually missing.

### Groups

- Missing Category.
- Missing Account.
- Missing Organisation.
- Missing Financial Type.
- Missing Payment Method.
- Missing Activity Link.
- Other Required Details.

The system must first attempt to recover information from:

- Original statement.
- Configured account.
- Card mapping.
- Organisation directory.
- Existing merchant rules.
- Confirmed activity relationships.

Do not ask users to enter details already available in existing verified records.

---

# 14. ACCOUNT AND TRANSACTION TYPE CORRECTIONS

Move complex account correction controls into a dedicated action.

### Supported Corrections

- Expense.
- Income.
- Transfer.
- Credit Card Settlement.
- Loan Repayment.
- Investment Contribution.
- Refund.
- Reimbursement.
- Other Financial Movement.

### Example

Transaction:

AMEX Card Bill Payment.

Ledgerline should suggest:

**Credit Card Settlement**

Then ask the user to confirm the appropriate card account when necessary.

Do not classify the payment as a new expense.

---

# 15. AUTOMATIC CARD PAYMENT MATCHING

Integrate with configured credit cards.

When a potential card settlement is identified:

1. Identify the sending account.
2. Identify the possible receiving card.
3. Search for corresponding statement activity.
4. Check matching references, dates and amounts.
5. Suggest settlement treatment.
6. Require confirmation if uncertain.
7. Preserve the original ledger records.

A card payment must not duplicate expenses originally incurred using the card.

---

# 16. ORGANISATION AND WORKSPACE MAPPING

Use the central configuration system developed under Version 5.8.

Transactions should inherit appropriate suggestions from:

- Account ownership.
- Confirmed merchant rules.
- Associated organisation.
- Project or trip.
- Existing reimbursement configuration.

### Important

Account ownership and expense responsibility must remain separate.

Example:

Personal AMEX payment for AET expenditure.

The financial account remains personal.

The expense responsibility may belong to AET.

Do not reassign the legal ownership of the account.

---

# 17. INTELLIGENT RECURRING PAYMENT IDENTIFICATION

Integrate with Recurring Payments.

Identify:

- Subscriptions.
- EMIs.
- Insurance premiums.
- Repeated merchant payments.
- Possible unknown recurring charges.

Allow users to confirm and save recurring profiles.

Do not generate duplicate expenses from recurring schedules.

---

# 18. REVIEW STATUS LIFECYCLE

Use clear states:

- Needs Review.
- Suggested Correction.
- Selected.
- Awaiting Confirmation.
- Correction Applied.
- Partially Resolved.
- Resolved.
- Unable to Resolve.

### Rules

A checkbox only selects a transaction.

It does not automatically mark the transaction resolved.

An issue becomes resolved only when its underlying condition has been corrected and verified.

Where one transaction contains multiple issues, maintain the remaining unresolved issues.

---

# 19. AUTOMATIC STATUS UPDATES

After applying corrections:

- Update the underlying transaction.
- Update linked review issues.
- Refresh group counts.
- Update the transaction status.
- Update Financial Inbox totals.

Do not require the user to manually reload the page.

If saving fails, display:

**Unable to Save — Retry**

Do not silently discard changes.

---

# 20. OTHER REMINDERS CORRECTION

Audit the current reminder counts.

The screenshots display:

**412 Open Issues**

while the Other Reminders section may state:

**No Other Reminders**

Determine whether these represent different datasets.

Rename or separate the counts so that the interface is accurate.

Do not generate duplicate reminders for the same unresolved issue.

Resolved issues must not continue appearing as new reminders.

---

# 21. iPAD INTERFACE REDESIGN

**iPad optimisation is mandatory.**

The supplied screenshots show excessive unused space and long transaction lists.

### Landscape Layout

Use two main panels.

**Left Panel — Transaction Review**

- Search.
- Filters.
- Selection.
- Transaction list.
- Suggested categories.

**Right Panel — Details and Actions**

- Selected transaction details.
- Bulk selection summary.
- Proposed corrections.
- Preview.
- Confirm button.

### Portrait Layout

Adapt to the available width.

Use:

- Compact transaction list.
- Expandable details.
- Accessible action toolbar.

### Additional Requirements

Support:

- Split View.
- Stage Manager.
- External keyboard.
- Trackpad.
- Touchscreen selection.
- Responsive resizing.

Do not simply scale the desktop page down.

---

# 22. iPHONE INTERFACE

Use:

- Compact transaction cards.
- Searchable filters.
- Clear checkboxes.
- Sticky bulk action bar.
- Bottom-sheet correction forms.
- Dedicated confirmation view.

Avoid wide tables.

Ensure the bottom navigation does not obstruct review actions.

Do not open the keyboard automatically.

---

# 23. DESKTOP INTERFACE

Use a structured table with:

- Select.
- Date.
- Merchant.
- Account.
- Amount.
- Financial Type.
- Category.
- Organisation.
- Status.

Allow:

- Sorting.
- Filtering.
- Multi-selection.
- Merchant grouping.
- Bulk corrections.
- Keyboard shortcuts where appropriate.

Keep financial details readable without excessive horizontal scrolling.

---

# 24. PROCESSING FEEDBACK

Every meaningful action must display its status.

Examples:

- Selecting…
- Analysing Transactions…
- Preparing Suggestions…
- Applying Changes…
- Saving…
- Completed.
- Failed — Retry.

Users must never be left wondering whether Ledgerline is processing their request.

Prevent repeated taps from creating duplicate operations.

---

# 25. SAVE AND RESUME

Preserve unfinished review selections and correction drafts where appropriate.

If the user leaves the page:

- Preserve saved corrections.
- Restore unfinished review context when supported.
- Do not duplicate transactions.
- Do not silently apply unconfirmed changes.

Draft status must be clearly distinguished from confirmed financial changes.

---

# 26. FINANCIAL INTEGRITY

Mandatory rules:

1. Preserve all original statement records.
2. Preserve original transaction dates and amounts.
3. Do not duplicate imported transactions.
4. Do not double-count credit card payments.
5. Do not inflate income using transfers.
6. Do not incorrectly count reimbursements as income.
7. Preserve loan and investment classifications.
8. Maintain accurate workspace allocations.
9. Maintain accurate organisation allocations.
10. Preserve historical currency conversion rates.
11. Do not overwrite confirmed user corrections with automatic suggestions.
12. Maintain an audit trail of bulk changes.

---

# 27. COMPLETE TESTING PLAN

Test using a safe copy of existing Financial Inbox records.

### Selection

1. Select one transaction.
2. Select multiple transactions.
3. Select all visible.
4. Select all matching.
5. Select merchant group.
6. Clear selection.
7. Preserve selection while scrolling.

### Bulk Actions

8. Assign category.
9. Assign organisation.
10. Change financial type.
11. Correct source account.
12. Link receiving account.
13. Link trip/project.
14. Save recurring rule.
15. Preview changes.
16. Confirm changes.
17. Cancel changes.

### Financial Integrity

18. AMEX settlement.
19. Internal transfer.
20. Loan EMI.
21. Refund.
22. Reimbursement.
23. Mixed-organisation transactions.
24. Potential duplicate.
25. Missing account details.

### Interface

26. iPhone portrait.
27. iPad portrait.
28. iPad landscape.
29. Split View.
30. Stage Manager.
31. Desktop browser.
32. External keyboard.
33. No hidden buttons.
34. No horizontal page overflow.
35. No unnecessary scrolling.

### Reliability

36. Interrupted save.
37. Repeated confirmation.
38. Partial bulk failure.
39. Page reload.
40. Cross-device refresh.
41. Pending count recalculation.
42. Reminder count reconciliation.

---

# 28. REQUIRED ACCEPTANCE DEMONSTRATION

Before completion, Lovable must demonstrate the following using safe test copies of existing records.

### Scenario A — Bulk Category Assignment

1. Open Categorisation Required.
2. Select all matching transactions.
3. Group by merchant.
4. Apply classifications.
5. Preview.
6. Confirm.
7. Verify updated review counts.

### Scenario B — AMEX Settlements

1. Select the relevant card-payment transactions.
2. Identify the payment sources.
3. Select the correct AMEX account.
4. Preview settlement treatment.
5. Confirm verified matches.
6. Verify that expenses are not duplicated.

### Scenario C — Missing Information

1. Open Missing Information.
2. Group by missing field.
3. Automatically recover available statement details.
4. Apply confirmed mappings in bulk.
5. Leave uncertain transactions for review.

### Scenario D — iPad Usability

Demonstrate the complete process in iPad landscape and portrait modes.

The user must be able to complete a bulk correction without excessive scrolling or searching for hidden actions.

---

# 29. DEVELOPMENT PRIORITY

### Priority 1 — Core Usability

- Financial Inbox separation.
- Clear selection controls.
- Select All Matching.
- Sticky bulk action bar.
- Guided correction workflow.
- Correct counts.

### Priority 2 — Intelligent Assistance

- Merchant grouping.
- Learned rules.
- Account mapping.
- Organisation mapping.
- Missing information recovery.

### Priority 3 — Financial Processing

- Transfer identification.
- Credit card settlement matching.
- Recurring payment matching.
- Duplicate protection.

### Priority 4 — Responsive Experience

- iPhone.
- iPad.
- Desktop.
- Accessibility.
- Performance.

### Priority 5 — Audit

- Financial reconciliation.
- Existing data preservation.
- Security.
- Regression testing.
- Completion report.

---

# 30. STRICT DEVELOPMENT RESTRICTIONS

Do not:

- Rebuild Ledgerline.
- Delete pending review items without resolving them.
- Mark unresolved records complete.
- Duplicate existing transactions.
- Alter original statement data.
- Replace the financial ledger.
- Introduce independent calculation logic.
- Automatically apply uncertain financial classifications.
- Break existing reports.
- Reset organisation or account mappings.
- Deploy to production without approval.

Any database changes must be documented and safely reversible.

---

# 31. REQUIRED COMPLETION REPORT

Lovable must provide:

1. Before-and-after UI comparison.
2. Updated Financial Inbox navigation.
3. Working selection demonstration.
4. Bulk action demonstration.
5. Merchant grouping demonstration.
6. Missing information resolution demonstration.
7. Financial reconciliation results.
8. Accurate issue-count verification.
9. iPhone testing.
10. iPad testing.
11. Desktop testing.
12. Database changes.
13. Existing data preservation confirmation.
14. Outstanding issues.
15. Preview link.
16. Confirmation that live production remains unchanged.

---

# 32. FINAL DEVELOPMENT INSTRUCTION

Redesign the existing Financial Inbox into a simple, guided and efficient Financial Review Centre.

The user must be able to identify transactions requiring attention, select individual or multiple records, apply safe bulk corrections and verify the results without navigating through numerous forms.

The interface must be intuitive enough to use without technical instructions.

Use existing financial records, configured accounts, merchant rules, organisations and Ledgerline calculation services.

Preserve all existing financial data, permissions and application functionality.

Complete functional, financial and responsive testing.

**Do not deploy to the live application without explicit approval.**

### FINAL PRINCIPLE

**SELECT EASILY. CORRECT IN BULK. VERIFY AUTOMATICALLY. FINISH FASTER.**

**End of Ledgerline Version 5.10 Development Requirements.**