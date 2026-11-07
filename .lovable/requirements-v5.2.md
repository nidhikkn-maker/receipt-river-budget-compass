LEDGERLINE

Version 5.2 — Smart Home & Travel Experience Redesign

Final Development Specification with Recommended Enhancements

Project: Existing Ledgerline Application
Priority: High
Development Type: Navigation, Usability and Travel Management Refinement
Design: Premium, Minimalist, Apple-Inspired
Primary Theme: Signature Blue & Gold

⸻

1. Project Objective

Redesign the existing Travel Manager and improve homepage navigation without removing functionality.

The current Travel Manager contains trip information, budget configuration, bookings, itineraries, travel advances, expense entry, reconciliation, reporting and trip creation within one extremely long page.

This arrangement must be replaced with a compact, clearly organised interface.

The redesign should make common activities accessible within one or two interactions.

Preserve the existing project, database, financial records and all functional modules.

⸻

2. Final Recommended Architecture

Use three interface levels.

Level 1 — Travel Manager

Display all trips and important travel information.

Level 2 — Individual Trip

Display an individual trip’s overview and navigation.

Level 3 — Specific Activity

Open focused screens or sheets for:

* Adding bookings.
* Adding itinerary items.
* Managing budgets.
* Recording advances.
* Reviewing reimbursements.
* Editing trip details.
* Generating reports.

Do not create multiple permanently expanded forms on one page.

⸻

PART A — HOMEPAGE

3. Customisable Homepage Menu

Introduce:

Home → Customise

Allow users to select which shortcuts and financial modules appear on the homepage.

3.1 Multiple Selection

Support:

* Select multiple shortcuts.
* Deselect shortcuts.
* Select all within a category.
* Clear selection.
* Restore recommended defaults.

3.2 Rearranging

Allow selected shortcuts to be reordered.

Use drag-and-drop where supported, with accessible alternatives.

3.3 Available Shortcuts

Include existing modules such as:

* Add Expense.
* Scan Receipt.
* Financial Inbox.
* Universal Search.
* Accounts.
* Credit Cards.
* Travel Manager.
* Upcoming Trips.
* Reimbursements.
* Upcoming Payments.
* Budgets.
* Reports.
* Financial Insights.
* AI Assistant.
* Wealth.
* Documents.

3.4 My Recommendation

Display a maximum of six primary shortcuts by default.

Additional shortcuts should be available through View All.

Recommended initial shortcuts:

1. Scan Receipt.
2. Financial Inbox.
3. Travel Manager.
4. Universal Search.
5. Upcoming Payments.
6. Reports.

The central + already provides immediate expense entry, so a separate Add Expense shortcut should be optional rather than permanently occupying another position.

⸻

4. Smart Workspace Selection

Replace an excessively long workspace-chip row with a compact selector.

Example:

Workspace: All ▾

On selection, open a sheet containing:

* Personal.
* Family.
* Business.
* Official.
* All Workspaces.

Allow multiple authorised workspaces to be selected.

Remember the user’s preferred selection.

Ensure consolidated financial totals do not double-count allocated expenses.

⸻

5. Homepage Personalisation

Retain:

Daily

Default everyday financial overview.

Executive

Comprehensive financial position.

Minimal

Essential information only.

Allow users to:

* Select homepage mode.
* Hide cards.
* Rearrange cards.
* Configure shortcuts.
* Save preferences.
* Restore defaults.

The homepage must remain compact on iPhone.

⸻

6. Universal Add Action

Preserve the central floating + button.

One tap must open Universal Expense Entry.

Do not introduce a separate expense-entry system for Travel Manager.

The selected trip or workspace may be passed into Universal Entry as an editable default.

⸻

PART B — TRAVEL MANAGER HOME

7. Compact Travel Manager

The main Travel Manager should display:

* Upcoming trips.
* Active trips.
* Completed trips.
* Travel search.
* Workspace filters.
* Create Trip.
* Important travel alerts.

Avoid displaying booking, budget and itinerary forms directly on this page.

7.1 Trip Cards

Each trip card should show:

* Trip name.
* Destination.
* Dates.
* Status.
* Workspace.
* Organisation.
* Budget.
* Recorded expenditure.

Selecting the card opens that trip.

7.2 Recommended Trip Filters

* Upcoming.
* Active.
* Completed.
* Cancelled.
* All.

Allow additional filtering by:

* Traveller.
* Organisation.
* Workspace.
* Destination.
* Date.

Support multiple selections where appropriate.

⸻

PART C — INDIVIDUAL TRIP

8. Trip Overview

Each trip should open in a dedicated view.

Display:

Header

* Trip name.
* Destination.
* Dates.
* Status.
* Edit option.

Financial Summary

* Budget.
* Actual expenditure.
* Unpaid commitments.
* Remaining allowance.
* Outstanding advances.
* Pending reimbursements.

Quick Actions

* Add Expense.
* Scan Receipt.
* Add Booking.
* Add Itinerary Item.
* Generate Report.

8.1 Trip Sections

Provide:

1. Overview.
2. Itinerary.
3. Bookings.
4. Expenses.
5. Budget & Settlements.
6. Reports.

Use compact section navigation suited to the iPhone.

Do not display all sections simultaneously.

⸻

9. Simplified Trip Creation

Open Create Trip as a focused workflow.

Essential Details

* Trip name.
* Destination.
* Start date.
* End date.
* Primary workspace.

Allow creation once these details are valid.

Optional Details

* Purpose.
* Organisation.
* Travellers.
* Budget.
* Currencies.
* Notes.
* Additional workspace allocations.

Optional information may be added later.

Recommended Improvement

Provide Save Draft.

Users should not lose a partially configured trip when navigating away.

Do not automatically open the keyboard when the form initially appears.

⸻

PART D — ITINERARY

10. Day-Wise Itinerary

Display the itinerary as a chronological timeline.

Each item should show:

* Time.
* Activity.
* Location.
* Participants.
* Linked booking.
* Relevant notes.

Use an Add Itinerary Item action to open the entry form.

Recommended Improvements

* Copy an itinerary item.
* Move an item to another day.
* Select multiple participants.
* Link existing bookings.
* Attach documents.
* Open locations in a supported maps application.
* Show timing conflicts where detectable.

Do not require comma-separated names.

Use a searchable multi-select participant control.

⸻

PART E — BOOKINGS

11. Dedicated Booking Management

Display bookings as compact cards.

Support:

* Flights.
* Hotels.
* Trains.
* Airport transfers.
* Ground transport.
* Car rentals.
* Activities.
* Other reservations.

Booking Details

* Provider.
* Date and time.
* Booking reference.
* Amount.
* Currency.
* Payment status.
* Travellers.
* Location.
* Supporting documents.
* Cancellation terms.

Only show additional fields when relevant to the booking type.

Recommended Improvements

Booking Document Import

Allow users to upload booking confirmations.

The system should attempt to extract booking information and prepare a draft for verification.

Booking-to-Itinerary Linking

A booking should be linkable to an itinerary item.

Booking-to-Expense Linking

A paid booking should link to an existing confirmed transaction or an approved new expense.

Do not count a booking as expenditure simply because it has been reserved.

⸻

PART F — TRAVEL EXPENSES

12. Unified Travel Expense Entry

All travel expenses must continue to use Universal Expense Entry.

When opened from a trip:

* Preselect the trip.
* Suggest the workspace.
* Suggest the organisation.
* Suggest the currency.
* Suggest relevant travel categories.

All suggestions must remain editable.

Multiple Selection

Within trip expenses, support:

* Select several transactions.
* Assign organisation.
* Add tags.
* Link existing transactions.
* Mark reimbursable.
* Include in reports.
* Review selected entries.

Maintain the original financial ledger and prevent double-counting.

⸻

PART G — TRAVEL FINANCES

13. Dedicated Budget & Settlements

Separate financial information into manageable subsections.

Budget

* Planned amount.
* Actual spending.
* Unpaid commitments.
* Remaining allowance.
* Contingency.

Budget Allocations

* Category.
* Workspace.
* Traveller.
* Currency.

Advances

* Amount received.
* Amount utilised.
* Amount returned.
* Outstanding advance.

Reimbursements

* Reimbursable amount.
* Amount submitted.
* Amount approved.
* Amount received.
* Outstanding balance.

Reconciliation

* Outstanding items.
* Transactions requiring review.
* Settlement status.

Use compact summaries by default.

Open configuration forms only when necessary.

⸻

14. Recommended Financial Improvements

14.1 Separate Commitments From Payments

Bookings and scheduled commitments must not automatically be treated as completed expenditure.

14.2 Avoid Duplicate Spending

A paid booking should not create a second expense if the payment already exists in Ledgerline.

14.3 Multi-Currency Accuracy

Preserve the recorded exchange rate applicable to the transaction.

A later exchange-rate update must not silently rewrite historical transaction values.

14.4 Shared Travel Expenses

Allow trips to involve more than one workspace.

For example:

Personal + Business.

Record one payment and allocate its financial responsibility appropriately.

The allocation total must equal the original amount.

⸻

PART H — REPORTS

15. Travel Reports

Move all reporting functions into a dedicated Reports section.

Support:

* Trip Financial Summary.
* Detailed Expenditure Statement.
* Budget vs Actual.
* Traveller-wise Expenditure.
* Workspace-wise Expenditure.
* Organisation-wise Expenditure.
* Booking Commitments.
* Travel Advances.
* Reimbursement Settlement.
* Final Trip Closure Report.

15.1 Detailed Expenditure Statement

Preserve the approved report format.

Include:

* Trip information.
* Organisation.
* Workspace.
* Expense line items.
* Merchant.
* Date.
* Payment method.
* Masked payment card details.
* Original payer.
* Amount paid.
* Reimbursable amount.
* Reimbursement received.
* Outstanding reimbursement.
* Original bills as annexures.

Support PDF download.

Keep the formal Expense Claim Submission Report separate.

⸻

PART I — INTELLIGENT TRAVEL FEATURES

16. Travel Inbox

Integrate travel-related pending work into the existing Financial Inbox.

Include:

* Booking confirmations awaiting review.
* Expense drafts.
* Receipt scans.
* Unlinked transactions.
* Reimbursement tasks.
* Report generation.
* Reconciliation exceptions.

Do not create a second unrelated inbox.

⸻

17. Smart Trip Linking

When recording an expense, Ledgerline should suggest an active or relevant trip based on:

* Transaction date.
* Merchant.
* Location where available.
* Existing booking references.
* Workspace.
* Previous user selections.

Do not automatically link uncertain transactions without confirmation.

⸻

18. Trip Readiness

Introduce a compact readiness indicator.

Review:

* Upcoming bookings.
* Missing booking details.
* Important payment dates.
* Pending documents.
* Travel advances.
* Financial commitments.

Do not add complex travel-operating features that are unrelated to Ledgerline’s existing purpose.

The focus should remain travel organisation and financial management.

⸻

PART J — TRIP COMPLETION

19. Controlled Trip Closure

Move Close Trip under:

Trip Overview → More → Close Trip

Before financial closure, check:

* Unconfirmed expenses.
* Unpaid commitments.
* Unsettled advances.
* Pending reimbursements.
* Unreconciled transactions.

Distinguish:

* Travel completed.
* Financial settlement pending.
* Financially closed.

Do not display “Everything is settled” unless the relevant records support it.

⸻

PART K — DESIGN AND NAVIGATION

20. Interface Standards

Use:

* Apple-inspired typography.
* Compact cards.
* Clear headings.
* Minimal repetitive explanations.
* Contextual help.
* Consistent spacing.
* Appropriate touch targets.
* Clean light and dark modes.

Maintain:

Primary Theme: Signature Blue & Gold.

Alternative: Apple × Ledgerline.

20.1 Header

Keep the header compact.

Avoid unnecessary repeated icons.

20.2 Footer

Preserve the existing primary navigation and central +.

Ensure the footer does not cover forms, controls or report content.

20.3 Horizontal Overflow

Fix:

* Oversized text.
* Misaligned date fields.
* Wide tables.
* Long category lists.
* Clipped filter controls.

All content must fit supported iPhone screen widths.

⸻

PART L — TECHNICAL REQUIREMENTS

21. Preserve Existing Architecture

Reuse:

* Trip database.
* Financial ledger.
* Accounts.
* Payment methods.
* Workspaces.
* Organisations.
* Travel bookings.
* Itinerary data.
* Budget engine.
* Advances.
* Reimbursements.
* Documents.
* Reporting services.

Do not duplicate the same data in separate financial systems.

21.1 Shared Components

Develop reusable components for:

* Trip cards.
* Summary cards.
* Section navigation.
* Multi-select fields.
* Booking forms.
* Itinerary forms.
* Financial summaries.
* Report actions.
* Processing states.

21.2 Persistence

Preserve unfinished forms and drafts where supported.

21.3 Feedback

Display clear saving, loading, success and failure indicators.

Prevent repeated submissions.

⸻

PART M — DEVELOPMENT PRIORITIES

22. Priority 1 — Core Navigation

1. Compact Travel Manager overview.
2. Dedicated individual trip view.
3. Separate trip sections.
4. Simplified Create Trip.
5. Correct responsive layout issues.

23. Priority 2 — Operational Workflows

6. Dedicated Itinerary.
7. Dedicated Bookings.
8. Universal Expense Entry integration.
9. Multiple selection.
10. Document-to-booking extraction.

24. Priority 3 — Financial Management

11. Budget summaries.
12. Budget configuration screens.
13. Advances.
14. Reimbursements.
15. Reconciliation.
16. Financial integrity verification.

25. Priority 4 — Home Navigation

17. Home shortcut selection.
18. Home shortcut reordering.
19. Workspace multi-selection.
20. User preferences.
21. Homepage modes.
22. Favourites.

26. Priority 5 — Advanced Refinement

23. Smart trip linking.
24. Travel Inbox integration.
25. Trip readiness.
26. Reports consolidation.
27. Controlled trip closure.
28. Theme and typography refinements.
29. iPhone testing.

⸻

PART N — ACCEPTANCE REQUIREMENTS

27. Required Demonstrations

Before completion, demonstrate:

1. Travel Manager is no longer one excessively long page.
2. Existing trips remain available.
3. Each trip has its own dedicated view.
4. Bookings have a separate screen.
5. Itinerary has a separate screen.
6. Budget management is clearly organised.
7. Advances and reimbursements remain accurate.
8. Universal Expense Entry is reused.
9. Paid bookings do not duplicate expenses.
10. Shared-workspace travel allocations reconcile correctly.
11. Multiple travellers can be selected.
12. Multiple eligible transactions can be selected.
13. Reports remain available.
14. Original bills remain accessible.
15. Trip closure uses validation.
16. Home shortcuts can be selected and hidden.
17. Home shortcuts can be reordered.
18. Workspace filters support multiple selection.
19. Homepage preferences are preserved.
20. The central + continues to work.
21. The interface works correctly on iPhone.
22. Existing financial records remain unchanged.
23. Existing Ledgerline functionality remains operational.

⸻

28. FINAL DEVELOPMENT DIRECTION

Redesign Ledgerline’s Travel Manager into a compact, trip-centred experience.

Do not remove existing functionality.

Separate trip discovery, trip details, bookings, itinerary, expenses, budgets, settlements and reporting.

Move long forms into focused screens or sheets.

Implement customisable homepage shortcuts with multiple selection.

Maintain a single Universal Expense Entry and shared financial ledger.

Use existing workspace, account, payment-method and reporting services.

Preserve all records, permissions, attachments and financial calculations.

Do not create a new project.

Do not delete existing trips.

Do not duplicate financial transactions.

Do not replace the existing transaction engine.

Do not deploy changes to the live application without approval.

Provide a before-and-after interface review and feature-wise completion report.

⸻

FINAL DESIGN PRINCIPLE

SHOW THE INFORMATION FIRST.

OPEN THE FORM ONLY WHEN NEEDED.

KEEP FINANCIAL RECORDING UNIFIED.

MAKE NAVIGATION SIMPLE.

PRESERVE FINANCIAL ACCURACY.

LEDGERLINE VERSION 5.2

LESS SCROLLING. SMARTER TRAVEL. EASIER FINANCES.

End of Final Development Specification.