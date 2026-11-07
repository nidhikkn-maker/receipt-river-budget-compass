LEDGERLINE

Version 5.3 — Final Usability & Financial Safety Enhancements

Supplementary Development Instructions for Lovable

Project: Existing Ledgerline Application
Module: Bank Statement Import & Reconciliation
Priority: Critical
Implementation: Include within the existing Version 5.3 development programme.

⸻

1. Objective

Further refine Ledgerline’s bank and credit card statement import functionality to reduce manual work while preventing inaccurate financial records.

The following three enhancements are mandatory:

1. Safe transaction selection and approval.
2. Intelligent bulk categorisation.
3. Compact, mobile-first transaction review.

These requirements should be integrated into the existing Statement Import module.

Do not create a new import module or separate ledger.

⸻

2. Safe Transaction Selection

2.1 Current Problem

The existing import screen displays transactions marked:

Miscellaneous — check

However, these transactions may still be selected for automatic registration.

This creates a risk of inaccurate categorisation and financial reporting.

2.2 Required Change

Introduce classification-based approval eligibility.

Verified Transactions

Transactions with sufficiently reliable information and no unresolved accounting conflicts may be marked as eligible for approval.

Suggested Transactions

Transactions with proposed categories or workspaces must display the suggestions clearly.

Users should be able to confirm these individually or in groups.

Uncertain Transactions

Transactions with unresolved financial classification must remain in a review queue.

Do not automatically include them in a one-click final approval batch.

2.3 Default Selection Rules

When the import review page opens:

* Do not automatically select uncertain transactions.
* Do not automatically approve transactions.
* Clearly distinguish suggested from confirmed classifications.
* Allow users to select eligible records.
* Require explicit confirmation before ledger posting.

The label Miscellaneous — check must not be treated as a verified classification.

Users may explicitly approve Miscellaneous as the final category when appropriate.

2.4 Confirmation Summary

Before registration, show:

* Transactions selected.
* Transactions eligible.
* Transactions requiring review.
* Duplicates excluded.
* Proposed expenses.
* Proposed income.
* Transfers.
* Card settlements.
* Other transaction types.

The final action should be labelled:

Confirm & Import Selected Transactions

Avoid ambiguous actions such as Register Automatically when the operation will post actual financial records.

⸻

3. Intelligent Bulk Categorisation

3.1 Objective

Users must be able to classify multiple similar transactions through a single action.

Do not require users to open every transaction individually.

3.2 Automatic Grouping

Group transactions by:

* Merchant.
* Similar bank description.
* Account.
* Transaction direction.
* Suggested category.
* Workspace.
* Organisation.
* Recurring pattern.

3.3 Group Review

Example:

Restaurant Payments

24 transactions identified.

Suggested category: Food & Dining.

Suggested workspace: Personal.

Available actions:

* Select All.
* Exclude Selected.
* Apply Category.
* Assign Workspace.
* Add Tags.
* Confirm Classification.

3.4 Multiple Selection

Support:

* Select individual.
* Select multiple.
* Select all visible.
* Select all matching filters.
* Select merchant group.
* Select date range.
* Clear selection.

Clearly show the total selected count.

3.5 Bulk Actions

Allow users to:

* Assign category.
* Assign subcategory.
* Assign workspace.
* Assign organisation.
* Add multiple tags.
* Assign person.
* Link trip.
* Mark reimbursable.
* Confirm classifications.

Only show actions valid for the selected records.

3.6 Preview Before Applying

Before bulk changes are committed, display:

* Number of affected records.
* Previous classifications.
* New classifications.
* Records excluded.
* Potential conflicts.

Require confirmation for material changes.

3.7 Learn From User Decisions

After a user corrects a transaction, offer:

1. Apply to this transaction.
2. Apply to selected similar transactions.
3. Apply to all eligible matching transactions in this import.
4. Remember this rule for future imports.

Store reusable rules centrally.

Recommended location:

Settings → Financial Automation → Import Rules

Rules must be editable and removable.

Do not silently rewrite already confirmed historical records when a rule changes.

⸻

4. Mobile-First Statement Review

4.1 Current Problem

The existing iPhone interface displays long transaction lists within oversized cards.

Descriptions are truncated, important information is difficult to scan, and the fixed bottom navigation sometimes obscures content.

4.2 Required Layout

Replace the current long review page with focused views.

View 1 — Import Overview

Show:

* Account.
* Statement period.
* Transactions extracted.
* Ready for review.
* Needs attention.
* Duplicates.
* Already recorded.

View 2 — Transaction Groups

Display groups of similar transactions.

Show:

* Merchant.
* Transaction count.
* Total amount.
* Suggested classification.
* Review status.

View 3 — Individual Transaction Review

Open full transaction details only when selected.

View 4 — Final Confirmation

Show the financial impact of approved transactions before posting.

⸻

5. Compact Transaction Rows

Each transaction should display:

Primary Row

Merchant or shortened description.

Secondary Row

Date and suggested classification.

Amount

Clearly visible and consistently aligned.

Status

Verified, Suggested or Needs Review.

Do not display long technical bank narrations directly in every list row.

Preserve full narration in the transaction detail view.

⸻

6. Expandable Transaction Details

When selected, display:

* Original bank narration.
* Merchant.
* Date.
* Amount.
* Debit or credit.
* Account.
* Transaction reference.
* Financial transaction type.
* Category.
* Workspace.
* Organisation.
* Tags.
* Trip.
* Reimbursement information.
* Source statement.

Allow users to edit proposed classifications before confirmation.

Do not modify the original source narration.

⸻

7. Selection Toolbar

When multiple transactions are selected, display a compact contextual toolbar.

Example:

18 selected

Actions:

* Categorise.
* Workspace.
* Tags.
* More.

Position the toolbar without covering transaction rows or the application’s bottom navigation.

Provide a clear Cancel Selection action.

⸻

8. Responsive Layout Requirements

The redesigned interface must:

1. Fit supported iPhone screen widths.
2. Avoid horizontal overflow.
3. Display complete monetary amounts.
4. Handle long merchant names.
5. Use readable typography.
6. Maintain appropriate touch targets.
7. Prevent fixed navigation from covering content.
8. Keep primary actions accessible.
9. Support light and dark themes.
10. Preserve comfortable one-handed operation.

Use Ledgerline’s existing Apple-inspired typography and approved colour system.

⸻

9. Financial Accuracy

Maintain the existing ledger rules.

Specifically:

* Internal transfers are not expenses.
* Credit card settlements must not duplicate purchase expenses.
* Refunds and reversals must be classified correctly.
* Reimbursements must retain their appropriate financial treatment.
* Loan principal must be distinguished from interest.
* Investment transactions must not automatically be treated as expenditure.
* Workspace allocations must reconcile with the original payment.

Do not classify all imported debits as expenses or all credits as income.

⸻

10. Processing Feedback

When an action is initiated, display an appropriate status.

Examples:

* Applying classifications…
* Checking duplicates…
* Validating selected transactions…
* Importing approved records…
* Reconciling account balance…

Prevent duplicate submission.

On completion, show:

* Successfully updated.
* Skipped.
* Requires review.
* Failed.

Preserve unresolved records for later review.

⸻

11. Acceptance Requirements

Before completion, demonstrate:

1. Uncertain transactions are not automatically selected for final approval.
2. “Miscellaneous — check” is not treated as verified.
3. Users can select multiple transactions.
4. Users can categorise similar transactions together.
5. Users can exclude individual exceptions.
6. Bulk changes show a preview.
7. Reusable rules are saved correctly.
8. Existing confirmed records are not silently rewritten.
9. Transaction amounts remain fully visible on iPhone.
10. Long bank narrations are available in detail view.
11. No horizontal overflow occurs.
12. The bottom navigation does not obscure transaction controls.
13. The final import summary separates transaction types.
14. Transfers and card settlements are treated correctly.
15. Repeated submissions do not create duplicates.
16. Existing Ledgerline functionality remains unaffected.

⸻

12. Development Priority

Priority 1 — Financial Safety

* Approval eligibility.
* Uncertain classification handling.
* Confirmation summary.
* Ledger posting safeguards.

Priority 2 — Bulk Classification

* Merchant grouping.
* Multiple selection.
* Bulk actions.
* Rule learning.

Priority 3 — Mobile Interface

* Compact review overview.
* Grouped transaction list.
* Transaction detail view.
* Responsive layout corrections.
* Bottom navigation correction.

Priority 4 — Reliability

* Processing indicators.
* Retry handling.
* Audit history.
* Regression testing.

⸻

13. Final Development Instruction

Integrate these enhancements into Ledgerline Version 5.3.

The primary objective is to reduce manual categorisation without compromising financial accuracy.

Build a safe approval process, an intelligent bulk-classification system and a compact iPhone review interface.

Reuse the existing statement import, financial ledger, account management, workspace classification and reconciliation services.

Preserve all existing financial records and source statements.

Do not automatically approve uncertain transactions.

Do not overwrite original statement details.

Do not duplicate financial records.

Do not create a separate import system.

Do not deploy changes to the live application without approval.

Complete the changes in the stated priority order and demonstrate the improvements using the existing sample statement-import workflow.

FINAL PRINCIPLE

REVIEW LESS. CLASSIFY FASTER. APPROVE SAFELY.

End of Supplementary Version 5.3 Development Requirements.