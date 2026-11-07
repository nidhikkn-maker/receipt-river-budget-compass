# LEDGERLINE
## Version 5.5 — Travel Manager: Compact Trip Budget & Allocation Redesign

**Project:** Existing Ledgerline Application  
**Platform:** Lovable  
**Development Type:** UI/UX Redesign and Financial Logic Verification  
**Priority:** High  
**Deployment:** Development/Preview Only

---

# 1. Objective

Redesign the existing **Budget Allocations** section inside Travel Manager.

The current interface separately displays:

- Workspace budget.
- Traveller budget.
- Currency budget.
- Multiple budget entry fields.
- Multiple Save buttons.

This creates unnecessary scrolling and makes it difficult to understand the actual trip budget.

Replace this interface with a compact, easy-to-understand **Trip Budget** card.

The new system must:

1. Show the overall trip budget clearly.
2. Automatically calculate actual expenditure.
3. Display the remaining budget.
4. Display the amount eligible for reimbursement.
5. Support optional detailed allocations.
6. Avoid duplicate budget calculations.
7. Integrate with Universal Expense Entry.
8. Use the existing financial ledger.
9. Preserve all existing records and settings.

**This is a redesign of the existing Travel Manager, not a new independent financial system.**

---

# 2. Recommended User Interface

Within an individual trip, display:

## Trip Budget

**Example: Kovai Trip**

Workspace: Business  
Organisation: AET  
Currency: INR

| Financial Summary | Amount |
|---|---:|
| Total Budget | ₹10,000 |
| Actual Expenses | ₹0 |
| Remaining Budget | ₹10,000 |
| Reimbursable Balance | ₹0 |

Below the summary, provide three actions:

**Edit Budget | View Breakdown | Add Expense**

The primary card must remain compact.

Do not show detailed allocation forms unless the user specifically opens them.

### Important

- Actual expenditure comes from linked, confirmed financial transactions.
- Remaining budget is calculated automatically.
- Reimbursable balance comes from eligible expenses after applicable settlements.
- Pending commitments must be distinguished from paid expenditure.
- A trip can exceed its budget; do not prevent valid expense recording.

---

# 3. Primary Trip Budget

Introduce one primary trip budget.

The primary budget should include:

- Budget amount.
- Primary currency.
- Optional contingency amount.
- Budget notes.
- Last updated date.

### Default behaviour

When creating a trip, ask for:

1. Trip name.
2. Destination.
3. Travel dates.
4. Trip type.
5. Workspace and organisation, where applicable.
6. Optional budget amount.
7. Primary currency.

Do not require workspace-wise, traveller-wise or currency-wise allocations during initial trip creation.

Users must be able to create a trip without a budget.

If no budget exists, display:

**Budget not set**

Provide an **Add Budget** action.

Do not display ₹0 as though a budget has been intentionally configured.

---

# 4. Optional Budget Breakdown

Below the Trip Budget summary, introduce:

**View Budget Breakdown**

When selected, open a dedicated view containing the following tabs.

### A. By Workspace

Show allocations across:

- Personal.
- Family.
- Business.
- Official.

Example:

| Workspace | Allocated | Spent |
|---|---:|---:|
| Business | ₹10,000 | ₹0 |

Allow users to add or edit allocations.

### B. By Traveller

Display a list of travellers and their allocated budgets.

Example:

| Traveller | Allocated | Spent |
|---|---:|---:|
| Krupanidhi Karunanithi | ₹10,000 | ₹0 |

Travellers must be selected from the existing trip traveller list.

Do not require users to enter traveller names repeatedly.

### C. By Category

Support category-level budgets such as:

- Flights.
- Hotels.
- Meals.
- Local transport.
- Fuel.
- Activities.
- Other configured categories.

Use Ledgerline's existing category master.

### D. By Currency

Display budgets and expenditure by currency.

Support INR and other currencies used within the trip.

Each currency allocation should preserve its original currency value.

Where consolidated amounts are displayed, apply the existing approved currency-conversion rules.

### E. By Organisation

For business and official trips, allow allocations across authorised organisations.

Organisation options must come from the central Settings configuration.

Do not ask the user to repeatedly type organisation names.

---

# 5. Critical Financial Reconciliation Rules

This section is mandatory.

## 5.1 Prevent Double Counting

Workspace, traveller, category and currency budgets represent different dimensions of the same financial plan.

They must not automatically be added together.

### Example

Trip budget: ₹10,000

Workspace allocation:

Business — ₹10,000

Traveller allocation:

Krupanidhi Karunanithi — ₹10,000

**Correct total trip budget: ₹10,000**

**Incorrect total: ₹20,000**

The system must distinguish between:

- Primary trip budget.
- Allocation dimensions.
- Actual expenditure.
- Unpaid commitments.
- Reimbursements.

Each allocation dimension should reconcile independently with the primary budget when configured as a complete allocation.

Partial allocations must be identified as partial, not assumed to cover the entire budget.

If an allocation exceeds the intended budget, display a warning rather than silently changing financial values.

## 5.2 Single Transaction Source

All actual expenses must come from the shared Ledgerline financial ledger.

Do not create duplicate expense records inside the Budget module.

A transaction linked to a trip must be counted only once in the trip's total expenditure.

Where a transaction has multiple workspace allocations, those allocations must reconcile to the original transaction amount.

## 5.3 Bookings and Commitments

Distinguish between:

- Confirmed paid expenses.
- Unpaid bookings.
- Pending commitments.
- Cancelled bookings.
- Refunded transactions.

Unpaid bookings must not be treated as expenses already paid.

Recommended calculation:

**Remaining Budget = Primary Budget − Confirmed Expenses**

Also display:

**Available After Commitments = Primary Budget − Confirmed Expenses − Outstanding Commitments**

Avoid double-counting a booking when its payment later becomes a confirmed ledger transaction.

## 5.4 Reimbursements

The reimbursement summary must distinguish:

- Eligible expenses paid personally.
- Eligible expenses paid through personal cards.
- Amounts paid directly by the organisation.
- Travel advances received.
- Reimbursements already received.
- Amount still pending reimbursement.

Do not automatically assume that every Business or Official expense is reimbursable.

A business expense paid using an organisation-owned card may not create a personal reimbursement receivable.

Reimbursement eligibility must be based on the expense's configured reimbursement status and responsible party.

**Pending reimbursement must not be counted as new income.**

Travel advances and reimbursement receipts must be reconciled according to their existing financial treatment.

---

# 6. Universal Expense Entry Integration

The **Add Expense** action must open Ledgerline's existing Universal Expense Entry.

Automatically preselect:

- Current trip.
- Relevant workspace.
- Relevant organisation, where appropriate.
- Primary currency, where appropriate.

The user should still be able to change applicable selections.

The expense entry must support:

- Date.
- Merchant.
- Category.
- Amount.
- Currency.
- Payment method.
- Actual payment account or card.
- Workspace.
- Organisation.
- Traveller.
- Reimbursement eligibility.
- Original bill attachment.
- Notes.

After saving, the Trip Budget card must update automatically.

Do not require a second budget-update action.

Do not create a separate travel expense entry system.

---

# 7. Budget Editing Experience

Selecting **Edit Budget** should open a small dedicated form or bottom sheet.

Fields:

- Total budget.
- Currency.
- Optional contingency.
- Notes.

Provide one primary action:

**Save Changes**

Remove the existing separate controls:

- Save workspace budget.
- Save traveller budget.
- Save currency budget.

These functions must remain available through the optional Budget Breakdown view, where applicable.

For detailed allocations, provide a single clear save workflow.

The app must display:

- Saving…
- Saved successfully.
- Unable to save — Retry.

Prevent repeated taps from creating duplicate records.

---

# 8. Budget Warnings

Introduce subtle financial warnings.

Recommended behaviour:

| Budget Utilisation | Status |
|---|---|
| Below 80% | Within Budget |
| 80–99% | Approaching Limit |
| 100% | Budget Fully Utilised |
| Above 100% | Over Budget |

These thresholds should be configurable in Settings.

Do not use aggressive warning colours unnecessarily.

The user must be able to record expenses even when the trip is over budget.

For overspending, display the excess amount clearly instead of showing an unexplained negative remaining balance.

---

# 9. Multi-Currency Handling

For international trips:

1. Preserve each original transaction currency.
2. Preserve the recorded transaction exchange rate.
3. Use the approved Ledgerline conversion logic.
4. Display consolidated totals in the trip's reporting currency.
5. Allow original-currency breakdowns.
6. Do not recalculate historic transactions merely because current exchange rates change.

If an exchange rate is missing or unverified, flag the amount clearly.

Do not silently invent a rate.

Multi-currency allocations must not inflate the total budget.

---

# 10. Existing Data Migration and Preservation

Before implementing the new design, inspect the existing Travel Manager budget tables, relationships and calculations.

### Mandatory requirements

1. Preserve all current trip records.
2. Preserve existing workspace allocations.
3. Preserve existing traveller allocations.
4. Preserve currency budgets.
5. Preserve category budgets.
6. Preserve linked bookings.
7. Preserve travel advances.
8. Preserve transaction relationships.
9. Preserve reimbursement records.
10. Preserve existing trip reports.

### Migration principle

Do not automatically sum historical workspace, traveller and currency budgets to derive a new primary trip budget.

Where the existing primary budget is already defined, retain that value.

Where no authoritative primary budget exists, display **Budget requires confirmation**.

The user must be able to review ambiguous historical budget records.

Do not overwrite, merge or delete allocations without an explicit, validated migration rule.

Use a reversible migration approach with a verified backup and rollback plan.

---

# 11. Mobile UI and Layout Requirements

Optimise primarily for iPhone.

### Design rules

- Compact financial summary.
- Clear headings.
- Proper spacing.
- Consistent Ledgerline typography.
- Existing navy and gold brand identity.
- Readable financial figures.
- Minimal scrolling.
- No horizontally overflowing text.
- No unnecessarily large input fields.
- No repetitive instructions.
- No permanently expanded advanced forms.

### Navigation

Within a trip:

**Travel Manager → Select Trip → Budget & Settlement**

The Trip Overview should also show a smaller budget summary.

Selecting that summary should open the detailed Budget & Settlement view.

Do not display the complete budget configuration inside Trip Overview.

### Fixed Bottom Navigation

Ensure that:

- Content remains visible above the bottom navigation.
- Form buttons are not covered.
- The keyboard does not obstruct inputs.
- The keyboard does not automatically open when entering the page.

Preserve the user's current trip and unsaved draft state during permitted navigation.

---

# 12. Reports Integration

The redesigned budget data must feed into existing:

- Trip Financial Summary.
- Detailed Expenditure Statement.
- Budget versus Actual Report.
- Traveller-wise Expense Report.
- Workspace-wise Expense Report.
- Reimbursement Statement.
- Final Trip Closure Report.

PDF reports must use the same financial calculations as the application.

The Detailed Expenditure Statement must continue showing:

- Itemised expenses.
- Payment method.
- Masked card identification where applicable.
- Actual amount spent.
- Reimbursable amount.
- Original bills appended to the PDF where supported.

Do not create a separate calculation engine for reporting.

---

# 13. Testing Requirements

Before declaring completion, test the following scenarios.

### Test 1 — Single Budget

Create a trip with a ₹10,000 budget.

Expected:

- Planned: ₹10,000.
- Spent: ₹0.
- Remaining: ₹10,000.

### Test 2 — Allocation Without Duplication

Allocate:

- Business workspace: ₹10,000.
- Traveller: ₹10,000.

Expected:

**Total trip budget remains ₹10,000.**

### Test 3 — Expense Addition

Add a confirmed expense of ₹3,000.

Expected:

- Budget: ₹10,000.
- Spent: ₹3,000.
- Remaining: ₹7,000.

### Test 4 — Personal Card Payment

Add a ₹2,000 eligible business expense paid using a personal card.

Expected:

- Expense counted once.
- Payment method recorded correctly.
- Reimbursement eligibility recognised.
- Reimbursement pending updated correctly.

### Test 5 — Unpaid Booking

Create an unpaid hotel booking of ₹4,000.

Expected:

- Confirmed spending does not increase.
- Outstanding commitments increase.
- Available after commitments updates.

### Test 6 — Currency Conversion

Add an expense in a foreign currency.

Expected:

- Original currency preserved.
- Recorded exchange rate preserved.
- Consolidated amount calculated correctly.

### Test 7 — Existing Trip Migration

Open a trip that already contains workspace, traveller and currency budgets.

Expected:

- All original allocations remain accessible.
- No duplicated budgets.
- No lost records.
- No unexpected financial changes.

### Test 8 — Mobile Usability

Test the complete workflow on iPhone Safari.

Expected:

- No clipping.
- No overlapping controls.
- No hidden buttons.
- No unwanted keyboard opening.
- No unnecessary horizontal scrolling.

### Test 9 — Reimbursements and Advances

Test personally funded expenses, company-funded expenses, advances and partial reimbursements.

Expected:

- No duplicate expense.
- No artificial income.
- Correct outstanding settlement.

### Test 10 — Save Reliability

Tap Save repeatedly or interrupt the connection during saving.

Expected:

- No duplicate allocation records.
- Correct saving state.
- Safe retry.
- No silent loss of changes.

---

# 14. Development Instructions for Lovable

Implement this redesign in the existing Ledgerline application.

### Phase 1 — Audit

Inspect:

- Current Travel Manager components.
- Existing budget records.
- Relevant database tables.
- Shared financial calculations.
- Universal Expense Entry integrations.
- Existing reports.

Identify which budget fields represent primary budgets and which represent allocation dimensions.

### Phase 2 — Redesign

Replace the current permanently expanded Budget Allocations form with:

1. Compact Trip Budget card.
2. Edit Budget action.
3. Optional Budget Breakdown.
4. Existing Universal Expense Entry integration.

### Phase 3 — Financial Validation

Verify:

- Correct expense totals.
- No duplicated budgets.
- Correct workspace splits.
- Correct reimbursement amounts.
- Correct multi-currency treatment.
- Correct commitments.
- Correct reporting outputs.

### Phase 4 — Regression Testing

Test the redesign against existing trips and financial records.

Document any unresolved issues.

---

# 15. Strict Development Restrictions

**Do not:**

- Delete existing financial records.
- Recreate the application.
- Replace the shared ledger.
- Introduce duplicate expense systems.
- Automatically combine unrelated budget allocations.
- Reset existing trip budgets.
- Change existing transaction amounts.
- Break current reports.
- Modify historical exchange rates.
- Deploy changes to the live application.
- Activate additional paid infrastructure without approval.

Implement and test in a development or preview environment.

If safe implementation requires a database migration, present the migration details, risks and rollback plan before applying it.

---

# 16. Completion Report Required

After development, provide:

1. Summary of UI changes.
2. Before-and-after interface description.
3. Database changes, if any.
4. Confirmation of preserved records.
5. Financial reconciliation test results.
6. Mobile testing results.
7. Any unresolved issues.
8. Preview link.
9. Confirmation that the live application remains unchanged.

Do not declare the redesign complete merely because the page renders correctly.

The financial calculations and existing records must also be verified.

---

# 17. Final Recommendation

My preferred Ledgerline budgeting architecture is:

**One Primary Trip Budget + Optional Allocation Dimensions + Automatic Ledger-Based Financial Tracking.**

The user should only need to enter the overall trip budget.

Workspace, traveller, category, organisation and currency breakdowns should be optional and available when required.

Actual expenses, commitments, reimbursements and remaining balances should update automatically from Ledgerline's existing financial records.

The objective is to make Travel Manager suitable for everyday personal trips while retaining the detailed financial controls needed for VEI official travel, MOVAC business trips and multi-traveller activities.

**Final Principle:**

**ONE TRIP. ONE BUDGET. MULTIPLE VIEWS. NO DUPLICATE CALCULATIONS.**

**End of Ledgerline Version 5.5 Development Requirements.**