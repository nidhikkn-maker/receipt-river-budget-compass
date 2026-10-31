LEDGERLINE

Version 4.4 — Universal Expense Entry Redesign

Intelligent Quick Capture & Progressive Expense Entry

Project: Existing Ledgerline Application
Development Platform: Lovable
Development Type: UI/UX Redesign of Existing Universal Expense Entry
Priority: High
Primary Platform: iPhone

⸻

1. PROJECT OBJECTIVE

Redesign Ledgerline’s existing Universal Expense Entry interface.

The current expense-entry page contains extensive functionality, but presents too many controls simultaneously.

This results in:

* Excessive scrolling.
* Visually crowded forms.
* Complicated transaction-type selection.
* Too many visible tags.
* Large workspace-selection controls.
* Repeated payment-related fields.
* Unnecessary information for simple expenses.
* Poor mobile usability.
* Difficulty locating the Save action.

The objective is to make everyday expense capture extremely simple while preserving every existing advanced financial feature.

Do not create a second expense-entry system.

Refactor the existing Universal Expense Entry into one adaptive interface with Quick Entry and Detailed Entry modes.

⸻

2. EXISTING FUNCTIONALITY PRESERVATION

Before development:

1. Inspect the existing expense-entry component.
2. Identify every field and its underlying database relationship.
3. Review validation logic.
4. Review transaction-type handling.
5. Review account-selection logic.
6. Review payment-method handling.
7. Review workspace allocation.
8. Review category and tag management.
9. Review AI receipt scanning.
10. Review voice-based entry.
11. Review currency conversion.
12. Review reimbursement handling.
13. Review travel integration.
14. Review transaction-saving services.

Preserve all existing functionality.

Do not:

* Modify historical transactions.
* Change financial calculation logic.
* Remove supported transaction types.
* Delete categories.
* Delete tags.
* Modify existing accounts.
* Change workspace relationships.
* Remove reimbursement functionality.
* Remove travel integration.
* Introduce duplicate financial records.

⸻

PART A — NEW EXPENSE ENTRY STRUCTURE

3. TWO-MODE ENTRY SYSTEM

Introduce two presentation modes within the existing Universal Expense Entry.

Mode 1 — Quick Entry

Default mode.

Designed for everyday expenses.

Mode 2 — Detailed Entry

Available through an expandable More Details section.

Designed for advanced expense classification.

Both modes must use the same transaction state, validation rules and saving service.

Switching modes must not erase information already entered.

⸻

4. QUICK ENTRY

The default screen should display:

1. Amount.
2. Category.
3. Payment account.
4. Workspace.
5. Date.
6. Optional quick note.
7. Save Expense.

Provide compact quick-capture actions for:

* Camera.
* Gallery.
* Files.
* Voice.

Do not require users to scroll through advanced fields before saving a normal expense.

Amount Entry

The amount should be the most prominent element.

Requirements:

* Numeric keypad.
* Automatic currency formatting.
* Default currency from user settings.
* Currency selector when needed.
* Clear validation.
* Appropriate decimal handling.
* Automatic focus when opening the entry screen.

Category

Use a searchable category selector.

Display recently used categories first.

Support intelligent suggestions.

Do not display the complete category hierarchy by default.

Payment Account

Use one compact selector.

Display recently used accounts first.

Possible options:

* Cash.
* Bank accounts.
* Credit cards.
* Digital wallets.
* Other existing financial accounts.

Display only accounts available to the authorised user.

Workspace

Use one compact selector.

Supported:

* Personal.
* Family.
* Business.
* Official.

Suggest the appropriate workspace based on context and previous confirmed behaviour.

Date

Default to the current date.

Allow editing.

⸻

PART B — EXPENSE CAPTURE

5. RECEIPT SCANNING

Replace the current oversized receipt-upload section with compact actions.

Buttons

* Camera.
* Gallery.
* Files.

Workflow

1. User selects source.
2. Uploads or captures receipt.
3. Existing AI extraction processes the document.
4. Extracted values populate the entry form.
5. User reviews the information.
6. User confirms and saves.

Support multiple attachments where existing functionality allows.

Do not create confirmed transactions automatically from uncertain extracted information.

Batch Capture

If several documents are uploaded:

* Process them individually.
* Show review status.
* Allow users to correct each entry.
* Identify possible duplicates.
* Avoid automatically saving uncertain records.

⸻

6. VOICE ENTRY

Provide a compact microphone action.

Example:

“Spent ₹2,500 on dinner using AMEX yesterday.”

The application should attempt to identify:

* Amount.
* Category.
* Payment account.
* Date.
* Merchant, where stated.

Populate the existing entry form for review.

Voice recognition must not independently post transactions without confirmation.

⸻

PART C — DETAILED ENTRY

7. ADVANCED DETAILS

Provide an expandable More Details section.

The section should contain contextually relevant advanced fields.

General

* Merchant.
* Title.
* Description.
* Tags.
* Attachments.

Workspace

* Workspace allocation.
* Multiple workspace split.
* Organisation.
* Business purpose.

People

* Expense beneficiary.
* Family member.
* Split between people.

Travel

* Trip.
* Traveller.
* Booking reference.
* Travel purpose.

Financial

* Reimbursement.
* Currency conversion.
* Exchange rate.
* Transaction reference.
* Additional notes.

Only display relevant sections based on transaction context.

Do not expose all advanced fields simultaneously.

⸻

8. INTELLIGENT FIELD VISIBILITY

Implement conditional field display.

Examples:

Personal grocery expense

Hide business purpose, organisation and travel fields unless requested.

Business expense

Show relevant organisation and reimbursement fields.

Travel expense

Show trip association and travel-related fields.

Shared expense

Show allocation controls.

Foreign currency expense

Show exchange-rate details.

All hidden fields must remain accessible through Detailed Entry when relevant.

⸻

PART D — TRANSACTION TYPE SELECTION

9. SIMPLIFIED TRANSACTION TYPES

The existing interface displays numerous transaction types as large buttons.

Replace this with a compact transaction-type selector.

Default

Expense.

Other Supported Types

* Income.
* Transfer.
* Refund.
* Reimbursement.
* Adjustment.
* Card Payment.
* Loan Repayment.
* Investment.
* Travel Advance.
* Advance Return.

Do not remove any existing transaction type.

Behaviour

When the user chooses a different type:

* Display relevant fields.
* Hide irrelevant fields.
* Preserve compatible entered values.
* Apply appropriate validation.
* Use the existing financial treatment.

Complex transaction types may use specialised subforms within the same universal transaction-entry system.

Do not force expense-specific fields onto non-expense transactions.

⸻

PART E — TAG MANAGEMENT

10. COMPACT TAG SELECTOR

Remove the existing long list of visible tag checkboxes.

Replace it with a compact searchable tag selector.

Default Display

Show:

* Selected tags.
* Add Tag action.

Tag Selection

On selecting Add Tag:

* Open a searchable sheet.
* Group tags by type.
* Show frequently used tags.
* Allow multiple selections.
* Provide selected-tag chips.

Tag Groups

* Person.
* Purpose.
* Organisation.
* Nature.
* Project.
* Other custom groups.

Do not delete or rename existing tags.

Preserve all existing tag relationships.

Users should be able to remove selected tags easily.

⸻

PART F — WORKSPACE MANAGEMENT

11. COMPACT WORKSPACE SELECTOR

Replace the current large four-option workspace panel with one selector.

Default Display

Show the selected workspace.

Example:

Personal ▼

Selection Options

* Personal.
* Family.
* Business.
* Official.

Multi-Workspace Allocation

Provide a Split Expense option.

Only display allocation controls when enabled.

Split Methods

* Percentage.
* Fixed amount.
* Equal split.
* Custom split.

Total allocated amounts must equal the original transaction amount.

The payment account must be affected only once.

⸻

12. PERSON ALLOCATION

Do not display the full For Whom section for every transaction.

Instead:

* Suggest Self by default where appropriate.
* Provide optional person selection.
* Show split controls only when enabled.

Family members should be selected from the existing authorised directory.

Preserve existing family-related expense tracking.

⸻

PART G — PAYMENT MANAGEMENT

13. PAYMENT ACCOUNT AND METHOD

Simplify the current Account and Paid With sections.

The interface should clearly distinguish:

* The actual account or wallet affected by the transaction.
* The payment method used.

Recommended Behaviour

The primary Paid With selector should show the relevant actual financial account.

Examples:

* Cash Wallet.
* IDFC Bank.
* AMEX Card.
* Other saved accounts.

Where useful, display payment method information as secondary metadata.

Examples:

* UPI.
* Debit Card.
* Credit Card.
* Bank Transfer.
* Cash.

Missing Account Handling

If no account is configured:

* Show Add Account.
* Explain that an account is required for accurate account-balance tracking.
* Allow the existing application’s supported draft or pending-entry workflow, if available.
* Do not silently debit an unspecified account.

Do not treat generic UPI as an independent balance-holding account unless the user has configured it as one.

Avoid presenting multiple conflicting payment selectors.

⸻

PART H — CURRENCY AND DATE

14. CURRENCY MANAGEMENT

Default to INR.

Allow users to change currency.

For foreign currency expenses:

* Record original amount.
* Record exchange rate.
* Calculate INR equivalent.
* Preserve exchange-rate source and date where available.
* Allow reconciliation against actual bank or card settlement amounts.

Do not display lengthy currency explanations on the main entry screen.

Use an information tooltip or advanced section.

⸻

15. DATE ENTRY

Default to the current date.

Display the date in a compact field.

Support:

* Today.
* Yesterday.
* Custom date.

Do not require a full calendar interaction for routine entries.

⸻

PART I — MOBILE LAYOUT

16. FOCUSED ENTRY INTERFACE

When the user taps the central floating + button:

Open Universal Expense Entry as a focused screen or full-height mobile sheet.

Entry Header

Display:

* Close or Back.
* New Expense.
* Optional transaction-type selector.

Remove the large global application header while the entry screen is active.

Navigation

Hide the standard bottom navigation during focused expense entry.

Provide a visible Save action at the bottom.

The Save action must respect iPhone safe areas and the on-screen keyboard.

Layout

Use:

* Compact spacing.
* Clear labels.
* Appropriate font sizes.
* Minimal borders.
* Consistent input heights.
* Controlled card usage.
* Smooth transitions.

Do not require the user to scroll through unnecessary sections.

⸻

17. SAVE ACTION

Provide a persistent Save Expense action.

Requirements

* Clearly visible.
* Theme-aware.
* Accessible.
* Disabled only when required information is invalid or missing.
* Appropriate loading state.
* Duplicate-submit protection.

On successful save:

1. Confirm the transaction was saved.
2. Update relevant financial summaries.
3. Update the affected account.
4. Update workspace reports.
5. Update trip reports, where applicable.
6. Return to the appropriate previous screen or show a confirmation state.

Error Handling

If saving fails:

* Preserve all entered information.
* Display a clear error.
* Allow retry.
* Avoid duplicate transactions.

⸻

PART J — SMART DEFAULTS

18. INTELLIGENT EXPENSE ENTRY

Use existing transaction history and user-confirmed preferences to reduce manual entry.

Suggested Defaults

* Recently used payment account.
* Frequently used category.
* Appropriate workspace.
* Current date.
* Relevant trip.
* Previous merchant classification.

Important

AI-generated suggestions must remain editable.

Do not silently select a workspace or payment account when confidence is insufficient.

Do not infer sensitive financial details without supporting records.

⸻

PART K — THEME COMPATIBILITY

19. THEME INTEGRATION

The redesigned entry interface must support all existing and planned Ledgerline themes:

1. Signature Blue & Gold.
2. Forest Green & Mint.
3. Midnight Blue & Champagne Gold.
4. Graphite & Platinum.
5. Apple-Inspired Minimal.

Apple-inspired variations:

* Apple Classic.
* Apple × Ledgerline.
* Apple Glass.

Design Requirements

* Consistent structure across themes.
* Theme-aware controls.
* Accessible contrast.
* Readable form labels.
* Clear selected states.
* Consistent modal behaviour.
* Theme-appropriate Save button.
* Functional dark and light appearances.

Do not build separate entry forms for individual themes.

⸻

PART L — IMPLEMENTATION PRIORITIES

20. DEVELOPMENT ORDER

Priority 1 — Structural Simplification

1. Inspect existing transaction-entry architecture.
2. Introduce focused expense-entry layout.
3. Remove global header from focused entry.
4. Hide bottom navigation while entering.
5. Implement amount-first Quick Entry.
6. Implement accessible Save action.

Priority 2 — Form Reorganisation

7. Compact transaction-type selection.
8. Compact category selection.
9. Consolidated payment account selection.
10. Compact workspace selector.
11. Collapsible advanced details.
12. Searchable tag selection.

Priority 3 — Intelligent Capture

13. Compact camera and gallery actions.
14. File upload.
15. Voice entry.
16. Existing AI extraction integration.
17. Smart defaults.
18. Context-aware field display.

Priority 4 — Advanced Financial Integration

19. Multi-workspace allocation.
20. Person allocation.
21. Travel association.
22. Reimbursements.
23. Multi-currency support.
24. Existing transaction-type handling.

Priority 5 — Testing

25. Validate all transaction types.
26. Test financial calculations.
27. Test account balances.
28. Test credit card transactions.
29. Test workspace allocation.
30. Test travel expenses.
31. Test reimbursement handling.
32. Test duplicate prevention.
33. Test iPhone keyboard behaviour.
34. Test theme compatibility.
35. Verify existing financial data remains intact.

⸻

PART M — ACCEPTANCE REQUIREMENTS

21. MANDATORY TESTS

Before completion, demonstrate:

1. A basic expense can be entered without opening advanced fields.
2. The + button opens Quick Entry immediately.
3. The amount field receives focus.
4. Category selection is quick and searchable.
5. Payment accounts are clearly identified.
6. Workspace selection is compact.
7. Advanced fields remain available.
8. Existing tags are preserved.
9. Existing categories are preserved.
10. Receipt scanning remains functional.
11. Voice entry remains functional.
12. Foreign currency expenses remain supported.
13. Multi-workspace splitting remains functional.
14. Reimbursements remain functional.
15. Travel-related expense entry remains functional.
16. All transaction types remain available.
17. The Save button remains accessible.
18. The bottom navigation does not overlap the form.
19. Form values are preserved when switching entry modes.
20. Saving updates the correct financial records.
21. Duplicate financial transactions are prevented.
22. Existing historical records remain unchanged.
23. All Ledgerline themes display correctly.
24. Mobile usability is substantially improved.

⸻

22. FINAL DEVELOPMENT DIRECTION

The objective is to make Ledgerline’s Universal Expense Entry extremely easy to use without reducing its financial capabilities.

Routine expense recording should require minimal interaction.

Advanced accounting, workspace, travel, reimbursement and allocation features should appear only when required.

The existing Universal Expense Entry must remain the single transaction-entry system throughout Ledgerline.

Final Principle:

ONE UNIVERSAL ENTRY. QUICK BY DEFAULT. DETAILED WHEN NEEDED.

Preserve all existing financial data, business logic, integrations, authentication and permissions.

Prepare the revised interface for review before deploying changes.

Do not modify or publish the live application without approval.

⸻

End of Ledgerline Version 4.4 Development Requirements