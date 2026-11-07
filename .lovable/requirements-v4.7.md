LEDGERLINE

Version 4.7 — PDF Reporting & Download Centre

Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Reporting and Export Enhancement
Priority: High

1. Objective

Develop a comprehensive PDF reporting system within Ledgerline.

Users should be able to generate, preview, download, share and retrieve financial reports.

The reporting system must integrate with the existing:

* Transaction ledger.
* Personal Workspace.
* Family Workspace.
* Business Workspace.
* Official Workspace.
* Travel Manager.
* Credit Card Management.
* Loan Management.
* Budget Management.
* Reimbursement Tracking.
* Financial Forecasting.
* Wealth Management.

All reports must use actual authorised financial records.

Do not create independent financial calculation logic for PDF reports.

⸻

2. Report Centre

Introduce a dedicated Reports Centre.

Recommended navigation:

More → Reports

The Reports Centre should provide:

1. Report selection.
2. Date filters.
3. Workspace selection.
4. Organisation selection.
5. Account selection.
6. Category filters.
7. Report preview.
8. PDF generation.
9. Download.
10. Share.
11. Report history.

Existing reports should also provide contextual Export PDF actions.

⸻

3. Required Report Types

Develop PDF export for:

A. Financial Reports

* Monthly Financial Summary.
* Income Report.
* Expense Report.
* Category-wise Expenditure.
* Account-wise Transactions.
* Credit Card Report.
* Budget Report.
* Subscription Report.
* Loan and EMI Report.
* Financial Forecast.
* Wealth and Net Worth.

B. Workspace Reports

* Personal.
* Family.
* Business.
* Official.
* Consolidated.
* Organisation-wise.

C. Travel Reports

* Trip Financial Summary.
* Trip-wise Expenses.
* Travel Budget versus Actual.
* Traveller-wise Expenses.
* Booking Commitments.
* Travel Advances.
* Travel Reimbursements.
* Trip Settlement.
* Final Trip Closure Report.

D. Operational Reports

* Pending Reimbursements.
* Unreconciled Transactions.
* Pending Financial Commitments.
* Expense Draft Summary.
* Statement Import Summary.

Drafts and pending items must be clearly separated from confirmed financial transactions.

⸻

4. PDF Design Standards

Use a premium, professional and consistent report format.

Page Format

* A4 portrait by default.
* A4 landscape for wide financial tables where appropriate.
* Consistent margins.
* Proper page breaks.
* Readable typography.
* Clear headings.
* Consistent column alignment.

Branding

Include:

* Ledgerline logo.
* Report title.
* Report period.
* Selected workspace.
* Generated date and time.
* Page number.

The existing small creator watermark may be used discreetly.

Do not include a full-name creator attribution.

Colour

Use the approved Ledgerline brand identity.

Default export styling should prioritise readability and print efficiency.

Allow a colour report and a printer-friendly monochrome option.

Do not automatically reproduce dark-mode dashboard backgrounds in PDF exports.

⸻

5. Report Contents

Where applicable, reports should contain:

Executive Summary

* Total income.
* Total expenses.
* Net cash flow.
* Available balances.
* Upcoming commitments.
* Budget utilisation.
* Key financial observations.

Analysis

* Category breakdown.
* Workspace allocation.
* Account-wise analysis.
* Trends.
* Relevant charts.
* Period comparisons.

Detailed Transactions

* Date.
* Description.
* Category.
* Workspace.
* Account.
* Amount.
* Currency.
* Relevant status.

Notes

Explain:

* Reporting period.
* Currency conversion assumptions.
* Missing or unverified information.
* Pending transactions excluded from totals.
* Any estimated figures.

Do not represent incomplete financial information as verified.

⸻

6. Report Filters

Support:

* Today.
* This Week.
* This Month.
* Last Month.
* This Quarter.
* This Year.
* Custom Date Range.

Additional filters:

* Workspace.
* Organisation.
* Account.
* Credit Card.
* Category.
* Tag.
* Person.
* Trip.
* Currency.
* Transaction Status.

Users should be able to select multiple applicable filters.

The selected filters must be displayed in the report header or metadata.

⸻

7. PDF Generation Workflow

Standard Workflow

1. Open Reports Centre.
2. Select report.
3. Choose filters.
4. Select Generate.
5. Show processing status.
6. Prepare PDF.
7. Display preview.
8. Allow Download or Share.

Download

Support standard browser PDF downloads.

On supported iPhone devices, allow users to open the system Share Sheet to save the PDF to Files or share it through compatible applications.

Do not assume that every iPhone browser provides identical download behaviour.

⸻

8. Background Report Generation

Integrate with Ledgerline’s planned persistent background-processing system.

For large reports:

1. Create a report-generation job.
2. Save the request securely.
3. Process it on the server.
4. Store the completed PDF.
5. Update job status.
6. Notify the user within the application.
7. Allow later download.

Users should not need to keep the report page open after the backend confirms that a persistent job has been accepted.

If background infrastructure is not yet implemented, use a visible foreground-processing state and clearly communicate that the page must remain open.

Do not describe foreground processing as background processing.

⸻

9. Report History

Maintain a Report History section.

Fields

* Report name.
* Report type.
* Date generated.
* Reporting period.
* Workspace.
* Generation status.
* File size, where available.

Actions

* Preview.
* Download.
* Share.
* Regenerate.
* Delete.

Report history should only expose files authorised for the current user.

Previously generated reports must not silently change when underlying transactions are edited.

Regeneration should produce a new version using the updated records.

⸻

10. PDF Export Reliability

Requirements:

* Support multi-page reports.
* Repeat table headers across pages.
* Prevent rows from being awkwardly split.
* Maintain accurate totals.
* Support Indian number formatting.
* Support international currencies.
* Preserve readable charts.
* Use embedded or compatible fonts.
* Support appropriate Tamil and other Unicode text where data requires it.
* Prevent content clipping.
* Handle long merchant names.
* Handle large transaction volumes.

⸻

11. Financial Data Integrity

Every PDF report must reconcile with Ledgerline’s underlying financial calculation services.

Important Rules

1. Transfers must not inflate income or expenditure.
2. Credit card bill payments must not duplicate expenses.
3. Workspace splits must reconcile with original transactions.
4. Consolidated reports must not double-count transactions.
5. Draft expenses must remain separate from confirmed expenses.
6. Unpaid travel bookings must remain commitments.
7. Reimbursements must use their correct financial treatment.
8. Multi-currency conversions must use recorded rates.
9. Estimated values must be labelled.
10. Missing information must be disclosed.

⸻

13. Development Priority

Priority 1

1. PDF export infrastructure.
2. Monthly Financial Summary.
3. Expense Report.
4. Workspace-wise Report.
5. Credit Card Report.
6. Download and Preview.

Priority 2

7. Travel Reports.
8. Reimbursement Reports.
9. Budget Reports.
10. Loan Reports.
11. Consolidated Financial Reports.

Priority 3

12. Persistent background generation.
13. Report history.
14. In-app completion notifications.
15. Secure report storage.
16. Regeneration and versioning.

Priority 4

17. Printer-friendly exports.
18. Advanced charts.
19. Custom report configurations.
20. Comprehensive testing.

⸻

14. Acceptance Requirements

Before declaring completion:

1. Users can generate a Monthly Financial Report.
2. Users can preview the PDF.
3. Users can download the PDF.
4. PDFs open correctly on iPhone.
5. Reports support multiple pages.
6. Totals reconcile with existing Ledgerline figures.
7. Workspace allocations are accurate.
8. Credit card expenses are not duplicated.
9. Travel reports reconcile correctly.
10. Incomplete data is clearly identified.
11. Only authorised users can access reports.
12. Large reports can be generated through persistent jobs when the background infrastructure is available.
13. Report history retrieves previously generated documents.
14. Existing Ledgerline functionality remains unaffected.

⸻

15. Final Development Instruction

Develop a comprehensive PDF reporting and download system within the existing Ledgerline application.

The reporting system must support personal, family, business, official and travel financial management.

Reports should be professional, accurate, easy to understand and suitable for digital sharing or A4 printing.

Users must be able to generate, preview, download and retrieve their reports.

Integrate long-running report generation with the persistent background-job system.

Preserve all existing financial data, calculations, permissions and application functionality.

Do not deploy changes to the live application or activate new paid infrastructure without approval.

Final Principle:

ACCURATE REPORTS. PROFESSIONAL PRESENTATION. DOWNLOAD ANYTIME.

End of Ledgerline Version 4.7 Development Requirements.