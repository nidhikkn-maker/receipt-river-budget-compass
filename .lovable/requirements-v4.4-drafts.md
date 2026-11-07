LEDGERLINE

Version 4.4 — Expense Entry Usability Enhancement

Keyboard Control, Automatic Draft Saving & Resume Later

Project: Existing Ledgerline Application
Development Type: Enhancement to Universal Expense Entry
Priority: High

1. Objective

Improve the Universal Expense Entry interface by introducing:

1. Controlled keyboard behaviour.
2. Automatic draft saving.
3. Receipt capture persistence.
4. Resume Later functionality.
5. Pending Expense Drafts.
6. Recovery after application closure.
7. Secure synchronisation.
8. Protection against accidental data loss.

These features must integrate with the existing Quick Entry, Detailed Entry, receipt scanning, voice entry and unified financial ledger.

Do not create a separate transaction-entry system.

⸻

2. Keyboard Behaviour

Current Problem

The keyboard automatically opens when the Add Expense page is launched and remains visible until the user interacts elsewhere.

This unnecessarily occupies screen space and interferes with receipt scanning and other actions.

Required Changes

1. Do not automatically focus the Amount field when opening Universal Expense Entry.
2. Do not automatically open the keyboard when the page loads.
3. Open the keyboard only when the user selects an editable text or amount field.
4. Allow the keyboard to be dismissed using the system’s normal dismissal behaviour.
5. Provide an appropriate Done action for numeric entry where supported.
6. Ensure the keyboard does not cover essential form controls.
7. Allow the user to scroll the form while the keyboard is open.
8. Do not reopen the keyboard automatically after receipt scanning or returning from another screen.

Important

Removing automatic keyboard focus must not affect amount validation or financial calculations.

⸻

3. Automatic Expense Draft Saving

Introduce automatic draft saving within the existing Universal Expense Entry.

Draft Creation

A draft should be created when the user begins meaningful entry activity, such as:

* Capturing a receipt.
* Uploading a document.
* Entering an amount.
* Adding a merchant.
* Selecting a category.
* Recording a voice entry.
* Changing transaction details.

Opening an empty entry page should not create an unnecessary blank draft.

Draft Content

Preserve applicable information:

* Transaction type.
* Amount.
* Date.
* Category.
* Merchant.
* Payment account.
* Workspace.
* Organisation.
* Trip.
* Traveller.
* Currency.
* Exchange rate.
* Tags.
* Notes.
* Reimbursement information.
* Workspace allocations.
* Attached receipts.
* AI-extracted information.
* Processing status.

Save changes automatically using a suitable debounced mechanism.

Show a discreet status such as:

Draft saved

Do not display disruptive notifications for every automatic save.

⸻

4. Receipt Capture Persistence

Required Workflow

When the user captures a receipt:

1. Create a draft record.
2. Store the receipt securely.
3. Associate the receipt with the draft.
4. Begin extraction where supported.
5. Save extracted information to the draft.
6. Maintain processing status.
7. Allow the user to leave the page.

The receipt should remain available even if the application is closed before extraction or classification is completed.

Upload Reliability

Do not show Draft Saved until the required data has been stored successfully.

If an image has not finished uploading, indicate that it is still being saved.

If the user closes the application before the upload completes, recover the local draft and retry safely when the application is reopened, where supported.

Do not claim that an unsaved receipt has been backed up.

⸻

5. Resume Later

Provide a Resume Later action within Universal Expense Entry.

When selected:

1. Save the current draft.
2. Preserve all entered information.
3. Close the entry screen.
4. Return the user to the previous screen.
5. Keep the draft available for future completion.

The user should not be forced to complete an expense immediately after scanning a receipt.

The Resume Later action should also be accessible when closing a partially completed form.

⸻

6. Pending Expense Drafts

Introduce a Pending Drafts section.

Recommended Location

Activity → Drafts

Also provide access through Universal Expense Entry.

Draft List

Display:

* Merchant, where identified.
* Amount, where available.
* Capture date.
* Receipt thumbnail.
* Workspace, if selected.
* Processing status.
* Completion status.

Statuses

* Draft.
* Uploading.
* Processing.
* Ready for Review.
* Information Required.
* Processing Failed.
* Saved as Transaction.

Actions

* Resume.
* Review.
* Edit.
* Retry Processing.
* Delete.
* Select Multiple.

The application should distinguish incomplete drafts from confirmed financial transactions.

⸻

7. Automatic Resume

When Ledgerline is reopened, the user should be able to access pending drafts easily.

Recommended Behaviour

If pending drafts exist, display a subtle notification:

You have 3 expenses waiting to be completed.

Actions:

* Review Drafts.
* Later.

Do not automatically force the user into an unfinished expense.

Do not automatically open the keyboard.

Draft Restoration

When a draft is opened:

* Restore all available fields.
* Restore attached receipts.
* Restore selected workspace.
* Restore selected trip.
* Restore existing classifications.
* Restore any previously entered notes.

The user should continue from the saved state.

⸻

8. Multiple Receipt Drafts

Support multiple unfinished expenses.

Example

The user captures:

* Hotel receipt.
* Restaurant bill.
* Fuel receipt.
* Shopping invoice.

Each should become an independent draft.

The user may complete them individually at a later time.

Requirements

* Maintain unique draft identifiers.
* Preserve individual attachments.
* Avoid merging unrelated receipts.
* Allow duplicate detection.
* Allow batch review.
* Support independent deletion.

Do not automatically create confirmed financial transactions from these drafts.

⸻

9. Background Processing

Where supported by the existing architecture, receipt extraction may continue after the user navigates away.

Processing Status

Display:

* Waiting.
* Uploading.
* Extracting.
* Ready for Review.
* Failed.

If processing is interrupted by application closure, the system should recover or safely retry when reopened.

Ensure repeated processing does not create duplicate records or attachments.

The user should be able to access the original receipt even if AI extraction fails.

⸻

10. Drafts and Financial Data Integrity

Drafts must remain separate from confirmed ledger transactions.

Mandatory Rules

1. Drafts must not reduce account balances.
2. Drafts must not increase credit card liabilities.
3. Drafts must not count as confirmed expenses.
4. Drafts must not alter investment balances.
5. Drafts must not settle reimbursements.
6. Drafts must not count as completed travel expenditure.
7. Drafts must not automatically update financial reports as actual expenditure.

Where useful, the application may show pending draft amounts separately.

Final Confirmation

Only when the user selects Save Expense should the application validate and create the confirmed transaction.

After successful saving, link the original draft to the confirmed transaction and remove it from the pending list.

Prevent duplicate posting if the Save action is repeated.

⸻

11. Draft Security

Expense drafts and receipts contain sensitive financial information.

Requirements:

* Associate drafts with authenticated users.
* Enforce workspace permissions.
* Store uploaded documents securely.
* Protect locally cached financial information.
* Prevent unauthorised access.
* Avoid exposing financial information through public URLs.
* Clear sensitive temporary data when appropriate.
* Preserve audit information for confirmed transactions.

Drafts should remain available after logout and login through the authorised account where synchronisation is supported.

For offline drafts, clearly indicate whether they are stored only on the current device or have been securely synchronised.

⸻

12. Draft Deletion

Provide an explicit Delete Draft action.

Deletion should require confirmation.

Example

“Delete this unfinished expense and its attached receipt?”

Options:

* Cancel.
* Delete Draft.

Do not delete drafts automatically merely because they are old.

Provide a configurable retention or cleanup policy if required in future.

⸻

13. Application Navigation

The draft system must integrate with the existing Ledgerline navigation.

Universal Expense Entry

* Quick Entry.
* Detailed Entry.
* Scan.
* Voice.
* Repeat Expense.
* Resume Later.

Activity

* Transactions.
* Imports.
* Reconciliation.
* Drafts.

Home

Optionally display a compact Pending Drafts reminder when unfinished expenses exist.

Do not introduce another permanent main navigation tab solely for drafts.

⸻

14. Development Priority

Priority 1

1. Remove automatic keyboard focus.
2. Improve keyboard dismissal.
3. Introduce draft persistence.
4. Implement Resume Later.
5. Preserve form values during navigation.

Priority 2

6. Secure receipt persistence.
7. Draft list.
8. Draft restoration.
9. Multiple draft support.
10. Draft deletion.

Priority 3

11. Background processing integration.
12. Failed-upload recovery.
13. Draft synchronisation.
14. Processing status.
15. Duplicate prevention.

Priority 4

16. Mobile usability testing.
17. Offline recovery testing.
18. Authentication testing.
19. Financial integrity testing.
20. Regression testing.

⸻

15. Acceptance Requirements

Before completion, demonstrate:

1. Opening Add Expense does not automatically open the keyboard.
2. Selecting Amount opens the numeric keyboard.
3. The keyboard can be dismissed normally.
4. Scanning a receipt creates a recoverable draft.
5. Closing the application does not lose a successfully saved draft.
6. Reopening the application allows the user to resume.
7. Multiple drafts can be stored.
8. Drafts remain separate from confirmed transactions.
9. Incomplete drafts do not affect financial balances.
10. Failed uploads are clearly identified.
11. AI extraction failure does not delete the original receipt.
12. Draft information is restored accurately.
13. Resume Later works correctly.
14. Delete Draft requires confirmation.
15. Saving a draft as a confirmed expense does not create duplicates.
16. Existing Universal Expense Entry functionality remains operational.

⸻

16. Final Development Instruction

Ledgerline must allow users to capture financial information whenever convenient and complete the transaction later.

Users should not be forced to classify expenses immediately after taking a photograph.

The application should protect unfinished work and recover drafts safely after navigation, interruption or application closure.

The keyboard must only open when required.

Final Principle:

CAPTURE NOW. SAVE AUTOMATICALLY. COMPLETE WHEN CONVENIENT.

Implement these enhancements within the existing Ledgerline application.

Preserve all existing financial data, calculations, authentication, workspaces and integrations.

Do not deploy changes to the live application until approved.

End of Ledgerline Expense Entry Draft & Resume Requirements.