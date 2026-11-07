LEDGERLINE VERSION 4.4

Additional Development Requirements

Intelligent Quick Entry & Smart Expense Capture

1. Quick Entry as the Default Experience

The Universal Expense Entry must open in Quick Entry mode by default.

When the user taps the central floating + button, the application should immediately open the simplified expense-entry interface.

Default Fields

1. Amount.
2. Category.
3. Payment account.
4. Workspace.
5. Date.

The date should automatically default to today.

The payment account and workspace should be intelligently suggested based on the user’s previous confirmed selections and current application context.

The amount field should receive immediate focus.

Users should be able to save a normal expense without opening additional sections.

Quick Entry Requirements

* Minimal scrolling.
* Compact fields.
* Clear labels.
* Searchable categories.
* Intelligent suggestions.
* One-tap access to receipt scanning.
* Persistent Save action.
* Proper keyboard handling.
* Clear validation messages.

The user should not be required to interact with irrelevant fields.

⸻

2. Smart Expense Capture

Introduce three intelligent shortcuts within the Universal Expense Entry interface.

These should be presented compactly without adding visual clutter.

2.1 Repeat Last Expense

Provide a Repeat Expense shortcut.

Behaviour

When selected, Ledgerline should retrieve the user’s most recent eligible expense or allow selection from recent transactions.

The application should prepopulate:

* Category.
* Merchant.
* Payment account.
* Workspace.
* Relevant tags.
* Optional description.

The transaction date should default to the current date.

The previous amount may be suggested but must remain clearly editable.

Important Rules

* Do not duplicate the original transaction automatically.
* Do not reuse its original transaction ID.
* Do not automatically copy reimbursement or settlement status.
* Do not automatically copy trip associations that are no longer relevant.
* Require confirmation before saving.
* Create a new transaction only after the user saves.

Additional Enhancement

Allow users to mark frequently repeated expenses as favourites.

These favourites should appear in a compact Recent or Favourites selector.

⸻

2.2 Scan and Fill

Provide a Scan and Fill shortcut.

Behaviour

1. Open the camera immediately.
2. Capture a bill or receipt.
3. Process the document using the existing extraction service.
4. Identify relevant transaction information.
5. Prepopulate Universal Expense Entry.
6. Present the extracted information for verification.
7. Save only after user confirmation.

Information to Extract

* Merchant.
* Date.
* Total amount.
* Currency.
* Tax, where available.
* Relevant category.
* Payment method, where identifiable.
* Description.
* Individual items, where supported.

Additional Requirements

* Allow corrections.
* Retain the original receipt.
* Detect potential duplicates.
* Support multiple images or documents where existing functionality permits.
* Clearly indicate uncertain extracted values.
* Preserve manually entered information when scanning is initiated.

The application must not independently save uncertain extracted transactions.

⸻

2.3 Voice and Fill

Provide a Voice and Fill shortcut.

Behaviour

The user should be able to describe an expense naturally.

Example:

“Spent ₹3,500 for dinner using AMEX. Family expense.”

Ledgerline should identify:

* Amount: ₹3,500.
* Category: Food and Beverages.
* Payment account: AMEX, if available.
* Workspace: Family.
* Description: Dinner.

The extracted values should populate the existing Universal Expense Entry form.

The user must be able to review and correct the information before saving.

Additional Examples

“₹1,200 fuel, personal, paid through IDFC.”

“₹8,500 hotel in Jakarta, MOVAC business expense.”

“₹2,000 groceries yesterday, paid by UPI.”

Requirements

* Support natural-language entry.
* Support flexible word order.
* Identify dates expressed conversationally.
* Recognise existing account names.
* Suggest appropriate categories.
* Recognise workspace names.
* Suggest relevant trips.
* Clearly identify uncertain information.

Do not create transactions automatically from voice commands without confirmation.

⸻

3. Detailed Entry — Progressive Disclosure

The existing advanced functionality must remain available through a More Details section.

Advanced Fields

* Transaction type.
* Merchant.
* Description.
* Tags.
* Organisation.
* Business purpose.
* Person.
* Family member.
* Multi-workspace allocation.
* Expense splitting.
* Trip association.
* Booking reference.
* Reimbursement.
* Currency conversion.
* Exchange rate.
* Supporting documents.
* Other existing advanced fields.

Intelligent Field Visibility

Display advanced fields based on context.

Examples:

Personal expense: Hide unnecessary business and travel fields.

Business expense: Offer organisation, business purpose and reimbursement details.

Family expense: Offer person association and family splitting.

Travel expense: Offer trip and booking association.

Shared expense: Display allocation controls.

Foreign currency expense: Display currency conversion information.

Users should always retain the option to manually access advanced fields.

Switching between Quick Entry and Detailed Entry must not erase entered information.

Both modes must use the same underlying transaction service.

⸻

4. Recommended Interface Layout

The redesigned Universal Expense Entry should follow this hierarchy.

Header

* Close.
* New Expense.
* Transaction Type / More Options.

Primary Capture Area

* Amount.
* Scan.
* Voice.
* Repeat.

Essential Details

* Category.
* Payment Account.
* Workspace.
* Date.

Optional Details

* More Details.
* Advanced classification and allocation fields.

Bottom Action

* Save Expense.

The Save button should remain easily accessible while respecting keyboard visibility and iPhone safe areas.

The standard bottom navigation should be hidden during focused expense entry.

⸻

5. Intelligent Personalisation

Ledgerline should improve the entry experience using confirmed historical preferences.

Suggested Information

* Frequently used payment account.
* Recently used category.
* Preferred workspace.
* Frequently used merchant.
* Relevant trip.
* Previously confirmed tags.

User Control

All suggestions must remain editable.

The application must not silently classify uncertain transactions.

Users should be able to correct classifications.

Confirmed corrections should inform future suggestions.

⸻

6. Performance Objectives

The redesigned entry system should minimise unnecessary interaction.

Target User Experience

Routine Expense

Tap + → Enter Amount → Confirm Category and Account → Save.

Receipt Expense

Tap + → Scan → Review → Save.

Voice Expense

Tap + → Speak → Review → Save.

Repeated Expense

Tap + → Repeat → Adjust Amount → Save.

Advanced Expense

Tap + → Enter Amount → More Details → Classify → Save.

These are interaction targets, not separate transaction-entry systems.

⸻

7. Development Priority

Implement the following as part of Version 4.4:

Priority 1

1. Quick Entry default.
2. Amount-first interface.
3. Compact essential fields.
4. Persistent Save action.
5. Focused mobile layout.

Priority 2

6. Repeat Last Expense.
7. Scan and Fill.
8. Voice and Fill.
9. Recent and Favourite Expenses.

Priority 3

10. Contextual Detailed Entry.
11. Intelligent field visibility.
12. Smart defaults.
13. Existing workspace integration.
14. Existing travel integration.
15. Existing reimbursement integration.

Priority 4

16. Duplicate prevention.
17. Form validation.
18. Performance testing.
19. iPhone usability testing.
20. Regression testing across existing Ledgerline modules.

⸻

8. Acceptance Requirements

Before declaring the development complete:

1. Tapping + immediately opens Quick Entry.
2. Quick Entry displays only essential fields.
3. The user can enter a normal expense without opening Detailed Entry.
4. Repeat Expense creates a new transaction only after confirmation.
5. Scan and Fill populates the existing entry form.
6. Voice and Fill populates the existing entry form.
7. All AI-extracted information remains editable.
8. Detailed Entry retains all existing advanced functionality.
9. Switching modes does not delete entered information.
10. Workspace and trip associations remain functional.
11. Payment accounts update correctly.
12. Duplicate expense creation is prevented.
13. All transaction types remain supported.
14. The Save action remains accessible.
15. No existing financial data is modified during development.

⸻

9. FINAL IMPLEMENTATION DIRECTION

The Ledgerline expense-entry experience must prioritise speed, simplicity and financial accuracy.

Quick Entry must be the default.

Detailed Entry must remain available when required.

Intelligent Capture must provide convenient scanning, voice and repeat-entry functionality.

All entry methods must use the same Universal Expense Entry component and underlying financial transaction service.

ONE UNIVERSAL ENTRY. QUICK BY DEFAULT. INTELLIGENT CAPTURE. DETAILED WHEN REQUIRED.

Implement these requirements as part of Ledgerline Version 4.4.

Preserve all existing records, financial calculations, workspaces, travel management, authentication and application functionality.

Do not deploy changes to the live application until approved.