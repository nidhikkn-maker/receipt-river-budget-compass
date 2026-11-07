LEDGERLINE

VERSION 4.8 — UNIVERSAL EXPENDITURE REPORTING SYSTEM

Complete Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Reporting Architecture, PDF Generation and Financial Integration
Primary Platform: iPhone and Desktop
Priority: High
Implementation: Existing Project Only

⸻

1. PROJECT OBJECTIVE

Develop a comprehensive Universal Expenditure Reporting System within Ledgerline.

The system must generate professional expenditure statements for any particular activity recorded in the application.

Supported activities include:

1. Personal expenses.
2. Family expenses.
3. Business expenses.
4. Official expenses.
5. Travel and trips.
6. Events and meetings.
7. Projects.
8. Business purchases.
9. Major purchases.
10. Other user-defined expenditure groups.

The purpose is to provide one consolidated record showing:

* What expenditure occurred.
* Why the expenditure occurred.
* Who paid.
* How each payment was made.
* Which bank account or card was used.
* The original amount paid.
* The amount attributable to the selected activity.
* The amount eligible for reimbursement.
* Reimbursements already received.
* Reimbursement outstanding.
* Original supporting bills and payment evidence.

The result must be a single professionally formatted, downloadable PDF.

The system must reuse Ledgerline’s existing unified transaction ledger.

Do not create a separate expense-entry system or duplicate financial records.

⸻

2. REPORTING ARCHITECTURE

Implement three distinct reporting options.

2.1 Detailed Expenditure Statement

The primary report for a specific event, trip, project or purchase.

Includes complete transaction details, payment sources, financial allocations, reimbursements and original bills.

2.2 Summary Expenditure Statement

A shorter version containing consolidated expenditure information, payment-source breakdown, reimbursement position and supporting bills.

2.3 Expense Claim Submission Report

Retain the existing formal reimbursement claim report.

This report is intended for submission to an organisation or Accounts Department and may contain approval and declaration fields.

Important Distinction

The Detailed and Summary Expenditure Statements are financial records of an activity.

They must not automatically create reimbursement claims, initiate approvals or change claim statuses.

The Expense Claim Submission Report remains a separate workflow.

⸻

PART A — REPORT ACCESS AND USER WORKFLOW

3. UNIVERSAL REPORT ACCESS

The Detailed Expenditure Statement must be available throughout Ledgerline.

Personal Workspace

Personal → Select Activity → Generate Expenditure Statement.

Family Workspace

Family → Select Activity → Generate Expenditure Statement.

Business Workspace

Business → Select Organisation → Select Activity → Generate Expenditure Statement.

Official Workspace

Official → Select Organisation → Select Event or Project → Generate Expenditure Statement.

Travel Manager

Travel → Select Trip → Generate Expenditure Statement.

Purchase Records

Select Purchase → Generate Expenditure Statement.

Central Reports Centre

Reports → Expenditure Statements.

The same reporting engine must serve every entry point.

Do not create different expenditure-reporting systems for each workspace.

⸻

4. REPORT CREATION WORKFLOW

The user should be able to generate a report through the following process:

1. Select the activity, trip, project or purchase.
2. Select Generate Expenditure Statement.
3. Choose report format.
4. Review associated expenses.
5. Review payment sources.
6. Review reimbursement information.
7. Verify supporting documents.
8. Generate PDF.
9. Preview the report.
10. Download or share.

Where expense records are already correctly linked to the activity, Ledgerline should retrieve them automatically.

The user must be able to add or remove transactions from the report selection without deleting or modifying the underlying ledger records.

⸻

5. REPORT FORMAT SELECTION

Provide two selectable output formats.

Format A — Summary + Bills

A concise expenditure report.

Include:

* Activity information.
* Financial summary.
* Category-wise expenditure.
* Payment-source summary.
* Reimbursement position.
* Compact expenditure register.
* Original supporting bills.

Format B — Detailed + Bills

Default and Recommended Format

Include:

* Activity information.
* Executive expenditure summary.
* Complete expenditure register.
* Available invoice line-item breakdown.
* Payment-method details.
* Actual account or card information.
* Workspace allocations.
* Original currency and INR equivalents.
* Reimbursement calculations.
* Settlement details.
* Original supporting bills.
* Payment confirmations.

Default Preference

Set Detailed + Bills as the default report format.

Allow the user to select Summary + Bills.

Remember the user’s preferred format for subsequent reports.

⸻

PART B — REPORT IDENTIFICATION

6. ACTIVITY INFORMATION

Every report must clearly identify the selected activity.

Required Information

* Activity name.
* Activity type.
* Workspace.
* Organisation, where applicable.
* Purpose.
* Reporting period.
* Report generation date.
* Report reference number.
* Reporting currency.

Optional Information

* Destination.
* Project reference.
* Department.
* Responsible person.
* Participants.
* Related trip.
* Additional description.

Example

Activity: Vanuatu Founder Recce
Workspace: Business
Organisation: MOVAC
Purpose: Destination Development and Commercial Validation
Reporting Period: Selected Travel Dates

Do not include claim-submission declarations or approval signatures in the expenditure statement by default.

⸻

PART C — FINANCIAL SUMMARY

7. EXPENDITURE OVERVIEW

The first page must contain a clearly organised financial summary.

Required Figures

1. Total expenditure.
2. Total personally funded expenditure.
3. Total company-funded expenditure.
4. Total funded by other parties.
5. Business or official allocation.
6. Personal allocation.
7. Family allocation.
8. Eligible reimbursable expenditure.
9. Reimbursement already received.
10. Outstanding reimbursement.

Additional Information

Where applicable, display:

* Total budget.
* Actual expenditure.
* Budget variance.
* Unpaid commitments.
* Refunds.
* Advances.
* Unsettled balances.

Do not combine unpaid commitments with actual expenditure.

Reconciliation

The sum of payment-source expenditure must equal the report’s actual expenditure total.

Workspace allocations must reconcile with the underlying transactions.

⸻

8. PAYMENT SOURCE SUMMARY

Include a separate section showing how the expenses were paid.

Required Breakdown

* Personal bank accounts.
* Personal credit cards.
* Personal debit cards.
* Cash.
* UPI.
* Forex cards.
* Company bank accounts.
* Company cards.
* Other payment sources.

Example

Payment Source	Amount
Personal AMEX	₹40,000
Personal IDFC UPI	₹15,000
Personal Cash	₹10,000
Company Card	₹20,000
Total Expenditure	₹85,000

These are illustrative amounts.

Important

Payment mode and payment account must be distinguished.

For example:

Payment Mode: UPI
Payment Account: IDFC Bank

Or:

Payment Mode: Credit Card
Payment Account: Personal AMEX ending 1234

Do not treat UPI itself as a bank account unless a corresponding wallet or balance-holding account has been configured.

⸻

PART D — DETAILED EXPENDITURE REGISTER

9. TRANSACTION REGISTER

The Detailed Expenditure Statement must include every selected transaction.

Required Columns

1. S.No.
2. Date.
3. Expense particulars.
4. Merchant or supplier.
5. Category.
6. Payment mode.
7. Actual payment account or card.
8. Actual payer.
9. Original amount.
10. Original currency.
11. INR equivalent.
12. Amount allocated to the activity.
13. Eligible reimbursement.
14. Amount reimbursed.
15. Outstanding reimbursement.
16. Bill reference.

Table Formatting

Use landscape A4 pages for wide financial tables where necessary.

Alternatively, use two clearly linked tables with the same serial or transaction reference.

Do not reduce text to an unreadable size to accommodate every column on one page.

Grouping Options

Allow transactions to be grouped by:

* Date.
* Category.
* Payment account.
* Merchant.
* Workspace.
* Traveller.
* Organisation.

Totals

Show relevant subtotals and a grand total.

All calculations must come from the existing Ledgerline financial engine.

⸻

10. LINE-ITEM EXPENDITURE

Support detailed line-item reporting where the underlying invoice information is available.

Example

Hotel invoice:

* Room tariff.
* Food and beverages.
* Laundry.
* Service charges.
* Taxes.
* Other charges.

Requirements

* Preserve the original invoice total.
* Ensure line-item totals reconcile.
* Support multiple items within one transaction.
* Distinguish item-level expenditure from payment-level transactions.
* Do not count line items as additional transactions.

If the invoice cannot be itemised reliably, display the transaction as one expense and retain the original invoice.

Do not invent individual items.

⸻

PART E — PAYMENT INFORMATION

11. PAYMENT METHOD DETAILS

Every financial transaction must identify its actual payment source wherever recorded.

Supported Payment Methods

* Cash.
* UPI.
* Credit card.
* Debit card.
* Bank transfer.
* Forex card.
* Company card.
* Digital wallet.
* Other configured methods.

Card Details

Display:

* Card name.
* Issuing bank, where known.
* Last four digits.
* Whether personal or company-owned.

Example

Personal AMEX — ending 1234

Do not display:

* Full card number.
* CVV.
* Bank passwords.
* OTPs.
* Sensitive credentials.

Missing Payment Information

If payment information is unavailable, clearly display:

Payment Source Not Recorded

Do not invent or assume the payment method.

⸻

12. PAYMENT OWNERSHIP

The report must distinguish the party who actually paid from the workspace or organisation responsible for the expense.

Example

An employee or business owner pays ₹30,000 using a personal credit card for MOVAC business purposes.

The statement must show:

* Actual payer: Individual.
* Payment account: Personal Credit Card.
* Expenditure classification: Business.
* Organisation: MOVAC.
* Eligible reimbursement: Confirmed eligible amount.

Do not incorrectly represent the payment as having been made from MOVAC’s bank account.

⸻

PART F — REIMBURSEMENT REPORTING

13. REIMBURSEMENT SUMMARY

The report must clearly state:

1. Personally funded expenditure.
2. Eligible reimbursement.
3. Amount already reimbursed.
4. Amount pending approval, where relevant.
5. Approved but unpaid amount.
6. Outstanding reimbursement.
7. Ineligible or rejected amounts.

Important

These values are not always identical.

The system must distinguish:

* Amount spent.
* Amount eligible.
* Amount claimed.
* Amount approved.
* Amount paid.
* Amount outstanding.

Use the existing reimbursement and settlement records.

⸻

14. REIMBURSEMENT CALCULATIONS

Example

Original hotel bill: ₹60,000.

Business allocation: ₹36,000.

Family allocation: ₹24,000.

Eligible business reimbursement: ₹36,000.

Previously reimbursed: ₹10,000.

Remaining eligible reimbursement: ₹26,000.

Mandatory Rules

* Reimbursements must not exceed eligible amounts.
* Company-paid expenses must not automatically become personal receivables.
* Partial reimbursements must be supported.
* Refunds must be accounted for.
* Workspace splits must reconcile.
* Reimbursement receipts must not duplicate expenditure.

⸻

15. SETTLEMENT DETAILS

Where reimbursements have been received, include:

* Settlement date.
* Reimbursing organisation.
* Amount received.
* Receiving account.
* Settlement reference.
* Remaining balance.

Status

* Not Reimbursable.
* Eligible / Not Submitted.
* Submitted.
* Under Review.
* Approved.
* Partially Reimbursed.
* Fully Reimbursed.
* Rejected.

Do not automatically change reimbursement status when a report is generated.

⸻

PART G — ORIGINAL BILLS AND SUPPORTING DOCUMENTS

16. AUTOMATIC BILL ATTACHMENT

This is a mandatory feature.

The Detailed Expenditure Statement must automatically identify and include available documents linked to selected transactions.

Supported Documents

* Original invoices.
* Bills.
* Receipts.
* Payment screenshots.
* Bank payment confirmations.
* Credit card payment evidence.
* UPI confirmations.
* Booking confirmations.
* Supporting financial documents.

Important

The system must retrieve existing documents from Ledgerline’s secure document vault.

Do not require users to upload the same bill again.

⸻

17. DOCUMENT ANNEXURES

All supporting documents should appear at the end of the same PDF.

Arrangement

Annexure 01 — Original Bill

Annexure 02 — Original Bill

Annexure 03 — Payment Evidence

Annexure 04 — Original Invoice

Continue according to the expenditure register.

Each Annexure Must Identify

* Annexure reference.
* Related transaction serial number.
* Merchant.
* Transaction date.
* Amount.
* Document type.

PDF Requirements

* Preserve original bill readability.
* Maintain correct orientation.
* Support multi-page invoices.
* Support image and PDF attachments.
* Avoid unnecessary compression.
* Include complete supporting documents.
* Ensure annexure references match the register.

Missing Bills

If a bill is unavailable, display:

Supporting Bill Not Attached

Include a missing-document list before the annexures.

Do not silently omit unavailable documents.

⸻

18. DOCUMENT REVIEW BEFORE GENERATION

Before generating the final PDF, provide a document verification screen.

Display

* Number of transactions.
* Number of attached bills.
* Number of missing bills.
* Available payment proofs.
* Unreadable or unsupported files.
* Duplicate document warnings.

Users should be able to:

* Preview documents.
* Add missing files.
* Remove an attachment from the report.
* Correct document associations.
* Continue with clearly identified missing documents.

Removing an attachment from a particular report must not delete the original document from Ledgerline’s vault.

⸻

PART H — PDF DESIGN AND STRUCTURE

19. PROFESSIONAL DOCUMENT DESIGN

The report must resemble a professional expenditure statement rather than an application dashboard.

Design Characteristics

* Clean.
* Formal.
* Elegant.
* Readable.
* Minimal decorative elements.
* Restrained Ledgerline branding.
* Suitable for Accounts Department review.
* Suitable for personal records.
* Suitable for electronic sharing.

Avoid large dashboard-style cards.

⸻

20. PDF PAGE STRUCTURE

Section 1 — Expenditure Overview

Include:

* Ledgerline branding.
* Report identification.
* Activity information.
* Total expenditure.
* Payment-source breakdown.
* Workspace allocation.
* Reimbursement position.
* Budget comparison, where relevant.

Section 2 — Detailed Expenditure Register

Include:

* Transaction details.
* Payment sources.
* Actual payer.
* Allocated expenditure.
* Reimbursement information.
* Bill references.

Section 3 — Itemised Details

Where available:

* Invoice line-item information.
* Category-level expenditure.
* Merchant-wise expenditure.
* Additional supporting explanations.

Section 4 — Reimbursement and Settlement

Include:

* Eligible amounts.
* Reimbursements received.
* Outstanding amounts.
* Settlement references.

Section 5 — Original Bills

Include all supporting documents as numbered annexures.

The final output must be one consolidated PDF.

⸻

21. PAGE FORMATTING

Page Size

* A4 portrait for report summaries.
* A4 landscape where required for detailed tables.
* A4 portrait for supporting bills where appropriate.

Requirements

* Consistent margins.
* Proper page breaks.
* Page numbers.
* Report reference.
* Repeated table headings.
* Readable financial figures.
* Indian number formatting.
* Correct currency symbols.
* Appropriate font embedding.
* Clear annexure numbering.

The document must remain readable when printed.

⸻

PART I — REPORT GENERATION

22. REPORT GENERATION WORKFLOW

Step 1

Select the activity.

Step 2

Choose:

* Summary + Bills.
* Detailed + Bills.

Step 3

Review associated transactions.

Step 4

Verify payment-source information.

Step 5

Review workspace allocations.

Step 6

Verify reimbursement calculations.

Step 7

Review available supporting documents.

Step 8

Generate PDF.

Step 9

Preview the completed report.

Step 10

Download or share.

⸻

23. BACKGROUND PROCESSING

Integrate PDF generation with Ledgerline’s persistent background-processing system when available.

Workflow

1. Save the report request.
2. Register a persistent generation job.
3. Retrieve authorised transactions.
4. Retrieve supporting documents.
5. Generate the PDF.
6. Store the completed report securely.
7. Update processing status.
8. Notify the user.
9. Allow download later.

The user should not need to keep the page open after the backend confirms that the job has been safely accepted.

If persistent background processing is not yet available, show a clear foreground-processing message.

Do not incorrectly state that processing will continue after the page closes.

⸻

PART J — REPORT HISTORY

24. REPORT HISTORY

Maintain generated reports.

Information

* Report reference.
* Activity name.
* Report format.
* Workspace.
* Organisation.
* Reporting period.
* Generated date.
* File size.
* Generation status.

Actions

* Preview.
* Download.
* Share.
* Regenerate.
* Archive.
* Delete.

Previously generated reports should remain unchanged.

If underlying financial records are modified, generating an updated report should create a new version.

⸻

PART K — DATA INTEGRITY

25. FINANCIAL RECONCILIATION

Every generated report must reconcile with Ledgerline’s existing financial records.

Rules

1. Transfers must not count as expenditure.
2. Credit card bill payments must not create duplicate expenditure.
3. Workspace allocations must reconcile.
4. Consolidated reports must avoid double counting.
5. Refunds must be reflected accurately.
6. Draft expenses must not appear as confirmed expenditure.
7. Unpaid bookings must remain separate from actual expenses.
8. Reimbursements must use their correct financial treatment.
9. Currency conversions must use recorded exchange rates.
10. Estimated figures must be identified.
11. Missing payment details must be disclosed.
12. Supporting documents must match the underlying transactions.

⸻

PART L — SECURITY

26. REPORT SECURITY

Financial statements and supporting bills contain sensitive information.

Requirements

* Authenticate report requests.
* Enforce workspace permissions.
* Restrict access to authorised financial records.
* Protect generated PDF files.
* Secure document storage.
* Avoid permanent public download URLs.
* Mask sensitive card and account details.
* Maintain relevant report-generation logs.
* Apply appropriate file retention policies.
* Prevent unauthorised access to supporting bills.

Shared activity access must not automatically grant access to unrelated financial records.

⸻

PART M — USER PREFERENCES

27. SAVED REPORT PREFERENCES

Remember the user’s preferred report settings.

Supported Preferences

* Default report format.
* Default currency.
* Preferred grouping.
* Include payment-source summary.
* Include line-item details.
* Include reimbursement section.
* Include supporting bills.
* Include payment evidence.
* Preferred PDF style.

Default Configuration

Report Format: Detailed + Bills

Supporting Bills: Included

Payment Details: Included

Reimbursement Details: Included

Line Items: Included where available

PDF Style: Premium, printer-friendly Ledgerline format

Allow the user to modify these settings before generating a report.

⸻

PART N — DEVELOPMENT PRIORITIES

28. IMPLEMENTATION PHASES

PHASE 1 — UNIVERSAL REPORT FOUNDATION

1. Review existing Reports Centre.
2. Identify reusable reporting services.
3. Create Universal Expenditure Statement.
4. Implement activity-based report selection.
5. Integrate unified transaction ledger.
6. Implement Summary + Bills.
7. Implement Detailed + Bills.

PHASE 2 — PAYMENT AND REIMBURSEMENT

8. Payment-source reporting.
9. Account and card identification.
10. Actual payer reporting.
11. Workspace allocations.
12. Reimbursement calculations.
13. Settlement information.
14. Financial reconciliation.

PHASE 3 — DOCUMENT ANNEXURES

15. Retrieve existing bills.
16. Retrieve payment confirmations.
17. Match documents to transactions.
18. Generate annexure references.
19. Merge documents into one PDF.
20. Preserve multi-page invoices.
21. Identify missing attachments.

PHASE 4 — USER EXPERIENCE

22. Report preview.
23. Download.
24. Share.
25. Report preferences.
26. Report history.
27. Background generation integration.
28. Processing notifications.

PHASE 5 — VALIDATION

29. Test financial calculations.
30. Test payment-source reporting.
31. Test reimbursement totals.
32. Test workspace allocations.
33. Test multi-currency transactions.
34. Test bill annexures.
35. Test multi-page PDFs.
36. Test iPhone downloads.
37. Test report security.
38. Verify existing report functionality.

⸻

PART O — ACCEPTANCE REQUIREMENTS

29. MANDATORY TEST SCENARIOS

Before completion, demonstrate:

1. A trip expenditure statement can be generated.
2. A business event statement can be generated.
3. A personal expenditure statement can be generated.
4. A business purchase statement can be generated.
5. Both report formats work.
6. Detailed + Bills is the default.
7. Every transaction displays its recorded payment source.
8. Masked card details appear where available.
9. Payment ownership is correctly identified.
10. Workspace allocations reconcile.
11. Personal and company expenditure are separated.
12. Reimbursement calculations are accurate.
13. Partial reimbursements are supported.
14. Invoice line items appear where available.
15. All available original bills are attached.
16. Annexure references match transaction rows.
17. Missing documents are clearly identified.
18. The completed PDF downloads correctly.
19. Report history works.
20. Existing claim submission reports remain unchanged.
21. No duplicate expenses are created.
22. No historical financial records are modified.
23. Existing Ledgerline functionality remains operational.

⸻

30. EXPECTED DEVELOPMENT REPORT

After implementation, provide:

1. Report formats developed.
2. Screens created or modified.
3. Financial services reused.
4. Payment-source integration details.
5. Reimbursement calculation implementation.
6. Document attachment workflow.
7. PDF generation architecture.
8. Background-processing integration.
9. Security controls.
10. Test results.
11. Known limitations.
12. Remaining development requirements.

⸻

31. FINAL DEVELOPMENT DIRECTION

The Universal Expenditure Reporting System must become Ledgerline’s standard reporting mechanism for any selected activity.

Users should be able to generate a complete financial statement for a trip, event, project or purchase without manually assembling individual transaction records and bills.

The report must clearly identify:

* What was spent.
* Why it was spent.
* Who paid.
* How it was paid.
* Which financial account was used.
* Which workspace the expenditure belongs to.
* How much is eligible for reimbursement.
* How much has already been reimbursed.
* How much remains outstanding.

All original supporting bills and available payment confirmations must appear at the end of the same downloadable PDF.

Detailed + Bills must be the default format.

Summary + Bills must remain available as a shorter alternative.

The existing formal Expense Claim Submission Report must be retained separately.

Preserve the existing Ledgerline application, unified transaction ledger, financial calculations, workspaces, permissions, documents and historical records.

Do not modify or deploy changes to the live application without approval.

FINAL PRINCIPLE

ONE ACTIVITY. ALL LINKED EXPENSES. COMPLETE PAYMENT DETAILS. ACCURATE REIMBURSEMENT POSITION. ORIGINAL BILLS. ONE PDF.

⸻

END OF LEDGERLINE VERSION 4.8 — UNIVERSAL EXPENDITURE REPORTING SYSTEM