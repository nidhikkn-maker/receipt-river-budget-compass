

# LEDGERLINE
## Version 4.0 — Unified Expense & Travel Management
### Revised Development Requirements — Core Architecture and Integration

**Project:** Existing Ledgerline Application  
**Platform:** Lovable  
**Development Type:** Enhancement to existing application

## 1. Development Objective

Extend Ledgerline into a unified financial and travel management platform supporting Personal, Family, Business and Official workspaces.

The central requirement is to establish **Universal Expense Entry** as the common transaction-entry system for the entire application.

The revised development must incorporate eight core capabilities:

1. Universal Expense Entry.
2. Intelligent Workspace Classification.
3. Multi-Workspace Financial Management.
4. Comprehensive Travel Management.
5. Automated Expense Categorisation.
6. Travel Budgets and Financial Reporting.
7. Booking and Itinerary Management.
8. Reimbursement and Settlement Tracking.

All eight capabilities must work together using the existing financial database, transaction ledger and calculation services.

Do not create parallel accounting systems, duplicate transaction-entry forms or disconnected financial records.

---

# PART A — UNIVERSAL FINANCIAL ARCHITECTURE

## 2. Universal Expense Entry

### 2.1 Primary Requirement

Develop or enhance one universal transaction-entry interface that serves every Ledgerline workspace and module.

The same entry interface must be accessible from:

- Main Dashboard.
- Personal Workspace.
- Family Workspace.
- Business Workspace.
- Official Workspace.
- Travel Manager.
- Individual Trip.
- Credit Card Management.
- Receipt Scanner.
- Statement Import.
- AI Assistant.

Every entry must ultimately use the same underlying transaction service and financial ledger.

### 2.2 Supported Transaction Types

- Expense.
- Income.
- Transfer.
- Refund.
- Reimbursement.
- Advance.
- Advance settlement.
- Credit card payment.
- Loan repayment.
- Investment transaction.
- Balance adjustment.

Each transaction type must follow its existing financial treatment.

Do not classify every movement of money as an expense.

### 2.3 Universal Entry Fields

**Essential fields**

- Amount.
- Transaction date.
- Transaction type.
- Category.
- Payment account.
- Workspace.

**Additional fields**

- Subcategory.
- Merchant.
- Organisation.
- Trip.
- Traveller.
- Currency.
- Exchange rate.
- Description.
- Tags.
- Receipt.
- Reimbursement status.
- Allocation details.
- Booking reference.
- Project reference.

Only essential fields should be visible initially.

Additional fields should appear based on the selected transaction type, workspace and context.

### 2.4 Intelligent Entry Behaviour

The entry interface should dynamically adapt.

**Example 1 — Personal Expense**

Entering a grocery purchase should require only the amount, category and payment method, with Personal Workspace suggested automatically.

**Example 2 — Business Expense**

Selecting MOVAC should automatically suggest the Business Workspace and previously associated categories.

**Example 3 — Travel Expense**

Opening Add Expense inside an Indonesia trip should automatically associate the new transaction with that trip.

**Example 4 — Shared Expense**

A hotel expense involving business and family expenditure should allow allocation between both workspaces within the same entry.

### 2.5 Multiple Capture Methods

The universal entry system should support:

1. Manual entry.
2. Receipt scanning.
3. Screenshot scanning.
4. PDF and document upload.
5. Bank statement import.
6. Credit card statement import.
7. Voice-based entry.
8. Natural-language entry.
9. iOS Share Sheet.
10. AI-assisted extraction.

Every capture method must lead to the same verification and transaction-saving workflow.

### 2.6 Duplicate Prevention

Before saving imported or extracted transactions, check existing records using available identifiers, payment accounts, dates, amounts, merchants and references.

Present possible matches for confirmation.

Repeated uploads must not create duplicate expenses.

---

## 3. Intelligent Workspace Classification

### 3.1 Objective

Ledgerline should intelligently suggest which workspace an expense belongs to.

Supported workspaces:

- Personal.
- Family.
- Business.
- Official.

The system should also support organisation-level classification within authorised workspaces.

### 3.2 Classification Intelligence

Suggestions may consider:

- Merchant.
- Previous transactions.
- Payment account.
- Expense category.
- Trip association.
- Organisation.
- Traveller.
- Transaction description.
- User-established classification rules.

### 3.3 Classification Confidence

Where technically feasible, provide:

- High-confidence suggestion.
- Suggested classification requiring review.
- Unclassified transaction.

Low-confidence classifications must be presented for confirmation.

Users must be able to override all automated suggestions.

Confirmed corrections should improve future recommendations.

### 3.4 Classification Rules

Examples:

- Expenses associated with MOVAC projects → Suggest Business / MOVAC.
- Expenses linked to a family vacation → Suggest Family.
- Expenses linked to an approved official visit → Suggest Official.
- Regular personal subscriptions → Suggest Personal.

These are suggestions, not compulsory classifications.

A merchant may serve multiple purposes, so previous classification alone must not determine every future transaction.

---

## 4. Multi-Workspace Financial Management

### 4.1 Unified Workspace Structure

Continue using Ledgerline's existing financial workspace system.

Each workspace should support:

- Expense classification.
- Income classification.
- Categories.
- Budgets.
- Reports.
- Projects.
- Trip associations.
- Reimbursement records.
- Authorised users.

### 4.2 Single Transaction, Multiple Allocations

A transaction may belong to multiple workspaces.

**Example**

Hotel expense: ₹60,000.

- Business: ₹36,000.
- Family: ₹24,000.

The original transaction remains ₹60,000.

The payment account must be charged only once.

Workspace reports should reflect allocated amounts.

The consolidated financial report must not count the expenditure twice.

### 4.3 Allocation Methods

Support:

- Fixed amount allocation.
- Percentage allocation.
- Equal allocation.
- Custom allocation.

The sum of all allocations must equal the original transaction amount.

### 4.4 Payment Ownership

The workspace responsible for an expense may differ from the account used for payment.

For example:

A MOVAC expense paid using a personal AMEX card must remain associated with the personal credit card liability while being classified as a business-related expense.

Where applicable, it should also create a reimbursement claim.

Do not create artificial deductions from business bank accounts.

### 4.5 Workspace Permissions

Users should only access authorised workspaces and records.

Sharing travel information must not automatically expose personal bank balances, investments or unrelated transactions.

---

# PART B — COMPREHENSIVE TRAVEL MANAGEMENT

## 5. Dedicated Travel Manager

### 5.1 Architecture

Create a dedicated Travel Manager within the existing Ledgerline application.

Travel Manager should handle travel operations independently while using the universal financial system for actual transactions.

### 5.2 Travel Types

- Personal.
- Family.
- Business.
- Official.
- Mixed-purpose.

A single trip may involve several workspaces.

### 5.3 Travel Manager Features

- Trip creation.
- Trip planning.
- Traveller management.
- Itinerary management.
- Booking management.
- Travel documents.
- Expense monitoring.
- Currency tracking.
- Travel budgets.
- Advances.
- Reimbursements.
- Financial reports.
- Trip closure.

### 5.4 Trip Creation

Required fields:

- Trip name.
- Destination.
- Start date.
- End date.
- Travel purpose.
- Primary workspace.
- Travellers.
- Organisation, where applicable.
- Estimated budget.
- Currency.

Users should be able to create trips with minimal initial information and add details later.

### 5.5 Expense Integration

Every trip should display its associated financial transactions.

Selecting Add Expense from a trip must open the same Universal Expense Entry interface.

The trip should be automatically selected.

No separate travel expense database or independent accounting process should be created.

---

## 6. Automated Expense Categorisation

### 6.1 Categories

Extend the existing category hierarchy to support travel-related expenditure.

**Travel**

- Flights.
- Hotels.
- Trains.
- Ground transport.
- Airport transfers.
- Car rental.
- Fuel.
- Visa.
- Insurance.
- Food and beverages.
- Sightseeing.
- Activities.
- Shopping.
- Communication.
- Service charges.
- Miscellaneous.

Avoid creating duplicate categories where suitable existing categories can be reused.

### 6.2 AI-Based Categorisation

The system should identify relevant categories from:

- Receipt information.
- Merchant descriptions.
- Payment screenshots.
- Imported statements.
- User descriptions.
- Previously confirmed classifications.
- Associated trip and booking information.

### 6.3 Automated Trip Association

If an expense occurs during an active trip, the application should suggest the relevant trip.

Consider transaction date, merchant, location information when available and payment context.

Do not automatically associate transactions with trips solely because their dates overlap.

Users must approve uncertain matches.

---

## 7. Travel Budgets and Financial Reporting

### 7.1 Trip Budgeting

Each trip should support:

- Total trip budget.
- Category-wise budget.
- Workspace-wise allocation.
- Traveller-wise allocation.
- Contingency allowance.
- Multi-currency budgeting.

### 7.2 Financial Dashboard

Display:

1. Total planned budget.
2. Confirmed booking commitments.
3. Actual expenditure.
4. Remaining unpaid commitments.
5. Forecast final trip cost.
6. Budget balance.
7. Pending reimbursements.
8. Workspace-wise expenditure.

### 7.3 Reporting

Provide:

- Trip-wise expenditure.
- Workspace-wise travel expenditure.
- Organisation-wise expenditure.
- Traveller-wise expenditure.
- Category-wise expenditure.
- Payment account-wise expenditure.
- Destination-wise expenditure.
- Planned versus actual expenditure.
- Monthly and annual travel expenditure.
- Reimbursement reports.

### 7.4 Reporting Integrity

Expenses must be counted once in consolidated reporting.

Allocated amounts must reconcile with original transactions.

Unpaid reservations must remain commitments rather than actual expenditure.

---

## 8. Booking and Itinerary Management

### 8.1 Booking Management

Supported bookings:

- Flights.
- Hotels.
- Trains.
- Buses.
- Transfers.
- Rental vehicles.
- Tours.
- Activities.
- Insurance.
- Visa services.
- Other travel arrangements.

### 8.2 Booking Details

- Provider.
- Booking reference.
- Traveller.
- Service date.
- Location.
- Currency.
- Booking amount.
- Paid amount.
- Outstanding amount.
- Payment due date.
- Confirmation status.
- Cancellation conditions.
- Attachments.

### 8.3 Booking-to-Expense Integration

A booking and an actual payment are separate records.

A booking may have:

- No payment.
- One payment.
- Multiple partial payments.
- Refunds.
- Cancellation charges.

Allow booking records to link to existing financial transactions.

Do not create an additional expense when an existing transaction is matched to the booking.

### 8.4 Itinerary

Provide:

- Day-wise itinerary.
- Calendar view.
- Activities.
- Meetings.
- Transfers.
- Accommodation details.
- Traveller assignments.
- Booking references.
- Important notes.
- Linked documents.

The itinerary must remain operational even when individual activities have no financial transactions.

---

# PART C — REIMBURSEMENT AND SETTLEMENT

## 9. Reimbursement Tracking

### 9.1 Objective

Integrate Travel Manager with the existing reimbursement system.

Support situations where one person or workspace pays expenses attributable to another person or organisation.

### 9.2 Reimbursement Information

- Original transaction.
- Claimant.
- Responsible workspace.
- Responsible organisation.
- Claim amount.
- Claim date.
- Approval status.
- Amount reimbursed.
- Balance outstanding.
- Receiving account.
- Supporting documents.

### 9.3 Workflow

1. Record expense through Universal Expense Entry.
2. Classify the appropriate workspace.
3. Mark reimbursement as applicable.
4. Create a linked reimbursement claim.
5. Track approval and settlement.
6. Match reimbursement receipt to the original claim.
7. Update outstanding reimbursement balance.

Do not duplicate the original expense during settlement.

### 9.4 Advance Settlement

Support travel advances provided before a trip.

The application should distinguish:

- Advance received.
- Advance transferred.
- Actual expenses.
- Advance utilised.
- Advance returned.
- Outstanding settlement.

Advance transfers must not be treated automatically as final expenditure.

### 9.5 Trip Closure

At the end of a trip:

- Verify recorded expenses.
- Reconcile booking payments.
- Review outstanding commitments.
- Check workspace allocations.
- Review reimbursements.
- Settle advances.
- Finalise currency differences.
- Generate trip reports.

Closing a trip should not create duplicate ledger postings.

---

# PART D — INTEGRATED USER WORKFLOWS

## 10. Workflow A — Normal Expense

1. User selects Add Expense.
2. Universal Expense Entry opens.
3. User enters or scans expense.
4. System suggests category and workspace.
5. User reviews and saves.
6. Existing Ledgerline accounts and reports update.

## 11. Workflow B — Travel Expense

1. User opens Travel Manager.
2. Selects a trip.
3. Selects Add Expense.
4. Universal Expense Entry opens with trip preselected.
5. User records expense.
6. Workspace and category are suggested.
7. User confirms.
8. Trip and financial dashboards update immediately.

## 12. Workflow C — Mixed-Purpose Expense

1. User records a ₹60,000 expense.
2. Selects Split Allocation.
3. Assigns ₹36,000 to Business.
4. Assigns ₹24,000 to Family.
5. Confirms payment account.
6. Saves one transaction.
7. Both workspace reports reflect their respective amounts.
8. The payment account reflects the full ₹60,000 once.

## 13. Workflow D — Booking Without Payment

1. User creates a hotel booking.
2. Enters confirmed booking amount.
3. Adds payment due date.
4. Booking appears as an unpaid commitment.
5. Trip budget and forecast reflect the commitment.
6. Actual financial balances remain unchanged.

## 14. Workflow E — Booking Payment

1. User pays for an existing booking.
2. Records the transaction through Universal Expense Entry or imports the statement.
3. Links the payment to the booking.
4. Booking outstanding amount decreases.
5. The financial ledger records the payment once.

## 15. Workflow F — Business Reimbursement

1. User pays a business expense personally.
2. Transaction is allocated to the business workspace.
3. A reimbursement claim is created.
4. The claim is approved.
5. Payment is received.
6. Reimbursement is matched and settled.
7. The original expenditure is not counted again.

---

# PART E — DEVELOPMENT INTEGRATION

## 16. Database Requirements

The developer must reuse the existing transaction ledger.

Required relationships should support:

- Transactions to workspaces.
- Transactions to allocation records.
- Transactions to organisations.
- Transactions to trips.
- Transactions to booking payments.
- Transactions to reimbursement claims.
- Trips to travellers.
- Trips to itineraries.
- Trips to documents.
- Trips to budgets.

Financial allocation records should reference the original transaction rather than create duplicate transactions.

Ensure that financial updates are atomic, consistent and auditable.

## 17. User Interface

Maintain the existing Ledgerline visual identity and navigation.

Do not create separate expense-entry forms for individual workspaces or Travel Manager.

Use contextual fields, intelligent defaults and progressive disclosure to simplify entry.

The experience must remain responsive and suitable for iPhone use.

## 18. Security

All enhancements must preserve existing authentication, workspace isolation and financial data security.

AI classification must operate only on authorised data.

No user should gain access to another workspace's private financial information through shared trips or documents.

---

# PART F — IMPLEMENTATION PRIORITIES

## Priority 1 — Unified Financial Foundation

1. Universal Expense Entry.
2. Intelligent Workspace Classification.
3. Multi-Workspace Financial Management.
4. Transaction Allocation Engine.
5. Automated Expense Categorisation.

These functions must be integrated and tested before extending financial workflows.

## Priority 2 — Travel Operations

6. Comprehensive Travel Management.
7. Trip Creation.
8. Traveller Management.
9. Booking Management.
10. Itinerary Management.
11. Travel Documents.

## Priority 3 — Travel Financial Integration

12. Trip Budgets.
13. Booking-to-Transaction Linking.
14. Travel Financial Reporting.
15. Multi-Currency Support.
16. Reimbursement Tracking.
17. Advance and Settlement Tracking.

## Priority 4 — Intelligence and Completion

18. Intelligent Trip Association.
19. AI-Assisted Travel Analysis.
20. Automated Reconciliation Suggestions.
21. Trip Closure.
22. Advanced Reports.
23. Comprehensive Testing.

All priorities form one development programme.

---

# PART G — MANDATORY ACCEPTANCE CRITERIA

Before declaring development complete, verify:

1. There is only one universal expense-entry component.
2. Existing financial transactions remain unchanged unless explicitly edited.
3. Expenses entered from Travel Manager appear in the unified ledger immediately.
4. Expenses entered from the main dashboard can be associated with trips.
5. Workspace classification suggestions remain editable.
6. Multi-workspace allocation does not duplicate expenses.
7. Credit card liabilities are recorded only once.
8. Unpaid bookings do not reduce account balances.
9. Booking payments reconcile with existing transactions.
10. Reimbursement settlements do not inflate income.
11. Travel advances are correctly distinguished from expenses.
12. Trip budgets distinguish actual expenditure from commitments.
13. Multi-currency calculations reconcile correctly.
14. Workspace permissions remain enforced.
15. Existing Ledgerline modules continue functioning correctly.
16. Travel reports reconcile with the unified financial ledger.
17. Closing a trip does not create new duplicate expenditure.

---

# FINAL DEVELOPMENT INSTRUCTION

This enhancement must be incorporated into the existing Ledgerline project.

The development must establish Universal Expense Entry as the foundation of all personal, family, business, official and travel-related financial activities.

Travel Manager should operate as a dedicated module for planning, booking, itinerary management, traveller management and travel operations.

All financial transactions must remain part of the existing unified financial system.

The application should automatically suggest appropriate workspace, organisation, category and trip classifications while keeping the final decision with the user.

**Final architecture:**

**ONE UNIVERSAL EXPENSE ENTRY. ONE FINANCIAL LEDGER. INTELLIGENT CLASSIFICATION. MULTIPLE WORKSPACES. COMPREHENSIVE TRAVEL MANAGEMENT.**

Preserve existing Ledgerline functionality, financial data, accounts, authentication, workspaces and branding.

Review the existing implementation before creating new components. Extend and reuse functioning features wherever possible.

Proceed in the stated priority order, validate each stage and provide a final implementation report.

**End of Revised Ledgerline Version 4.0 Development Requirements.**

