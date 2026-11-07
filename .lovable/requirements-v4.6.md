LEDGERLINE

Version 4.6 — Persistent Background Processing & Job Management

Development Requirements for Lovable

Project: Existing Ledgerline Application
Development Type: Backend Infrastructure and User Experience Enhancement
Priority: High

1. Objective

Introduce reliable server-side background processing for long-running operations.

The current application requires users to remain on the active page for certain processing tasks.

This limitation must be addressed.

The objective is to allow users to initiate supported operations, leave the page or close the application, and return later to review completed results.

Core Principle

Start Once. Process Reliably. Resume Anytime.

⸻

2. Mandatory Architecture Review

Before implementation:

1. Inspect the existing backend infrastructure.
2. Identify the database and authentication services.
3. Review existing AI integrations.
4. Review receipt-processing functions.
5. Review document uploads.
6. Review statement-import services.
7. Identify operations dependent on the browser session.
8. Determine which operations can be moved to server-side workers.
9. Review available background execution and scheduling capabilities.
10. Identify infrastructure or subscription limitations.

Do not assume that a browser-side asynchronous operation will continue after the page closes.

If persistent processing requires additional services or paid infrastructure, identify these requirements before implementation.

⸻

3. Persistent Job Architecture

Create a durable background-job system.

Required Components

* Job database.
* Job creation service.
* Background worker or durable task processor.
* Job status tracking.
* Retry management.
* Result storage.
* Error tracking.
* User notifications.
* Job history.
* Cancellation handling where supported.

Job Information

Each job should maintain:

* Unique job ID.
* User ID.
* Workspace ID, where applicable.
* Job type.
* Job status.
* Creation timestamp.
* Start timestamp.
* Completion timestamp.
* Processing stage.
* Progress information, where measurable.
* Retry count.
* Error details.
* Input document references.
* Result references.
* Idempotency key.

All jobs must be associated with authorised users.

⸻

4. Job Statuses

Support:

1. Queued.
2. Processing.
3. Completed.
4. Failed.
5. Retry Scheduled.
6. Cancelled.
7. Action Required.

Users must be able to view the current status of their jobs.

⸻

5. Supported Background Operations

Initially implement persistent processing for:

Priority Operations

1. Receipt scanning.
2. Multiple receipt extraction.
3. PDF processing.
4. Bank statement imports.
5. Credit card statement imports.
6. AI document extraction.
7. Transaction matching.
8. Reconciliation preparation.

Secondary Operations

9. Financial report generation.
10. AI financial analysis where appropriate.
11. Large financial data imports.
12. Travel document processing.

Only migrate operations that can safely run independently of an active user interface.

⸻

6. Receipt Processing Workflow

Required Workflow

1. User captures or uploads a receipt.
2. The original file is securely stored.
3. A draft expense is created.
4. A persistent background job is registered.
5. The server begins processing.
6. The user may leave the page.
7. Processing continues independently.
8. Extracted results are stored.
9. The draft is marked Ready for Review.
10. The user returns later to verify and save.

Important

The receipt must be securely uploaded and the job accepted by the backend before the application indicates that the user can safely close it.

If the upload is incomplete, clearly display that the file is not yet safely stored.

⸻

7. Background Processing Reliability

Implement:

* Durable job storage.
* Controlled worker execution.
* Retry policies.
* Duplicate execution protection.
* Processing timeouts.
* Job recovery after worker interruption.
* Error logging.
* Safe cancellation where supported.

A worker interruption must not cause the job to disappear.

Use operation-specific idempotency protection to prevent duplicate financial records.

⸻

8. Background Task Dashboard

Create a compact Background Activity section.

Recommended Location

Activity → Processing

Also provide a small activity indicator in the application header.

Display

* Processing.
* Queued.
* Completed.
* Failed.
* Action Required.

Individual Task Information

* Task name.
* File name, where relevant.
* Start time.
* Current status.
* Progress stage.
* Completion information.
* Available actions.

Actions

* View Result.
* Review Expense.
* Retry.
* Dismiss Notification.
* Cancel, where supported.

Do not allow users to cancel operations that have already completed irreversible financial writes.

⸻

9. Notifications

When supported background processing completes, notify the user.

Notification Examples

* Your receipt is ready for review.
* Five documents have been processed.
* Statement import completed.
* Financial report is ready.
* Receipt extraction failed.

Delivery Methods

Initial Requirement

In-app notifications that remain available when the user returns.

Additional Capability

Push notifications, subject to supported infrastructure, device permissions and user consent.

Do not assume iPhone web applications can always deliver notifications while closed.

Where push notifications are unavailable, preserve the completed result and display the notification on the next application visit.

⸻

10. Progress Indicators

Display progress accurately.

Examples

* Uploading document.
* Queued for processing.
* Reading receipt.
* Extracting information.
* Checking possible duplicates.
* Preparing results.
* Ready for review.

Show percentages only where measurable progress information is available.

Otherwise, use stage-based or indeterminate indicators.

Do not generate artificial progress percentages.

⸻

11. Financial Integrity

Background jobs must not independently create confirmed expense transactions without the required user confirmation.

For receipt extraction:

* Create or update an expense draft.
* Preserve extracted information.
* Allow user review.
* Create confirmed transactions only after authorisation.

For statement imports:

* Prepare transaction matches.
* Identify possible duplicates.
* Present reconciliation results.
* Apply changes only through the existing approved reconciliation workflow.

Background retries must not create duplicate transactions or financial postings.

⸻

12. Security

Requirements:

1. Authenticate all job requests.
2. Enforce workspace permissions.
3. Protect uploaded documents.
4. Use secure server-side credentials.
5. Never expose AI service keys in the browser.
6. Restrict users to their authorised jobs.
7. Apply appropriate job retention.
8. Protect processing logs from sensitive-data exposure.
9. Validate all files before processing.
10. Use appropriate resource and execution limits.

⸻

13. Application Closure and Recovery

The system must support the following:

1. User starts receipt processing.
2. Backend confirms the receipt and job are safely stored.
3. User closes Ledgerline.
4. Server-side processing continues.
5. Result is saved.
6. User reopens Ledgerline.
7. Application retrieves the latest job status.
8. Completed results are available for review.

If the job fails, the original uploaded document and draft must remain available.

⸻

14. Development Priorities

Phase 1 — Infrastructure

1. Review backend capabilities.
2. Design persistent job records.
3. Implement job creation.
4. Implement server-side worker processing.
5. Implement job state management.
6. Implement retry and recovery controls.

Phase 2 — Receipt Processing

7. Connect receipt uploads.
8. Connect expense drafts.
9. Connect AI extraction.
10. Implement result persistence.
11. Implement review workflow.

Phase 3 — Financial Imports

12. Connect statement imports.
13. Connect transaction matching.
14. Connect reconciliation preparation.
15. Implement duplicate protection.

Phase 4 — User Experience

16. Background Activity dashboard.
17. Header activity indicator.
18. In-app notifications.
19. Job history.
20. Error and retry controls.

Phase 5 — Extended Capabilities

21. Financial report processing.
22. Additional AI processing.
23. Push notification feasibility.
24. Performance testing.
25. Security testing.

⸻

15. Acceptance Tests

The developer must demonstrate:

1. Upload a receipt.
2. Confirm that the backend has accepted the job.
3. Close the application.
4. Reopen after processing.
5. Retrieve the completed result.
6. Review the extracted expense.
7. Confirm that no expense was automatically posted.

Repeat the same test using:

* Multiple receipts.
* Bank statement import.
* Credit card statement import.
* Failed extraction.
* Interrupted worker.
* Network disconnection.
* Duplicate upload.
* User logout and login.

Verify that:

* Jobs persist.
* Results persist.
* Errors remain visible.
* Retries are controlled.
* No duplicate financial records are created.
* Users cannot access another user’s processing jobs.

⸻

16. Completion Requirements

Provide:

1. Background-processing architecture.
2. Services implemented.
3. Job database structure.
4. Worker configuration.
5. Retry policies.
6. Notification capabilities.
7. Infrastructure requirements.
8. Estimated operating costs.
9. Security assessment.
10. End-to-end test results.
11. Known limitations.

⸻

FINAL DEVELOPMENT INSTRUCTION

Implement a reliable persistent background-processing system within the existing Ledgerline application.

Users must be able to complete uploads, receive confirmation that work has been safely queued, leave the application and return later to review results.

The application must not rely on an active browser page to complete supported long-running jobs.

Preserve all existing financial functionality and data.

Do not deploy infrastructure changes or activate paid services without approval.

Final Principle:

UPLOAD ONCE. PROCESS IN THE BACKGROUND. REVIEW WHEN CONVENIENT.

End of Ledgerline Version 4.6 Development Requirements.