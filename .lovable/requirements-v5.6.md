# LEDGERLINE
## Version 5.6 — Organisation-Based Reimbursement Profiles & Automatic Claim Prefilling

**Project:** Existing Ledgerline Application  
**Platform:** Lovable  
**Development Type:** Settings, Reimbursement Workflow and Report UX Enhancement  
**Priority:** High  
**Deployment:** Development/Preview Only

---

## 1. Objective

Improve Ledgerline's reimbursement workflow by introducing centrally managed, reusable claimant profiles.

Users associated with multiple organisations must be able to maintain different:

- Designations and roles.
- Departments.
- Employee or member IDs.
- Reporting and approving authorities.
- Reimbursement payment destinations.
- Claim submission preferences.
- Organisation-specific report details.

Whenever a trip, project, event or business expense is selected, Ledgerline should automatically identify the appropriate reimbursement profile.

Avoid repeated data entry.

All details must remain editable.

---

## 2. Central Reimbursement Settings

Introduce a dedicated configuration page:

**Settings → Financial Setup → Reimbursements**

Replace the current informational **Learn More** action with:

**Configure Reimbursements**

The settings page should contain:

1. My Reimbursement Profiles.
2. Organisation and Role Mapping.
3. Approval and Reporting Details.
4. Reimbursement Payment Accounts.
5. Default Claim Preferences.
6. Trip, Project and Event Mapping.
7. Report Templates.
8. Rules and Exceptions.

The Financial Setup checklist should display:

- Not Configured.
- Partially Configured.
- Ready.

Configuration must remain optional for users who do not need reimbursement tracking.

---

## 3. Multiple Organisation Profiles

Allow users to create more than one claimant profile.

### Example

| Organisation | Role | Department | Reimbursement Destination |
|---|---|---|---|
| AET / VEI | Vice Chairman | Configurable | Selected personal account |
| KRNA Enterprises / MOVAC | Director | Configurable | Selected account |
| Other organisation | User-defined | User-defined | Selected account |

These are illustrative mappings. Do not assume specific employee IDs, approval authorities or bank destinations.

### Each profile should contain:

**Organisation Information**

- Organisation name.
- Workspace.
- Organisation code, if applicable.
- Department or division.
- Cost centre, if applicable.

**Claimant Information**

- Claimant name.
- Designation.
- Employee ID, where applicable.
- Department.
- Official email.
- Optional contact details.

**Approvals**

- Reporting authority.
- Approving manager.
- Finance/accounts department.
- Additional approver, if applicable.

**Reimbursement Details**

- Default receiving account.
- Account holder.
- Bank name.
- Masked account identification.
- Preferred reimbursement currency.

**Preferences**

- Default report format.
- Default declaration.
- Default supporting-document rules.
- Applicable reimbursement categories.

Organisation profiles must reference Ledgerline's existing organisation and account masters wherever possible.

Do not create duplicate organisation or financial-account records.

---

## 4. Support Multiple Roles Within the Same Organisation

One person may have multiple roles.

For example, an individual may act as:

- Director.
- Trustee.
- Vice Chairman.
- Authorised representative.
- Consultant.
- Employee.

Therefore:

**One organisation must support multiple role profiles.**

Example:

Organisation: AET

Profile A: Vice Chairman  
Profile B: Authorised Representative

The user should be able to select the applicable role without creating another organisation.

Each role may have different approval and claim-report preferences.

---

## 5. Trip, Project and Event Mapping

Introduce automatic reimbursement-profile mapping for:

- Trips.
- Projects.
- Official events.
- Business activities.
- Business purchases.
- Other tagged activities.

### Example Workflow

**Travel Manager → Kovai Trip**

Trip details:

- Workspace: Business.
- Organisation: AET.
- Purpose: Auditor Meeting.

When generating a reimbursement report:

Ledgerline should automatically fill:

- Organisation: AET.
- Claimant: Krupanidhi Karunanithi.
- Designation: Saved AET role.
- Department: Saved AET department.
- Approval authority: Saved AET approver.
- Reimbursement account: Saved preferred account.
- Purpose: Auditor Meeting.
- Trip name: Kovai Trip.
- Dates: Actual trip dates.

The user should only review and confirm these details.

### Mapping Priority

Use the following order:

1. Explicit profile selected for this report.
2. Profile assigned to the trip, project or event.
3. Unique applicable organisation-and-role profile.
4. User's configured default profile for that organisation.
5. Manual selection if the mapping remains ambiguous.

Do not guess between multiple valid roles.

If a trip spans several organisations, identify the responsible organisation for each expense.

Do not combine claims payable by different organisations into a single claim without a clear separation and user confirmation.

---

## 6. Automatic Claim Prefilling

Redesign the current **Expense Claim Submission** page.

### Current Problem

The user must manually enter:

- Name.
- Employee ID.
- Department.
- Designation.
- Email.
- Approving manager.
- Reimbursement account.
- Statement purpose.
- Organisation.

This becomes repetitive when preparing multiple reports.

### Recommended New Layout

**Expense Claim Submission**

**1. Claim For**

- Trip / Project / Event selector.
- Organisation selector.
- Claimant role selector.

**2. Claimant Profile**

Display a compact summary:

Name · Designation · Organisation · Department

Actions:

**Change Profile | Edit for This Claim**

**3. Reimbursement Account**

Automatically display the selected saved account, using masked identification.

Allow the user to change it.

**4. Claim Period and Purpose**

Populate from the selected activity.

**5. Eligible Expenses**

Automatically load eligible linked transactions.

**6. Report Format**

- Detailed + Bills.
- Summary + Bills.

**7. Review & Generate**

Display the total amount to be reimbursed, exceptions and missing documents.

Avoid permanently displaying every profile input field.

---

## 7. Clear Payment Source and Reimbursement Responsibility

For each expense, track:

1. Who incurred the expense.
2. Who paid the expense.
3. Payment method.
4. Actual payment account or card.
5. Which organisation bears the expense.
6. Reimbursement eligibility.
7. Amount already reimbursed.
8. Remaining reimbursement amount.

### Example

Expense: Hotel  
Amount: ₹12,000  
Paid by: Krupanidhi Karunanithi  
Payment method: Personal AMEX card  
Responsible organisation: AET  
Eligible reimbursement: ₹12,000  
Reimbursement received: ₹0  
Outstanding: ₹12,000

The report must preserve masked card identification where available.

Never expose full card numbers in reports.

Do not automatically classify a company-paid expense as personally reimbursable.

---

## 8. Handling Multiple Organisations in One Trip

Some activities may involve more than one organisation.

Example:

A business trip includes expenses attributable to AET and MOVAC.

Ledgerline should support:

- Organisation-wise expense allocation.
- Separate reimbursement responsibilities.
- Separate claim profiles.
- Separate claim PDFs.
- A consolidated expenditure statement showing both organisations.

The consolidated expenditure statement is an informational financial report.

Formal reimbursement claims must identify the correct paying organisation.

Workspace and organisation splits must reconcile with the original transactions.

---

## 9. Saved Reimbursement Accounts

Reimbursement destinations should be selected from existing configured accounts.

Example:

**Reimburse To: IDFC FIRST Bank ••••1234**

The final four digits shown above are illustrative.

Provide:

- Set as default for this organisation.
- Change account.
- Add account through Settings.

Do not ask users to type the bank name and account details every time.

Do not duplicate bank account records.

Changes to payment destination must not automatically alter previously generated claim documents.

---

## 10. Reusable Approval Details

Allow organisation-specific approval information.

Fields may include:

- Approving manager.
- Reporting authority.
- Department head.
- Accounts department.
- Approval designation.

These must be editable.

Where an organisation has several approval routes, allow the user to select the applicable route.

Do not invent approval hierarchies.

A missing approving authority must remain blank or be flagged for confirmation.

The system must not represent a generated PDF as formally approved merely because an approver's name is prefilled.

---

## 11. Automatic Expense Selection

When a trip, project or event is selected, Ledgerline should find its linked expenses.

Classify them into:

- Eligible for reimbursement.
- Already reimbursed.
- Partially reimbursed.
- Organisation-paid.
- Personal or non-reimbursable.
- Missing payment details.
- Missing bills.
- Unverified.

Only eligible, outstanding amounts should be included in the formal reimbursement total.

Provide multiple selection options:

- Select all eligible.
- Select by organisation.
- Select by date.
- Select by category.
- Select by payment method.
- Select individually.

Uncertain items must require review.

The report must clearly display excluded items and the reason for exclusion.

Generating a PDF must not automatically change reimbursement or approval status.

---

## 12. Remember Preferences Securely

The screenshot currently states:

**Claimant details remembered on this device.**

Replace this approach, where the necessary secure infrastructure already exists, with authenticated user-specific settings stored in Ledgerline's authorised database.

Requirements:

- Profiles remain available across the user's authorised devices.
- Sensitive details are protected.
- Users cannot access another person's profiles without permission.
- Local device storage is not the sole source of important reimbursement settings.
- Changes should be saved with visible confirmation.

Where server-side secure profile storage is unavailable, clearly disclose the limitation. Do not claim cross-device persistence until implemented and tested.

---

## 13. Claim Report Design

The generated PDF must include:

**Claimant Header**

- Claimant name.
- Designation.
- Department.
- Organisation.
- Claim period.
- Trip, project or event.

**Expense Details**

- Date.
- Merchant.
- Description.
- Category.
- Payment method.
- Masked card/account identification.
- Amount spent.
- Eligible reimbursement.
- Already reimbursed.
- Outstanding reimbursement.

**Supporting Documents**

Attach the original bills in the appropriate order.

Indicate where a supporting bill is missing.

**Claim Summary**

- Total submitted expenditure.
- Ineligible or excluded expenditure.
- Eligible reimbursement.
- Advances and reimbursements already received.
- Outstanding claim amount.

Retain the existing Detailed Expenditure Statement as a separate report from the formal Expense Claim Submission.

---

## 14. Financial Integrity

Mandatory rules:

1. No duplicate expenses.
2. No duplicate reimbursement claims without clear identification.
3. No automatic classification of all business expenses as reimbursable.
4. No inclusion of fully settled expenses as outstanding.
5. No duplication of credit card payments.
6. No inflation of income through reimbursement receipts.
7. No double counting of workspace or organisation allocations.
8. No alteration of historic exchange rates.
9. No fabricated claimant or approver details.
10. No changes to original transactions merely because a profile is edited.

Historical claim PDFs must retain the details used when they were generated.

Any regenerated report should create a new version.

---

## 15. Testing and Acceptance Requirements

Test the following scenarios:

1. One user with three organisations.
2. One user with multiple roles in one organisation.
3. AET trip correctly selects the AET profile.
4. MOVAC trip correctly selects the MOVAC profile.
5. A trip with multiple organisations requests clarification.
6. Changing a claim profile does not change the original expense.
7. Reimbursement account defaults correctly.
8. Personal-card payments remain identifiable.
9. Company-paid expenses are excluded from personal reimbursement.
10. Partially settled expenses show only the outstanding balance.
11. Missing bills are clearly identified.
12. Bulk selection works correctly.
13. PDFs display the selected claimant details.
14. Original bills are attached correctly.
15. Previously generated reports remain unchanged.
16. Saved profiles work across authorised devices.
17. Existing reimbursement records remain intact.
18. The mobile layout has no clipping or unnecessary scrolling.
19. Missing or ambiguous mappings are never silently guessed.
20. No changes are deployed to production.

---

## 16. Additional UX Recommendations

Implement the following:

### A. Set Default Profile

Allow one default role per organisation, while retaining other roles.

### B. Quick Switch

Provide a **Change Profile** option directly on the claim page.

### C. One-Time Setup

Guide the user through reimbursement-profile configuration once.

### D. Automatic Purpose

Use the trip or project purpose instead of asking users to type it again.

### E. Smart Missing Information

Show only missing details that require attention.

Example:

**Ready to generate — 2 expenses need bills.**

### F. Preview Before Download

Allow users to inspect claimant details, payment methods and amounts before generating the final PDF.

### G. Profile-Based Report Preferences

Remember whether an organisation normally requires:

- Detailed + Bills.
- Summary + Bills.

The user must still be able to change the format for an individual claim.

---

## 17. Implementation Instructions for Lovable

1. Audit the existing organisation, account, trip, project, expense and reimbursement data structures.
2. Identify reusable existing configuration fields.
3. Introduce organisation-specific claimant and role profiles where needed.
4. Add explicit activity-to-profile mapping.
5. Implement automatic claim prefilling.
6. Redesign the claim screen into compact review sections.
7. Maintain the existing Universal Expense Entry and shared ledger.
8. Verify reimbursement calculations.
9. Test on desktop and iPhone.
10. Provide a preview and implementation report.

Preserve the complete existing database, financial records, account mappings, permissions and report functionality.

Use reversible migrations where required.

**Do not deploy to the live application without approval.**

---

## 18. Final Recommendation

Ledgerline should follow this structure:

**One Person → Multiple Organisations → Multiple Roles → Linked Activities → Automatically Prepared Reimbursement Reports**

A user should configure their organisation-specific details once.

After that, selecting an activity should automatically prepare the relevant reimbursement information.

The user should review exceptions, confirm the amounts and generate the report.

**Final Principle:**

**CONFIGURE ONCE. MAP AUTOMATICALLY. REVIEW AND GENERATE.**

**End of Ledgerline Version 5.6 Development Requirements.**