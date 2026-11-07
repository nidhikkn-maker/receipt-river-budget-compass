# LEDGERLINE
## Version 5.9.2 — Financial Inbox Complete User Experience Redesign

**Project:** Existing Ledgerline Application  
**Development Type:** UI/UX Redesign, Bulk Review Workflow and Financial Inbox Audit  
**Priority:** Critical  
**Platforms:** iPhone, iPad and Desktop  
**Deployment:** Development/Preview Only

---

# 1. Objective

Completely redesign the current Financial Inbox interface.

The existing page is excessively long, technically complicated and difficult to operate.

Multiple selection controls, correction dropdowns, status summaries, notifications and transaction details are combined into one screen without a clear workflow.

Replace the current layout with a simple, guided Financial Review Centre.

Preserve all existing financial records, classifications, review items and reconciliation functionality.

---

# 2. Recommended Navigation

Separate the current Financial Inbox into three main views.

### A. Financial Inbox — Overview

Display:

- Items requiring attention.
- Ready-to-review statement imports.
- Account reconciliation warnings.
- Reimbursement exceptions.
- Financial reminders.

### B. Transaction Review

A dedicated screen for reviewing and correcting financial transactions.

### C. Accounts Check

A dedicated screen for statement reconciliation and balance verification.

Do not place the full transaction review table and account reconciliation forms on the Inbox overview page.

---

# 3. Simplified Financial Inbox Overview

The main page should answer three questions:

1. What needs attention?
2. What can Ledgerline resolve automatically?
3. What requires my decision?

Display compact cards for:

- Categorisation Required.
- Missing Information.
- Financial Type Confirmation.
- Account Reconciliation.
- Possible Duplicates.
- Reimbursement Issues.

Each card must open the relevant filtered review screen.

Keep ready-to-review statement imports and generated report notifications in separate, clearly named sections.

---

# 4. Accurate Counts

The supplied screenshots show:

- 412 review items.
- 265 transactions in Financial Review.
- 91 requiring categories.
- 169 missing information.
- 5 requiring transaction type confirmation.

These numbers require an audit.

Determine whether:

- Counts represent unique transactions.
- One transaction has multiple issues.
- Some counts include reminders.
- Some issues remain after their underlying records have been corrected.

Display unique transaction counts separately from issue counts.

Never imply that different issue categories are mutually exclusive if transactions can appear in more than one.

Correct contradictory empty states such as:

**412 Open Issues**

followed by:

**No Other Reminders**

---

# 5. Transaction Review Layout

Create a dedicated Transaction Review page with:

### Top Area

- Page title.
- Pending transaction count.
- Filters.
- Search.
- Selection controls.

### Main Area

- Transaction list.
- Suggested correction.
- Confidence and reason.
- Review status.

### Action Area

- Apply category.
- Assign organisation.
- Correct account.
- Confirm financial type.
- Link trip/project.
- Mark recurring.

### Detail Area

Display the selected transaction or bulk selection summary.

Do not show 'No transaction selected' when bulk selections exist.

---

# 6. Mandatory Select Options

Introduce one clearly labelled **Select** control.

Options:

1. Select All Visible.
2. Select All Matching Current Filters.
3. Select Current Merchant Group.
4. Select Current Page.
5. Clear Selection.

Do not ambiguously label a filtered selection as simply 'Select All'.

When the matching set is larger than the visible page, explain exactly how many records will be selected.

Example:

**Select all 91 matching transactions?**

Display the selected count prominently.

Selection must persist while the user scrolls or opens transaction details, unless intentionally cleared.

---

# 7. Bulk Action Bar

When at least one transaction is selected, display a persistent bulk action bar.

Example:

**5 Transactions Selected**

Actions:

- Categorise.
- Assign Organisation.
- Change Financial Type.
- Link Account.
- Link Activity.
- More Actions.
- Clear Selection.

Provide a prominent:

**Review & Apply**

button after a correction is chosen.

Disable actions only when they are genuinely inapplicable.

When disabled, explain the exact reason and offer the next required action.

---

# 8. Guided Correction Workflow

Replace the existing scattered dropdowns and preview controls.

Use:

### Step 1 — Select Transactions

Choose individual transactions or an entire matching group.

### Step 2 — Choose an Action

Example:

Assign Category.

### Step 3 — Set Values

Choose the relevant category and any applicable organisation or activity.

### Step 4 — Preview

Display:

- Number of affected transactions.
- Proposed changes.
- Financial impact.
- Conflicts.
- Excluded transactions.

### Step 5 — Confirm

Provide:

**Apply to Selected Transactions**

After confirmation:

- Save the changes.
- Update financial records.
- Recalculate affected review items.
- Show success or partial-failure details.
- Refresh counts.

Do not require the user to visit each transaction individually after successful bulk classification.

---

# 9. Merchant-Based Review

Introduce an optional grouped view.

Example:

**Grab — 12 transactions**

Suggested category:

Local Transport.

Actions:

- Select Group.
- Apply Category.
- Change Category.
- Review Individually.

Provide merchant groups only when the underlying transactions are sufficiently similar.

Different financial types or organisation responsibilities must be separated where necessary.

Do not assume all transactions with the same merchant have the same purpose.

---

# 10. Missing Information Review

Do not combine all missing-information transactions into one undifferentiated group.

Group by missing field:

- Missing Account.
- Missing Organisation.
- Missing Financial Type.
- Missing Category.
- Missing Activity Link.
- Missing Payment Details.
- Other Required Information.

Prioritise fields that can be recovered from the original bank statement or existing account configuration.

Do not ask the user to re-enter information already available in verified records.

Provide bulk correction where safe.

---

# 11. Intelligent Suggestions

Use existing:

- Account directory.
- Organisation mapping.
- Card mapping.
- Merchant rules.
- Statement data.
- Trip/project associations.
- Recurring payment configuration.

Show suggestions with:

- Proposed classification.
- Confidence.
- Reason.
- Supporting information.

The user must be able to confirm or reject suggestions.

Do not post uncertain classifications automatically.

---

# 12. iPad Layout Redesign

The supplied screenshots show excessive vertical scrolling and poor use of horizontal space.

Provide a proper iPad layout.

### Landscape

Use a two-panel review interface:

**Left — Transaction List**

- Merchant.
- Date.
- Amount.
- Suggested category.
- Selection checkbox.

**Right — Review Panel**

- Selected transaction details.
- Missing information.
- Proposed correction.
- Preview.
- Confirm action.

When multiple transactions are selected, replace individual details with the bulk action summary.

### Portrait

Use a responsive single-column or compact two-column layout depending on available width.

### Additional Requirements

Support:

- Split View.
- Stage Manager.
- External keyboard.
- Trackpad.
- Touch gestures.
- Adaptive text and controls.

Do not rely solely on screen-size labels; adapt to the available window width.

---

# 13. iPhone Layout

Use:

- Transaction cards.
- Compact filters.
- Clear checkboxes.
- Sticky selection summary.
- Bottom-sheet correction forms.
- Dedicated preview screen.

Avoid wide financial tables and horizontal page scrolling.

Ensure the fixed bottom navigation does not cover actions.

---

# 14. Desktop Layout

Use a structured table and side review panel.

Support:

- Search.
- Sorting.
- Multiple selection.
- Bulk actions.
- Merchant grouping.
- Keyboard navigation.
- Responsive panel widths.

---

# 15. Remove Unnecessary Clutter

The following must not be permanently expanded on the main review page:

- Classification rule management.
- Merchant batch configuration.
- Account correction forms.
- Receiving-account correction forms.
- Advanced confidence filters.
- Financial reminders.

Move advanced options into contextual drawers or dedicated Settings screens.

Present only the actions relevant to the current task.

---

# 16. Financial Safety

Maintain the existing shared ledger.

Mandatory rules:

1. No duplicate expenses.
2. No duplicate imported transactions.
3. Transfers remain separate from expenses.
4. Credit card bill payments do not duplicate spending.
5. Account ownership is preserved.
6. Organisation allocation is verified.
7. Existing transaction amounts are unchanged unless explicitly corrected.
8. Bulk actions require preview and confirmation.
9. Every applied change is traceable.
10. Failed bulk operations must identify which records succeeded and failed.

---

# 17. Correct Review Item Lifecycle

A review item must clear when its underlying issue is genuinely resolved.

Do not simply hide the item after a checkbox selection.

Distinguish:

- Selected.
- Correction Proposed.
- Correction Applied.
- Resolved.
- Still Requires Information.

If one transaction has several unresolved issues, resolving its category must not incorrectly mark the entire transaction complete.

---

# 18. Testing Requirements

Test with the existing review data in a safe environment.

Required scenarios:

1. Select one transaction.
2. Select multiple transactions.
3. Select all visible.
4. Select all matching filtered records.
5. Select merchant group.
6. Clear selection.
7. Change category.
8. Change organisation.
9. Change financial type.
10. Correct source account.
11. Link receiving account.
12. Apply a mixed-validity bulk selection.
13. Preview changes.
14. Confirm changes.
15. Cancel before confirmation.
16. Interrupt saving.
17. Retry a failed operation.
18. Verify review counts.
19. Verify financial totals.
20. Verify iPhone layout.
21. Verify iPad landscape.
22. Verify iPad portrait.
23. Verify desktop layout.
24. Verify no historical data loss.
25. Verify no production changes.

---

# 19. Completion Requirements

Lovable must demonstrate:

- Clear Select All functionality.
- Accurate selected counts.
- A working bulk action bar.
- Guided correction and preview.
- Accurate review status updates.
- Merchant-group categorisation.
- Responsive iPad interface.
- No clipped fields or wasted space.
- Financial reconciliation.
- Preserved existing data.

Provide before-and-after screenshots and a functional test report.

---

# 20. Final Development Instruction

Redesign the Financial Inbox into a clean, guided and practical financial review interface.

The user must be able to select multiple transactions, choose an appropriate correction, preview the consequences and confirm the changes in one clear workflow.

Reduce unnecessary forms, duplicate controls and excessive scrolling.

Preserve the existing financial ledger and historical records.

Complete implementation and testing in the development environment.

**Do not deploy to the live application without approval.**

### FINAL PRINCIPLE

**SELECT. REVIEW. APPLY. DONE.**

**End of Ledgerline Version 5.9.2 Development Requirements.**