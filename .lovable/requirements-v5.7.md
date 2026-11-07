# LEDGERLINE
## Version 5.7 — Intelligent Reimbursement Management, Organisation Profiles & Responsive Interface

### Complete Development Requirements for Lovable

**Project:** Existing Ledgerline Application  
**Development Type:** Reimbursement System Enhancement, Configuration Management and Responsive UI Redesign  
**Platforms:** iPhone, iPad, Desktop and Supported Web Browsers  
**Priority:** High  
**Implementation:** Existing Lovable Project  
**Deployment:** Development/Preview Only

---

# 1. PROJECT OBJECTIVE

Redesign and enhance Ledgerline's reimbursement system to support users associated with multiple organisations, holding multiple roles and managing expenses across different projects, activities, events and trips.

The system must eliminate repetitive data entry, automatically identify appropriate reimbursement details, retrieve linked financial transactions and produce professional reimbursement reports.

The development must integrate with the existing:

- Financial accounts.
- Payment methods.
- Personal Workspace.
- Family Workspace.
- Business Workspace.
- Official Workspace.
- Organisation Management.
- Universal Expense Entry.
- Shared Financial Ledger.
- Travel Manager.
- Project and Event Tracking.
- Document Vault.
- Bank Statement Import.
- Expense Categorisation.
- Reimbursement Tracking.
- PDF Reporting Centre.

**Primary Objective:**

Configure information once, reuse it across the application and require manual intervention only when information is missing, ambiguous or needs approval.

The application must provide an equally usable experience on iPhone, iPad and desktop.

---

# 2. CURRENT PROBLEMS IDENTIFIED

Based on the existing Ledgerline screenshots, the following issues require correction.

### Problem 1 — Repetitive Claimant Information

The current Expense Claim Submission page requests:

- Name.
- Employee ID.
- Department.
- Designation.
- Email.
- Approving manager.
- Reimbursement account.

These details are repeatedly required even though they are associated with an existing user and organisation.

### Problem 2 — No Visible Organisation-Specific Claimant Profiles

Ledgerline currently has configured organisations, but the reimbursement page does not provide a clear mechanism for mapping a claimant's role and preferences to each organisation.

### Problem 3 — Multiple Roles Are Not Adequately Addressed

A user may have different roles across several organisations or more than one role in the same organisation.

The system must support these situations without creating duplicate users.

### Problem 4 — Activity Mapping Is Incomplete

Selecting a trip, project or event should automatically identify the relevant:

- Organisation.
- Claimant profile.
- Designation.
- Purpose.
- Dates.
- Expense records.

### Problem 5 — Missing Transaction Linking

The current report page displays:

**Review Transactions — 0 of 0 Included**

The user is instructed to tag expenses manually.

This is inconvenient, particularly when transactions have already been imported from bank or credit card statements.

### Problem 6 — Excessive Manual Inputs

The current page displays multiple large forms even when most information could be obtained from existing settings.

### Problem 7 — Device-Specific Layout Limitations

The existing interface must be optimised for:

- iPhone portrait.
- iPhone landscape where supported.
- iPad portrait.
- iPad landscape.
- Desktop browsers.

Simply enlarging or shrinking the same page is insufficient.

---

# 3. CENTRALISED REIMBURSEMENT CONFIGURATION

Introduce:

**Settings → Financial Setup → Reimbursements**

Replace the current informational reimbursement setup with an actionable configuration centre.

### Reimbursement Settings Menu

1. My Reimbursement Profiles.
2. Organisation & Role Mapping.
3. Approving Authorities.
4. Reimbursement Accounts.
5. Activity Mapping.
6. Default Reimbursement Rules.
7. Claim Report Preferences.
8. Saved Templates.

The main Financial Setup page must show:

**Reimbursements — Ready**

Only when the applicable configuration has been completed and validated.

Otherwise display:

- Not Configured.
- Partially Configured.
- Ready.

Do not require reimbursement settings to be completed before users can record ordinary personal expenses.

---

# 4. ORGANISATION-BASED PROFILES

Allow one user to maintain multiple organisation-specific reimbursement profiles.

### Example Configuration

| Organisation | Role | Workspace |
|---|---|---|
| AET / VEI | Vice Chairman | Official / Business, as configured |
| KRNA Enterprises / MOVAC | Director | Business |
| AK MERIDIAN | Director | Business |
| Other Organisation | User Defined | Relevant workspace |

These are illustrative examples.

The actual organisation names, legal entities, roles and permissions must be taken from Ledgerline's existing settings or confirmed by the user.

Do not automatically assume that a brand, trust or trade name is a separate legal entity.

For example, MOVAC may be displayed as the operating brand while KRNA Enterprises Pvt Ltd remains the relevant legal entity.

### Profile Fields

Each reimbursement profile must support:

**A. Identity**

- User name.
- Profile name.
- Organisation.
- Legal entity, where applicable.
- Workspace.
- Role/designation.
- Department.
- Employee or member ID.
- Official email.

**B. Approval Information**

- Reporting authority.
- Approving manager.
- Finance/accounts department.
- Additional approver.
- Approval reference, if applicable.

**C. Financial Information**

- Default reimbursement account.
- Account holder.
- Bank name.
- Masked account identification.
- Default reimbursement currency.

**D. Report Preferences**

- Default claim format.
- Declaration.
- Signature preferences.
- Supporting bill requirements.
- Organisation-specific report header.

All fields must remain editable.

Use existing organisation, financial account and user records whenever possible.

---

# 5. MULTIPLE ROLES WITHIN ONE ORGANISATION

Ledgerline must support:

**One User → Multiple Organisations → Multiple Roles**

For example:

Organisation: AET

Possible profiles:

- Vice Chairman.
- Authorised Representative.
- Other configured role.

The user should not need to create multiple login accounts.

Each role may have different:

- Designations.
- Departments.
- Approvers.
- Expense responsibilities.
- Claim formats.

Provide one default role per organisation where appropriate.

Alternative roles must remain selectable.

If multiple profiles are equally applicable, Ledgerline must ask the user to select one.

Never silently select an uncertain profile.

---

# 6. AUTOMATIC TRIP, PROJECT AND EVENT MAPPING

Introduce a mapping system connecting reimbursement profiles to existing activities.

Supported activity types:

- Trip.
- Project.
- Event.
- Official meeting.
- Business purchase.
- Business activity.
- Other tagged activity.

### Example 1 — AET Official Trip

Selected activity:

**Kovai Trip — Auditor Meeting**

Ledgerline should retrieve:

- Organisation: AET.
- Claimant: Krupanidhi Karunanithi.
- Designation: Saved AET role.
- Department: Saved profile.
- Purpose: Auditor Meeting.
- Travel dates: From trip record.
- Default reimbursement account: Saved AET preference.
- Linked expenses: From the shared financial ledger.

### Example 2 — MOVAC Business Trip

Selected activity:

**MOVAC Vanuatu Recce**

Ledgerline should retrieve:

- Relevant MOVAC/KRNA Enterprises profile.
- Claimant role.
- Trip purpose.
- Trip dates.
- Linked expenses.
- Payment sources.
- Applicable reimbursement responsibility.

### Example 3 — Business Purchase

Selected activity:

**Official Equipment Purchase**

Ledgerline should retrieve:

- Responsible organisation.
- Linked purchase expenses.
- Payment source.
- Eligible reimbursement.
- Supporting invoices.

The same reporting architecture must apply beyond Travel Manager.

---

# 7. RECOMMENDED PROFILE MAPPING PRIORITY

Use the following order:

1. Profile explicitly selected for the current report.
2. Profile explicitly assigned to the activity.
3. Unique profile matching the responsible organisation and applicable role.
4. Configured default profile for that organisation.
5. User selection when multiple profiles remain possible.

Do not rely only on the currently selected workspace tab.

The global workspace filter is a navigation context, not definitive evidence of which organisation owes reimbursement.

Do not infer reimbursement eligibility solely from the trip type or organisation.

---

# 8. INTELLIGENT EXPENSE DISCOVERY AND LINKING

**This is a mandatory additional improvement.**

Currently, the Expense Claim Submission page may show:

**0 of 0 transactions included.**

A selected trip or project should not require the user to manually search for every expense.

Introduce:

### Find & Link Existing Expenses

When an activity is selected, Ledgerline must search authorised financial records for potential matches.

Matching information may include:

- Explicit trip or project relationship.
- Existing activity tags.
- Organisation.
- Transaction dates.
- Merchant.
- Description.
- Booking reference.
- Linked bill.
- Payment account.
- Related itinerary or booking.

### Suggested Expense Groups

Display:

**Already Linked**

Transactions already associated with the activity.

**Suggested Matches**

Transactions potentially related to the activity.

**Needs Review**

Transactions requiring manual confirmation.

**Previously Claimed or Settled**

Transactions that should not be claimed again without an appropriate adjustment.

### Important Rules

- Never automatically associate uncertain transactions with a trip solely because their dates overlap.
- Show the reason for each suggested match.
- Allow the user to accept or reject suggestions.
- Link existing transaction records rather than creating copies.
- Preserve original bank narration and import history.
- Prevent duplicate expense creation.
- Maintain a traceable record of confirmed relationships.

### Multiple Selection

Provide:

- Select All Suggested.
- Select by Date.
- Select by Organisation.
- Select by Account.
- Select by Category.
- Select by Payment Method.
- Select Individually.
- Deselect All.

The user must be able to link multiple existing expenses in one operation.

---

# 9. BANK STATEMENT IMPORT INTEGRATION

Ledgerline's historical transaction import must integrate with the reimbursement system.

For transactions imported from April 2026 onwards, the system should be able to suggest appropriate:

- Workspace.
- Organisation.
- Activity.
- Payment account.
- Category.
- Reimbursement status.

### Example

A hotel transaction imported from an AMEX statement falls within the dates of an AET official trip.

Ledgerline may suggest:

**Possible match: Kovai Trip — AET**

The user should be able to confirm the association.

Do not automatically mark the transaction reimbursable unless eligibility is established.

### Additional Recommendations

1. Remember user-confirmed mappings.
2. Reuse recurring merchant classification rules where appropriate.
3. Support bulk organisation assignment.
4. Support bulk activity assignment.
5. Flag already linked transactions.
6. Identify possible duplicate imports.
7. Preserve all original imported statement data.
8. Keep uncertain transactions pending review.

No transaction should be silently posted to an incorrect organisation.

---

# 10. PAYMENT SOURCE AND REIMBURSEMENT RESPONSIBILITY

For every expense, distinguish:

1. Who incurred it.
2. Who paid it.
3. Which account or card was used.
4. Which organisation is responsible.
5. Whether reimbursement is applicable.
6. Amount already reimbursed.
7. Outstanding reimbursement.

### Example

| Particulars | Details |
|---|---|
| Expense | Hotel |
| Amount | ₹12,000 |
| Paid By | Krupanidhi Karunanithi |
| Payment Method | Personal AMEX |
| Responsible Organisation | AET |
| Eligible Reimbursement | ₹12,000 |
| Amount Received | ₹0 |
| Outstanding | ₹12,000 |

The application must preserve masked payment instrument details.

Do not include full card numbers in PDF reports.

A business expense paid directly using an organisation-owned account or card must not automatically become a personal reimbursement claim.

---

# 11. REIMBURSEMENT ACCOUNT MANAGEMENT

Users must be able to map different receiving accounts to different profiles.

### Recommended Workflow

**Settings → Reimbursements → Profile → Reimbursement Account**

Choose from existing configured financial accounts.

Allow:

- Set as default.
- Change account.
- Remove default association.
- Select another account for a particular claim.

Do not create a duplicate financial account merely because it is used for reimbursements.

The reimbursement destination must remain separate from the account originally used to pay an expense.

Sensitive account information must be masked in the interface and reports.

---

# 12. AUTOMATIC CLAIM FORM PREFILLING

Redesign the existing Expense Claim Submission interface.

### Recommended Flow

**Step 1 — Select Activity**

Trip / Project / Event / Purchase.

**Step 2 — Confirm Organisation and Role**

Automatically display the matching claimant profile.

**Step 3 — Review Eligible Expenses**

Load existing linked expenses and allow additional linking.

**Step 4 — Verify Reimbursement**

Show paid amount, eligible amount, prior settlements and outstanding balance.

**Step 5 — Preview Report**

Review claimant details, line items and attachments.

**Step 6 — Generate PDF**

Download or share.

### Default Display

Do not permanently display all claimant input fields.

Instead, show:

**Claimant Profile**

Krupanidhi Karunanithi  
Vice Chairman  
AET

Actions:

**Change Profile | Edit for This Claim**

The user can expand the details when required.

Edits for one report must not automatically change the saved master profile.

Provide a separate **Save to Profile** action where appropriate.

---

# 13. MULTI-ORGANISATION CLAIM HANDLING

A single trip may contain expenses attributable to multiple organisations.

Example:

- AET-related expenses.
- MOVAC-related expenses.
- Personal expenses.

The system must support:

**A. Consolidated Expenditure Statement**

Show the complete activity expenditure, separated by organisation and payment source.

**B. Organisation-Specific Reimbursement Claim**

Generate a claim for the expenses payable by one organisation.

**C. Multiple Claim Packages**

Allow the user to prepare separate claim documents for each responsible organisation.

Never combine multiple organisations' reimbursement obligations into one undifferentiated outstanding amount.

Where one expense is split between organisations, the allocated shares must reconcile to the original transaction.

---

# 14. RESPONSIVE DESIGN — iPHONE

Ledgerline must be designed mobile-first.

### iPhone Requirements

- Single-column layout.
- Compact sections.
- Minimal scrolling.
- Large, accessible touch targets.
- Clear labels.
- No horizontal overflow.
- No overlapping elements.
- No hidden buttons beneath fixed navigation.

### Recommended Screen Structure

**Expense Claim Submission**

1. Activity selector.
2. Profile summary.
3. Reimbursement summary.
4. Eligible expense list.
5. Missing information.
6. Report format.
7. Preview / Generate actions.

Use expandable sections and dedicated selection sheets where helpful.

Do not open the keyboard automatically when the page loads.

Use search-enabled selectors for organisations, roles, projects and accounts.

### Bottom Navigation

Maintain adequate safe-area spacing.

The fixed navigation must never cover:

- Save buttons.
- Transaction checkboxes.
- Report generation actions.
- Error messages.

---

# 15. RESPONSIVE DESIGN — iPAD

**Dedicated iPad layout optimisation is mandatory.**

Do not merely enlarge the iPhone interface.

Support:

- iPad portrait.
- iPad landscape.
- Split View.
- Stage Manager resizing.
- Keyboard and trackpad interactions.

Use responsive containers that adapt to available window width rather than detecting only the physical device.

## 15.1 iPad Landscape

Recommended layout:

**Left Panel — Activity & Profile**

- Selected activity.
- Organisation.
- Claimant role.
- Claimant summary.
- Reimbursement account.
- Report preferences.

**Right Panel — Financial Review**

- Eligible transactions.
- Suggested linked expenses.
- Reimbursement totals.
- Missing information.
- PDF preview and generation.

Where space permits, show a transaction list beside a selected transaction's details.

Avoid excessive empty space.

## 15.2 iPad Portrait

Use a compact content layout with:

- Activity and profile summary at the top.
- Financial overview.
- Transaction review.
- Supporting documents.
- Report controls.

Use two columns only where they remain comfortably readable.

Otherwise, collapse into one column.

## 15.3 iPad Interaction Improvements

Support:

- Keyboard navigation.
- Tab movement between fields.
- Clear focus indication.
- Trackpad and mouse interaction.
- Appropriate touch target sizes.
- Searchable dropdowns.
- Multi-selection.
- Scrollable transaction lists.
- Persistent selection during navigation.

Do not rely exclusively on hover interactions.

## 15.4 Transaction Review on iPad

Use a proper structured list or table.

Recommended columns:

| Select | Date | Merchant | Paid Using | Amount | Status |
|---|---|---|---|---:|---|

Selecting a transaction should open its complete details in a side panel or dedicated detail view.

Do not truncate important information without providing access to the complete value.

For narrower windows, use compact transaction cards instead of forcing horizontal page scrolling.

## 15.5 iPad PDF Preview

Where screen space allows:

- Display the PDF preview beside the report settings.
- Allow full-screen preview.
- Support document page navigation.
- Support Download.
- Support Share.
- Support Save to Files through supported system functionality.

Use the available browser or operating-system capabilities appropriately.

---

# 16. DESKTOP INTERFACE

Optimise for wider screens.

### Recommended Layout

**Column 1 — Configuration**

- Activity.
- Organisation.
- Role.
- Claimant details.
- Report preferences.

**Column 2 — Financial Review**

- Expense selection.
- Payment information.
- Reimbursement calculations.
- Exceptions.

**Column 3 — Report Preview**

Where sufficient screen width is available.

Otherwise use a two-column layout with a dedicated preview action.

Do not force three columns on medium-sized screens.

### Desktop Features

- Searchable transaction table.
- Sorting.
- Multi-select.
- Bulk actions.
- Expandable transaction details.
- Keyboard navigation.
- Adjustable or responsive panel widths.

Maintain the existing Ledgerline brand identity.

---

# 17. CROSS-DEVICE CONSISTENCY

The same information must be available on:

- iPhone.
- iPad.
- Desktop.

A user who starts preparing a claim on one device should be able to continue on another authorised device if secure draft persistence is implemented.

### Save Behaviour

- Automatically save claim configuration drafts.
- Clearly display saving status.
- Restore unfinished drafts.
- Preserve selected transactions.
- Preserve the selected organisation profile.
- Prevent duplicate submissions.

Drafts must be scoped to the authenticated user and protected by appropriate permissions.

If background jobs are available, report generation should persist safely after acceptance by the backend.

If only foreground processing is available, display the processing state and clearly inform the user that the page must remain open.

Do not claim background processing is available until it is implemented and tested.

---

# 18. REIMBURSEMENT SUMMARY CARD

Introduce one compact summary.

### Example

**Kovai Trip — AET**

| Summary | Amount |
|---|---:|
| Total Activity Expenditure | ₹25,000 |
| Eligible for Reimbursement | ₹20,000 |
| Already Reimbursed | ₹5,000 |
| Outstanding Reimbursement | ₹15,000 |

These are illustrative amounts.

Actual values must be calculated from Ledgerline's confirmed records.

The summary should distinguish:

- Personal payments.
- Organisation payments.
- Advances received.
- Reimbursements received.
- Non-reimbursable expenses.
- Missing or unverified information.

---

# 19. PDF REPORTING

Retain two distinct report types.

## A. Detailed Expenditure Statement

Purpose:

Provide a complete financial statement of an activity.

Include:

- Activity details.
- Organisation.
- Date range.
- Line-item expenditure.
- Payment methods.
- Masked card information.
- Person who paid.
- Reimbursable amounts.
- Original bills appended.
- Financial summary.

This is not automatically a formal claim.

## B. Expense Claim Submission

Purpose:

Submit eligible expenses to an organisation for reimbursement.

Include:

- Claimant profile.
- Designation.
- Department.
- Organisation.
- Claim period.
- Purpose.
- Eligible line items.
- Payment sources.
- Reimbursement account.
- Outstanding claim amount.
- Supporting bills.
- Declaration.
- Approval fields, where required.

A generated PDF must not be represented as approved or paid unless an actual corresponding workflow event has occurred.

---

# 20. REPORT FORMAT PREFERENCES

Allow organisation-specific defaults.

### Available Formats

1. Detailed + Bills.
2. Summary + Bills.

Remember the preferred format for each organisation profile.

The user must be able to override the format for an individual report.

Previously generated reports must retain their original contents.

Regeneration must produce a new version rather than silently altering an older document.

---

# 21. DOCUMENT AND BILL MANAGEMENT

Use the existing Document Vault.

Requirements:

- Attach existing receipts.
- Upload missing receipts.
- Capture bills using the camera.
- Support image and PDF attachments.
- Associate bills with the correct expense.
- Avoid unnecessary duplicate uploads.
- Preserve the original file.
- Preview bills before generating the report.

Where a document is missing, clearly identify the affected transaction.

Do not generate or invent bill images.

The user should be able to proceed with an appropriately labelled incomplete report where permitted.

---

# 22. FINANCIAL DATA INTEGRITY

The following rules are mandatory.

1. All expenses must originate from the existing financial ledger.
2. Transfers must not inflate expenses.
3. Credit card payments must not be counted as new expenditure.
4. Reimbursements received must not automatically become income.
5. Travel advances must be treated correctly.
6. Partially reimbursed expenses must show the remaining balance.
7. Company-paid expenses must not automatically become personal claims.
8. Workspace splits must reconcile with the original transaction.
9. Organisation allocations must not be duplicated.
10. Foreign exchange calculations must use the existing approved logic.
11. Historic exchange rates must be preserved.
12. Estimated information must be labelled.
13. Missing information must be disclosed.
14. Claim PDFs must not silently change existing transaction statuses.
15. Previously submitted or settled claims must be identifiable to prevent duplicate reimbursement.

Financial totals must reconcile with Ledgerline's existing calculation services.

---

# 23. SECURITY AND PERMISSIONS

Reimbursement profiles may contain sensitive employment and financial information.

Requirements:

- Authenticated access.
- User-specific profile permissions.
- Secure storage.
- Masked account information.
- Appropriate database access controls.
- Protection against accessing another user's reports.
- Authorised document downloads.
- Audit logging for relevant financial and profile changes.
- No exposed credentials in frontend code.

Do not assume that every user within an organisation is entitled to view another user's reimbursement details.

Organisation membership and reimbursement-report access must be separately authorised.

---

# 24. COMPLETE TESTING REQUIREMENTS

Test all important scenarios before declaring completion.

## A. Profile Tests

1. One user with multiple organisations.
2. Multiple roles within the same organisation.
3. Correct default profile.
4. Switching profiles.
5. Editing a claim without changing master settings.
6. Updating saved organisation details.
7. Changing reimbursement accounts.

## B. Activity Mapping Tests

8. AET trip automatically selects the correct profile.
9. MOVAC trip automatically selects the correct profile.
10. Business purchase uses the correct organisation.
11. Multiple organisation matches require confirmation.
12. Activity details are populated correctly.

## C. Expense Linking Tests

13. Existing linked expenses are retrieved.
14. Legacy activity tags are recognised where valid.
15. Potential matches are suggested.
16. Incorrect suggestions can be rejected.
17. Multiple transactions can be linked together.
18. No duplicate ledger entries are created.
19. Imported transactions remain traceable.

## D. Reimbursement Tests

20. Personal-card payment.
21. Organisation-card payment.
22. Cash payment.
23. Partial reimbursement.
24. Full reimbursement.
25. Travel advance.
26. Split expense between organisations.
27. Expense already included in a claim.
28. Missing payment details.
29. Missing receipt.

## E. Device Tests

30. iPhone portrait.
31. iPhone landscape where supported.
32. iPad portrait.
33. iPad landscape.
34. iPad Split View.
35. iPad Stage Manager resizing.
36. Desktop browser.
37. External keyboard navigation.
38. Touchscreen interaction.
39. PDF preview and download.
40. Fixed navigation and keyboard behaviour.

## F. Reliability Tests

41. Save interruption.
42. Slow network.
43. Repeated button taps.
44. Draft restoration.
45. Session expiry.
46. Report generation failure.
47. Large PDF with multiple bills.
48. Cross-device continuity.
49. Existing data migration.
50. Regression against the current financial ledger.

All test failures must be documented and resolved according to severity.

---

# 25. VISUAL QUALITY REQUIREMENTS

The interface must retain Ledgerline's premium design language.

Use:

- Approved Ledgerline typography.
- Navy primary branding.
- Restrained gold accents.
- Consistent spacing.
- Readable financial figures.
- Clear section hierarchy.
- Compact cards.
- Simple action buttons.

Avoid:

- Excessive form fields.
- Repetitive headings.
- Excessive scrolling.
- Oversized empty cards.
- Unnecessary shadows.
- Horizontally clipped data.
- Too many permanently visible controls.
- Different styling across iPhone, iPad and desktop.

Use responsive design rules rather than maintaining unrelated interfaces for each device.

---

# 26. DEVELOPMENT SEQUENCE

### Phase 1 — Existing System Audit

Inspect the existing:

- Organisation master.
- User profile.
- Financial account master.
- Reimbursement records.
- Trip/project relationships.
- Ledger transactions.
- Document Vault.
- PDF reporting.

Identify reusable fields and existing mappings.

### Phase 2 — Central Configuration

Implement:

- Organisation reimbursement profiles.
- Multiple roles.
- Approver settings.
- Reimbursement account mapping.
- Claim preferences.

### Phase 3 — Automatic Mapping

Implement:

- Trip mapping.
- Project mapping.
- Event mapping.
- Business purchase mapping.
- Automatic claimant prefilling.

### Phase 4 — Intelligent Expense Linking

Implement:

- Existing expense discovery.
- Suggested matches.
- Multi-selection.
- Duplicate protection.
- Review and confirmation.

### Phase 5 — Responsive Interface

Redesign:

- Settings.
- Claim submission.
- Transaction review.
- Report preview.

Test on iPhone, iPad and desktop.

### Phase 6 — Reporting Integration

Connect the redesigned workflow to the existing reporting services.

### Phase 7 — Testing and Audit

Perform:

- Functional tests.
- Financial reconciliation.
- Security checks.
- Responsive layout checks.
- Regression testing.

---

# 27. STRICT IMPLEMENTATION RESTRICTIONS

Do not:

1. Rebuild Ledgerline from scratch.
2. Delete existing organisations.
3. Delete or reset user profiles.
4. Delete financial accounts.
5. Modify historical transactions without an authorised operation.
6. Duplicate expenses during linking.
7. Create an independent reimbursement ledger.
8. Replace Universal Expense Entry.
9. Change existing financial calculations without validation.
10. Break current reports.
11. Automatically submit reimbursement claims.
12. Automatically approve reimbursement claims.
13. Deploy changes to the live application.
14. Activate paid services without approval.

Any database migration must be documented, reversible where practical and validated before application.

Preserve the existing database, records, permissions and functionality.

---

# 28. REQUIRED DEVELOPMENT COMPLETION REPORT

Lovable must provide:

1. Summary of implemented changes.
2. List of new configuration options.
3. Explanation of organisation-role mapping.
4. Explanation of activity-to-profile mapping.
5. Expense linking workflow.
6. Reimbursement calculation verification.
7. Database changes and migration details.
8. iPhone layout testing.
9. iPad portrait testing.
10. iPad landscape testing.
11. Desktop testing.
12. PDF generation results.
13. Security and access-control test results.
14. Unresolved issues.
15. Preview link.
16. Confirmation that production remains unchanged.

Do not declare completion based solely on a successful build.

Actual workflow testing and financial reconciliation are mandatory.

---

# 29. FINAL RECOMMENDATIONS

The following design decisions should be treated as the preferred implementation.

### Recommendation 1 — One Central Profile System

Configure personal and organisation-specific details once.

Do not maintain separate copies of the same information across different reporting pages.

### Recommendation 2 — Organisation-Specific Roles

Allow multiple roles for the same user without additional login accounts.

### Recommendation 3 — Automatic Activity Mapping

Whenever a trip, project or event is selected, automatically retrieve its relevant profile and existing information.

### Recommendation 4 — Intelligent Expense Linking

Do not require manual tagging of every historical expense.

Suggest matching transactions using existing financial records, but require confirmation where matching is uncertain.

### Recommendation 5 — One Shared Ledger

All reimbursement and reporting calculations must use existing ledger transactions.

### Recommendation 6 — Compact, Responsive Design

Provide a genuinely usable interface across iPhone, iPad and desktop.

On iPad, use the additional screen space for side-by-side transaction review and report preview where appropriate.

### Recommendation 7 — Exception-Based Interaction

Only ask the user to complete information that is missing, ambiguous or requires confirmation.

### Recommendation 8 — Separate Expenditure Statements and Claims

Retain both report formats for their different purposes.

### Recommendation 9 — Safe Draft Persistence

Allow users to leave and resume incomplete report preparation.

### Recommendation 10 — Financial Accuracy Before Automation

Automatic classification must never compromise financial accuracy.

The system should prioritise verified financial records over assumptions.

---

# 30. FINAL DEVELOPMENT INSTRUCTION

Enhance the existing Ledgerline application with a complete organisation-aware reimbursement management system.

Provide centrally configured claimant profiles, support multiple organisations and roles, automatically populate report details from linked trips and projects, intelligently identify existing expenses and simplify reimbursement report preparation.

Optimise the complete workflow for iPhone, iPad and desktop, including responsive layouts, multi-selection, transaction review and PDF generation.

Preserve all existing financial records, ledger calculations, organisations, accounts, trip data and reports.

Complete implementation and testing in the development environment.

**Do not deploy to the live application without explicit approval.**

### FINAL PRINCIPLE

**CONFIGURE ONCE. LINK AUTOMATICALLY. REVIEW EXCEPTIONS. GENERATE ACCURATE REPORTS.**

**End of Ledgerline Version 5.7 Development Requirements.**