LEDGERLINE — FINANCIAL INBOX v5.12

Complete Implementation, Testing & Verification Specification

Project: Ledgerline
Module: Financial Inbox
Implementation: Lovable development environment
Status: Development and testing only
Production deployment: Not authorised without explicit approval

⸻

1. Objective

Redesign and thoroughly test Ledgerline’s Financial Inbox to provide a fast, intuitive and reliable financial review process.

The Financial Inbox should allow users to:

1. Review imported financial transactions.
2. Identify missing or incorrect information.
3. Apply intelligent category suggestions.
4. Correct multiple transactions simultaneously.
5. Identify internal and third-party transfers.
6. Recognise credit card payments and reimbursements.
7. Automatically map accounts, organisations and workspaces where sufficient evidence exists.
8. Reconcile imported bank and credit card statements.
9. Resolve review items when their underlying issues are corrected.
10. Verify that every correction is accurately reflected throughout Ledgerline.

Primary requirement: The user should not need to open and manually edit hundreds of transactions individually.

Preserve all existing financial records, account configurations, original statements, attachments, classifications, linked records and historical audit information.

Continue using the existing Universal Expense Entry and shared financial ledger.

⸻

2. Problems Identified in the Existing Financial Inbox

The supplied screenshots reveal several usability and functional concerns.

Existing issue	Required improvement
Hundreds of pending review items	Intelligent grouping and bulk resolution
Confusing selection controls	Clear Select All and selected-item actions
Selection without an obvious next step	Guided action workflow
Separate controls scattered across the page	Consolidated review toolbar
Categories remaining unresolved	Category suggestions and batch classification
Unknown account information	Statement-based account mapping
Expense asking for From and To accounts	Transaction-specific entry fields
Third-party transfers unclear	Dedicated external transfer classification
Credit card payments appearing as expenses	Card settlement recognition
Potential duplication when linking transfers	Safe two-sided transfer matching
Reconciliation status not updating correctly	Independent verification of account status
Pending counts difficult to understand	Live issue counts with explanations
Extensive scrolling on iPad	Responsive, compact review layout

The redesign must correct both the interface and the underlying processing logic.

A visual redesign alone is insufficient.

⸻

3. Recommended New Financial Inbox Structure

Replace the current lengthy Financial Inbox with five clearly separated views.

A. Overview

Display the overall state of financial records.

B. Smart Review

The primary working area for classifying and correcting transactions.

C. Transfers & Card Payments

Dedicated review of internal transfers, third-party transfers and card settlements.

D. Account Reconciliation

Statement verification and bank/card balance matching.

E. Review History

Previously reviewed, corrected, dismissed and confirmed transactions.

The user should be able to move between these sections without losing selected filters or unfinished review work.

⸻

4. Financial Inbox Overview

Use a compact dashboard.

Display:

* Total transactions requiring review.
* Transactions ready for approval.
* Missing categories.
* Missing account or organisation information.
* Transfers requiring verification.
* Possible duplicates.
* Statement reconciliation exceptions.

Each indicator must open its relevant filtered review list.

Important: A transaction may have multiple issues. Show both the number of distinct transactions and the number of unresolved issues. Never misleadingly add overlapping categories to produce a transaction total.

Below the summary, display:

Recommended Actions

Examples:

* Review 15 suggested card payments.
* Categorise 42 transactions from known merchants.
* Match 8 possible internal transfers.
* Confirm 12 unknown payment recipients.
* Verify 2 bank statement balances.

These are illustrative examples only. Actual counts must come from Ledgerline’s database.

Prioritise actions by financial risk and expected review effort.

⸻

5. Smart Review — Main Workflow

Redesign the review process around four steps.

Step 1 — Select

Allow the user to select:

* One transaction.
* Multiple transactions.
* All visible transactions.
* All matching transactions across every result page.
* All transactions from one merchant.
* All transactions from one account.
* All transactions sharing the same suggested category.

When Select All Matching is chosen, clearly display the total count and selection scope.

Never silently include transactions excluded by filters.

Step 2 — Choose Action

After selection, display a prominent action toolbar.

Actions:

* Assign category.
* Change transaction type.
* Assign organisation.
* Assign workspace.
* Assign trip or project.
* Correct payment account.
* Set reimbursement status.
* Review transfers.
* Confirm suggestions.
* Mark for individual review.

Only show actions valid for the selected transactions.

Step 3 — Preview

Before saving, display:

* Number of transactions affected.
* Original classification.
* Proposed classification.
* Total transaction amount.
* Accounts affected.
* Organisations affected.
* Any conflicts.
* Any records that cannot safely be changed.

The preview must distinguish amounts that are actual expenses, income, transfers or card settlements.

Step 4 — Confirm

Save the validated corrections.

Immediately update:

* Financial Inbox status.
* Transaction details.
* Account and statement links.
* Expense reports.
* Organisation summaries.
* Workspace summaries.
* Budgets and travel reports, where relevant.

Display the outcome:

37 transactions updated successfully. 4 require additional information.

Provide links to review exceptions and an appropriate undo option for reversible classification changes.

A successful selection or preview must never be mistaken for a completed update.

⸻

6. Intelligent Transaction Classification

Introduce a rule-based classification engine that can learn from confirmed user corrections.

Use available evidence from:

* Merchant name.
* Statement narration.
* UPI identifiers.
* Bank reference.
* Payment account.
* Card information.
* Transaction direction.
* Historical classifications.
* Organisation mappings.
* Trip and project associations.
* Existing recurring-payment rules.

Suggestions should have confidence levels.

Confidence	Behaviour
High	Suggest and, where explicitly authorised and safe, auto-apply
Medium	Group for quick confirmation
Low	Request manual review
Conflicting	Block automatic classification

Never automatically classify unclear transfers, loans, advances, reimbursements or card settlements as ordinary expenses.

Merchant recognition

Identify merchant variations where supported by the underlying transaction evidence.

For example:

* Apple Services.
* Apple subscription charges.
* Apple App Store.

These may be grouped under a merchant family for review, but they must not automatically receive the same category if their purposes differ.

Remember classification

When a classification is confirmed, offer:

Remember this classification for future matching transactions.

The saved rule must record relevant conditions, not merely an unrestricted merchant-name match.

Allow users to edit, disable and delete classification rules.

⸻

7. Correct Transaction-Type Behaviour

The existing problem of requesting both source and destination bank accounts for an ordinary expense must be corrected.

Different transaction types require different information.

Transaction type	Required details
Expense	Payment account/card, merchant/payee, category
Income	Receiving account, payer/source, income category
Internal transfer	Source owned account, destination owned account
External transfer	Source account, external recipient, purpose
Credit card settlement	Paying account and credit card liability account
Loan disbursement	Account, lender/borrower, loan record
Loan repayment	Payment account, loan record, principal/interest split
Reimbursement received	Receiving account and linked claim/receivable
Refund	Receiving account and related original transaction, where known
Advance	Payment/receiving account and relevant advance record

The destination of an ordinary expense must not be restricted to Ledgerline’s saved bank accounts.

An external recipient should be stored as a merchant, payee or counterparty as appropriate.

External transfer is a payment description, not necessarily an accounting classification. The user must identify whether money represents an expense, loan, advance, gift or another valid movement.

⸻

8. Safe Internal Transfer Matching

Implement a dedicated transfer-matching workflow.

Required behaviour

When money moves between two accounts owned or controlled by the same user or relevant entity:

* Preserve both original statement entries.
* Represent the movement as one logical transfer.
* Link both entries to that transfer.
* Avoid duplicate expense or income recognition.
* Maintain account-level debit and credit movements.
* Preserve complete statement traceability.

Matching checks

Consider:

* Source account.
* Destination account.
* Transaction amount.
* Debit/credit direction.
* Date.
* Transaction reference.
* Currency.
* Ownership and account mapping.

Matching amounts and dates alone must never be sufficient for automatic linking.

Single-sided transfer

When only one statement is available, allow:

Transfer recorded — awaiting matching entry.

Do not invent a missing statement transaction.

Linking controls

Provide:

* Review suggested match.
* Confirm match.
* Reject match.
* Search for another transaction.
* Leave unmatched.
* Unlink an incorrect match.

All link/unlink operations must be atomic, idempotent, reversible where appropriate and recorded in the audit trail.

⸻

9. Credit Card Payment Recognition

Recognise payments made from bank accounts toward saved credit cards.

For example:

Bank account debit → AMEX payment

This is generally a credit card liability settlement, not another purchase expense.

Requirements:

1. Identify likely card-payment narrations.
2. Match the saved card using reliable identifiers.
3. Suggest the relevant card account.
4. Display the linked bank transaction.
5. Display the corresponding card payment entry when available.
6. Avoid counting the settlement again as spending.
7. Allow partial and multiple settlements.
8. Flag unmatched or disputed settlement amounts.

Original card purchases remain the expenses.

Repayment of the card balance must not duplicate those expenses.

⸻

10. Account and Organisation Auto-Mapping

Use existing Financial Settings configurations.

Where supported by available evidence, detect:

* Bank account.
* Card.
* Legal account owner.
* Associated organisation.
* Workspace.
* Payment responsibility.

Account ownership and expense responsibility are separate fields.

A personal card may pay for an organisation’s expense.

Therefore, Ledgerline must not automatically treat every payment from a personal account as a personal expense.

Required hierarchy

1. Explicit transaction-level mapping.
2. Confirmed trip/project association.
3. Confirmed reimbursement or responsibility mapping.
4. Saved organisation/account relationship.
5. Historical approved classification rule.
6. Suggested mapping requiring confirmation.

Conflicting mappings must be flagged.

⸻

11. Bulk Missing-Information Correction

Provide a guided form that identifies exactly what information is missing.

Examples:

15 transactions missing organisation

8 transactions missing receiving account

4 transactions requiring transfer type confirmation

Users should be able to correct common fields once and apply them to eligible records.

If selected transactions have incompatible types, split them into appropriate groups or block the invalid bulk action.

Never overwrite populated fields without clearly displaying the proposed change.

⸻

12. Financial Inbox Status Logic

Introduce clear review statuses.

* Needs Review: One or more unresolved issues.
* Ready to Confirm: Required information is available; user confirmation is outstanding.
* Confirmed: Relevant review checks passed.
* Exception: An unresolved conflict needs investigation.
* Reopened: Previously confirmed record changed or a new issue was detected.

When a transaction is corrected, the corresponding issue must disappear from the active queue after successful persistence and verification.

However, correcting a category must not hide a separate missing-account issue.

Accurate counts

The summary must be calculated from the current underlying records.

Avoid stale cached counts.

Recalculate after successful bulk actions, imports, reversals and reconciliation changes.

⸻

13. Bank Statement Import Integration

Ensure that importing another statement does not recreate previously imported transactions.

Check:

* Source account identity.
* Statement period.
* Bank transaction references.
* Date.
* Amount.
* Direction.
* Narration.
* Existing source linkage.

Use appropriate deduplication logic with a review process for uncertain matches.

Preserve original statement files and imported transaction provenance.

A repeated upload must not:

* Double spending.
* Duplicate income.
* Duplicate internal transfers.
* Reopen correctly resolved items without a valid new reason.
* Replace manually verified classifications without explicit approval.

⸻

14. Account Reconciliation Verification

Separate these concepts:

1. Statement successfully imported.
2. Transactions matched.
3. Statement closing balance verified.
4. Account data current for its freshness policy.

A recent upload alone must not mark an account fully reconciled.

Reconciliation checks

Verify:

* Opening balance.
* Statement debits.
* Statement credits.
* Closing balance.
* Ledger balance.
* Unmatched entries.
* Missing periods.
* Currency.
* Applicable reconciliation date.

Display the difference accurately.

Reconciled should only appear when the required checks pass.

Current may describe statement freshness, but it must not imply balance reconciliation.

Clearly explain any outstanding requirement.

⸻

15. Proposed iPad Interface

The supplied screenshots show that Ledgerline’s desktop layout is being compressed onto an iPad, creating excessively small text and lengthy scrolling.

Build a genuine responsive iPad layout.

Landscape mode

Use:

Left panel — Transaction list

* Search.
* Filters.
* Merchant grouping.
* Select All.
* Transaction selection.
* Status indicators.

Right panel — Review and correction

* Transaction details.
* Suggested classification.
* Account mapping.
* Organisation mapping.
* Required information.
* Preview.
* Confirm.

A transaction selected on the left should populate the right panel.

Do not display an empty right panel when multiple transactions have been selected; show the selected batch summary and valid actions.

Portrait mode

Use a full-width transaction list.

Open selected transaction details in a drawer or dedicated review view.

Provide an easily accessible action toolbar.

General iPad requirements

* Readable text without browser zoom.
* Touch-friendly selection controls.
* No horizontally clipped tables.
* No essential actions hidden below unrelated page sections.
* No overlapping floating navigation.
* Persistent selection when moving between compatible views.
* Appropriate keyboard support.

Desktop and iPhone must also remain fully responsive.

⸻

16. Suggested Simplified Page Layout

Top section

Financial Inbox

Review financial transactions and resolve missing information.

Summary indicators:

* Needs Review
* Ready to Confirm
* Transfers
* Accounts Check

Second section

Search and filters.

* Account.
* Workspace.
* Organisation.
* Transaction type.
* Category.
* Date.
* Confidence.

Third section

Merchant groups and transaction list.

Each transaction should display only the most useful information initially:

* Date.
* Merchant.
* Amount.
* Account.
* Suggested type/category.
* Review status.

Advanced information should open on selection.

Fourth section

Context-sensitive review actions.

Fifth section

Review History.

Do not mix report notifications, unrelated reminders and full reconciliation tools into the primary transaction classification workspace.

Move them into the appropriate sections.

⸻

17. Testing Requirements

Perform testing against a safe development or staging environment.

Use anonymised copies or controlled test fixtures where possible.

Do not modify real financial balances merely to demonstrate functionality.

Test Group A — Selection

Test	Expected result
Select one transaction	One item selected
Select several transactions	Accurate selected count
Select all visible	Current visible set selected
Select all matching	All matching records selected across pages
Change filters	Selection scope remains explicit
Clear selection	No items selected
Select incompatible types	Invalid bulk actions blocked

Test Group B — Classification

Test	Expected result
Assign expense category	Category persists correctly
Assign income category	Income remains correctly classified
Confirm merchant rule	Future eligible matches suggested
Edit existing rule	Rule updates without retroactive silent changes
Mixed batch	Ineligible records excluded or flagged
Refresh page	Saved classifications remain
Reimport statement	Confirmed data preserved

Test Group C — Transfers

Test	Expected result
Match bank debit and credit	One logical transfer
Import counterpart later	Existing transfer safely linked
Attempt duplicate match	Prevent duplicate linkage
Transfer to external party	Correct external counterparty flow
Reject suggested match	No ledger mutation
Unlink incorrect match	Traceable reversal
Multiple similar amounts	Ambiguous match requires review

Test Group D — Credit Cards

Test	Expected result
Import card purchases	Purchases remain expenses
Import bank card repayment	Liability settlement recognised
Match settlement	No duplicate spending
Partial card payment	Correct balance treatment
Two bank payments to card	Correct individual settlement links
Unmatched repayment	Visible exception

Test Group E — Accounts

Test	Expected result
Correctly mapped statement	Correct source account
Unknown source account	Review required
Duplicate upload	No duplicate ledger entries
Verify closing balance	Accurate reconciliation result
Missing statement period	Freshness warning
Correct mapping	Status updates after verification

Test Group F — Organisations and Reimbursements

Test	Expected result
Personal card, official expense	Correct payment source and organisation
Assign trip	Expense linked to correct trip
Reimbursable personal expense	Outstanding claim tracked
Reimbursement received	Claim settled without duplicate income
Company-paid expense	Not incorrectly marked personal reimbursement

⸻

18. End-to-End Verification Scenarios

In addition to isolated tests, verify complete workflows.

Scenario 1 — Bank statement to final report

1. Import a statement.
2. Identify new transactions.
3. Map the correct account.
4. Apply classifications.
5. Confirm selected transactions.
6. Reconcile statement balance.
7. Open financial reports.

Expected result:

Every report reflects the corrected records without duplication.

Scenario 2 — Internal bank transfer

1. Import source bank statement.
2. Identify transfer.
3. Leave awaiting counterpart.
4. Import receiving bank statement.
5. Match the corresponding credit.
6. Confirm transfer.
7. Open account balances and expenditure reports.

Expected result:

Both account movements are preserved, while ordinary income and expenditure are not inflated.

Scenario 3 — Credit card payment

1. Import original card purchases.
2. Import bank payment toward the card.
3. Recognise settlement.
4. Link the payment.
5. Generate expenditure statement.

Expected result:

Purchases appear as expenses; card repayment does not create duplicate spending.

Scenario 4 — Official expense paid personally

1. Import a payment from a personal card.
2. Assign the responsible organisation.
3. Link the relevant trip or project.
4. Mark reimbursement eligibility.
5. Generate an expense claim.
6. Record reimbursement.

Expected result:

Payment source, responsible organisation, expense and claim settlement remain correctly linked.

⸻

19. Automated Regression Testing

Lovable must create and execute repeatable automated checks for:

* Import idempotency.
* Transfer matching.
* Card settlement handling.
* Category persistence.
* Bulk update correctness.
* Account mapping.
* Organisation allocation.
* Reimbursement status.
* Reconciliation calculations.
* Review queue counts.
* Audit log creation.
* Report consistency.

Use deterministic financial fixtures and independently calculated expected totals.

Tests must fail when expected and actual financial results differ.

Do not mark tests as passed merely because the screen loads successfully.

⸻

20. Financial Integrity Checks

Before and after the proposed changes, compare:

* Total transactions.
* Source statement entries.
* Account balances.
* Income totals.
* Expense totals.
* Transfers.
* Credit card liabilities.
* Reimbursements.
* Outstanding claims.
* Trip expenditure.
* Organisation expenditure.

Any difference must be explained by a verified, authorised correction.

The redesign must not independently create a new ledger calculation engine.

Use existing ledger entries and established accounting rules.

⸻

21. Audit Trail and Recovery

Every financial correction should record:

* Transaction identifier.
* Previous value.
* New value.
* Change type.
* User or automated rule responsible.
* Timestamp.
* Reason or rule reference.
* Related statement.
* Related transfer or settlement, if applicable.

Allow safe reversal of eligible changes.

Never erase original imported banking information.

For irreversible or consequential actions, require confirmation.

⸻

22. Security and Data Protection

Verify:

* Workspace-based permissions.
* Organisation-level access controls.
* Account visibility restrictions.
* Sensitive account masking.
* Secure document storage.
* No unintended disclosure between organisations.
* Proper audit logging.
* No unauthorised modification of historical ledger records.

A personal workspace filter must not unintentionally expose unrelated organisation records.

⸻

23. Performance Requirements

Test using realistic volumes, including the current backlog and a substantially larger dataset.

Recommended initial targets:

* Financial Inbox initial view: approximately 2 seconds under normal test conditions.
* Filter/search response: approximately 1 second.
* Selection of hundreds of transactions: responsive without noticeable freezing.
* Bulk preview: approximately 3 seconds for a typical batch.
* Bulk save: visible progress and reliable completion, with duration depending on batch size.
* Account reconciliation: no interface freeze.
* iPad scrolling and selection: smooth and stable.

Measure actual performance and report any missed targets.

Do not sacrifice database correctness to meet speed targets.

⸻

24. Acceptance Criteria

Financial Inbox v5.12 may be considered ready for approval only when:

* [ ]	The interface is understandable without technical guidance.
* [ ]	Select All Visible and Select All Matching both work.
* [ ]	Selected transactions have an obvious next action.
* [ ]	Bulk category corrections save correctly.
* [ ]	Account and transaction-type fields behave appropriately.
* [ ]	External payments can be classified without inventing owned destination accounts.
* [ ]	Internal transfers do not duplicate income or expenditure.
* [ ]	Credit card settlements do not duplicate purchase expenses.
* [ ]	Organisation and workspace mappings work correctly.
* [ ]	Corrected review issues disappear from the active queue.
* [ ]	Remaining unresolved issues are clearly explained.
* [ ]	Statement imports are idempotent.
* [ ]	Account freshness and reconciliation statuses are accurate.
* [ ]	Expense, travel and organisation reports remain consistent.
* [ ]	iPad portrait and landscape layouts are verified.
* [ ]	All critical automated tests pass.
* [ ]	Existing production data remains intact.
* [ ]	Audit logs record all relevant changes.

⸻

25. Required Development Deliverables

Lovable must provide:

A. Implementation Summary

List all affected pages, components, workflows and database logic.

B. Before-and-After Review

Explain the specific problems corrected.

C. Automated Test Report

Show test names, expected outcomes, actual outcomes and pass/fail results.

D. Financial Reconciliation Report

Confirm that the financial ledger remains internally consistent.

E. Exception Register

List unresolved problems, severity, affected functionality and recommended correction.

F. Responsive Layout Verification

Provide screenshots for:

* iPhone.
* iPad portrait.
* iPad landscape.
* Desktop.

G. Deployment Readiness Report

Show whether the module is technically ready for deployment, without actually deploying it.

⸻

26. Implementation Sequence

Follow this order:

Phase 1 — Diagnose

Inspect existing Financial Inbox components, database mappings, ledger relationships, import logic and current test coverage.

Identify the actual reasons behind failed categorisation, unclear selection, stale statuses and incomplete account mappings.

Phase 2 — Correct Financial Logic

Fix transaction types, account mappings, transfer handling, card settlements and issue-resolution persistence.

Phase 3 — Build Guided Bulk Review

Implement Select → Correct → Preview → Confirm, including merchant grouping and selected-item summaries.

Phase 4 — Redesign Interfaces

Implement the simplified Financial Inbox for desktop, iPad and iPhone.

Phase 5 — Test

Run unit, integration, end-to-end, financial reconciliation and responsive interface tests.

Phase 6 — Verify Existing Data

Perform read-only comparisons against historical records and identify discrepancies.

Apply historical financial corrections only through a separately reviewed and approved process.

Phase 7 — Submit for Approval

Provide the implementation report, screenshots, financial checks and unresolved exception list.

Do not deploy.

⸻

27. Final Instructions to Lovable

Implement and verify Financial Inbox v5.12 in the development environment.

Preserve the complete existing database, imported statements, attachments, historical entries, classification rules, original banking references, account configurations and connected financial modules.

The objective is to reduce repetitive manual review while maintaining full financial accuracy.

Do not automatically approve uncertain transactions or use category assumptions that could incorrectly affect expenditure, income, transfers, card balances, loans or reimbursements.

Do not silently rewrite historical transactions.

Do not create parallel financial records or duplicate ledger calculations.

Do not publish or deploy the changes to Ledgerline’s live application without explicit approval.

After implementation, provide a full testing and verification report and wait for approval.