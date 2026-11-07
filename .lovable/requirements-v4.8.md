LEDGERLINE

Version 4.8 — Detailed Expenditure Statement

Event, Trip and Business Purchase Reporting

Project: Existing Ledgerline Application
Development Type: Reporting Enhancement
Primary Output: Consolidated A4 PDF with Original Bills Attached

1. Objective

Develop a new report called Detailed Expenditure Statement.

The report must provide a complete financial record for a selected:

* Business event.
* Official event.
* Business trip.
* Personal trip.
* Family trip.
* Business purchase.
* Project.
* Other user-defined expenditure group.

The purpose is to clearly establish:

1. What expenditure occurred.
2. Why the expenditure occurred.
3. Who made the payment.
4. Which payment account or card was used.
5. The original amount paid.
6. The business or personal allocation.
7. The amount eligible for reimbursement.
8. The amount already reimbursed.
9. The remaining reimbursement outstanding.
10. The original supporting bills and payment proofs.

This is an expenditure report, not an expense claim submission form.

Retain the existing Expense Claim Submission Report as a separate report type.

⸻

2. Report Selection

Make the new report available through:

Reports → Detailed Expenditure Statement

Also provide a contextual Generate Statement action within:

* Travel Manager.
* Business Workspace.
* Official Workspace.
* Events.
* Projects.
* Individual Business Purchases.

The user should be able to select the reporting subject and applicable period.

⸻

3. Report Identification

Every statement should include:

* Report title.
* Event, trip, project or purchase name.
* Associated workspace.
* Organisation.
* Purpose.
* Start date.
* End date.
* Prepared date.
* Unique report reference.
* Reporting currency.

Do not include claim submission or approval fields by default.

⸻

4. Executive Expenditure Summary

The first page should show:

* Total expenditure.
* Amount paid personally.
* Amount paid directly by the business or organisation.
* Amount paid by other parties.
* Amount allocated to business or official purposes.
* Amount allocated to personal or family purposes.
* Total eligible for reimbursement.
* Reimbursements already received.
* Reimbursement outstanding.

All amounts must reconcile with the detailed expenditure records.

Do not assume that every business expense is reimbursable.

Eligibility must come from user-confirmed classifications or recorded policy decisions.

⸻

5. Detailed Expenditure Register

Include every selected transaction.

Required Columns

1. S.No.
2. Transaction date.
3. Expense particulars.
4. Category.
5. Merchant or supplier.
6. Payment mode.
7. Actual payment account or card.
8. Person or entity that paid.
9. Original currency.
10. Original amount.
11. INR equivalent, where applicable.
12. Amount allocated to the selected activity.
13. Eligible reimbursement amount.
14. Amount reimbursed.
15. Outstanding reimbursement.
16. Bill reference.

For narrow A4 layouts, use landscape pages or split the information into two aligned tables with stable transaction references.

Do not reduce font sizes excessively to force all columns onto one portrait page.

⸻

6. Detailed Line Items

Where invoices contain identifiable individual items, provide an optional line-item breakdown.

Example:

Hotel invoice:

* Room tariff.
* Food.
* Laundry.
* Taxes.
* Other charges.

Line-item amounts must reconcile with the invoice total.

If the invoice has not been reliably itemised, do not invent line items.

Preserve the original receipt for verification.

⸻

7. Payment Mode and Card Details

Display the actual method used for each expense.

Examples:

* Personal AMEX — ending 1234.
* IDFC Bank — UPI.
* Personal Debit Card — ending 5678.
* Company Credit Card — ending 9012.
* Cash.
* Forex Card — ending 3456.
* Bank Transfer.

Mandatory Rules

Distinguish:

* Payment method.
* Payment account.
* Actual payer.
* Workspace responsible for expenditure.

A personal card used for a business expense must remain a personal payment liability until settled.

Do not include full card numbers, CVVs, passwords or sensitive credentials.

Where payment mode or account information is missing, display Not Recorded rather than inventing information.

⸻

8. Reimbursement Summary

Provide a separate reimbursement section.

Information

* Personally funded eligible expenses.
* Amount reimbursed to date.
* Amount pending reimbursement.
* Reimbursement status.
* Settlement references where recorded.

Calculation Principles

Use existing Ledgerline reimbursement and allocation records.

Company-paid expenses should not automatically become personal reimbursement receivables.

Partial reimbursements must be supported.

Amounts rejected or deemed ineligible should remain separately identifiable.

Do not count reimbursement receipts as additional expenditure.

⸻

9. Payment Source Summary

Include a payment-source breakdown.

Example:

Payment Source	Total Spent
Personal AMEX	₹40,000
Personal IDFC UPI	₹15,000
Cash	₹10,000
Company Card	₹20,000
Total	₹85,000

The breakdown must reconcile with total report expenditure.

If one transaction has multiple payments, preserve the individual payment records.

⸻

10. Supporting Bills and Soft Copies

At the end of the PDF, attach all available original bills and payment evidence.

Required Arrangement

Annexure 01 — Original Bill

Annexure 02 — Original Bill

Annexure 03 — Original Bill

Continue in the same order as the expenditure register.

Document Requirements

* Preserve original readability.
* Maintain orientation.
* Include multi-page invoices.
* Support image and PDF receipts.
* Support payment screenshots.
* Match annexure numbers to transaction rows.
* Preserve invoice totals and important identifiers.
* Avoid excessive compression.

For each annexure, provide:

* Annexure number.
* Related transaction number.
* Merchant or supplier.
* Transaction date.
* Amount.
* Document type.

If no supporting bill is available, clearly mark the transaction as Bill Not Attached.

Do not silently omit missing or unreadable documents.

⸻

11. PDF Structure

Page 1 — Expenditure Overview

* Report identification.
* Event/trip/purchase information.
* Expenditure summary.
* Payment source summary.
* Reimbursement position.

Page 2 Onwards — Detailed Expenditure

* Itemised transaction register.
* Payment methods.
* Account/card details.
* Workspace allocations.
* Reimbursement information.
* Bill references.

Following Pages — Supporting Bills

* Original invoices.
* Receipts.
* Payment evidence.
* Other supporting documents.

The final PDF must be a single consolidated document.

⸻

12. Report Generation

Workflow

1. Select Detailed Expenditure Statement.
2. Choose event, trip, project or purchase.
3. Select reporting period.
4. Review associated transactions.
5. Add or remove transactions where authorised.
6. Verify payment modes.
7. Verify reimbursement classification.
8. Review supporting bills.
9. Generate PDF.
10. Preview.
11. Download or Share.

The report should not modify underlying financial records.

⸻

13. Report Design

Use a premium but restrained corporate layout.

Formatting

* A4 portrait for summary.
* A4 landscape for wide transaction tables where required.
* Consistent typography.
* Clear monetary alignment.
* Proper page breaks.
* Repeated table headers.
* Page numbering.
* Report reference.
* Ledgerline branding.
* Printer-friendly design.

Avoid dashboard-style tiles, large decorative cards and excessive colours.

The report should resemble a professionally prepared expenditure statement.

⸻

14. Reconciliation Requirements

Verify that:

1. Total transaction expenditure matches the register.
2. Payment-source totals reconcile.
3. Workspace allocations reconcile.
4. Reimbursement amounts reconcile.
5. Currency conversions use recorded rates.
6. Transfers are not treated as expenses.
7. Credit card settlements are not double-counted.
8. Refunds are correctly reflected.
9. Each bill reference identifies the correct document.
10. Missing records are clearly disclosed.

⸻

15. Existing Claim Submission Report

Retain the previously developed Expense Claim Submission Report.

The two reports must remain separate.

Detailed Expenditure Statement

Purpose:

Financial documentation of an event, trip, project or purchase.

Expense Claim Submission Report

Purpose:

Formal reimbursement request submitted to an organisation or Accounts Department.

Both reports should use the same underlying financial data and attachments.

Do not duplicate transaction records.

⸻

16. Acceptance Requirements

Before completion, demonstrate:

1. A Detailed Expenditure Statement can be generated for one trip.
2. The same report can be generated for a business event.
3. Individual business purchases can be reported.
4. Each transaction shows its actual payment source.
5. Card details display the card name and masked identifier.
6. Line-item information is included where available.
7. Total expenditure reconciles correctly.
8. Personally funded expenditure is identified.
9. Reimbursement outstanding is accurate.
10. All available original bills appear at the end.
11. Annexures match the transaction register.
12. The PDF downloads correctly.
13. Reports remain accessible through Report History.
14. Existing Claim Submission Reports remain unchanged.
15. No financial records are altered during report generation.

⸻

FINAL DEVELOPMENT INSTRUCTION

Create a dedicated Detailed Expenditure Statement for Ledgerline.

It must provide a complete record of expenditure associated with a particular event, trip, project or business purchase.

The report must clearly identify how every amount was paid, including the actual payment account or masked card details.

It must distinguish total expenditure, personally funded expenditure and outstanding reimbursement.

All original supporting bills and payment evidence must be included as annexures at the end of the same PDF.

Retain the existing formal Expense Claim Submission Report as a separate report type.

Preserve the existing Ledgerline application and financial data.

Do not modify or deploy changes to the live application without approval.

End of Detailed Expenditure Statement Development Requirements.